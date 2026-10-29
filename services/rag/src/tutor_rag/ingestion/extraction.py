import os
from collections.abc import Callable
from contextlib import closing
from pathlib import Path
from shutil import which

import pypdfium2 as pdfium
import pytesseract

from tutor_rag.core.config import OCR_LANGUAGES, PDF_RENDER_SCALE, PROJECT_ROOT, Settings
from tutor_rag.ingestion.cleaning import clean_text
from tutor_rag.ingestion.models import ExtractedPage


def recognize_page(page: pdfium.PdfPage) -> str:
    # PDF gambar perlu dirender sebelum dibaca OCR; skala dua mempertahankan detail huruf.
    # OCR tetap dicoba pada setiap halaman sesuai kebijakan pemrosesan yang sudah ada.
    bitmap = page.render(scale=PDF_RENDER_SCALE)
    try:
        with bitmap.to_pil() as image:
            text = pytesseract.image_to_string(
                image,
                lang=OCR_LANGUAGES,
                timeout=120,
            )
        return clean_text(text)
    finally:
        # Buffer gambar native harus dilepas agar dokumen panjang tidak menumpuk di memori.
        bitmap.close()


def extract_page(page: pdfium.PdfPage, number: int) -> ExtractedPage:
    # Embedded text adalah lapisan teks asli PDF, sedangkan OCR membaca tampilan halamannya.
    with closing(page.get_textpage()) as text_page:
        embedded_text = clean_text(text_page.get_text_bounded())
    ocr_text, ocr_error = "", None
    try:
        ocr_text = recognize_page(page)
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
    # Variabel proses diwariskan subprocess tanpa masalah literal quote pada Windows.
    # Path dengan spasi juga aman; tidak perlu merangkai --tessdata-dir lewat shlex.
    os.environ["TESSDATA_PREFIX"] = settings.tessdata_prefix
    # Utamakan konfigurasi eksplisit/PATH; runtime lokal menjaga setup Windows tetap mandiri.
    # Binary berada di .tools yang diabaikan Git, bukan menjadi bagian source aplikasi.
    candidates = [
        settings.tesseract_cmd,
        which("tesseract"),
        str(PROJECT_ROOT / ".tools" / "tesseract" / "tesseract.exe"),
        str(
            Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
            / "Tesseract-OCR"
            / "tesseract.exe"
        ),
    ]
    executable = next(
        (candidate for candidate in candidates if candidate and Path(candidate).is_file()), None
    )
    if executable:
        pytesseract.pytesseract.tesseract_cmd = executable
    pages = []
    # Simpan hasil per halaman agar cleaning, chunking, dan sumber jawaban tetap terlacak.
    with pdfium.PdfDocument(data) as document:
        for index in range(len(document)):
            with closing(document[index]) as page:
                pages.append(extract_page(page, index + 1))
            # Callback hanya melaporkan progres; detail penyimpanan tetap di repository.
            on_page(index + 1, len(document))
    return pages
