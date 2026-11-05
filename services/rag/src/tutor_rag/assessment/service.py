from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from psycopg import Connection
from psycopg.types.json import Jsonb

from tutor_rag.assessment.scoring import POSITIVE, REINFORCEMENT, grade_responses, has_four_options
from tutor_rag.learning.profile import operational_status


class AssessmentService:
    def __init__(
        self,
        connection: Connection[dict[str, Any]],
        student_id: str,
        course_id: str,
        kind: str = "PRE",
    ):
        self.connection = connection
        self.student_id = student_id
        self.course_id = course_id
        self.kind = kind

    def require_access(self) -> None:
        # Identitas diteruskan server LMS dari sesi Better Auth, lalu diverifikasi lagi di sini.
        row = self.connection.execute(
            'SELECT u.id FROM "user" u JOIN enrollment e ON e."userId"=u.id '
            'JOIN course c ON c.id=e."courseId" '
            "WHERE u.id=%s AND u.role='mahasiswa' AND e.\"courseId\"=%s "
            'AND e."isActive"=true AND c."isActive"=true',
            (self.student_id, self.course_id),
        ).fetchone()
        if row is None:
            raise HTTPException(403, "Anda tidak memiliki akses ke mata kuliah ini.")

    def configuration(self) -> dict | None:
        return self.connection.execute(
            'SELECT * FROM course_learning_config WHERE "courseId"=%s', (self.course_id,)
        ).fetchone()

    def attempt(self, *, locked: bool = False) -> dict | None:
        return self.connection.execute(
            'SELECT * FROM assessment_attempt WHERE "studentId"=%s AND "courseId"=%s '
            "AND kind=%s" + (" FOR UPDATE" if locked else ""),
            (self.student_id, self.course_id, self.kind),
        ).fetchone()

    def overview(self) -> dict:
        self.require_access()
        count = (
            self.connection.execute(
                'SELECT COUNT(*)::int AS count FROM domain_topic WHERE "courseId"=%s',
                (self.course_id,),
            ).fetchone()
            or {"count": 0}
        )["count"]
        attempt = self.attempt()
        configuration = self.configuration()
        return {
            "available": configuration is not None,
            "status": attempt["status"] if attempt else "NOT_STARTED",
            "attemptId": attempt["id"] if attempt else None,
            "topicCount": count,
            "totalQuestions": (configuration or {}).get("pretestQuestionCount", 0),
            "posttest": self.posttest_availability(),
        }

    def posttest_availability(self) -> dict:
        config = self.configuration()
        post = self.connection.execute(
            'SELECT id,status FROM assessment_attempt WHERE "studentId"=%s '
            "AND \"courseId\"=%s AND kind='POST'",
            (self.student_id, self.course_id),
        ).fetchone()
        pre = self.connection.execute(
            'SELECT id FROM assessment_attempt WHERE "studentId"=%s AND "courseId"=%s '
            "AND kind='PRE' AND status='SUBMITTED'",
            (self.student_id, self.course_id),
        ).fetchone()
        progress = self.connection.execute(
            'SELECT EXTRACT(EPOCH FROM (NOW()-"startedAt")) AS elapsed '
            'FROM student_learning_progress WHERE "studentId"=%s AND "courseId"=%s',
            (self.student_id, self.course_id),
        ).fetchone()
        remaining = max(
            0,
            (config or {}).get("minimumStudySeconds", 0)
            - int(progress["elapsed"] if progress else 0),
        )
        allowed = bool(pre and progress and remaining == 0)
        return {
            "available": allowed or bool(post),
            "status": post["status"] if post else "NOT_STARTED",
            "remainingStudySeconds": remaining,
            "reason": None
            if allowed or post
            else (
                "Selesaikan pre-test dahulu."
                if not pre
                else "Lakukan pembelajaran dengan AI Tutor atau latihan terlebih dahulu."
                if not progress
                else "Durasi belajar minimal belum tercapai."
            ),
        }

    def current(self) -> dict | None:
        self.require_access()
        attempt = self.attempt()
        return self.public_attempt(attempt) if attempt else None

    def public_attempt(self, attempt: dict) -> dict:
        # Daftar field eksplisit: snapshot privat, kunci, pembahasan, dan isCorrect tidak keluar.
        result = {
            key: attempt[key]
            for key in [
                "id",
                "status",
                "startedAt",
                "submittedAt",
                "correctCount",
                "totalQuestions",
                "percentage",
            ]
        }
        result["questions"] = []
        if attempt["status"] == "IN_PROGRESS":
            items = self.connection.execute(
                'SELECT "questionId","orderNumber","selectedOption","questionSnapshot" '
                'FROM assessment_item WHERE "attemptId"=%s ORDER BY "orderNumber"',
                (attempt["id"],),
            ).fetchall()
            if any(not has_four_options(i["questionSnapshot"]) for i in items):
                raise HTTPException(
                    409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
                )
            result["questions"] = [
                {
                    "id": i["questionId"],
                    "number": i["orderNumber"],
                    "question": i["questionSnapshot"]["question"],
                    "options": i["questionSnapshot"]["options"],
                    "selectedOption": i["selectedOption"],
                }
                for i in items
            ]
        return result

    def start(self) -> dict:
        self.require_access()
        with self.connection.transaction():
            # Mengunci course yang sama dengan importer: paket tidak berubah di tengah pembentukan.
            self.connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (self.course_id,))
            existing = self.attempt()
            if existing:
                return self.public_attempt(existing)
            configuration = self.configuration()
            if configuration is None:
                raise HTTPException(404, "Pre-test belum dikonfigurasi untuk mata kuliah ini.")
            expected = configuration["pretestQuestionCount"]
            questions = self.connection.execute(
                'SELECT q.* FROM question_bank_item q JOIN domain_topic t ON t.id=q."topicId" '
                'JOIN domain_indicator i ON i.id=q."indicatorId" '
                'WHERE t."courseId"=%s AND q."courseId"=t."courseId" '
                'AND i."courseId"=t."courseId" AND q.kind=\'PRE_POST\' ORDER BY i.code',
                (self.course_id,),
            ).fetchall()
            if len(questions) != expected or len({q["indicatorId"] for q in questions}) != expected:
                raise HTTPException(409, "Dataset pre-test belum lengkap. Hubungi pengampu.")
            if any(not has_four_options(q) for q in questions):
                raise HTTPException(
                    409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D."
                )
            attempt = self.connection.execute(
                'INSERT INTO assessment_attempt (id,"studentId","courseId","totalQuestions") '
                "VALUES (%s,%s,%s,%s) RETURNING *",
                (str(uuid4()), self.student_id, self.course_id, expected),
            ).fetchone()
            assert attempt is not None
            for number, q in enumerate(questions, start=1):
                # Snapshot mempertahankan soal DAN kunci asli sesi ini saat seed diulang.
                snapshot = {
                    key: q[key]
                    for key in [
                        "question",
                        "options",
                        "correctOption",
                        "explanation",
                        "sourcePdf",
                        "sourcePages",
                    ]
                }
                self.connection.execute(
                    'INSERT INTO assessment_item (id,"attemptId","questionId","indicatorId",'
                    '"orderNumber","questionSnapshot") VALUES (%s,%s,%s,%s,%s,%s)',
                    (
                        str(uuid4()),
                        attempt["id"],
                        q["id"],
                        q["indicatorId"],
                        number,
                        Jsonb(snapshot),
                    ),
                )
            return self.public_attempt(attempt)

    def owned_attempt(self, attempt_id: str) -> dict:
        attempt = self.attempt(locked=True)
        if attempt is None or attempt["id"] != attempt_id:
            raise HTTPException(404, "Sesi pre-test tidak ditemukan.")
        return attempt

    def save(self, attempt_id: str, question_id: str, option: str | None) -> dict:
        self.require_access()
        with self.connection.transaction():
            attempt = self.owned_attempt(attempt_id)
            if attempt["status"] != "IN_PROGRESS":
                raise HTTPException(409, "Pre-test sudah difinalisasi dan tidak dapat diubah.")
            row = self.connection.execute(
                'SELECT "questionSnapshot" FROM assessment_item '
                'WHERE "attemptId"=%s AND "questionId"=%s',
                (attempt_id, question_id),
            ).fetchone()
            if row is None:
                raise HTTPException(404, "Soal tidak berada dalam sesi ini.")
            if option is not None and (
                option not in ("A", "B", "C", "D")
                or option not in row["questionSnapshot"]["options"]
            ):
                raise HTTPException(422, "Pilihan tidak tersedia pada soal ini.")
            self.connection.execute(
                'UPDATE assessment_item SET "selectedOption"=%s,'
                '"answeredAt"=CASE WHEN %s::text IS NULL THEN NULL ELSE NOW() END '
                'WHERE "attemptId"=%s AND "questionId"=%s',
                (option, option, attempt_id, question_id),
            )
        return {"saved": True, "questionId": question_id, "selectedOption": option}

    def submit(self, attempt_id: str) -> dict:
        self.require_access()
        with self.connection.transaction():
            # Semua penyimpanan draf dan submit mengunci baris yang sama: submit ganda aman.
            attempt = self.owned_attempt(attempt_id)
            if attempt["status"] == "SUBMITTED":
                return self.public_attempt(attempt)
            items = self.connection.execute(
                'SELECT * FROM assessment_item WHERE "attemptId"=%s ORDER BY "orderNumber"',
                (attempt_id,),
            ).fetchall()
            try:
                correct, percentage, scores = grade_responses(items, attempt["totalQuestions"])
            except ValueError as error:
                raise HTTPException(409, str(error)) from None
            for item, score in zip(items, scores, strict=True):
                self.connection.execute(
                    'UPDATE assessment_item SET "isCorrect"=%s WHERE id=%s',
                    (bool(score), item["id"]),
                )
                # Satu bukti per indikator adalah baseline terbatas, bukan penguasaan penuh.
                if self.kind == "POST":
                    continue  # Post-test adalah pengukuran hasil, tidak memperbarui baseline/EMA.
                self.connection.execute(
                    'INSERT INTO student_indicator_profile (id,"studentId","courseId",'
                    '"indicatorId","baselineItemId","initialScore","currentScore","initialStatus",'
                    '"currentStatus") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                    (
                        str(uuid4()),
                        self.student_id,
                        self.course_id,
                        item["indicatorId"],
                        item["id"],
                        score,
                        score,
                        POSITIVE if score else REINFORCEMENT,
                        POSITIVE if score else REINFORCEMENT,
                    ),
                )
            completed = self.connection.execute(
                "UPDATE assessment_attempt SET status='SUBMITTED',\"submittedAt\"=NOW(),"
                '"correctCount"=%s,percentage=%s WHERE id=%s RETURNING *',
                (correct, percentage, attempt_id),
            ).fetchone()
            # Penilaian, finalisasi, dan profil commit bersama atau seluruhnya dibatalkan.
            assert completed is not None
            return self.public_attempt(completed)

    def profile(self) -> dict:
        self.require_access()
        config = self.configuration()
        attempt = self.attempt()
        course = self.connection.execute(
            "SELECT id,title FROM course WHERE id=%s", (self.course_id,)
        ).fetchone()
        topics = self.connection.execute(
            'SELECT id,code,title,"orderNumber","courseSessionId","cpmkCodes","subCpmkCodes",'
            '"sourcePdf","sourcePages" FROM domain_topic WHERE "courseId"=%s '
            'ORDER BY "orderNumber"',
            (self.course_id,),
        ).fetchall()
        if config is None:
            raise HTTPException(404, "Domain pembelajaran belum tersedia untuk mata kuliah ini.")
        rows = self.connection.execute(
            'SELECT i.id,i.code,i."topicId",i.description,c.name AS concept,i."subCpmkCodes",'
            'p."initialScore",p."currentScore",p."evidenceCount",p."initialStatus",p."createdAt" '
            'FROM domain_indicator i JOIN domain_topic t ON t.id=i."topicId" '
            'JOIN domain_concept c ON c.id=i."conceptId" '
            'LEFT JOIN student_indicator_profile p ON p."indicatorId"=i.id '
            'AND p."studentId"=%s AND p."courseId"=%s '
            'WHERE t."courseId"=%s ORDER BY i.code',
            (self.student_id, self.course_id, self.course_id),
        ).fetchall()
        for topic in topics:
            topic["indicators"] = [
                {
                    **row,
                    "initialStatus": row["initialStatus"] or "NOT_ASSESSED",
                    "evidenceCount": row["evidenceCount"] or 0,
                    "currentStatus": operational_status(row, config),
                }
                for row in rows
                if row["topicId"] == topic["id"]
            ]
            topic["initialPositiveCount"] = sum(
                int(i["initialScore"] or 0) for i in topic["indicators"]
            )
            scored = [
                i["currentScore"] for i in topic["indicators"] if i["currentScore"] is not None
            ]
            topic["currentScore"] = sum(scored) / len(scored) if scored else None
        return {
            "course": course,
            "attempt": self.public_attempt(attempt) if attempt else None,
            "topics": topics,
            "assessedCount": sum(r["initialScore"] is not None for r in rows),
            "positiveCount": sum(int(r["initialScore"] or 0) for r in rows),
            "reinforcementCount": sum(r["initialStatus"] == REINFORCEMENT for r in rows),
        }
