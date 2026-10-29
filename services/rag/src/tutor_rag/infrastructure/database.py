from typing import Any

import psycopg
from psycopg.rows import dict_row

from tutor_rag.core.config import Settings


def connect_database(settings: Settings) -> psycopg.Connection[dict[str, Any]]:
    # Prisma dan Python memakai PostgreSQL yang sama; tidak ada salinan database AI.
    url = settings.database_url.get_secret_value()
    if not url:
        raise ValueError("DATABASE_URL belum diatur.")

    # Autocommit menutup transaksi query singkat sebelum proses OCR atau panggilan Gemini.
    # Repository membuka transaction() secara eksplisit untuk operasi tulis yang atomik.
    return psycopg.connect(url, autocommit=True, row_factory=dict_row, connect_timeout=10)
