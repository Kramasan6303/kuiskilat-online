# ⚡ KuisKilat Online 3.0

**Kuis interaktif untuk guru dan siswa yang dapat diakses lewat internet setelah diterbitkan pada hosting Node.js.** Guru membuat soal pilihan ganda, membagikan tautan/PIN, memulai permainan, dan mengunduh laporan hasil. Siswa bermain langsung dari HP, tanpa harus berada di jaringan Wi-Fi yang sama.

## Fitur yang tersedia

- **Kuis real-time:** pertanyaan 4 pilihan, timer 10–60 detik, skor berdasarkan kecepatan/ketepatan, *streak*, papan peringkat, dan podium.
- **Ruang dengan PIN 6 digit:** siswa bergabung melalui URL publik `https://alamat-aplikasi/?pin=123456` atau PIN.
- **Maksimum 100 siswa per ruang** (batas logis program, bukan jaminan performa dari penyedia hosting).
- **Kode akses guru opsional:** bila variabel `HOST_ACCESS_CODE` diisi pada server, hanya pemegang kode tersebut bisa membuat ruang. Siswa tidak perlu kode tersebut.
- **Laporan CSV:** setelah permainan selesai, guru dapat mengunduh nilai, peringkat, jawaban benar/salah/tidak menjawab, dan status setiap soal; bisa dibuka di Excel.
- **Impor dari Excel/CSV:** guru dapat mengunduh template, mengisi soal di Excel, menyimpan dalam format CSV, dan mengimpornya ke studio kuis. Mendukung pemisah koma atau titik koma.
- **Impor/ekspor JSON:** soal bisa dicadangkan dan diimpor ke browser lain.
- **Pemulihan ruang opsional:** bila `DATA_FILE` diarahkan ke penyimpanan yang permanen, PIN, peserta, skor, dan jawaban dipulihkan setelah server mulai ulang.
- **Pengoperasian satu server:** komunikasi waktu nyata menggunakan *Server-Sent Events* (SSE); tidak perlu layanan pihak ketiga untuk pengiriman jawaban.
- **Siap dipasang:** `render.yaml` (Render), `railway.json` (Railway), `Dockerfile` (platform kompatibel Docker), dan endpoint `/api/health`.

## Mulai cepat

Baca **`MULAI-DI-SINI.md`** untuk panduan sederhana dari ZIP sampai menjadi website publik.

## Memulai di komputer (untuk uji coba)

