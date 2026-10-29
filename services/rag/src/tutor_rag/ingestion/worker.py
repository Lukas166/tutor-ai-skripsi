import logging
from threading import Event

from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.database import connect_database
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.ingestion.pipeline import process_material
from tutor_rag.repositories.materials import LostLeaseError, MaterialRepository

logger = logging.getLogger(__name__)


def run_worker(settings: Settings, stopping: Event) -> None:
    # Worker dipanggil oleh lifespan API; tidak memiliki CLI atau entry point tersendiri.
    # Upload/retry dari LMS tetap menulis antrean pada tabel material yang sama.
    provider = GeminiProvider(settings)
    logger.info("Worker ingestion dokumen aktif")
    while not stopping.is_set():
        try:
            with connect_database(settings) as connection:
                repository = MaterialRepository(connection)
                job = repository.claim()
                if job:
                    logger.info("Memproses material %s", job.id)
                    process_material(job, repository, provider, settings)
        except LostLeaseError:
            logger.warning("Kepemilikan job berubah; hasil worker lama diabaikan")
        except Exception as error:
            # Nama jenis error cukup untuk log layanan tanpa mencetak URL atau API key.
            logger.error("Worker ingestion gagal (%s)", type(error).__name__)
        # Event.wait dapat dibangunkan saat shutdown; tidak perlu loop polling yang rapat.
        stopping.wait(settings.rag_worker_poll_seconds)
