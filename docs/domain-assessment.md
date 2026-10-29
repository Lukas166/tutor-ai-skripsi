# Domain pembelajaran, pre-test, dan profil awal

## Hubungan dengan mata kuliah LMS

Tidak ada tabel khusus `rpl_*`. Dataset Excel RPL menjadi data awal pada model yang
berlaku untuk semua mata kuliah:

```text
Course
  ├─ CourseLearningConfig       konfigurasi jumlah soal dan identitas dataset
  ├─ LearningOutcome           CPMK/Sub-CPMK dan teks resmi sumber
  ├─ DomainTopic ─ CourseSession (opsional, sesi materi LMS yang sudah ada)
  │    ├─ DomainConcept
  │    ├─ DomainIndicator
  │    └─ QuestionBankItem ─ DomainIndicator
  ├─ AssessmentAttempt ─ User
  │    └─ AssessmentItem ─ QuestionBankItem
  └─ StudentIndicatorProfile ─ User / DomainIndicator / AssessmentItem
```

`courseId` selalu mengacu ke `Course.id` yang nyata. Importer wajib menerima ID
course tujuan secara eksplisit dan menolak ID yang tidak ada. Tidak ada pencocokan
judul mata kuliah otomatis. Pada setiap materi, importer menautkan sesi dengan
pasangan `(courseId, orderNumber)`; sesi yang belum ada ditambahkan tanpa mengganti
sesi atau PDF existing.

Kode workbook seperti `RPL-M01`, `RPL-I01`, dan `RPL-PP-01` disimpan utuh dalam `code`
serta baris asli `sourceData`. Primary key internal dibentuk deterministik dari
`courseId + kode`, sehingga impor ulang memakai ID yang sama. Constraint
`(courseId, code)` mencegah duplikasi sekaligus membolehkan dua course menggunakan
kode sumber yang sama. Relasi internal memakai primary key tersebut, bukan judul.

Nama tabel, assessment engine, dan UI tidak bergantung pada RPL. Jumlah soal dibaca
dari `CourseLearningConfig`, bukan angka 14 yang ditanam di engine. Adapter workbook
RPL tetap memvalidasi format dataset sumber: 7 materi, 14 indikator, 14 PRE_POST,
dan 28 PRACTICE. Adapter sumber mata kuliah lain dapat ditambahkan kemudian tanpa
mengubah tabel assessment atau profil.

## Migrasi dan seed

```powershell
pnpm exec prisma migrate deploy
pnpm exec prisma generate
uv sync --project services/rag --locked
pnpm seed:domain:rpl COURSE_ID_TUJUAN
```

Seed menggunakan `data/rpl/domain-model.xlsx`. Alternatif jika uv belum ada di PATH,
gunakan Python environment proyek langsung:

```powershell
services/rag/.venv/Scripts/python.exe scripts/data/import-rpl.py COURSE_ID_TUJUAN
```

Seluruh data divalidasi sebelum ditulis. Upsert dan pemetaan dilakukan dalam satu
transaksi; seed tidak menghapus data LMS atau menimpa baseline mahasiswa.
`datasetChecksum` mencatat SHA-256 workbook. Seluruh lima opsi, kunci, penjelasan,
metadata PDF/halaman, status Draf, serta pemetaan CPMK/Sub-CPMK tetap sesuai sumber.
PDF asli tidak disertakan workbook: metadata materi disimpan, tetapi tidak dibuat
file PDF palsu. Bank soal tidak dimasukkan ke tabel Material atau indeks RAG.

## Menggunakan fitur

1. Jalankan ulang `pnpm dev` setelah perubahan backend Python ini. Next.js dan API
   Python menggunakan konfigurasi URL, port, serta token yang sudah ada.
2. Login sebagai mahasiswa yang memiliki enrollment aktif pada course tujuan.
3. Buka mata kuliah, lalu pilih **Mulai Pre-test** pada kartu Profil Belajar Awal.
4. Pilih satu dari lima opsi untuk setiap soal. Jawaban tersimpan otomatis ke
   database; draf yang belum terkonfirmasi juga dipertahankan pada perangkat.
