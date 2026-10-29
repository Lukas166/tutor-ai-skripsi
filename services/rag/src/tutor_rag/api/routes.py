import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from tutor_rag.api.dependencies import Pipeline, authorize
from tutor_rag.contracts.rag import (
    AvatarExpression,
    AvatarExpressionRequest,
    GenerateRequest,
    PreparedAnswer,
    PrepareRequest,
)
from tutor_rag.rag.avatar import choose_expression
from tutor_rag.rag.pipeline import RagPipeline

logger = logging.getLogger(__name__)
router = APIRouter()
internal = APIRouter(prefix="/v1", dependencies=[Depends(authorize)])


@router.get("/health")
def health() -> dict[str, str]:
    # Pemeriksaan proses tidak membaca materi, mengubah database, atau memanggil Gemini.
    return {"status": "ok", "service": "tutor-rag"}


@internal.post("/prepare", response_model=PreparedAnswer)
def prepare(request: PrepareRequest, pipeline: Pipeline) -> PreparedAnswer:
    # Endpoint hanya memetakan HTTP ke pipeline; algoritma RAG berada di folder rag.
    try:
        return pipeline.prepare(request)
    except Exception as error:
        logger.error("Persiapan RAG gagal (%s)", type(error).__name__)
        raise HTTPException(502, "Persiapan konteks RAG gagal.") from None


@internal.post("/generate")
def generate(request: GenerateRequest, pipeline: Pipeline) -> dict[str, str]:
    try:
        return {"text": pipeline.provider.generate(request)}
    except Exception as error:
        logger.error("Generasi RAG gagal (%s)", type(error).__name__)
        raise HTTPException(502, "Generasi jawaban RAG gagal.") from None


@internal.post("/avatar-expression")
def avatar_expression(
    request: AvatarExpressionRequest, pipeline: Pipeline
) -> dict[str, AvatarExpression]:
    return {"expression": choose_expression(request, pipeline.provider)}


def answer_events(pipeline: RagPipeline, request: GenerateRequest) -> Iterator[str]:
    try:
        for text in pipeline.provider.stream(request):
            yield json.dumps({"type": "text", "text": text}, ensure_ascii=False) + "\n"
        # Event done membedakan jawaban selesai dari koneksi putus setelah teks parsial.
        yield json.dumps({"type": "done"}) + "\n"
    except Exception as error:
        # Error SDK tidak diteruskan mentah karena bisa memuat URL atau kredensial internal.
        logger.error("Streaming RAG gagal (%s)", type(error).__name__)
        yield json.dumps({"type": "error", "error": "Streaming RAG gagal."}) + "\n"


@internal.post("/generate/stream")
def stream(request: GenerateRequest, pipeline: Pipeline) -> StreamingResponse:
    # Python mengirim NDJSON ke Next.js; Next.js membungkusnya menjadi SSE untuk UI LMS.
    return StreamingResponse(
        answer_events(pipeline, request),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


router.include_router(internal)
