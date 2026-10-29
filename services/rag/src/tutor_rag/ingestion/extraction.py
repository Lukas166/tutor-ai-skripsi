from collections.abc import Callable
from contextlib import closing

import pypdfium2 as pdfium
import pytesseract

from tutor_rag.core.config import OCR_LANGUAGES, PDF_RENDER_SCALE, Settings
from tutor_rag.ingestion.cleaning import clean_text
from tutor_rag.ingestion.models import ExtractedPage


def recognize_page(page: pdfium.PdfPage, settings: Settings) -> str:
    # PDF gambar perlu dirender sebelum dibaca OCR; skala dua mempertahankan detail huruf.
    # OCR tetap dicoba pada setiap halaman sesuai kebijakan pemrosesan yang sudah ada.
    bitmap = page.render(scale=PDF_RENDER_SCALE)
    try:
        with bitmap.to_pil() as image:
            text = pytesseract.image_to_string(
                image,
                lang=OCR_LANGUAGES,
                timeout=120,
                config=f'--tessdata-dir "{settings.tessdata_prefix}"',
            )
        return clean_text(text)
    finally:
        # Buffer gambar native harus dilepas agar dokumen panjang tidak menumpuk di memori.
        bitmap.close()


def extract_page(page: pdfium.PdfPage, number: int, settings: Settings) -> ExtractedPage:
    # Embedded text adalah lapisan teks asli PDF, sedangkan OCR membaca tampilan halamannya.
    with closing(page.get_textpage()) as text_page:
        embedded_text = clean_text(text_page.get_text_bounded())
    ocr_text, ocr_error = "", None
    try:
        ocr_text = recognize_page(page, settings)
    except Exception as error:
        # PDF teks masih bisa diindeks ketika OCR gagal; penyebab dicatat pada metadata.
        # Untuk PDF scan tanpa embedded text, hasil kosong akan ditolak pipeline ingestion.
        ocr_error = type(error).__name__

    # Kedua hasil tetap digabung untuk mempertahankan kebijakan ekstraksi sebelumnya.
    final_text = clean_text("\n\n".join(filter(None, [embedded_text, ocr_text])))
    return ExtractedPage(
        page_number=number,
        embedded_text=embedded_text,
        ocr_text=ocr_text,
        final_text=final_text,
        image_ocr_attempted=True,
        metadata={
            "embeddedTextLength": len(embedded_text),
            "ocrTextLength": len(ocr_text),
            "ocrError": ocr_error,
            "renderScale": PDF_RENDER_SCALE,
        },
    )


def extract_pdf(
    data: bytes, settings: Settings, on_page: Callable[[int, int], None]
) -> list[ExtractedPage]:
    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
    pages = []
    # Simpan hasil per halaman agar cleaning, chunking, dan sumber jawaban tetap terlacak.
    with pdfium.PdfDocument(data) as document:
        for index in range(len(document)):
            with closing(document[index]) as page:
                pages.append(extract_page(page, index + 1, settings))
            # Callback hanya melaporkan progres; detail penyimpanan tetap di repository.
            on_page(index + 1, len(document))
    return pages
