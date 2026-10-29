from tutor_rag.contracts.rag import RetrievedChunk
from tutor_rag.core.config import MAX_CONTEXT_CHUNKS, MIN_SIMILARITY, Settings
from tutor_rag.infrastructure.database import connect_database
from tutor_rag.infrastructure.gemini import to_pgvector

# Operator <=> menghitung jarak kosinus pgvector; 1 - jarak menjadi similarity.
# Filter course, materi terpilih, dan status ready mencegah sumber dari konteks lain.
RETRIEVE_SQL = """
SELECT c.id AS "chunkId", c."materialId", c."sessionId", c."pageNumber",
       c."chunkIndex", c.content,
       (1 - (c.embedding <=> %(vector)s::vector))::double precision AS similarity,
       m.title AS "materialTitle", m."fileName", s.title AS "sessionTitle"
FROM material_chunk c
JOIN material m ON m.id = c."materialId"
JOIN course_session s ON s.id = c."sessionId"
WHERE c."courseId" = %(course_id)s
  AND s."courseId" = %(course_id)s
  AND c.embedding IS NOT NULL
  AND m."isActive" = true AND m."isProcessed" = true
  AND m."processingStatus" = 'ready' AND m."materialType" = 'file'
  AND m.id = ANY(%(material_ids)s)
  AND s."isActive" = true
ORDER BY c.embedding <=> %(vector)s::vector
LIMIT %(limit)s
"""


class ChunkRepository:
    def __init__(self, settings: Settings):
        self.settings = settings

    def retrieve(
        self, course_id: str, material_ids: list[str], embedding: list[float]
    ) -> list[RetrievedChunk]:
        if not material_ids:
            return []
        # Nilai diikat sebagai parameter SQL; daftar ID bukan hasil interpolasi string.
        with connect_database(self.settings) as connection:
            rows = connection.execute(
                RETRIEVE_SQL,
                {
                    "vector": to_pgvector(embedding),
                    "course_id": course_id,
                    "material_ids": list(dict.fromkeys(material_ids)),
                    "limit": MAX_CONTEXT_CHUNKS,
                },
            ).fetchall()
        # Ambil top-k terlebih dahulu, lalu buang kandidat di bawah ambang relevansi.
        # Urutan dan ambang dipertahankan agar pemindahan bahasa tidak mengubah retrieval.
        return [RetrievedChunk(**row) for row in rows if row["similarity"] >= MIN_SIMILARITY]
