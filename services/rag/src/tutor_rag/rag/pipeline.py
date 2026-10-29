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
            # Pilihan LMS membatasi ruang pencarian; indikator mempersempit ke materi yang sesuai.
            with connect_database(self.provider.settings) as connection:
                rows = connection.execute(
                    'SELECT id FROM material WHERE id=ANY(%s) AND "courseSessionId"=%s',
                    (material_ids, adaptive["sessionId"]),
                ).fetchall()
                material_ids = [row["id"] for row in rows]
        # Tahap 1: ubah pertanyaan ke ruang vektor yang sama dengan embedding dokumen.
        # Tanpa materi terpilih, tidak perlu membayar panggilan embedding ke Gemini.
        chunks = []
        if material_ids and not (adaptive and adaptive["action"] in ("CLARIFY", "PRACTICE_HINT")):
            query = (
                adaptive.get("retrievalQuery", request.question) if adaptive else request.question
            )
            embedding = self.provider.embed_question(query)
            # Tahap 2: cari potongan materi paling relevan dalam course dan pilihan pengguna.
            chunks = self.repository.retrieve(request.course.id, material_ids, embedding)
        # Tahap 3: gabungkan sumber, riwayat, dan instruksi jawaban menjadi konteks LLM.
        # Generasi dipisahkan dari persiapan agar konteks identik untuk chat dan streaming.
        if adaptive and chunks:
            adaptive_service.offer(request, adaptive)
        instruction = build_system_instruction(request)
        prompt = build_prompt(request, chunks)
        if adaptive:
            instruction += (
                "\nKebijakan ITS: gunakan hanya sumber PDF yang benar-benar ditemukan. "
                "Jangan mengarang soal, memilih opsi, mengungkap kunci pre/post, menilai jawaban "
                "atau mengubah skor/profil. Penawaran dan penilaian soal ditangani UI/server. "
                "Jangan memperlakukan status sebagai sertifikasi penguasaan.\n"
                + adaptive["instruction"]
            )
        # Tanpa sumber, tidak meminta LLM mengisi kekosongan dengan pengetahuan di luar PDF.
        direct_answer = None
        if adaptive and adaptive["action"] == "PRACTICE_HINT":
            direct_answer = (
                "Latihan konsep ini sedang terbuka. Coba jawab mandiri, atau pilih Minta Hint "
                "pada kartu latihan untuk memperoleh bantuan yang tercatat. "
                "Anda tetap dapat memilih materi lain."
            )
        elif adaptive and adaptive["action"] == "CLARIFY":
            direct_answer = (
                "Konsep atau materi mana yang ingin Anda bahas? "
                "Sebutkan topiknya agar penjelasan dan latihan sesuai kebutuhan Anda."
            )
        elif not chunks:
            direct_answer = (
                "Sumber PDF yang dipilih belum mendukung jawaban ini. "
                "Pilih materi yang relevan atau periksa kesiapan indeksnya."
            )
        return PreparedAnswer(
            chunks=chunks,
            system_instruction=instruction,
            prompt=prompt,
            adaptive=adaptive,
            direct_answer=direct_answer,
        )
