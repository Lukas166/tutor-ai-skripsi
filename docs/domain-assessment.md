# Domain pembelajaran dan ITS adaptif

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
judul mata kuliah otomatis. Pada setiap materi, importer memprioritaskan kecocokan
nama file PDF di dalam course tersebut, lalu memakai `(courseId, orderNumber)` bila
PDF belum diunggah. Normalisasi nama file hanya dilakukan saat impor; retrieval
dan penilaian selalu memakai ID database. Sesi yang belum ada ditambahkan tanpa
mengganti sesi atau PDF existing.

Kode workbook seperti `RPL-M01`, `RPL-I01`, dan `RPL-PP-01` disimpan utuh dalam `code`.
Primary key internal dibentuk deterministik dari
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

Seed menggunakan `data/rpl/RPL.xlsm`. Pembaca hanya mengambil nilai sel tanpa
menjalankan makro. Alternatif jika uv belum ada di PATH,
gunakan Python environment proyek langsung:

```powershell
services/rag/.venv/Scripts/python.exe scripts/data/import-rpl.py COURSE_ID_TUJUAN
```

Struktur, relasi, jumlah soal, opsi, dan kunci divalidasi sebelum ditulis. Validasi ini
bukan peninjauan akademik isi soal. Upsert dan pemetaan dilakukan dalam satu
transaksi; seed tidak menghapus data LMS atau menimpa baseline mahasiswa.
`datasetChecksum` mencatat SHA-256 workbook. Empat opsi A-D dari workbook baru,
kunci, penjelasan,
metadata PDF/halaman, serta pemetaan CPMK/Sub-CPMK tetap sesuai sumber.
API dan soal baru hanya menerima A-D. Sesi lama yang masih memuat E ditolak
dengan pesan untuk memperbarui dataset; data historis tidak dihapus oleh migrasi.
Status `Draf`/`Status Sumber` dan salinan JSON baris Excel tidak disimpan sebagai kolom
operasional: saat ini tidak ada alur verifikasi soal yang memakainya. Workbook tetap
menjadi sumber asli untuk meninjau metadata tersebut. Soal yang diimpor tetap dapat
dipakai oleh pre-test/latihan; impor tidak berarti isi soal telah disahkan secara akademik.
PDF asli tidak disertakan workbook: metadata materi disimpan, tetapi tidak dibuat
file PDF palsu. Bank soal tidak dimasukkan ke tabel Material atau indeks RAG.

## Menggunakan fitur

1. Terapkan migrasi database dengan `pnpm exec prisma migrate deploy`, lalu jalankan
   ulang `pnpm dev`. Halaman assessment memakai API Next.js; Tutor AI tetap memakai Python.
2. Login sebagai mahasiswa yang memiliki enrollment aktif pada course tujuan.
3. Buka mata kuliah dan baca panduan pre-test sebelum memilih **Mulai Pre-test**.
4. Pilih satu dari opsi yang tersedia untuk setiap soal. Jawaban tersimpan otomatis ke
   database; draf yang belum terkonfirmasi juga dipertahankan pada perangkat.
5. Setelah semua jawaban terisi, pilih **Kirim Jawaban**.
   Pre-test dan post-test masing-masing berdurasi 15 menit. Tenggat disimpan pada
   `localStorage` berdasarkan waktu mulai sesi. Saat waktu habis atau halaman dibuka
   kembali setelah tenggat, jawaban tersimpan dinilai dan soal kosong dihitung salah.
   Backend juga menolak perubahan
   jawaban setelah tenggat, tanpa perubahan skema database.
6. Setelah dikirim, Profil Belajar langsung menampilkan skor pre-test, ringkasan
   materi dan indikator, serta akses ke materi dan AI Tutor. AI Tutor tidak dapat
   dibuka sebelum pre-test selesai. **Tinjau jawaban** membuka halaman ulasan
   per soal. Sebelum post-test selesai, halaman ini hanya menampilkan pilihan
   mahasiswa dan status benar/salah/kosong.
7. Pilih **Buka AI Tutor**. Atur PDF melalui Context Materi; pilihan
   satu materi membatasi retrieval ke PDF tersebut, pilihan semua materi tetap
   dibatasi course yang diakses. Tanyakan konsep spesifik, misalnya pengumpulan data.
   Tutor memakai `/courses/{courseId}/tutor` agar layout layar penuh tidak dibungkus
   panel Mahasiswa; alias lama `/mahasiswa/courses/{courseId}/tutor` diarahkan ke sana.
