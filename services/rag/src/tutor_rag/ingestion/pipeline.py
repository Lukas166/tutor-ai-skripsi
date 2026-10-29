from tutor_rag.core.config import Settings
from tutor_rag.infrastructure.gemini import GeminiProvider
from tutor_rag.infrastructure.storage import download_pdf
from tutor_rag.ingestion.chunking import chunk_pages
from tutor_rag.ingestion.extraction import extract_pdf
from tutor_rag.ingestion.models import MaterialJob
from tutor_rag.repositories.materials import LostLeaseError, MaterialRepository


def process_material(
    job: MaterialJob, repository: MaterialRepository, provider: GeminiProvider, settings: Settings
) -> None:
    stage = "extracting"
    try:
        # Tahap 1: baca PDF dari object storage menggunakan path yang tersimpan pada LMS.
        repository.set_state(job, stage, 10, "Mengambil embedded text PDF")
        pdf = download_pdf(job.storage_path, settings)

        def on_page(page_number: int, page_count: int) -> None:
            repository.set_state(
                job,
                "ocr",
                10 + round(page_number / page_count * 50),
                page_count=page_count,
            )

        # Tahap 2: ekstraksi dan OCR per halaman, lalu cleaning teks sebelum dipotong.
        pages = extract_pdf(pdf, settings, on_page)
        stage = "chunking"
        repository.set_state(job, stage, 65, "Melakukan cleaning text dan chunking")
        chunks = chunk_pages(pages)
        if not chunks:
            raise ValueError("Tidak ada teks yang berhasil diekstrak atau di-OCR dari PDF.")

        # Tahap 3: ubah setiap chunk menjadi embedding dokumen dengan provenance halaman.
        stage = "embedding"
        repository.set_state(job, stage, 70, "Membuat embedding Gemini")
        embeddings = []
        for index, chunk in enumerate(chunks, start=1):
            embeddings.append(
                provider.embed_document(
                    f"{job.title} - halaman {chunk.page_number}",
                    chunk.content,
                )
            )
            repository.set_state(
                job,
                stage,
                70 + round(index / len(chunks) * 20),
                chunk_count=index,
                page_count=len(pages),
            )

        # Tahap 4: publikasikan hasil lengkap sekaligus; indeks parsial tidak dipakai retrieval.
        stage = "indexing"
        repository.set_state(job, stage, 95, "Menyimpan index pgvector")
        repository.publish(job, pages, chunks, embeddings)
    except LostLeaseError:
        # Kepemilikan berubah: jangan mengubah status atau hasil milik worker yang baru.
        raise
    except Exception as error:
        # Status gagal tetap terlihat pada LMS, tanpa membocorkan kredensial dari error SDK.
        repository.set_state(
            job,
            "failed",
            100,
            "Processing materi gagal; periksa log worker.",
            error=f"Pemrosesan gagal pada tahap {stage} ({type(error).__name__}).",
        )
        raise
