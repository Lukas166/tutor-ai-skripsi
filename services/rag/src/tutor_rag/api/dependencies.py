import hmac
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.rag.pipeline import RagPipeline
from tutor_rag.repositories.chunks import ChunkRepository


@lru_cache
def get_settings() -> Settings:
    # Satu konfigurasi dipakai sepanjang umur proses; perubahan .env memerlukan restart.
    return Settings()


def authorize(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.rag_service_token.get_secret_value()
    if not expected:
        raise HTTPException(503, "RAG_SERVICE_TOKEN belum diatur.")

    # Token ini hanya digunakan antarlayanan. Browser tetap diautentikasi oleh LMS.
    # Perbandingan konstan waktu menghindari perbandingan secret dengan operator biasa.
    if not hmac.compare_digest((authorization or "").encode(), f"Bearer {expected}".encode()):
        raise HTTPException(401, "Unauthorized")


def get_pipeline(settings: Annotated[Settings, Depends(get_settings)]) -> RagPipeline:
    # Penyusunan dependensi dipusatkan agar router tidak berisi konfigurasi SDK atau SQL.
    return RagPipeline(GeminiProvider(settings), ChunkRepository(settings))


Pipeline = Annotated[RagPipeline, Depends(get_pipeline)]
