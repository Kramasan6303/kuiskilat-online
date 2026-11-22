# PANDUAN MENERBITKAN KUISKILAT ONLINE

Dokumen ini ditujukan bagi pengguna yang ingin membuat KuisKilat bisa dibuka siswa melalui internet, bukan hanya dari komputer guru. Tidak harus bisa memprogram. Anda perlu akun GitHub dan akun layanan hosting Node.js seperti Render atau Railway.

## A. Cara paling mudah: GitHub + Render

### 1. Siapkan kode program di GitHub

1. Buka https://github.com dan masuk atau buat akun.
2. Klik tombol **New repository**.
3. Beri nama `kuiskilat-online`, pilih **Private** jika ingin kode program hanya bisa dibaca oleh Anda, lalu klik **Create repository**.
4. Buka folder hasil ekstrak ZIP `KuisKilat-Online` di komputer. Pastikan Anda melihat `server.js`, `package.json`, `render.yaml`, folder `public`, dan folder `tests`.
5. Di halaman repositori GitHub, pilih **Add file → Upload files**. Unggah **isi folder** tersebut, bukan ZIP-nya. Pastikan folder `public` dan `tests` ikut terunggah beserta isinya. File yang diawali titik boleh diunggah juga, tetapi **jangan mengunggah `.env` yang berisi rahasia**.
6. Klik **Commit changes**. Setelah selesai, file `server.js`, `package.json`, dan `render.yaml` harus terlihat pada halaman utama repositori, bukan bersarang satu folder lagi.

### 2. Pasang aplikasi di Render

1. Buka https://dashboard.render.com/ dan login.
2. Pilih **New → Web Service** (bukan Static Site, karena KuisKilat menggunakan Node.js di server).
3. Pilih repositori GitHub `kuiskilat-online` dan izinkan Render membaca repositori tersebut.
4. Jika membuat Web Service manual, isi:
   - **Language/Runtime:** Node
   - **Build command:** `npm install --omit=dev`
   - **Start command:** `npm start`
   - **Health check path:** `/api/health`
   - **Instance:** dapat menggunakan opsi Free untuk percobaan jika tersedia pada akun Anda.
5. Di bagian **Environment**, tambahkan `NODE_ENV=production` dan `HOST_ACCESS_CODE` dengan nilai rahasia yang hanya diketahui guru/admin (misalnya frasa acak panjang). Jangan membagikan kode ini kepada siswa.
6. Klik **Create Web Service / Deploy Web Service**. Tunggu status menjadi **Live** di dasbor layanan.
7. Buka alamat publik yang diberikan, misalnya `https://kuiskilat-online-xyz.onrender.com` (contoh saja, alamat sebenarnya akan berbeda).
8. Di browser, coba buka `https://ALAMAT-ANDA/api/health`: jika muncul respons JSON berisi `"ok":true`, aplikasi berjalan.

Perlu diketahui: jika memakai Render Free, aplikasi dapat tertidur saat tidak digunakan dan penyimpanan server tidak permanen. Jangan mengandalkannya untuk ujian resmi dengan nilai yang harus tahan terhadap restart. Simpan hasil CSV segera setelah kuis selesai.

### 3. Buka kuis untuk siswa

1. Guru buka URL aplikasi yang sudah terbit di Chrome atau browser lain.
2. Tekan **Saya Guru / Host** lalu susun kuis, impor Excel/CSV, atau impor JSON yang pernah disimpan.
3. Ketik **Kode akses guru** sesuai nilai `HOST_ACCESS_CODE` yang diatur di Render.
4. Tekan **Buka ruang kuis** dan **Salin tautan bergabung**. Bagikan melalui WhatsApp/grup kelas.
5. Siswa klik tautan. PIN akan terisi otomatis; siswa hanya memasukkan nama panggilan dan memilih **Gabung sekarang**.
6. Setelah siswa masuk, guru pilih **Mulai permainan**. Siswa menjawab langsung dari HP masing-masing.
7. Guru menyelesaikan permainan, lalu klik **Unduh hasil CSV** agar bisa dibuka dengan Excel.

## B. Alternatif: Railway

1. Siapkan repositori GitHub seperti langkah A1.
2. Login ke https://railway.com/ dan pilih **New Project → Deploy from GitHub Repo**.
3. Pilih repositori `kuiskilat-online`.
4. Di bagian **Variables**, tambahkan `NODE_ENV=production` dan `HOST_ACCESS_CODE` yang rahasia. Railway biasanya memberikan `PORT` secara otomatis.
5. Setelah *deployment* berjalan, pilih layanan → **Settings → Networking → Generate Domain** untuk memperoleh URL HTTPS publik.
6. Tes `https://ALAMAT-ANDA/api/health`, lalu gunakan alamat tersebut untuk permainan.
7. Jika ingin ruangan tidak hilang karena restart, pelajari fitur **Volume** Railway dan atur `DATA_FILE` agar mengarah ke jalur volume permanen. Lokasi volume harus dapat ditulis oleh proses Node.

Ketersediaan paket, biaya, dan tampilan menu provider dapat berubah. Selalu periksa informasi terbaru pada dashboard layanan.

## C. Menyimpan ruang di layanan dengan volume permanen

Jika Anda menggunakan paket hosting dengan disk/volume permanen (umumnya bukan Render Free):

1. Buat/mount volume di lokasi misalnya `/var/data`.
2. Tambahkan environment variable `DATA_FILE=/var/data/rooms.json`.
3. Pastikan proses Node memiliki izin tulis untuk jalur tersebut.
4. Buat ruang dan lakukan uji singkat, restart layanan lalu buka lagi sesi yang sama untuk memverifikasi pemulihan.

Perlu diingat: penyimpanan berbasis file ini hanya untuk **satu instance server**, bukan arsitektur distribusi. Cadangkan isi disk sesuai kebijakan sekolah.

## D. Masalah yang sering muncul

**Alamat website menampilkan error 502/503:** periksa log Render/Railway. Pastikan server start dengan `npm start`, `PORT` diambil otomatis dari environment, dan layanan berjalan.

**Siswa membuka tautan tetapi tidak dapat bergabung:** pastikan tautan memakai domain publik `https://...`, bukan `http://localhost:3000` atau alamat `192.168.x.x`. Pastikan ruangan masih aktif dan permainan belum dimulai.

**Kode guru salah:** periksa kecocokan karakter kode dengan yang tersimpan pada Environment di hosting. Setelah mengubahnya, lakukan deploy/restart layanan jika diminta.

**PIN hilang setelah beberapa saat:** pada layanan tanpa penyimpanan permanen, proses server yang restart akan kehilangan ruangan. Gunakan penyimpanan permanen untuk mengurangi risiko tersebut.

**Soal tidak terlihat di komputer lain:** draf soal disimpan di browser setempat. Ekspor JSON di komputer pertama lalu impor JSON di komputer kedua, atau gunakan template CSV dari Excel. Sistem akun dan bank soal cloud belum tersedia pada versi ini.

**Unduhan nilai tidak muncul:** tombol **Unduh hasil CSV** ada pada podium akhir di layar guru. Bila server telah restart dan datanya tidak dipulihkan, hasil sebelumnya tidak dapat diambil.

---

KuisKilat Online 3.0 — aplikasi web Node.js untuk kuis interaktif kelas.
