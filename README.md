# Tutor AI
> Mini LMS Berbasis AI Personalisasi dengan Teknologi Retrieval-Augmented Generation (RAG)

![Next.js](https://img.shields.io/badge/Next.js-16.2.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2-blue?logo=react)
![Prisma](https://img.shields.io/badge/Prisma-7.8-1B222D?logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## Visual Preview

Tutor AI menyediakan antarmuka pengguna yang terintegrasi untuk memberikan pengalaman belajar terbaik melalui percakapan kontekstual dan rendering avatar 3D.

![Tutor AI Avatar](./public/result/avatar.png)
*Tampilan Avatar 3D interaktif yang memberikan pengalaman belajar personal.*

![Tutor AI Chat Interface](./public/result/chat.png)
*Antarmuka obrolan yang mendukung rendering Markdown dan persamaan matematika secara langsung.*

## Table of Contents
- [Fitur Utama](#fitur-utama)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Dependensi Sistem](#dependensi-sistem)
- [Panduan Instalasi & Quickstart](#panduan-instalasi--quickstart)
- [Penggunaan dan Pengembangan](#penggunaan-dan-pengembangan)
- [Lisensi](#lisensi)

## Fitur Utama

1. **Mini Learning Management System (LMS)**
   Manajemen terpadu untuk mata kuliah dan pendaftaran mandiri menggunakan kunci registrasi (Enrollment Key). Dosen dapat mengatur sesi pembelajaran secara terstruktur.

2. **AI Tutor Berbasis Retrieval-Augmented Generation (RAG)**
   Sistem mengekstrak teks dari materi PDF secara otomatis (termasuk penggunaan OCR untuk materi berbentuk gambar). Jawaban AI selalu merujuk pada basis pengetahuan dokumen yang diunggah, meminimalisir risiko halusinasi informasi.

3. **Personalisasi Profil Mahasiswa**
   AI menyesuaikan kompleksitas jawaban berdasarkan jenjang studi:
   - S1 (Sarjana): Menggunakan analogi sederhana.
   - S2 (Magister): Berfokus pada teknis dan implementasi.
   - S3 (Doktor): Penjelasan analitis, formal, dan berorientasi riset.

4. **Interaksi Multimodal**
   Dukungan untuk Text-to-Speech (TTS) melalui ElevenLabs, konversi Speech-to-Text (STT) untuk masukan pengguna, serta dukungan Markdown dan LaTeX untuk formula matematika. Pengalaman diperkaya dengan integrasi Avatar 3D yang dirender via React Three Fiber.

5. **Pemrosesan Asinkron (Background Processing)**
   Proses pemotongan (chunking) dan embedding dokumen yang berat dipisahkan dari server utama menggunakan background worker untuk mempertahankan stabilitas dan latensi sistem inti.

## Arsitektur Sistem

Seluruh pemrosesan dokumen dan generasi jawaban RAG berjalan di layanan Python
[`services/rag`](services/rag/README.md). Next.js menangani UI, autentikasi,
otorisasi, dan sesi chat. Backend AI dan worker dokumen otomatis dijalankan bersama
LMS melalui `pnpm dev`; lihat panduan layanan untuk struktur kode dan alur integrasinya.

Arsitektur sistem dibangun di atas infrastruktur modern dengan pemisahan tugas yang jelas:
- **Frontend Layer:** Dibangun dengan React 19 dan Next.js 16 (App Router), menampilkan UI dinamis dan Avatar 3D interaktif.
- **Backend & API Layer:** Memanfaatkan Next.js Route Handlers untuk menjembatani komunikasi ke layanan LLM dan database.
- **Authentication:** Menggunakan Better Auth untuk implementasi Role-Based Access Control (RBAC).
- **Data & Storage:** 
  - Relasional Data: PostgreSQL via Prisma ORM.
  - Vektor & Dokumen: Supabase (pgvector) untuk manajemen data tidak terstruktur.
- **RAG Pipeline:**
  - Parser PDFium dan Tesseract OCR berjalan di Python.
  - Chunking menggunakan LangChain Text Splitters untuk Python.
  - Embedding dan jawaban chat/avatar menggunakan Google Gemini melalui Python.

## Dependensi Sistem

Berikut adalah library utama pendukung sistem ini:
- **Core Framework:** Next.js 16.2.2, React 19.2.4
- **Database ORM:** `@prisma/client`, `@prisma/adapter-pg`
- **Authentication:** `better-auth`
- **AI & ML Integration (Python):** `google-genai`, `langchain-text-splitters`, `psycopg`
- **File Parsing & OCR (Python):** `pypdfium2`, `pytesseract`, executable Tesseract 5
- **Speech-to-Text (Next.js):** `groq-sdk`
- **User Interface:** `tailwindcss` (v4), `shadcn/ui`, `lucide-react`, `react-markdown`, `katex`
- **Multimodal & 3D:** `@elevenlabs/elevenlabs-js`, `three`, `@react-three/fiber`, `@react-three/drei`
- **Development Tooling:** `concurrently`, `tsx`, `typescript`

## Panduan Instalasi & Quickstart

Langkah-langkah berikut akan membantu Anda menjalankan proyek ini di environment lokal Anda.

### 1. Prasyarat (Prerequisites)
Pastikan environment pengembangan Anda memenuhi persyaratan berikut:
- **Node.js**: Direkomendasikan versi 20 LTS atau yang lebih baru.
- **pnpm**: Package manager (dapat diinstal melalui `npm install -g pnpm`).
- **Python 3.12 atau 3.13** dan **uv**: Runtime dan pengelola dependensi layanan RAG.
- **Tesseract 5**: Executable OCR untuk memproses halaman PDF hasil pemindaian.
- **PostgreSQL**: Server database aktif, baik lokal maupun cloud (contoh: Supabase, Neon).
- **Supabase Project**: Dengan ekstensi pgvector yang telah diaktifkan.
- **API Keys**: Dapatkan kunci akses dari [Google AI Studio](https://aistudio.google.com/), [Groq Console](https://console.groq.com/), dan [ElevenLabs](https://elevenlabs.io/).

### 2. Kloning Repositori
Lakukan kloning repositori ke mesin lokal Anda:
```bash
git clone <url-repositori-tutor-ai>
cd tutor-ai
```

### 3. Instalasi Dependensi
Instal seluruh package dan dependensi dengan perintah:
```bash
pnpm install
uv sync --project services/rag --locked
```

### 4. Konfigurasi Environment Variables
Salin contoh konfigurasi ke dalam file `.env`:
```bash
cp .env.example .env
```
Buka file `.env` di teks editor dan lengkapi konfigurasi berikut:
```env
BETTER_AUTH_SECRET="your-secure-random-string"
DATABASE_URL="postgresql://user:password@localhost:5432/tutor-ai"
GEMINI_API_KEY="AIzaSy..."
GROQ_API_KEY="gsk_..."
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUz..."
ELEVENLABS_API_KEY="sk_..."
RAG_SERVICE_URL="http://127.0.0.1:8001"
RAG_SERVICE_PORT=8001
RAG_SERVICE_TOKEN="token-acak-yang-sama-pada-next-dan-python"
```

### 5. Setup dan Migrasi Database
Selaraskan skema Prisma dengan struktur database Anda:
```bash
pnpm dlx prisma db push
```

### 6. Menjalankan Server (Development Mode)
Aplikasi menjalankan server Next.js dan backend AI Python, termasuk worker dokumennya:
```bash
pnpm run dev
```
Setelah proses kompilasi selesai, aplikasi dapat diakses melalui browser pada `http://localhost:3000`.

## Penggunaan dan Pengembangan

### Pemrosesan Dokumen Latar Belakang
Worker dokumen mengikuti siklus hidup API Python. Upload atau retry materi dari LMS
memasukkan dokumen ke antrean database, lalu worker mengekstrak PDF/OCR, membentuk
chunk, dan menyimpan embedding. Tunggu status materi `ready` sebelum memakainya
sebagai sumber tutor. Folder dan tahapan kode dijelaskan di
[panduan backend AI](services/rag/README.md).

### Format Respon Markdown
Sistem dirancang untuk mendukung balasan AI dengan format Markdown dan sintaks LaTeX. Sebagai contoh persamaan gaya gravitasi:

$$ F = G \frac{m_1 m_2}{r^2} $$

Komponen antarmuka pada sisi klien (client-side) akan secara otomatis memproses luaran di atas menggunakan plugin Remark dan KaTeX untuk rendering yang sempurna.

## Lisensi

Proyek ini berada di bawah [MIT License](LICENSE). Hak cipta © 2026 Tutor AI.
