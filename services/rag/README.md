# Backend AI untuk LMS

Backend Python ini menangani RAG dalam dua alur: ingestion dokumen dan penjawaban
pertanyaan. LMS Next.js tetap menangani tampilan, login, izin akses, sesi chat,
konfigurasi gaya jawaban admin, serta penyimpanan pesan.

## Struktur kode

```text
services/rag/
  pyproject.toml                 dependensi dan pemeriksaan kode
  uv.lock                        versi dependensi yang dikunci
  src/tutor_rag/
    api/
      application.py             objek aplikasi FastAPI dan siklus hidup worker
      dependencies.py            autentikasi antarlayanan dan penyusunan dependensi
      routes.py                  endpoint HTTP untuk LMS
    contracts/
      rag.py                     validasi request/response, alias JSON camelCase
    core/
      config.py                  environment dan parameter RAG
    ingestion/
      models.py                  struktur job, halaman, dan chunk
      pipeline.py                urutan ingestion dari PDF sampai indeks siap
      extraction.py              pembacaan PDF dan OCR per halaman
      cleaning.py                normalisasi teks hasil ekstraksi
      chunking.py                pemotongan teks dan metadata sumber
      worker.py                  pengambilan antrean dokumen dari database
    rag/
      pipeline.py                embedding query, retrieval, dan penyusunan konteks
      prompting.py               perakitan system instruction, riwayat, dan sumber
      templates.py               isi instruksi chat/avatar
      avatar.py                  pemilihan metadata ekspresi avatar
    repositories/
      chunks.py                  query pencarian vektor dan filter konteks
      materials.py               antrean, progres, serta publikasi indeks dokumen
    infrastructure/
      database.py                koneksi PostgreSQL
      gemini.py                  adapter embedding dan generasi Gemini
      storage.py                 pengunduhan object PDF dari Supabase
```

Modul Python memakai `snake_case`, dataclass untuk hasil ingestion, serta Pydantic
untuk kontrak HTTP. JSON ke LMS tetap `camelCase`. Import menggunakan namespace
package Python sehingga tidak membutuhkan file `__init__.py`. Uvicorn memuat objek
`app` dari `api/application.py`; tidak ada CLI buatan atau file `__main__.py`.

## Menjalankan aplikasi

Dari root repositori, siapkan dependensi:

```powershell
pnpm install
uv sync --project services/rag --locked
```

Pada workspace ini, uv lokal juga tersedia di `.tools/uv/uv.exe` jika `uv` belum ada
di PATH. Isi `.env` di root proyek:

```dotenv
DATABASE_URL=<koneksi-postgresql>
GEMINI_API_KEY=<kunci-gemini>
SUPABASE_URL=<url-supabase>
SUPABASE_SERVICE_ROLE_KEY=<kunci-storage>
RAG_SERVICE_URL=http://127.0.0.1:8001
RAG_SERVICE_PORT=8001
RAG_SERVICE_TOKEN=<token-acak-yang-sama-untuk-next-dan-python>
```

Lalu jalankan:

```powershell
pnpm dev
```

Perintah ini membuka server Next.js dan backend AI Python. Script penghubung ada di
`scripts/services/start-ai.ts` dan otomatis memakai `services/rag/.venv`.
Dalam mode development, perubahan kode Python di `services/rag/src` memicu reload
otomatis. Perubahan `.env` tetap memerlukan restart; `pnpm start` dan `pnpm rag:api`
menjalankan backend tanpa reload.
Worker ingestion aktif secara default dan berjalan bersama backend AI. Untuk mencoba, buka LMS,
login, unggah materi PDF, tunggu status ready, lalu ajukan pertanyaan pada tutor.

OCR memerlukan Tesseract 5. Selain PATH dan instalasi Windows standar, backend
mengenali `.tools/tesseract/tesseract.exe` bila runtime lokal disediakan. Binary
diabaikan Git; data bahasa Inggris dan Indonesia dibaca dari root proyek.
PDF dengan teks bawaan masih bisa diproses ketika OCR gagal; PDF scan tanpa lapisan
teks membutuhkan Tesseract agar dapat diindeks.

Untuk produksi, gunakan `pnpm build` lalu `pnpm start`. Backend AI mendengarkan
`127.0.0.1` secara default. Pada deployment terpisah, jalankan Next.js dengan
`pnpm start:next`, kelola API ASGI melalui process manager, dan atur
`RAG_SERVICE_URL` ke alamat backend AI yang dapat dijangkau server Next.js.

## Hubungan LMS dan backend AI

```text
Browser LMS
  -> Route Handler Next.js: login, enrollment, kepemilikan chat, pilihan materi
  -> HTTP internal ke FastAPI: retrieval, konteks, generasi jawaban
  -> Next.js: penyimpanan pesan/sumber dan pengiriman SSE
  -> Browser LMS: teks jawaban chat atau avatar
```

