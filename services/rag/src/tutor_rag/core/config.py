from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Konfigurasi tetap dibaca dari root LMS, meskipun layanan dijalankan dari services/rag.
PROJECT_ROOT = Path(__file__).resolve().parents[5]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # SecretStr mencegah kunci API dan kredensial tampil saat objek konfigurasi dicetak.
    database_url: SecretStr = SecretStr("")
    gemini_api_key: SecretStr = SecretStr("")
    rag_service_token: SecretStr = SecretStr("")
    supabase_url: str = ""
    supabase_service_role_key: SecretStr = SecretStr("")
    supabase_storage_bucket: str = "course-materials"
    gemini_chat_model: str = "gemini-3.5-flash"
    tesseract_cmd: str = ""
    tessdata_prefix: str = str(PROJECT_ROOT)
    rag_worker_poll_seconds: float = Field(default=5, gt=0)
    rag_service_port: int = Field(default=8001, ge=1, le=65535)
    # Worker diaktifkan bersama API agar unggahan LMS langsung masuk alur ingestion.
    rag_worker_enabled: bool = True

    @field_validator("tessdata_prefix", mode="before")
    @classmethod
    def default_tessdata_directory(cls, value: str) -> str:
        return value or str(PROJECT_ROOT)


# Parameter ingestion: ukuran chunk dan overlap menentukan batas unit pengetahuan.
CHUNK_SIZE = 2400
CHUNK_OVERLAP = 300
OCR_LANGUAGES = "eng+ind"
PDF_RENDER_SCALE = 2

# Embedding dokumen dan pertanyaan wajib memakai model serta dimensi yang sama.
# Dimensi 768 mengikuti kolom vector(768) yang sudah ada; menggantinya perlu reindex.
EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIMENSIONS = 768

# Parameter retrieval membatasi sumber berdasarkan ranking dan kemiripan kosinus.
MAX_CONTEXT_CHUNKS = 8
MIN_SIMILARITY = 0.5

# Batas konteks dan riwayat menjaga ukuran prompt; ini bukan batas tokenisasi model.
MAX_CONTEXT_CHARS = 1400
MAX_HISTORY_MESSAGES = 8
