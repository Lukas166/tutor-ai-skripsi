import math

from langchain_text_splitters import RecursiveCharacterTextSplitter

from tutor_rag.core.config import CHUNK_OVERLAP, CHUNK_SIZE
from tutor_rag.ingestion.models import ExtractedPage, PreparedChunk


def chunk_pages(pages: list[ExtractedPage]) -> list[PreparedChunk]:
    # Pemisahan bertingkat mencoba paragraf, baris, kalimat, kata, lalu karakter.
    # Overlap mempertahankan konteks di sekitar batas dua chunk yang berdekatan.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
        keep_separator=True,
        strip_whitespace=True,
    )
    chunks: list[PreparedChunk] = []
    for page in pages:
        # Chunk tidak melintasi halaman agar nomor halaman rujukan tetap tepat.
        for content in splitter.split_text(page.final_text):
            content = content.strip()
            if not content:
                continue
            chunks.append(
                PreparedChunk(
                    page_number=page.page_number,
                    chunk_index=len(chunks),
                    content=content,
                    # Estimasi panjang ini untuk metadata, bukan tokenizer asli Gemini.
                    token_count=max(1, math.ceil(len(content) / 4)),
                    metadata={
                        "source": "pdf_page",
                        "chunkSize": CHUNK_SIZE,
                        "chunkOverlap": CHUNK_OVERLAP,
                        "pageNumber": page.page_number,
                    },
                )
            )
    return chunks
