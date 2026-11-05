import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

from tutor_rag.api.dependencies import authorize, get_settings
from tutor_rag.assessment.posttest import PosttestService
from tutor_rag.assessment.service import AssessmentService
from tutor_rag.contracts.rag import ContractModel
from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.database import connect_database
from tutor_rag.learning.practice import PracticeService, record_study

router = APIRouter(prefix="/v1/assessment", dependencies=[Depends(authorize)])
logger = logging.getLogger(__name__)


class StudentContext(ContractModel):
    student_id: str
    course_id: str
    attempt_id: str | None = None
    question_id: str | None = None
    selected_option: Literal["A", "B", "C", "D"] | None = None
    kind: Literal["PRE", "POST"] = "PRE"
    practice_id: str | None = None
    request_id: str | None = None
    chat_session_id: str | None = None
    message_id: str | None = None


def utc_timestamp(value: datetime) -> str:
    # Prisma menyimpan DateTime sebagai timestamp UTC tanpa zona di PostgreSQL.
    # Sertakan offset saat mengirim JSON agar browser tidak menafsirkannya sebagai waktu lokal.
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.isoformat()


@router.post("/{operation}")
def assessment(
    operation: Literal[
        "overview",
        "current",
        "start",
        "save",
        "submit",
        "profile",
        "review",
        "comparison",
        "practice-current",
        "practice-accept",
        "practice-dismiss",
        "practice-answer",
        "practice-hint",
        "study",
    ],
    request: StudentContext,
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        with connect_database(settings) as connection:
            service = (
                PosttestService(connection, request.student_id, request.course_id)
                if request.kind == "POST"
                else AssessmentService(connection, request.student_id, request.course_id)
            )
            if operation == "study":
                service.require_access()
                # Belajar dicatat setelah jawaban AI bersumber benar-benar tersimpan di LMS.
                message = connection.execute(
                    "SELECT m.id FROM ai_chat_message m JOIN ai_chat_session s "
                    'ON s.id=m."aiChatSessionId" WHERE m.id=%s AND s.id=%s '
                    'AND s."userId"=%s AND s."courseId"=%s AND m."senderType"=\'ai\' '
                    "AND jsonb_array_length(m.\"ragSources\"->'sources')>0 "
                    "AND m.\"ragSources\"->'adaptive'->>'action'<>'CLARIFY'",
                    (
                        request.message_id,
                        request.chat_session_id,
                        request.student_id,
                        request.course_id,
                    ),
                ).fetchone()
                if message:
                    PracticeService(
                        connection, request.student_id, request.course_id, settings
                    ).require_pretest()
                    record_study(connection, request.student_id, request.course_id)
                result = {"recorded": message is not None}
            elif operation.startswith("practice-"):
                if not request.practice_id:
                    raise HTTPException(422, "ID latihan wajib diisi.")
                practice = PracticeService(
                    connection, request.student_id, request.course_id, settings
                )
                if operation == "practice-current":
                    result = practice.current(request.practice_id)
                elif operation in ("practice-accept", "practice-dismiss"):
                    result = practice.change_status(
                        request.practice_id,
                        "ACTIVE" if operation == "practice-accept" else "DISMISSED",
                    )
                else:
                    if not request.request_id:
                        raise HTTPException(422, "ID permintaan wajib diisi.")
                    result = practice.interact(
                        request.practice_id,
                        request.request_id,
                        "HINT" if operation == "practice-hint" else "ANSWER",
                        request.selected_option,
                    )
            elif operation == "comparison":
                result = PosttestService(
                    connection, request.student_id, request.course_id
                ).comparison()
            elif operation == "save":
                if not request.attempt_id or not request.question_id:
                    raise HTTPException(422, "Sesi dan soal wajib diisi.")
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
