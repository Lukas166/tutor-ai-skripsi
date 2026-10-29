import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from tutor_rag.api.dependencies import authorize, get_settings
from tutor_rag.assessment.service import AssessmentService
from tutor_rag.contracts.rag import ContractModel
from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.database import connect_database

router = APIRouter(prefix="/v1/assessment", dependencies=[Depends(authorize)])
logger = logging.getLogger(__name__)


class StudentContext(ContractModel):
    student_id: str
    course_id: str
    attempt_id: str | None = None
    question_id: str | None = None
    selected_option: Literal["A", "B", "C", "D", "E"] | None = None


def utc_timestamp(value: datetime) -> str:
    # Prisma menyimpan DateTime sebagai timestamp UTC tanpa zona di PostgreSQL.
    # Sertakan offset saat mengirim JSON agar browser tidak menafsirkannya sebagai waktu lokal.
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.isoformat()


@router.post("/{operation}")
def assessment(
    operation: Literal["overview", "current", "start", "save", "submit", "profile"],
    request: StudentContext,
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        with connect_database(settings) as connection:
            service = AssessmentService(connection, request.student_id, request.course_id)
            if operation == "save":
                if not request.attempt_id or not request.question_id or not request.selected_option:
                    raise HTTPException(422, "Sesi, soal, dan pilihan wajib diisi.")
                result = service.save(
                    request.attempt_id, request.question_id, request.selected_option
                )
            elif operation == "submit":
                if not request.attempt_id:
                    raise HTTPException(422, "ID sesi wajib diisi.")
                result = service.submit(request.attempt_id)
            else:
                result = getattr(service, operation)()
            return jsonable_encoder(result, custom_encoder={datetime: utc_timestamp})
    except HTTPException:
        raise
    except Exception as error:
        logger.error("Assessment %s gagal (%s)", operation, type(error).__name__)
        raise HTTPException(
            503, "Layanan pre-test belum dapat memproses permintaan. Coba lagi."
        ) from None
