import math
from collections.abc import Iterator

from google import genai
from google.genai import types
from pydantic import BaseModel

from tutor_rag.contracts.rag import GenerateRequest
from tutor_rag.core.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, Settings

EMPTY_ANSWER = "Materi yang tersedia belum cukup untuk menjawab dengan pasti."


def validate_vector(values: list[float]) -> list[float]:
    # Tolak dimensi salah, NaN, dan infinity sebelum vektor masuk ke indeks PostgreSQL.
    if len(values) != EMBEDDING_DIMENSIONS or not all(math.isfinite(v) for v in values):
        raise ValueError(f"Embedding harus berisi {EMBEDDING_DIMENSIONS} angka finite.")
    return values


def to_pgvector(values: list[float]) -> str:
    # Delapan angka desimal mempertahankan format penyimpanan embedding sebelumnya.
    return "[" + ",".join(f"{v:.8f}" for v in validate_vector(values)) + "]"


class GeminiProvider:
    # Adapter ini mengisolasi SDK Gemini dari logika ingestion dan retrieval.
    def __init__(self, settings: Settings):
        self.settings = settings

    def _client(self, timeout_ms: int) -> genai.Client:
        api_key = self.settings.gemini_api_key.get_secret_value()
        if not api_key:
            raise ValueError("GEMINI_API_KEY belum diatur.")
        return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))

    def _embed(self, content: str, task: str) -> list[float]:
        # Task embedding berbeda untuk dokumen dan query, tetapi ruang vektornya sama.
        with self._client(45_000) as client:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=content,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSIONS, task_type=task
                ),
            )
        values = response.embeddings[0].values if response.embeddings else None
        return validate_vector(values or [])

    def embed_document(self, title: str, content: str) -> list[float]:
        # Judul/nomor halaman memberi konteks dokumen; format ini cocok dengan indeks lama.
        return self._embed(f"title: {title or 'none'} | text: {content}", "RETRIEVAL_DOCUMENT")

    def embed_question(self, question: str) -> list[float]:
        # Pertanyaan tidak memakai prefix judul karena berfungsi sebagai query pencarian.
        return self._embed(question, "RETRIEVAL_QUERY")

    def _generation_config(self, request: GenerateRequest) -> types.GenerateContentConfig:
        # Parameter generasi dijaga tetap agar refaktor tidak menjadi perubahan eksperimen.
        return types.GenerateContentConfig(
            system_instruction=request.system_instruction,
            temperature=0.25,
            top_p=0.85,
            max_output_tokens=8192,
        )

    def generate(self, request: GenerateRequest) -> str:
        # Jawaban chat/avatar dan inferensi ekspresi memakai jalur generasi Python yang sama.
        with self._client(60_000) as client:
            response = client.models.generate_content(
                model=self.settings.gemini_chat_model or "gemini-3.5-flash",
                contents=request.prompt,
                config=self._generation_config(request),
            )
        return (response.text or "").strip() or EMPTY_ANSWER

    def generate_structured(self, prompt: str, instruction: str, schema: type[BaseModel]) -> str:
        # Output terstruktur membatasi kontrak klasifikasi; validasi ID tetap milik domain.
        with self._client(20_000) as client:
            response = client.models.generate_content(
                model=self.settings.gemini_chat_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0,
                ),
            )
        return response.text or "{}"

    def stream(self, request: GenerateRequest) -> Iterator[str]:
        # Generator mengirim teks bertahap; instruksi gaya chat/avatar sudah ada pada prompt.
        # Context manager membatasi umur koneksi upstream selama iterasi berlangsung.
        with self._client(60_000) as client:
            for chunk in client.models.generate_content_stream(
                model=self.settings.gemini_chat_model or "gemini-3.5-flash",
                contents=request.prompt,
                config=self._generation_config(request),
            ):
                if chunk.text:
                    yield chunk.text
