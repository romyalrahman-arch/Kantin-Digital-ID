# 🍽️ Kantin Cerdas Real-time (Full-Stack + Server Publik)

Aplikasi pemesanan kantin modern dengan antarmuka pelanggan dan dashboard dapur/kasir yang tersinkronisasi secara **real-time** menggunakan database SQLite terpusat dan arsitektur Event-Driven (SSE).

---

## 🌟 Fitur Utama

1. **Sinkronisasi Real-Time Dua Arah:**
   - Saat pembeli checkout di HP $\rightarrow$ Layar kasir berbunyi "ding" dan antrean otomatis bertambah tanpa reload.
   - Saat kasir klik *"Makanan Siap"* $\rightarrow$ Layar HP pembeli otomatis berubah warna hijau menjadi *"Siap Diambil!"* disertai nada notifikasi.
   - Saat kasir menambah atau menghapus menu $\rightarrow$ Seluruh katalog pelanggan terupdate instan.
2. **Database Terpusat (SQLite):**
   - Semua data menu, harga, foto, antrean, dan pesanan tersimpan rapi dan permanen di file `data/kantin.db`.
3. **Proteksi Akses Admin:**
   - Dilengkapi popup PIN keamanan saat masuk ke mode Admin (PIN bawaan: `1234`).
4. **Audio Alert Bawaan:**
   - Menggunakan Web Audio API (synthesizer nada internal), sehingga tidak memerlukan file audio eksternal dan tetap berbunyi di semua browser.
5. **Zero External Dependency:**
   - Server Node.js berjalan menggunakan modul bawaan (`http`, `node:sqlite`, `fs`), sangat ringan dan cepat.

---

## 📁 Struktur Proyek

```
kantin-cerdas/
├── server.js            # Server HTTP, REST API, & Real-time Server-Sent Events (SSE)
├── package.json         # Konfigurasi dependensi & skrip start
├── Dockerfile           # Konfigurasi deploy ke Docker / Cloud Container
├── start.bat            # Peluncur cepat di Windows (klik ganda)
├── data/
│   └── kantin.db        # Database SQLite (dibuat otomatis)
└── public/
    └── index.html       # Antarmuka web responsive (Pembeli + Admin)
```

---

## 🚀 Cara Menjalankan Secara Lokal

### Cara 1: Menggunakan `start.bat`
Cukup klik ganda file `start.bat`. Server akan aktif dan dapat diakses di:
> **http://localhost:3000**

### Cara 2: Lewat Terminal / Command Prompt
```bash
node server.js
```

---

## 🌐 Cara Membuatnya Bisa Diakses Publik

Ada dua pilihan untuk membuka aplikasi ini ke publik:

### 1. Publik Cepat (Tunneling Langsung dari Laptop/PC Anda)
Jika Anda ingin mengetes langsung dengan HP Anda atau teman di tempat lain tanpa sewa server:

* **Opsi A: Cloudflare Tunnel (Gratis, Tanpa Registrasi, HTTPS Otomatis)**
  Unduh `cloudflared.exe` dari Cloudflare, lalu jalankan di terminal:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  Anda akan langsung mendapatkan link publik seperti: `https://contoh-random.trycloudflare.com` yang bisa dibuka langsung di HP mana saja.

* **Opsi B: Pinggy (Gratis via SSH bawaan Windows)**
  Jalankan di terminal:
  ```bash
  ssh -R 80:localhost:3000 a.pinggy.io
  ```

---

### 2. Publik Permanen (Deploy ke Cloud Hosting 24 Jam)

Aplikasi ini sudah siap di-deploy ke berbagai layanan cloud:

* **Render.com (Rekomendasi - Ada Paket Gratis):**
  1. Upload folder ini ke repository GitHub Anda.
  2. Buka dashboard [Render.com](https://render.com) $\rightarrow$ Pilih **New Web Service**.
  3. Hubungkan repository GitHub Anda.
  4. Atur:
     - **Runtime:** Node
     - **Build Command:** *(kosongkan atau `npm install`)*
     - **Start Command:** `node server.js`
  5. Klik **Deploy Web Service**. Dalam 1-2 menit aplikasi sudah online dengan domain `.onrender.com` gratis dan SSL HTTPS otomatis.

* **Railway.app / Fly.io:**
  - Cukup sambungkan repository GitHub atau gunakan Dockerfile yang sudah disertakan (`Dockerfile`).

* **VPS Sendiri (Ubuntu / Debian / Docker):**
  ```bash
  docker build -t kantin-cerdas .
  docker run -d -p 80:3000 --name kantin-app kantin-cerdas
  ```

---

## 🔑 Pengaturan Lingkungan (Environment Variables)

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server HTTP |
| `ADMIN_PIN` | `1234` | PIN untuk mengakses tab Admin |
