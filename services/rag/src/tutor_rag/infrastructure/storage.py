from urllib.parse import quote

import httpx

from tutor_rag.core.config import Settings


def download_pdf(storage_path: str, settings: Settings) -> bytes:
    key = settings.supabase_service_role_key.get_secret_value()
    if not settings.supabase_url or not key:
        raise ValueError("Konfigurasi Supabase Storage belum lengkap.")
    if storage_path.startswith("/") or any(p in (".", "..") for p in storage_path.split("/")):
        raise ValueError("storagePath bukan object path Supabase yang valid.")
    # Dokumen diambil dari bucket yang dikonfigurasi, bukan URL bebas dari isian materi.
    # Setiap segmen path dienkode agar spasi dan karakter khusus tidak merusak URL objek.
    url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
        f"{quote(settings.supabase_storage_bucket, safe='')}/{quote(storage_path, safe='/')}"
    )
    with httpx.Client(timeout=60) as client:
        response = client.get(url, headers={"Authorization": f"Bearer {key}", "apikey": key})
        if response.is_error:
            raise RuntimeError(f"Unduh PDF gagal (HTTP {response.status_code}).")
        return response.content