5. Setelah semua jawaban tersimpan, pilih **Kirim Jawaban** dan konfirmasi.
6. Halaman hasil menampilkan skor keseluruhan. **Lihat Profil Belajar** membuka
   ringkasan materi dan indikator, lalu tersedia akses ke materi serta AI Tutor.

Alamat halaman bersifat generik:

- `/mahasiswa/courses/{courseId}/pretest`
- `/mahasiswa/courses/{courseId}/pretest/result`
- `/mahasiswa/courses/{courseId}/student-profile`

Course yang belum memiliki konfigurasi domain tidak menampilkan CTA pre-test.
Login, enrollment aktif, dan role mahasiswa tetap diperiksa di server Next.js
dan backend Python. Identitas mahasiswa tidak pernah diterima bebas dari browser.

## Integritas penilaian dan profil

Paket PRE mengambil satu PRE_POST per indikator; PRACTICE tidak diikutkan. Saat sesi
dibentuk, soal dan kunci disalin ke snapshot privat agar perubahan seed berikutnya
tidak mengubah penilaian sesi tersebut. API soal hanya mengembalikan ID, nomor,
pertanyaan, opsi, dan draf pilihan. Kunci, pembahasan, snapshot, dan isCorrect tidak
dikirim pada API mahasiswa, termasuk setelah pre-test selesai.

Jawaban bernilai 1 bila sama dengan kunci snapshot dan 0 bila berbeda. Finalisasi
mengunci attempt dengan `FOR UPDATE`, menilai jawaban, membuat profil, dan menyimpan
hasil dalam satu transaksi. Submit serentak/retry mengembalikan hasil final yang
sama, tanpa menambah profil. Jawaban final tidak dapat diubah.

Setiap indikator memperoleh `initialScore`, `currentScore` yang sama pada awalnya,
`evidenceCount=1`, serta status NEEDS_REINFORCEMENT atau INITIAL_POSITIVE_EVIDENCE.
Sebelum pre-test sah, API menampilkan NOT_ASSESSED tanpa membuat bukti palsu.
Trigger database melindungi skor/status awal dan sumber baseline dari perubahan.
Ringkasan materi diturunkan dari profil indikator, bukan disimpan dua kali.

Profil menampilkan status per indikator sesuai spesifikasi, tanpa menghubungkannya
ke rincian jawaban soal atau memperlihatkan kunci. Satu bukti positif tidak dianggap
penguasaan penuh. Latihan, EMA, adaptive engine, dan post-test belum diaktifkan.

## Pemeriksaan yang dilakukan

- Kesesuaian teks/opsi/kunci/penjelasan/sumber seluruh 42 soal terhadap Excel.
- Seed berulang tidak menambah jumlah materi, indikator, atau soal.
- Dua course dapat memakai kode sumber yang sama tanpa benturan ID.
- Skenario 0/14, 7/14, dan 14/14 melalui transaksi database dengan rollback.
- Draf tersimpan, submit tidak lengkap ditolak, baseline satu bukti per indikator.
- Alur HTTP Better Auth → Next.js → Python → database → hasil/profil menggunakan
  akun QA sementara; akun dan hasil QA dibersihkan setelah pengujian.
- Akses tanpa login/enrollment dan akses attempt mahasiswa lain ditolak.
- Dua submit serentak menghasilkan satu hasil dan tepat 14 profil.
- TypeScript, lint kode baru, Ruff, Mypy, serta build produksi.

Tidak ditambahkan berkas test permanen. Pemeriksaan visual browser tidak dapat
diselesaikan karena Computer Use tidak dapat memastikan URL browser Windows;
verifikasi halaman pada tahap ini mencakup build dan respons HTTP terautentikasi.

Lint seluruh repositori masih melaporkan 9 error dan 12 warning lama pada seed serta
halaman admin/dashboard/dosen yang tidak diubah dalam fitur ini; lint kode baru lulus.
