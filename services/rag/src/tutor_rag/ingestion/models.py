from dataclasses import dataclass, field

# Struktur internal ingestion menggunakan dataclass agar hasil tiap tahap jelas dan bertipe.
# Metadata menyimpan asal halaman dan parameter proses untuk penelusuran hasil RAG.
Metadata = dict[str, str | int | float | bool | None]


@dataclass(frozen=True, slots=True)
class MaterialJob:
    id: str
    title: str
    storage_path: str
    course_session_id: str
    processing_job_id: str


@dataclass(frozen=True, slots=True)
class ExtractedPage:
    page_number: int
    embedded_text: str
    ocr_text: str
    final_text: str
    image_ocr_attempted: bool
    metadata: Metadata = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class PreparedChunk:
    page_number: int
    chunk_index: int
    content: str
    token_count: int
    metadata: Metadata