8. Terima atau lewati tawaran latihan pada balasan tutor. Dalam mode avatar,
   gunakan **Buka Latihan Konsep**. Jawaban, hint, remediasi dan riwayat disimpan.
9. Kembali ke mata kuliah dan pilih **Mulai Post-test** setelah seluruh indikator
   menyelesaikan dua kartu latihan dan tinjauan ulang yang diperlukan.
   Paket disalin dari snapshot pre-test, termasuk ID soal, urutan dan opsi yang sama.
10. Setelah post-test dikirim, **Lihat Perbandingan Hasil** menampilkan skor,
    perubahan poin persentase, jumlah benar, serta perubahan per indikator/materi.
    Ulasan pre-test dan post-test kini juga membuka kunci serta pembahasan soal.

Alamat halaman bersifat generik:

- `/mahasiswa/courses/{courseId}/pretest`
- `/mahasiswa/courses/{courseId}/pretest/review`
- `/mahasiswa/courses/{courseId}/student-profile`
- `/mahasiswa/courses/{courseId}/posttest`
- `/mahasiswa/courses/{courseId}/posttest/result`
- `/mahasiswa/courses/{courseId}/posttest/review`

URL lama `/mahasiswa/courses/{courseId}/pretest/result` diarahkan ke Profil Belajar.

Course yang belum memiliki konfigurasi domain tidak menampilkan CTA pre-test.
Login, enrollment aktif, dan role mahasiswa diperiksa di server Next.js untuk semua
halaman assessment. Python memeriksa lagi akses mahasiswa untuk latihan dan Tutor AI.
Identitas mahasiswa tidak pernah diterima bebas dari browser.

## Integritas penilaian dan profil

Paket PRE mengambil satu PRE_POST per indikator; PRACTICE tidak diikutkan. Saat sesi
dibentuk, soal dan kunci disalin ke snapshot privat agar perubahan seed berikutnya
tidak mengubah penilaian sesi tersebut. API soal hanya mengembalikan ID, nomor,
pertanyaan, opsi, dan draf pilihan. Kunci, pembahasan, snapshot, dan isCorrect tidak
dikirim pada API mahasiswa, termasuk setelah pre-test selesai.
Workbook RPL saat ini menggunakan empat opsi A-D. Pada pergantian dataset, seluruh
sesi penilaian, profil awal, latihan, dan progres belajar RPL versi lama direset sekali
setelah persetujuan pemilik data. Metadata adaptif lama pada pesan chat dilepas agar
kartu latihan yang sudah dihapus tidak muncul lagi. Mahasiswa dapat memulai pre-test
baru dari paket RPL.xlsm. Reset ini bukan bagian dari seed yang dapat dijalankan ulang;
impor dataset berikutnya tidak menghapus riwayat mahasiswa.

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
penguasaan penuh. Post-test tidak membuat ulang baseline dan tidak mengubah EMA.

## Bukti latihan, EMA, dan keputusan tutoring

`PracticeSession` memiliki constraint unik mahasiswa/course/soal. Hanya jawaban
pertama pada soal berbeda, ketika `answerCount=0` dan `hintCount=0` di database,
menjadi bukti mandiri. Benar bernilai 1, salah bernilai 0. Rumus:

```text
EMA_baru = (1 - emaAlpha) * EMA_lama + emaAlpha * hasil
```

`PracticeEvent` menyimpan requestId, jawaban, benar/salah, kondisi bantuan, alpha,
EMA sebelum/sesudah, feedback dan sumber. Lock sesi dan profil, constraint requestId
serta satu event mandiri per sesi mencegah pembaruan ganda. Hint/ulang tetap dicatat
tetapi tidak menaikkan jumlah bukti dan tidak mengubah EMA. Riwayat ini tetap ada
jika chat dihapus karena relasi chat memakai `SET NULL`, bukan cascade penilaian.
Tawaran yang dilewati sebelum dibuka dapat ditawarkan kembali dan tidak dianggap
bukti/soal yang telah dikerjakan. Setelah jawaban salah, Tutor AI membahasnya di
chat dan mahasiswa dapat mencoba soal yang sama sampai benar. Jawaban ulang tidak
mengubah EMA; riwayat tetap utuh.
Ketika soal masih terbuka tanpa jawaban/hint, permintaan penjelasan untuk indikator
yang sama diarahkan ke tombol hint. Ini mencegah bantuan lewat chat biasa dianggap
sebagai jawaban mandiri; setelah hint tercatat, diskusi konsep dapat dilanjutkan.

Konfigurasi ada pada `course_learning_config` per course, tanpa tambahan env wajib:

