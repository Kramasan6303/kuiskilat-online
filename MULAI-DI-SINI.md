# MULAI DI SINI — KuisKilat Online 3.0

KuisKilat adalah aplikasi web untuk permainan kuis seperti Kahoot. Guru membuat soal, membuka permainan, dan membagikan PIN 6 digit. Siswa dapat bergabung dan menjawab lewat HP dari mana saja setelah aplikasi diterbitkan ke internet.

## Pilihan A — Membuat website yang dapat diakses lewat internet

1. Buat/masuk akun **GitHub** di https://github.com.
2. Klik **New repository**, beri nama `kuiskilat-online`.
3. Ekstrak ZIP aplikasi. Unggah **semua berkas di dalam folder `KuisKilat-Online`** ke repositori GitHub. Folder `public` dan `tests` harus ikut. Jangan unggah `.env` yang berisi kode rahasia.
4. Buka https://dashboard.render.com/, pilih **New → Web Service** dan sambungkan repositori `kuiskilat-online`.
5. Pilih Node.js; **Build command**: `npm install --omit=dev`; **Start command**: `npm start`; **Health check path**: `/api/health`.
6. Di **Environment**, buat `NODE_ENV=production` dan `HOST_ACCESS_CODE` berisi kode rahasia guru (misalnya passphrase yang panjang dan unik). Jangan bagikan kode guru ke siswa.
7. Klik **Deploy**. Setelah berstatus Live, dapatkan alamat HTTPS publik dari Render.
8. Bagikan alamat website ke siswa. Guru klik **Saya Guru**, buat soal/Impor CSV, masukkan kode guru, klik **Buka ruang kuis**. Siswa klik **Gabung permainan** atau tautan PIN, isi nama, dan bermain.

**Penting:** membuat ZIP di sini tidak otomatis membuat domain publik. Langkah 1–7 membutuhkan akun Anda. Jangan memakai paket gratis untuk ujian yang wajib menyimpan nilai permanen: sesi bisa hilang bila server restart. Klik **Unduh hasil CSV** setelah bermain, atau gunakan volume penyimpanan permanen pada hosting yang mendukungnya.

## Pilihan B — Uji coba di komputer Windows

1. Instal Node.js v20 atau lebih baru dari https://nodejs.org.
2. Ekstrak ZIP, lalu klik `JALANKAN-WINDOWS.bat` di folder proyek.
3. Buka `http://localhost:3000` di Chrome.
4. Uji layar guru dan siswa dengan dua browser/tab. Ini hanya uji lokal, belum publik di internet.

## Membuat soal dari Excel

1. Buka `template-soal-kuiskilat.csv` dengan Excel.
2. Isi setiap baris: `pertanyaan, a, b, c, d, jawaban_benar, waktu_detik`.
3. Jawaban benar A–D; waktu antara 10 dan 60 detik. Maksimal 30 soal.
4. Simpan sebagai CSV dan gunakan **Impor Excel/CSV** di Studio Kuis.

## Fitur

- 100 pemain maksimal per ruang (batas program, kapasitas riil tergantung server)
- Soal pilihan ganda 4 jawaban, timer 10–60 detik
- Skor akurasi, kecepatan, dan bonus jawaban beruntun
- PIN, link undangan HTTPS, papan peringkat, podium
- Impor Excel/CSV dan JSON, ekspor hasil CSV/Excel
- Perlindungan kode akses guru di hosting produksi

Untuk informasi rinci, baca `PANDUAN-PASANG-ONLINE.md`.
