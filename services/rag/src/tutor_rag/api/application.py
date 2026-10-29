import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from threading import Event, Thread

from fastapi import FastAPI

from tutor_rag.api.assessment import router as assessment_router
from tutor_rag.api.dependencies import get_settings
from tutor_rag.api.routes import router
from tutor_rag.ingestion.worker import run_worker


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if not settings.rag_service_token.get_secret_value():
        raise RuntimeError("Isi RAG_SERVICE_TOKEN pada .env sebelum menjalankan backend AI.")

    # Ingestion melakukan I/O sinkron dan OCR; thread terpisah menjaga API chat tetap responsif.
    # Worker membaca antrean database, bukan menjalankan pemrosesan dalam request upload LMS.
    stopping = Event()
    worker = None
    if settings.rag_worker_enabled:
        worker = Thread(target=run_worker, args=(settings, stopping), name="rag-ingestion")
        worker.start()
    try:
        yield
    finally:
        # Saat shutdown, hentikan pengambilan job baru dan selesaikan dokumen yang sudah diklaim.
        stopping.set()
        if worker:
            await asyncio.to_thread(worker.join)


# Uvicorn memuat objek ASGI ini secara langsung; tidak perlu __main__.py atau CLI buatan.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI(
    title="Tutor RAG",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.include_router(router)
app.include_router(assessment_router)