| Kolom | Default | Penggunaan |
| --- | --- | --- |
| emaAlpha | 0.3 | Bobot bukti latihan baru |
| developingThreshold | 0.5 | Batas sinyal berkembang setelah ada latihan mandiri |
| readyThreshold | 0.8 | Batas sinyal siap lanjut setelah ada latihan mandiri |
| minimumStudySeconds | 0 | Data konfigurasi lama; tidak membuka post-test |

Angka default adalah pengaturan aplikasi, bukan standar ilmiah. Tidak ada batas
waktu pre/post yang dipaksakan. Status operasional diturunkan dari skor dan jumlah
bukti yang tersimpan: NOT_ASSESSED, NEEDS_REINFORCEMENT, INITIAL_POSITIVE_EVIDENCE,
DEVELOPING, READY_TO_ADVANCE. Nilai ringkasan materi dihitung dari indikator.
`currentStatus` menyimpan sinyal saat pembaruan bukti. Learner Model Python menghitung
tahap indikator dan kelayakan post-test, lalu menyimpannya sebagai `progressSnapshot`
di `student_learning_progress`. API Next.js membaca snapshot ini untuk halaman LMS;
TypeScript tidak menjalankan Adaptive Engine.

Python memetakan pesan ke daftar indikator resmi dalam materi terpilih, membaca
profil terbaru, lalu memutuskan FOUNDATION, APPLICATION, CLARIFY atau REVIEW.
Pemetaan eksplisit didahulukan; usulan LLM terstruktur divalidasi terhadap ID resmi.
Tidak ada indikator acak atau perubahan skor dari percakapan. Retrieval tetap
mengikat courseId dan materialId; konteks indikator dapat mempersempit sesi materi.
Tanpa sumber, respons mengakui keterbatasannya. Soal hanya berasal dari PRACTICE,
bukan generasi LLM. Hint/remediasi tidak menerima kunci atau opsi jawaban dari bank.

Post-test tersedia setelah pre-test selesai dan snapshot Python menyatakan seluruh
indikator selesai. Dua kartu per indikator harus dijawab benar; EMA rendah memerlukan
balasan tinjauan ulang bersumber PDF setelah kedua kartu. EMA rendah sendiri tidak
menjadi nilai lulus. Perbandingan benar/salah per indikator baru dikirim setelah
rangkaian post-test selesai.

## PDF dan OCR

Unggah/retry memakai mekanisme materi LMS yang sudah ada. Worker Python mengisi
material_page dan material_chunk dengan course/sesi/halaman. Tunggu status ready
sebelum memilih dokumen sebagai konteks tutor. `MaterialRepository.claim(course_id)`
dapat membatasi pemrosesan ulang ke satu course; worker aplikasi tetap memakai
antrean existing dengan lease dan SKIP LOCKED.

OCR memakai konfigurasi eksplisit, PATH, runtime lokal `.tools/tesseract/tesseract.exe`,
atau instalasi Windows standar. Data eng.traineddata dan ind.traineddata dibaca dari
root proyek. Binary lokal diabaikan Git dan harus disediakan lagi pada mesin lain.
Unduhan Windows tersedia melalui [dokumentasi Tesseract](https://github.com/UB-Mannheim/tesseract/wiki).
Jika executable OCR tidak tersedia, cek metadata halaman: status ready saja tidak
menjamin PDF scan memiliki cakupan teks yang lengkap.

Pada database pengembangan, tujuh PDF RPL telah diproses ulang: 347 halaman disimpan
dan 351 chunk ber-embedding dipublikasikan. Semua dokumen ready, tanpa error OCR.
Satu halaman UML tidak menghasilkan teks; halaman kosong tidak diberi chunk palsu.

## Validasi pengembangan lanjutan

Migrasi `20261030010000_adaptive_learning` diterapkan dan client Prisma diregenerasi.
Migrasi `20261030020000_persist_learner_status` menambahkan status operasional tersimpan
dan mengisi status profil existing tanpa mengubah baseline atau nilai performa.
Seed RPL dijalankan kembali untuk memperbaiki relasi PDF tanpa mengganti baseline.
Pemeriksaan TypeScript, ESLint perubahan, Ruff, Mypy, dan build produksi dijalankan.
Tidak dibuat atau dijalankan automated test/test suite untuk tahap lanjutan ini.
Alur interaktif perlu dicoba manual melalui langkah di atas; build dan pemeriksaan
statis tidak menggantikan pemeriksaan visual atau hasil percakapan LLM.
