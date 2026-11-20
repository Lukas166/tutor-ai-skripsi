from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

AvatarExpression = Literal["neutral", "happy", "concerned"]


class ContractModel(BaseModel):
    # Kode Python memakai snake_case; JSON HTTP tetap camelCase agar kompatibel dengan LMS.
    # Konversi hanya dilakukan pada batas API, bukan pada algoritma RAG atau kolom SQL.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class TutorUser(ContractModel):
    id: str | None = None
    name: str | None = None
    role: str
    academic_level: str | None = None


class Course(ContractModel):
    id: str
    title: str
    description: str | None = None


class Material(ContractModel):
    id: str
    title: str
    file_name: str


class HistoryMessage(ContractModel):
    sender_type: Literal["user", "ai"]
    content: str


class PrepareRequest(ContractModel):
    # Next.js mengirim konteks yang telah lolos pemeriksaan akses course dan sesi chat.
    course: Course
    user: TutorUser
    question: str = Field(min_length=1, max_length=8000)
    selected_material_ids: list[str] = Field(max_length=1000)
    active_materials: list[Material] = Field(max_length=1000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=8)
    response_mode: Literal["chat", "avatar"] = "chat"
    chat_session_id: str | None = None
    purpose: Literal["answer", "welcome", "practice_followup"] = "answer"
    practice_event_id: str | None = None


class RetrievedChunk(ContractModel):
    # Identitas dokumen, sesi, dan halaman ikut dibawa untuk membentuk rujukan jawaban.
    chunk_id: str
    material_id: str
    session_id: str
    page_number: int
    chunk_index: int
    content: str
    similarity: float
    material_title: str
    file_name: str
    session_title: str


class PreparedAnswer(ContractModel):
    # Hasil retrieval dan penyusunan prompt dipakai bersama oleh generasi biasa/streaming.
    chunks: list[RetrievedChunk]
    system_instruction: str
    prompt: str
    adaptive: dict | None = None


class GenerateRequest(ContractModel):
    system_instruction: str = Field(min_length=1)
    prompt: str = Field(min_length=1)


class AvatarExpressionRequest(ContractModel):
    answer: str
    question: str = Field(max_length=8000)
    response_mode: Literal["chat", "avatar"] = "avatar"
