from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from psycopg import Connection
from psycopg.types.json import Jsonb

from tutor_rag.assessment.service import AssessmentService
from tutor_rag.assessment.scoring import has_four_options
from tutor_rag.contracts.rag import GenerateRequest
from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.learning.profile import operational_status
from tutor_rag.rag.prompting import build_context
from tutor_rag.repositories.chunks import ChunkRepository


def record_study(connection: Connection[dict[str, Any]], student_id: str, course_id: str) -> None:
    # Waktu belajar dimulai oleh interaksi server, bukan timestamp yang dikirim browser.
    connection.execute(
        'INSERT INTO student_learning_progress ("studentId","courseId") VALUES (%s,%s) '
        'ON CONFLICT ("studentId","courseId") DO UPDATE SET "lastStudiedAt"=NOW()',
        (student_id, course_id),
    )


class PracticeService:
    def __init__(
        self,
        connection: Connection[dict[str, Any]],
        student_id: str,
        course_id: str,
        settings: Settings,
    ):
        self.connection = connection
        self.student_id = student_id
        self.course_id = course_id
        self.settings = settings
        self.assessment = AssessmentService(connection, student_id, course_id)

    def require_pretest(self) -> None:
        self.assessment.require_access()
        pretest = self.assessment.attempt()
        if not pretest or pretest["status"] != "SUBMITTED":
            raise HTTPException(409, "Selesaikan pre-test sebelum belajar dan berlatih.")

    def offer(self, indicator_id: str, chat_session_id: str) -> str | None:
        self.require_pretest()
        with self.connection.transaction():
            # Serialisasi pemilihan soal lintas chat agar satu soal tidak ditawarkan ganda.
            self.connection.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))",
                (f"practice:{self.student_id}:{self.course_id}",),
            )
            chat = self.connection.execute(
                'SELECT id FROM ai_chat_session WHERE id=%s AND "userId"=%s AND "courseId"=%s',
                (chat_session_id, self.student_id, self.course_id),
            ).fetchone()
            if not chat:
                raise HTTPException(404, "Chat tidak ditemukan.")
            existing = self.connection.execute(
                'SELECT id FROM practice_session WHERE "studentId"=%s AND "courseId"=%s '
                "AND \"indicatorId\"=%s AND status IN ('OFFERED','ACTIVE') "
                'ORDER BY "createdAt" LIMIT 1',
                (self.student_id, self.course_id, indicator_id),
            ).fetchone()
            if existing:
                return existing["id"]
            question = self.connection.execute(
                'SELECT q.* FROM question_bank_item q WHERE q."courseId"=%s '
                "AND q.\"indicatorId\"=%s AND q.kind='PRACTICE' AND NOT EXISTS "
                '(SELECT 1 FROM practice_session p WHERE p."studentId"=%s '
                'AND p."courseId"=%s AND p."questionId"=q.id) '
                'ORDER BY q."practiceNumber",q.code LIMIT 1',
                (self.course_id, indicator_id, self.student_id, self.course_id),
            ).fetchone()
            if not question:
                # Tawaran yang dilewati sebelum soal dibuka tidak menghabiskan bank soal.
                ignored = self.connection.execute(
                    'SELECT id FROM practice_session WHERE "studentId"=%s AND "courseId"=%s '
                    'AND "indicatorId"=%s AND status=\'DISMISSED\' AND "answerCount"=0 '
                    'AND "hintCount"=0 ORDER BY "updatedAt" LIMIT 1 FOR UPDATE',
                    (self.student_id, self.course_id, indicator_id),
                ).fetchone()
                if not ignored:
                    return None
                self.connection.execute(
                    "UPDATE practice_session SET status='OFFERED',\"chatSessionId\"=%s,"
                    '"updatedAt"=NOW() WHERE id=%s',
                    (chat_session_id, ignored["id"]),
                )
                return ignored["id"]
            if not has_four_options(question):
                raise HTTPException(
                    409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
                )
            practice_id = str(uuid4())
            # Snapshot privat menjaga soal/kunci stabil jika dataset diimpor kembali.
            self.connection.execute(
                'INSERT INTO practice_session (id,"studentId","courseId","chatSessionId",'
                '"indicatorId","questionId","questionSnapshot") VALUES (%s,%s,%s,%s,%s,%s,%s)',
                (
                    practice_id,
                    self.student_id,
                    self.course_id,
                    chat_session_id,
                    indicator_id,
                    question["id"],
                    Jsonb(question),
                ),
            )
            return practice_id

    def owned(self, practice_id: str, *, locked: bool = False) -> dict:
        self.require_pretest()
        row = self.connection.execute(
            'SELECT p.*,i.code AS "indicatorCode",c.name AS concept FROM practice_session p '
            'JOIN domain_indicator i ON i.id=p."indicatorId" '
            'JOIN domain_concept c ON c.id=i."conceptId" '
            'WHERE p.id=%s AND p."studentId"=%s AND p."courseId"=%s'
            + (" FOR UPDATE OF p" if locked else ""),
            (practice_id, self.student_id, self.course_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Latihan tidak ditemukan.")
        return row

    def current(self, practice_id: str) -> dict:
        row = self.owned(practice_id)
        snapshot = row["questionSnapshot"]
        if not has_four_options(snapshot):
            raise HTTPException(
                409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
            )
        # Field publik disusun eksplisit; snapshot, kunci, dan penjelasan salah tidak bocor.
        result = {
            key: row[key]
            for key in ["id", "status", "hintCount", "answerCount", "indicatorCode", "concept"]
        }
        result["code"] = snapshot["code"]
        opened = row["status"] in ("ACTIVE", "COMPLETED") or row["answerCount"] or row["hintCount"]
        result["question"] = snapshot["question"] if opened else None
        result["options"] = snapshot["options"] if opened else None
        result["events"] = self.connection.execute(
            'SELECT id,kind,"selectedOption","isCorrect",independent,"hintCount",'
            '"scoreBefore","scoreAfter",feedback,sources,"createdAt" '
            'FROM practice_event WHERE "practiceSessionId"=%s ORDER BY "createdAt",id',
            (practice_id,),
        ).fetchall()
        return result

    def change_status(self, practice_id: str, status: str) -> dict:
        with self.connection.transaction():
            row = self.owned(practice_id, locked=True)
            may_finish = (
                status == "DISMISSED"
                and row["status"] == "ACTIVE"
                and (row["answerCount"] > 0 or row["hintCount"] > 0)
            )
            if row["status"] == "OFFERED" or may_finish:
                self.connection.execute(
                    'UPDATE practice_session SET status=%s,"updatedAt"=NOW() WHERE id=%s',
                    (status, practice_id),
                )
        return self.current(practice_id)

    def guidance(self, row: dict, hint_number: int) -> tuple[str, list[dict]]:
        # LLM hanya menerima konsep dan PDF, bukan opsi/kunci/penjelasan bank soal.
        # Dengan demikian penilaian sepenuhnya deterministik dan terpisah dari generasi.
        context = self.connection.execute(
            'SELECT i.description,t."courseSessionId" FROM domain_indicator i '
            'JOIN domain_topic t ON t.id=i."topicId" WHERE i.id=%s AND i."courseId"=%s',
            (row["indicatorId"], self.course_id),
        ).fetchone()
        fallback = (
            "Sumber PDF belum mendukung petunjuk ini. Tinjau materi terkait sebelum mencoba lagi."
        )
        if not context:
            return fallback, []
        materials = self.connection.execute(
            'SELECT id FROM material WHERE "courseSessionId"=%s AND "isActive"=true '
            'AND "processingStatus"=\'ready\' AND "isProcessed"=true',
            (context["courseSessionId"],),
        ).fetchall()
        try:
            provider = GeminiProvider(self.settings)
            chunks = (
                ChunkRepository(self.settings).retrieve(
                    self.course_id,
                    [m["id"] for m in materials],
                    provider.embed_question(f"{row['concept']}: {context['description']}"),
                )
                if materials
                else []
            )
            if not chunks:
                return fallback, []
            instruction = (
                "Anda memberi petunjuk konsep bertahap dalam bahasa Indonesia berdasarkan PDF. "
                "Jangan menyebut huruf opsi, memilih jawaban, menilai, membuat soal baru, atau "
                "membocorkan jawaban. Sebutkan file dan halaman sumber. "
                "Jika sumber tidak cukup, akui keterbatasannya. Maksimal 120 kata."
            )
            feedback = provider.generate(
                GenerateRequest(
                    system_instruction=instruction,
                    prompt=f"Konsep: {row['concept']}\nIndikator: {context['description']}\n"
                    f"Tingkat petunjuk: {hint_number}. "
                    + (
                        "Uraikan dasar konsep untuk remediasi."
                        if hint_number == 0
                        else {
                            1: "Ingatkan definisi dan prinsip dasar konsep.",
                            2: "Uraikan penerapan prinsip pada situasi sejenis, tanpa jawaban.",
                            3: "Berikan langkah pemeriksaan dan kesalahan umum, tanpa jawaban.",
                        }[hint_number]
                    )
                    + "\n\n"
                    + build_context(chunks),
                )
            )
            return feedback, [
                chunk.model_dump(by_alias=True, exclude={"content"}) for chunk in chunks
            ]
        except Exception:
            # Gangguan LLM tidak membatalkan jawaban/penilaian yang sudah valid.
            return fallback, []

    def interact(
        self, practice_id: str, request_id: str, kind: str, selected_option: str | None = None
    ) -> dict:
        with self.connection.transaction():
            row = self.owned(practice_id, locked=True)
            if not has_four_options(row["questionSnapshot"]):
                raise HTTPException(
                    409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
                )
            duplicate = self.connection.execute(
                'SELECT id FROM practice_event WHERE "practiceSessionId"=%s AND "requestId"=%s',
                (practice_id, request_id),
            ).fetchone()
            if duplicate:
                return self.current(practice_id)
            if row["status"] != "ACTIVE":
                raise HTTPException(
                    409,
                    "Terima tawaran latihan terlebih dahulu; latihan selesai tidak dapat diubah.",
                )
            independent = False
            correct = None
            before = after = alpha = None
            hints = row["hintCount"]
            sources: list[dict] = []
            if kind == "HINT":
                if hints >= 3:
                    raise HTTPException(
                        409, "Tiga petunjuk sudah tersedia. Tinjau kembali atau lanjut ke materi."
                    )
                hints += 1
                feedback, sources = self.guidance(row, hints)
                self.connection.execute(
                    'UPDATE practice_session SET "hintCount"=%s,"updatedAt"=NOW() WHERE id=%s',
                    (hints, practice_id),
                )
            else:
                if selected_option not in row["questionSnapshot"]["options"]:
                    raise HTTPException(422, "Pilihan tidak tersedia pada soal ini.")
                # Hanya jawaban pertama tanpa bantuan pada soal berbeda yang menjadi bukti.
                independent = row["answerCount"] == 0 and hints == 0
                correct = selected_option == row["questionSnapshot"]["correctOption"]
                if independent:
                    config = self.assessment.configuration()
                    assert config is not None
                    profile = self.connection.execute(
                        'SELECT * FROM student_indicator_profile WHERE "studentId"=%s '
                        'AND "courseId"=%s AND "indicatorId"=%s FOR UPDATE',
                        (self.student_id, self.course_id, row["indicatorId"]),
                    ).fetchone()
                    if not profile:
                        raise HTTPException(409, "Profil awal belum terbentuk.")
                    before, alpha = profile["currentScore"], config["emaAlpha"]
                    after = (1 - alpha) * before + alpha * int(correct)
                    status = operational_status(
                        {
                            **profile,
                            "currentScore": after,
                            "evidenceCount": profile["evidenceCount"] + 1,
                        },
                        config,
                    )
                    self.connection.execute(
                        'UPDATE student_indicator_profile SET "currentScore"=%s,'
                        '"currentStatus"=%s,"evidenceCount"="evidenceCount"+1,'
                        '"updatedAt"=NOW() WHERE id=%s',
                        (after, status, profile["id"]),
                    )
                self.connection.execute(
                    'UPDATE practice_session SET "answerCount"="answerCount"+1,'
                    '"firstAnsweredAt"=COALESCE("firstAnsweredAt",NOW()),'
                    'status=%s,"updatedAt"=NOW() WHERE id=%s',
                    ("COMPLETED" if correct else "ACTIVE", practice_id),
                )
                if correct:
                    feedback = "Jawaban benar. " + row["questionSnapshot"]["explanation"]
                else:
                    remediation, sources = self.guidance(row, 0)
                    feedback = "Jawaban belum tepat. " + remediation
                feedback += (
                    " Bukti mandiri dicatat pada profil."
                    if independent
                    else " Latihan berbantuan/ulang; EMA tidak berubah."
                )
            self.connection.execute(
                'INSERT INTO practice_event (id,"practiceSessionId","requestId",kind,'
                '"selectedOption","isCorrect",independent,"hintCount","scoreBefore",'
                '"scoreAfter","emaAlpha",feedback,sources) '
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    str(uuid4()),
                    practice_id,
                    request_id,
                    kind,
                    selected_option,
                    correct,
                    independent,
                    hints,
                    before,
                    after,
                    alpha,
                    feedback,
                    Jsonb(sources),
                ),
            )
            record_study(self.connection, self.student_id, self.course_id)
        return self.current(practice_id)
