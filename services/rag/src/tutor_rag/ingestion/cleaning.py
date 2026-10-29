import re


def clean_text(text: str) -> str:
    # Buang karakter null karena PostgreSQL tidak menerima null byte pada kolom teks.
    text = text.replace("\x00", "").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)

    # Sambungkan kata yang terpotong tanda hubung saat pergantian baris pada PDF.
    text = re.sub(r"-\n(?=[A-Za-z0-9])", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)

    # Pertahankan jeda paragraf karena dipakai sebagai pemisah utama saat chunking.
    return re.sub(r"\n{3,}", "\n\n", text).strip()
