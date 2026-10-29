from tutor_rag.contracts.rag import PreparedAnswer, PrepareRequest
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.rag.prompting import build_prompt, build_system_instruction
from tutor_rag.repositories.chunks import ChunkRepository


class RagPipeline:
    def __init__(self, provider: GeminiProvider, repository: ChunkRepository):
        self.provider = provider
        self.repository = repository

    def prepare(self, request: PrepareRequest) -> PreparedAnswer:
        # Tahap 1: ubah pertanyaan ke ruang vektor yang sama dengan embedding dokumen.
        # Tanpa materi terpilih, tidak perlu membayar panggilan embedding ke Gemini.
        chunks = []
        if request.selected_material_ids:
            embedding = self.provider.embed_question(request.question)
            # Tahap 2: cari potongan materi paling relevan dalam course dan pilihan pengguna.
            chunks = self.repository.retrieve(
                request.course.id, request.selected_material_ids, embedding
            )
        # Tahap 3: gabungkan sumber, riwayat, dan instruksi jawaban menjadi konteks LLM.
        # Generasi dipisahkan dari persiapan agar konteks identik untuk chat dan streaming.
        return PreparedAnswer(
            chunks=chunks,
            system_instruction=build_system_instruction(request),
            prompt=build_prompt(request, chunks),
        )
