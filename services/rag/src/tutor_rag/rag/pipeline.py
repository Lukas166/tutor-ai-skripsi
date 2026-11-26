import json

from tutor_rag.contracts.rag import PreparedAnswer, PrepareRequest
from tutor_rag.infrastructure.database import connect_database
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.learning.tutoring import AdaptiveTutoring
from tutor_rag.rag.prompting import build_prompt, build_system_instruction
from tutor_rag.repositories.chunks import ChunkRepository


class RagPipeline:
    def __init__(self, provider: GeminiProvider, repository: ChunkRepository):
        self.provider = provider
        self.repository = repository

    def prepare(self, request: PrepareRequest) -> PreparedAnswer:
        adaptive_service = AdaptiveTutoring(self.provider.settings, self.provider)
        adaptive = adaptive_service.context(request)
        material_ids = request.selected_material_ids
        if adaptive and adaptive.get("sessionId"):
            # Pertanyaan profil mengambil PDF yang terhubung ke indikator walau
            # mahasiswa sedang memilih materi lain di kontrol konteks chat.
            with connect_database(self.provider.settings) as connection:
                if adaptive["action"] in (
                    "PROFILE", "WELCOME", "LEARN", "PRACTICE", "PRACTICE_FOLLOWUP"
                ):
                    rows = connection.execute(
                        'SELECT m.id FROM material m JOIN course_session s '
                        'ON s.id=m."courseSessionId" WHERE s."courseId"=%s '
                        'AND s.id=%s AND s."isActive"=true AND m."isActive"=true '
                        'AND m."isProcessed"=true AND m."processingStatus"=\'ready\'',
                        (request.course.id, adaptive["sessionId"]),
                    ).fetchall()
                else:
                    rows = connection.execute(
                        'SELECT id FROM material WHERE id=ANY(%s) AND "courseSessionId"=%s',
                        (material_ids, adaptive["sessionId"]),
                    ).fetchall()
                material_ids = [row["id"] for row in rows]
        # Tahap 1: ubah pertanyaan ke ruang vektor yang sama dengan embedding dokumen.
        # Tanpa materi terpilih, tidak perlu membayar panggilan embedding ke Gemini.
        chunks = []
        if material_ids and not (adaptive and adaptive["action"] in ("SOCIAL", "PRACTICE_HINT")):
            query = (
                adaptive.get("retrievalQuery", request.question) if adaptive else request.question
            )
            embedding = self.provider.embed_question(query)
            # Tahap 2: cari potongan materi paling relevan dalam course dan pilihan pengguna.
            chunks = self.repository.retrieve(request.course.id, material_ids, embedding)
        # Tahap 3: gabungkan sumber, riwayat, dan instruksi jawaban menjadi konteks LLM.
        # Generasi dipisahkan dari persiapan agar konteks identik untuk chat dan streaming.
        # Permintaan latihan eksplisit boleh menampilkan soal bank yang terhubung
        # ke materi meski pencarian semantik tidak menghasilkan potongan di atas ambang.
        if adaptive and adaptive.get("offerPractice") and (
            adaptive["action"] == "PRACTICE_HINT"
            or (material_ids and (
                chunks or adaptive["action"] in ("PRACTICE", "PRACTICE_FOLLOWUP")
            ))
        ):
            adaptive_service.offer(request, adaptive)
        instruction = build_system_instruction(request)
        prompt = build_prompt(request, chunks)
        if adaptive:
            instruction += (
                "\n\nData Student Profile resmi (bukan isi PDF):\n"
                + json.dumps(adaptive["profile"], ensure_ascii=False)
                + "\nUrutan prioritas belajar saat ini: "
                + json.dumps(adaptive["priorityPlan"], ensure_ascii=False)
                + "\nKemajuan alur belajar resmi: "
                + json.dumps({
                    key: adaptive["learningProgress"][key]
                    for key in ("totalIndicators", "completedIndicators",
                                "reviewPendingCount", "nextIndicatorCode")
                }, ensure_ascii=False)
                + "\nStatus post-test resmi: "
                + json.dumps(adaptive["posttest"], ensure_ascii=False)
                + "\n\nIndikator relevan: "
                + str(adaptive.get("indicatorCode") or "belum spesifik")
                + ". " + adaptive["instruction"]
                + "\nGunakan profil dan rencana sebagai konteks keputusan. "
                "Jangan membuka balasan dengan sapaan atau membacakan status, "
                "skor, dan rencana yang tidak diminta."
            )
            if adaptive.get("practiceEvent"):
                instruction += (
                    "\nHasil latihan resmi yang baru dinilai server: "
                    + json.dumps(adaptive["practiceEvent"], ensure_ascii=False)
                    + "\nLangkah belajar setelah pembahasan jawaban: "
                    + json.dumps(adaptive["nextStep"], ensure_ascii=False)
                )
            if adaptive["action"] == "WELCOME":
                instruction += (
                    "\nKode indikator yang wajib muncul seluruhnya pada peta awal: "
                    + ", ".join(adaptive["requiredWelcomeCodes"])
                )
            if adaptive.get("practiceId"):
                instruction += (
                    "\nKartu latihan sudah tampil tepat di bawah balasan ini. "
                    "Setelah menjawab materi, tawarkan secara langsung dan singkat "
                    "untuk mencobanya atau melewatinya. Jangan meminta mahasiswa "
                    "meminta latihan lagi, mencari kartu di tempat lain, atau "
                    "menanyakan izin sebelum kartu ditampilkan. Jangan menebak "
                    "isi soal sebelum mahasiswa membuka kartu."
                )
            elif adaptive.get("practiceLocation") == "current_chat":
                instruction += (
                    "\nKartu latihan indikator ini sudah ada pada balasan sebelumnya "
                    "di chat yang sama. Arahkan ke kartu itu bila diminta; jangan "
                    "mengklaim kartu baru tampil di bawah balasan ini."
                )
            elif adaptive.get("practiceLocation") == "other_chat":
                instruction += (
                    "\nLatihan indikator ini masih terbuka pada chat lain. "
                    "Jangan mengatakan kartu tersedia di balasan ini."
                )
            else:
                instruction += (
                    "\nTidak ada kartu latihan yang terlampir pada balasan ini. "
                    "Jangan mengklaim ada kartu yang bisa langsung dikerjakan. "
                    "Jika mahasiswa meminta latihan, katakan bahwa kartu untuk "
                    "konteks ini belum tersedia dan lanjutkan pembelajaran dari PDF."
                )
        return PreparedAnswer(
            chunks=chunks,
            system_instruction=instruction,
            prompt=prompt,
            adaptive=adaptive,
        )
