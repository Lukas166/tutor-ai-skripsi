from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from tutor_rag.core.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from tutor_rag.infrastructure.gemini import to_pgvector
from tutor_rag.ingestion.models import ExtractedPage, MaterialJob, PreparedChunk

# SKIP LOCKED membolehkan beberapa worker mengambil job berbeda tanpa memproses baris yang sama.
# Job yang berhenti memberi pembaruan selama dua jam dapat diambil kembali oleh worker lain.
CLAIM_SQL = """
UPDATE material SET "processingStatus" = 'processing', "processingProgress" = 5,
    "processingStartedAt" = NOW(), "processingCompletedAt" = NULL,
    "processingJobId" = %s, "processingError" = NULL,
    "isProcessed" = false, "updatedAt" = NOW()
WHERE id = (
    SELECT id FROM material
    WHERE "materialType" = 'file' AND "storagePath" IS NOT NULL
      AND "storagePath" NOT LIKE '/%%' AND LOWER("fileName") LIKE '%%.pdf'
      AND (%s::text IS NULL OR "courseSessionId" IN (
          SELECT id FROM course_session WHERE "courseId"=%s
      ))
      AND ("processingStatus" IN ('queued', 'uploaded') OR (
        "processingStatus" IN ('processing','extracting','ocr','chunking','embedding','indexing')
        AND "updatedAt" < NOW() - INTERVAL '2 hours'
      ))
    ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1
) RETURNING id, title, "storagePath" AS storage_path,
    "courseSessionId" AS course_session_id, "processingJobId" AS processing_job_id
"""


class LostLeaseError(RuntimeError):
    pass


class MaterialRepository:
    # Semua SQL tulis ingestion terkumpul di sini, terpisah dari ekstraksi dan embedding.
    def __init__(self, connection: psycopg.Connection[dict[str, Any]]):
        self.connection = connection

    def claim(self, course_id: str | None = None) -> MaterialJob | None:
        # Token unik per pengambilan mencegah worker lama menimpa hasil job yang diambil ulang.
        # Scope opsional membatasi pemrosesan ulang dataset tertentu tanpa menyentuh course lain.
        row = self.connection.execute(
            CLAIM_SQL, (f"python-worker:{uuid4()}", course_id, course_id)
        ).fetchone()
        return MaterialJob(**row) if row else None

    def set_state(
        self,
        job: MaterialJob,
        status: str,
        progress: int,
        message: str | None = None,
        *,
        page_count: int | None = None,
        chunk_count: int | None = None,
        error: str | None = None,
    ) -> None:
        # Nama kolom database tetap camelCase; pemanggil Python memakai parameter snake_case.
        values: dict[str, Any] = {
            "processingStatus": status,
            "processingProgress": max(0, min(100, round(progress))),
            "processingError": error,
            "isProcessed": status == "ready",
        }
        if page_count is not None:
            values["pageCount"] = page_count
        if chunk_count is not None:
            values["chunkCount"] = chunk_count
        if status in ("ready", "failed"):
            values["processingCompletedAt"] = datetime.now(UTC)
        if status == "ready":
            values.update(embeddingModel=EMBEDDING_MODEL, embeddingDimensions=EMBEDDING_DIMENSIONS)

        # Identifier membatasi penyusunan nama kolom; nilai selalu dikirim sebagai parameter.
        assignments: list[sql.Composable] = [
            sql.SQL("{} = %s").format(sql.Identifier(key)) for key in values
        ]
        assignments.append(sql.SQL('"updatedAt" = NOW()'))
        query = sql.SQL(
            'UPDATE material SET {} WHERE id = %s AND "processingJobId" = %s RETURNING id'
        ).format(sql.SQL(", ").join(assignments))
        with self.connection.transaction():
            row = self.connection.execute(
                query, [*values.values(), job.id, job.processing_job_id]
            ).fetchone()
            if row is None:
                raise LostLeaseError("Material sudah dihapus atau diambil worker lain.")
            if message:
                self.connection.execute(
                    "INSERT INTO material_processing_log "
                    '(id, "materialId", status, message, error) VALUES (%s,%s,%s,%s,%s)',
                    (str(uuid4()), job.id, status, message, error),
                )

    def publish(
        self,
        job: MaterialJob,
        pages: list[ExtractedPage],
        chunks: list[PreparedChunk],
        embeddings: list[list[float]],
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("Jumlah chunk dan embedding tidak cocok.")

        # Halaman, chunk, vektor, dan status ready merupakan satu snapshot dokumen.
        # Jika satu INSERT gagal, transaksi membatalkan seluruh penggantian indeks lama.
        with self.connection.transaction():
            row = self.connection.execute(
                'SELECT id FROM material WHERE id = %s AND "processingJobId" = %s FOR UPDATE',
                (job.id, job.processing_job_id),
            ).fetchone()
            if row is None:
                raise LostLeaseError("Kepemilikan job berubah sebelum publish.")
            session = self.connection.execute(
                'SELECT "courseId" FROM course_session WHERE id = %s',
                (job.course_session_id,),
            ).fetchone()
            if session is None:
                raise LostLeaseError("Sesi material sudah dihapus.")
            self.connection.execute('DELETE FROM material_page WHERE "materialId" = %s', (job.id,))
            self.connection.execute('DELETE FROM material_chunk WHERE "materialId" = %s', (job.id,))
            self._insert_pages(job.id, pages)
            self._insert_chunks(job, session["courseId"], chunks, embeddings)
            self.set_state(
                job,
                "ready",
                100,
                "Material siap digunakan untuk RAG",
                page_count=len(pages),
                chunk_count=len(chunks),
            )

    def _insert_pages(self, material_id: str, pages: list[ExtractedPage]) -> None:
        # Teks asli, OCR, dan teks gabungan disimpan terpisah untuk menelusuri hasil ekstraksi.
        with self.connection.cursor() as cursor:
            cursor.executemany(
                'INSERT INTO material_page (id, "materialId", "pageNumber", "embeddedText", '
                '"ocrText", "finalText", "textCharCount", "imageOcrAttempted", metadata) '
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                [
                    (
                        str(uuid4()),
                        material_id,
                        p.page_number,
                        p.embedded_text or None,
                        p.ocr_text or None,
                        p.final_text,
                        len(p.final_text),
                        p.image_ocr_attempted,
                        Jsonb(p.metadata),
                    )
                    for p in pages
                ],
            )

    def _insert_chunks(
        self,
        job: MaterialJob,
        course_id: str,
        chunks: list[PreparedChunk],
        embeddings: list[list[float]],
    ) -> None:
        # Hubungan course/sesi/halaman ikut disimpan agar retrieval dapat dibatasi dan dirujuk.
        with self.connection.cursor() as cursor:
            cursor.executemany(
                'INSERT INTO material_chunk (id, "materialId", "courseId", "sessionId", '
                '"pageNumber", "chunkIndex", content, "tokenCount", embedding, "chunkType", '
                "metadata) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s,%s)",
                [
                    (
                        str(uuid4()),
                        job.id,
                        course_id,
                        job.course_session_id,
                        c.page_number,
                        c.chunk_index,
                        c.content,
                        c.token_count,
                        to_pgvector(vector),
                        "page_text",
                        Jsonb(c.metadata),
                    )
                    for c, vector in zip(chunks, embeddings, strict=True)
                ],
            )