1. Instal [Node.js](https://nodejs.org) versi 20 atau lebih baru.
2. Ekstrak ZIP, lalu buka terminal di dalam folder `KuisKilat-Online`.
3. Jalankan `npm start`, atau klik ganda `JALANKAN-WINDOWS.bat` pada Windows.
4. Buka `http://localhost:3000`.
5. Guru masuk ke **Saya Guru / Host**, pilih/edit soal atau gunakan tombol **Impor Excel/CSV**, lalu klik **Buka ruang kuis**.
6. Siswa masuk memakai PIN. Untuk tes pada satu komputer gunakan dua browser atau tab berbeda.

Untuk menguji sistem: `npm test`. Pengujian mencakup pembuatan ruang, PIN, SSE, pengiriman jawaban, akses guru, unduh CSV, dan pemulihan data.

## Menerbitkan untuk diakses melalui internet

Baca **`PANDUAN-PASANG-ONLINE.md`**. Cara yang disarankan bagi pemula adalah GitHub + Render:

1. Unggah seluruh isi folder `KuisKilat-Online` ke sebuah repositori GitHub (file `server.js`, `package.json`, dan `render.yaml` harus berada pada tingkat teratas repositori).
2. Di [Render Dashboard](https://dashboard.render.com/), pilih **New → Web Service** dan hubungkan repo GitHub.
3. Isi perintah **Build:** `npm install --omit=dev` dan **Start:** `npm start` jika tidak otomatis terisi oleh `render.yaml`.
4. Atur **Environment variable** `HOST_ACCESS_CODE` dengan nilai rahasia yang cukup panjang. Jangan menaruhnya di kode sumber atau GitHub.
5. Deploy. Setelah berstatus *Live*, aplikasi akan memperoleh alamat publik `https://...onrender.com` dan HTTPS dari Render. [Dokumentasi resmi Render](https://render.com/docs/deploy-node-express-app).
6. Guru gunakan alamat tersebut, buka kuis dan salin tautan PIN. Siswa dapat membukanya dari rumah.

Alternatif: Railway mendukung layanan Node.js dari repositori GitHub dan pembuatan domain publik pada menu *Settings → Networking → Generate Domain*. [Dokumentasi Railway](https://docs.railway.com/quick-start).

**Aplikasi dalam ZIP ini belum dipublikasikan ke alamat internet.** Langkah deploy di atas diperlukan; membutuhkan akses ke akun hosting dan repositori milik Anda.

## Mengamankan dan menyimpan data

Pada server publik dengan `NODE_ENV=production`, **wajib** mengisi `HOST_ACCESS_CODE` untuk membatasi siapa saja yang bisa membuat ruang. Kode ini merupakan pengaman sederhana bersama, **bukan sistem akun atau autentikasi lengkap**. Jangan memakai password akun sekolah yang lain sebagai kode ini.

- Jika `DATA_FILE` **tidak** ditentukan, ruang/sesi/skor berada di memori server. Saat proses hosting berhenti, restart, atau deploy ulang, ruang dan hasil dapat hilang.
- Jika `DATA_FILE` ditentukan, misalnya `/var/data/rooms.json`, file data harus berada pada **persistent disk atau volume** yang dipasang dan dapat ditulis. File ini berisi token sesi dan nilai siswa; lindungi aksesnya.
- Render **Free** tidak menyediakan persistent disk, dan dapat *spin down* setelah 15 menit tanpa lalu lintas masuk; gunakan paket yang menyediakan disk permanen jika hendak menyimpan permainan setelah restart. [Batasan resmi Render Free](https://render.com/docs/free).
- Draf soal secara default tersimpan di **localStorage browser guru** (bukan database di cloud). Selalu gunakan tombol **Ekspor JSON** sebagai cadangan bila akan pindah komputer atau membersihkan data browser.
- Mode saat ini disarankan untuk **satu instance server**. Belum ada sinkronisasi ruang antarreplika. Mengaktifkan *autoscale* ke beberapa instance tanpa lapisan data realtime bersama dapat mengganggu permainan.
- CSV berisi nama panggilan dan hasil siswa, sebaiknya dikelola sebagai data pendidikan yang tidak dibagikan sembarangan.

## Variabel lingkungan

| Nama | Keterangan |
| --- | --- |
| `PORT` | Port HTTP; platform cloud biasanya mengatur otomatis. Default `3000`. |
| `HOST` | Antarmuka bind; default `0.0.0.0`. |
| `HOST_ACCESS_CODE` | Kode rahasia untuk membuat kuis; **disarankan untuk hosting publik**. |
| `DATA_FILE` | Jalur file JSON untuk penyimpanan ruang yang dipulihkan setelah restart, opsional. |

## Batasan dan pengembangan berikutnya

Versi ini belum memiliki akun guru individual, bank soal cloud bersama, database terkelola, penjadwalan ujian, soal multimedia, pengacakan soal, anti-cheat lanjutan, atau panel admin. Pengembangan berikutnya bisa memakai PostgreSQL dan autentikasi guru untuk mengelola kelas, bank soal, serta laporan lintas sesi.

## Impor soal dari Microsoft Excel

1. Pada Studio Kuis, klik **Template CSV**.
2. Buka berkas yang diunduh di Excel, isi satu soal per baris.
3. Kolom yang diperlukan: `pertanyaan`, `a`, `b`, `c`, `d`, `jawaban_benar`, `waktu_detik`.
4. Isi `jawaban_benar` dengan A, B, C, D atau 1–4 dan `waktu_detik` antara 10–60.
5. Simpan sebagai **CSV UTF-8**; klik **Impor Excel/CSV** pada aplikasi.

Berkas `template-soal-kuiskilat.csv` sudah disediakan dalam ZIP. Berkas CSV berisi bank soal guru, jadi jangan membagikan berkas yang memuat kunci jawaban kepada siswa.

## Struktur folder

```text
KuisKilat-Online/
  server.js                 # API, SSE, skor, laporan CSV, penyimpanan opsional
  package.json              # Jalankan aplikasi dan pengujian
  public/                   # Tampilan guru dan siswa + pembaca CSV
  tests/                    # Uji otomatis
  render.yaml               # Deploy Render
  railway.json              # Deploy Railway
  Dockerfile                # Deploy ke hosting berbasis Docker
  .env.example              # Contoh nama konfigurasi
  PANDUAN-PASANG-ONLINE.md  # Panduan terperinci memasang secara online
  MULAI-DI-SINI.md          # Panduan singkat
  template-soal-kuiskilat.csv  # Contoh format soal Excel
  JALANKAN-WINDOWS.bat      # Peluncur lokal Windows
```

Lisensi: boleh digunakan dan dimodifikasi untuk pembelajaran serta pengembangan internal.