`src/lib/rag/python-client.ts` merupakan penghubung HTTP pada server Next.js.
`RAG_SERVICE_URL` menentukan alamat API Python. `RAG_SERVICE_TOKEN` dikirim pada
header Authorization dan diverifikasi di `api/dependencies.py`. Browser tidak
menerima token layanan atau kredensial Gemini/database; tidak diperlukan CORS
karena browser berkomunikasi dengan Next.js.

Endpoint internal:

| Endpoint | Tanggung jawab |
| --- | --- |
| `GET /health` | Memeriksa proses API hidup tanpa memanggil Gemini/database |
| `POST /v1/prepare` | Embedding pertanyaan, retrieval, penyusunan konteks dan prompt |
| `POST /v1/generate` | Generasi jawaban utuh |
| `POST /v1/generate/stream` | Generasi teks bertahap dalam NDJSON |
| `POST /v1/avatar-expression` | Pemilihan ekspresi untuk jawaban mode avatar |

Seluruh endpoint `/v1/*` memerlukan token antarlayanan. Next.js mengubah stream
NDJSON dari Python menjadi SSE yang sudah dipakai UI. Model respons menggunakan
alias camelCase agar perubahan penamaan Python tidak mengubah kontrak LMS.

## Alur dokumen dan alur pertanyaan

**Ingestion:** upload di LMS -> object Supabase dan antrean database -> ekstraksi/OCR
-> cleaning -> chunking -> embedding dokumen -> penyimpanan halaman/vektor -> ready.
Worker menggunakan PostgreSQL yang sama dengan Prisma. `SKIP LOCKED` memisahkan job
antarworker; token kepemilikan mencegah hasil job lama menimpa job baru. Halaman,
vektor, dan status ready dipublikasikan dalam satu transaksi.

**Penjawaban:** pertanyaan dari LMS -> embedding query -> top-k chunk dalam course
serta materi terpilih -> filter similarity -> konteks berisi sumber halaman dan
riwayat -> generasi Gemini -> jawaban dan metadata sumber. Mode chat/avatar memakai
hasil retrieval yang sama; instruksi penyajian jawabannya berbeda.

Worker mengikuti lifespan API dan mengambil job baru selama layanan aktif. Saat
shutdown normal, worker menyelesaikan dokumen yang sedang diproses lalu berhenti.
`RAG_WORKER_ENABLED=false` dapat dipakai untuk menjalankan API tanpa ingestion.
Job yang tidak mendapat pembaruan selama dua jam dapat diklaim ulang.

## Parameter dan batas pemrosesan

Parameter tetap mengikuti mekanisme yang sudah berjalan: embedding
`gemini-embedding-2`, vector 768 dimensi, chunk 2400 karakter, overlap 300, maksimal
delapan sumber, cosine similarity minimal 0.5, konteks 1400 karakter per chunk, dan
delapan pesan riwayat. Generasi memakai temperature 0.25, top-p 0.85, maksimum
8192 token, serta `GEMINI_CHAT_MODEL` dengan default `gemini-3.5-flash`.
Instruksi avatar mempertahankan batas 45 kata. Pemilihan ekspresi berjalan di Python;
rendering avatar dan pengolahan teks untuk TTS tetap di aplikasi Next.js.

Ukuran konteks berbasis karakter, sedangkan token_count adalah estimasi metadata.
Teks PDF dan OCR tetap digabung sesuai kebijakan sebelumnya. Belum ada perubahan
algoritma retrieval, reranking, atau mekanisme personalisasi baru. Dokumen lama tidak
diindeks ulang otomatis. PDFium/Tesseract dan perhitungan Unicode Python dapat
menghasilkan batas teks yang berbeda dari parser sebelumnya.

Request internal dibatasi 120 detik, embedding Gemini 45 detik, dan generasi Gemini
60 detik. Pembatalan menutup pembacaan stream; panggilan provider sinkron dapat
bertahan sampai timeout upstream selesai.

## Membaca dan menjelaskan kode

Mulai dari `ingestion/pipeline.py` untuk memahami perjalanan dokumen dan
`rag/pipeline.py` untuk memahami perjalanan pertanyaan. Keduanya menyertakan komentar
bernomor tentang tahap RAG. Baca modul ekstraksi/chunking/prompting untuk rincian
konsepnya, lalu repository dan infrastructure untuk detail penyimpanan/provider.
Komentar `#` berbahasa Indonesia menjelaskan tujuan tahap, alasan parameter, sumber
halaman, validasi vektor, batas konteks, serta perilaku ketika pemrosesan gagal.

Pemeriksaan statis dari direktori `services/rag`:

```powershell
uv run --locked ruff check src
uv run --locked ruff format --check src
uv run --locked mypy src/tutor_rag
```

Dari root repositori: `pnpm exec tsc --noEmit`, `pnpm lint`, dan `pnpm build`.
