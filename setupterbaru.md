# 📋 Panduan Instalasi & Setup Terbaru
## IT Ticketing System — Versi Production

> **Stack:** Next.js 14 · Node.js/Express · PostgreSQL · Prisma ORM · Socket.IO · Docker
>
> **Update terakhir:** Mei 2026 — Data isolation per cabang: login, dashboard, tiket & laporan sesuai cabang user

---

## Daftar Isi

1. [Persyaratan Sistem](#1-persyaratan-sistem)
2. [Struktur Folder](#2-struktur-folder)
3. [Setup via Docker (Direkomendasikan)](#3-setup-via-docker-direkomendasikan)
4. [Setup Manual (Development)](#4-setup-manual-development)
5. [Konfigurasi Environment Variables](#5-konfigurasi-environment-variables)
6. [Menjalankan Pertama Kali & Seeding Data](#6-menjalankan-pertama-kali--seeding-data)
7. [Akun Default](#7-akun-default)
8. [Fitur-Fitur Utama](#8-fitur-fitur-utama)
9. [Pengaturan Perusahaan](#9-pengaturan-perusahaan)
10. [Cabang & Regulasi](#10-cabang--regulasi)
11. [Isolasi Data per Cabang](#11-isolasi-data-per-cabang)
12. [Perintah-Perintah Berguna](#12-perintah-perintah-berguna)
13. [Troubleshooting](#13-troubleshooting)
14. [Update Aplikasi](#14-update-aplikasi)

---

## 1. Persyaratan Sistem

### Menggunakan Docker (Direkomendasikan)
| Kebutuhan | Versi Minimum |
|-----------|---------------|
| Docker Desktop | 24.x atau lebih baru |
| Docker Compose | v2.x (sudah termasuk di Docker Desktop) |
| RAM | Minimal 4 GB |
| Storage | Minimal 5 GB kosong |

### Tanpa Docker (Manual)
| Kebutuhan | Versi Minimum |
|-----------|---------------|
| Node.js | 18.x atau lebih baru |
| npm | 9.x atau lebih baru |
| PostgreSQL | 14.x atau lebih baru |
| OS | Windows 10/11, macOS 12+, Ubuntu 20.04+ |

---

## 2. Struktur Folder

```
IT Tiketing/
├── docker-compose.yml          ← Orkestrasi semua service
├── setupterbaru.md             ← Panduan ini
│
├── backend/                    ← API Server (Node.js + Express)
│   ├── Dockerfile
│   ├── .env.example            ← Template environment variables
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       ← Skema database (9 model + CompanySetting)
│   │   └── seed.js             ← Data dummy untuk development
│   └── src/
│       ├── server.js           ← Entry point
│       ├── controllers/        ← Logic bisnis
│       ├── routes/             ← Definisi endpoint API
│       ├── middleware/         ← Auth, validasi, rate limit
│       ├── config/             ← Database, socket, cron
│       └── utils/              ← Helper functions
│
└── frontend/                   ← UI (Next.js 14 + TailwindCSS)
    ├── Dockerfile
    ├── next.config.js
    ├── postcss.config.js
    ├── tailwind.config.js
    └── src/
        ├── app/                ← Halaman (App Router)
        │   ├── auth/           ← Login
        │   ├── dashboard/      ← Dashboard utama
        │   ├── tickets/        ← Daftar & detail tiket
        │   ├── reports/        ← Laporan & export
        │   ├── admin/
        │   │   ├── users/      ← Kelola user
        │   │   ├── departments/← Kelola departemen
        │   │   ├── categories/ ← Kelola kategori
        │   │   └── settings/   ← Pengaturan perusahaan ← BARU
        │   ├── notifications/  ← Notifikasi
        │   └── profile/        ← Profil pengguna
        ├── components/         ← Komponen reusable
        └── lib/                ← API client, store, utils
```

---

## 3. Setup via Docker (Direkomendasikan)

### Langkah 1 — Clone / Salin Project

Pastikan folder project berada di lokasi yang tidak mengandung spasi berlebihan.
Contoh: `D:\project\it\IT Tiketing\`

### Langkah 2 — Buat File `.env`

Buat file `.env` di root folder (sejajar dengan `docker-compose.yml`):

```bash
# Salin dari contoh
copy backend\.env.example .env
```

Atau buat manual dengan isi minimal berikut:

```env
# Database
DB_PASSWORD=StrongPassword123!

# JWT Secrets (ganti dengan string acak minimal 32 karakter)
JWT_SECRET=ganti_ini_dengan_string_rahasia_minimal_32_karakter_aman
JWT_REFRESH_SECRET=ganti_ini_juga_dengan_string_rahasia_berbeda_32_karakter

# URL Aplikasi
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

# Email SMTP (opsional, untuk notifikasi email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=email_kamu@gmail.com
SMTP_PASS=app_password_gmail
EMAIL_FROM=IT Support <noreply@perusahaan.com>
```

> **Tips JWT Secret:** Generate string acak menggunakan perintah:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### Langkah 3 — Build & Jalankan

```bash
# Masuk ke folder project
cd "D:\project\it\IT Tiketing"

# Build dan jalankan semua service
docker compose up -d --build
```

Proses build pertama kali memakan waktu **5–10 menit** tergantung koneksi internet.

### Langkah 4 — Cek Status Container

```bash
docker compose ps
```

Hasil yang diharapkan (semua `running`):

```
NAME                    STATUS          PORTS
it_ticketing_db         running         0.0.0.0:5432->5432/tcp
it_ticketing_backend    running         0.0.0.0:5000->5000/tcp
it_ticketing_frontend   running         0.0.0.0:3000->3000/tcp
```

### Langkah 5 — Jalankan Seeder (Data Dummy)

```bash
docker compose exec backend node prisma/seed.js
```

### Langkah 6 — Buka Aplikasi

| Service | URL |
|---------|-----|
| **Aplikasi Web** | http://localhost:3000 |
| **API Backend** | http://localhost:5000 |
| **API Health Check** | http://localhost:5000/health |
| **Database** | localhost:5432 (user: postgres) |

---

## 4. Setup Manual (Development)

Gunakan cara ini jika ingin development aktif dengan hot-reload.

### Backend

```bash
cd backend

# Install dependencies
npm install

# Salin environment variables
copy .env.example .env
# Edit .env sesuai konfigurasi lokal Anda

# Generate Prisma client
npx prisma generate

# Push schema ke database (buat tabel)
npx prisma db push

# Jalankan seeder
node prisma/seed.js

# Jalankan server development (hot-reload)
npm run dev
```

Backend berjalan di: `http://localhost:5000`

### Frontend

Buka terminal baru:

```bash
cd frontend

# Install dependencies
npm install

# Buat file environment
echo NEXT_PUBLIC_API_URL=http://localhost:5000/api > .env.local
echo NEXT_PUBLIC_SOCKET_URL=http://localhost:5000 >> .env.local

# Jalankan development server
npm run dev
```

Frontend berjalan di: `http://localhost:3000`

---

## 5. Konfigurasi Environment Variables

### File `.env` (root — untuk Docker)

| Variable | Deskripsi | Default |
|----------|-----------|---------|
| `DB_PASSWORD` | Password database PostgreSQL | `StrongPassword123!` |
| `JWT_SECRET` | Secret key untuk JWT access token | — **Wajib diganti** |
| `JWT_REFRESH_SECRET` | Secret key untuk refresh token | — **Wajib diganti** |
| `FRONTEND_URL` | URL frontend (untuk CORS) | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | URL API backend dari browser | `http://localhost:5000/api` |
| `NEXT_PUBLIC_SOCKET_URL` | URL Socket.IO | `http://localhost:5000` |
| `SMTP_HOST` | Server SMTP untuk email | smtp.gmail.com |
| `SMTP_PORT` | Port SMTP | 587 |
| `SMTP_USER` | Email pengirim | — |
| `SMTP_PASS` | Password/App password email | — |

### Deploy ke Server/VPS

Ubah URL dari `localhost` ke IP atau domain server:

```env
FRONTEND_URL=http://192.168.1.100:3000
NEXT_PUBLIC_API_URL=http://192.168.1.100:5000/api
NEXT_PUBLIC_SOCKET_URL=http://192.168.1.100:5000
```

Atau jika sudah punya domain:

```env
FRONTEND_URL=https://ticketing.perusahaan.com
NEXT_PUBLIC_API_URL=https://api.ticketing.perusahaan.com/api
NEXT_PUBLIC_SOCKET_URL=https://api.ticketing.perusahaan.com
```

---

## 6. Menjalankan Pertama Kali & Seeding Data

Setelah container berjalan, jalankan seeder untuk mengisi data awal:

```bash
docker compose exec backend node prisma/seed.js
```

Seeder akan membuat:
- ✅ 8 Departemen (IT, Keuangan, HR, Operasional, dll.)
- ✅ 7 Kategori tiket (Hardware, Software, Network, Email, Printer, Security, Lainnya)
- ✅ 5 User (1 Admin, 2 IT Staff, 2 User biasa)
- ✅ ~20 Tiket dummy dengan berbagai status dan prioritas
- ✅ Pengaturan perusahaan default

---

## 7. Akun Default

> ⚠️ **Ganti password semua akun setelah pertama login di production!**

| Role | Email | Password |
|------|-------|----------|
| 👤 **Admin** | admin@company.com | password123 |
| 🔧 **IT Staff** | budi@company.com | password123 |
| 🔧 **IT Staff** | siti@company.com | password123 |
| 👥 **User** | rina@company.com | password123 |
| 👥 **User** | doni@company.com | password123 |

### Hak Akses per Role

| Fitur | User | IT Staff | Admin |
|-------|------|----------|-------|
| Buat tiket baru | ✅ | ✅ | ✅ |
| Lihat tiket sendiri | ✅ | — | — |
| Lihat semua tiket | — | ✅ | ✅ |
| Update status tiket | — | ✅ | ✅ |
| Assign tiket | — | ✅ | ✅ |
| Lihat laporan | — | ✅ | ✅ |
| Export PDF & Excel | — | ✅ | ✅ |
| Kelola user | — | — | ✅ |
| Kelola departemen | — | — | ✅ |
| Kelola kategori | — | — | ✅ |
| **Pengaturan Perusahaan** | — | — | ✅ |
| Hapus tiket permanen | — | — | ✅ |
| Hapus user permanen | — | — | ✅ |

---

## 8. Fitur-Fitur Utama

### Sistem Tiket
- Nomor tiket otomatis (format: `TKT-YYYYMMDD-XXXX`)
- Prioritas: Low / Medium / High / Critical
- Status: Open → On Progress → Pending → Resolved → Closed
- SLA timer otomatis per kategori (Network: 2 jam, Security: 1 jam, dll.)
- Upload attachment (gambar, PDF, dokumen)
- Komentar & komentar internal (hanya IT Staff)
- Timeline aktivitas tiket

### Dashboard
- Statistik total tiket, open, selesai, breached SLA
- Grafik tren tiket bulanan
- Distribusi per kategori dan per prioritas
- Performa SLA (%)
- Aktivitas terbaru

### Laporan & Export
- Filter periode: Hari Ini / Minggu Ini / Bulan Ini / Bulan Lalu / Custom
- Filter departemen & teknisi
- Export **PDF** profesional (header perusahaan + logo + halaman tanda tangan)
- Export **Excel** (3 sheet: Ringkasan, Data Tiket, Tanda Tangan)
- Simpan nama penanda tangan untuk digunakan ulang

### Notifikasi
- Real-time via Socket.IO
- Notifikasi in-app (bell icon)
- Email notification (jika SMTP dikonfigurasi)
- Reminder SLA overdue

---

## 9. Pengaturan Perusahaan

Halaman **Admin → Pengaturan** (`/admin/settings`) memungkinkan Admin mengatur:

| Field | Keterangan | Tampil di |
|-------|-----------|-----------|
| Nama Perusahaan | Nama utama organisasi | Sidebar + Header laporan |
| Tagline | Sub-judul / divisi | Sidebar |
| Logo | File gambar (PNG/JPG/SVG, maks 2MB) | Sidebar + Header PDF |
| Alamat | Alamat lengkap kantor | Header PDF & Excel |
| Kota | Kota kantor | Tanggal laporan (contoh: "Bandung, 24 Mei 2026") |
| Telepon | Nomor telepon kantor | Header PDF & Excel |
| Email | Email perusahaan | Header PDF & Excel |
| Website | URL website | Tersimpan di database |

### Nama Tanda Tangan Laporan

Di halaman **Laporan** (`/reports`), bagian "Pengaturan Tanda Tangan" dapat diisi dan disimpan:

- **Dibuat Oleh** — Nama Staff IT pembuat laporan
- **Diperiksa Oleh** — Nama Kepala IT / Supervisor
- **Disetujui Oleh** — Nama Manager

Klik **Simpan Nama TTD** agar tersimpan dan otomatis muncul saat halaman laporan dibuka berikutnya.

---

## 10. Cabang & Regulasi

Halaman **Admin → Cabang** (`/admin/branches`) memungkinkan Admin mengelola seluruh cabang perusahaan beserta regulasi masing-masing.

### Manajemen Cabang

| Field | Keterangan |
|-------|-----------|
| Nama Cabang | Nama lengkap cabang/kantor |
| Kode | Singkatan unik (contoh: HQ, BDG, SBY) — otomatis kapital |
| Kota | Kota lokasi cabang |
| Alamat | Alamat lengkap |
| Telepon | Nomor telepon cabang |
| Email | Email cabang |
| Nama Manajer | Nama kepala/manajer cabang |
| Kantor Pusat | Tandai satu cabang sebagai kantor pusat (bintang kuning) |
| Status | Aktif / Nonaktif |

> Hanya satu cabang yang bisa ditandai sebagai **Kantor Pusat** pada satu waktu. Menandai cabang baru secara otomatis mencabut status kantor pusat dari cabang sebelumnya.

### Regulasi per Cabang

Setiap cabang dapat memiliki daftar regulasi/kebijakan operasional. Klik **Kelola Regulasi** pada kartu cabang untuk membuka panel regulasi.

**Tipe Regulasi:**

| Tipe | Warna | Contoh Penggunaan |
|------|-------|-------------------|
| **SLA** | Biru | "Tiket Critical wajib selesai dalam 1 jam" |
| **Operasional** | Ungu | "Jam layanan IT: 08.00–17.00 WIB" |
| **Keamanan** | Merah | "Insiden keamanan lapor dalam 15 menit" |
| **Eskalasi** | Kuning | "SLA 2x lewat → eskalasi ke Supervisor" |
| **Lainnya** | Abu | Kebijakan lain-lain |

### Integrasi dengan Fitur Lain

- **User** dapat ditetapkan ke cabang tertentu (field Cabang di form tambah/edit user)
- **Tiket** dapat dikaitkan dengan cabang saat pembuatan tiket
- **Laporan** dapat difilter berdasarkan cabang
- **Seeder** sudah menyertakan 3 cabang default (Kantor Pusat, Bandung, Surabaya) dan 7 regulasi contoh

### Data Seeder Cabang Default

| Nama | Kode | Kota | Keterangan |
|------|------|------|-----------|
| Kantor Pusat | HQ | Jakarta | Marked sebagai Head Office, 5 regulasi |
| Cabang Bandung | BDG | Bandung | 2 regulasi |
| Cabang Surabaya | SBY | Surabaya | — |

---

## 11. Isolasi Data per Cabang

Setiap user yang login akan melihat data yang di-filter sesuai cabang mereka secara otomatis.

### Logika Akses Data per Role

| Role | Tiket | Dashboard | Laporan | Ekspor PDF/Excel |
|------|-------|-----------|---------|-----------------|
| **USER** | Tiket sendiri | Statistik sendiri | Tiket sendiri | Tiket sendiri |
| **IT_STAFF** | Tiket cabangnya | Statistik cabangnya | Data cabangnya | Header + info cabang |
| **ADMIN** | Semua cabang | Filter dropdown cabang | Filter dropdown cabang | Header cabang terpilih |

### Detail Implementasi

**Backend — `auth.middleware.js`**
Token JWT di-decode dan data user (`branchId`, `branch`) di-attach ke `req.user` pada setiap request.

**Backend — `dashboard.controller.js`**
```js
let baseWhere = {};
if (req.user.role === 'USER')     baseWhere = { creatorId: req.user.id };
else if (req.user.role === 'IT_STAFF') baseWhere = req.user.branchId ? { branchId: req.user.branchId } : {};
else if (req.query.branchId)      baseWhere = { branchId: req.query.branchId }; // ADMIN filter
```

**Backend — `ticket.controller.js`**
```js
if (req.user.role === 'USER')               where.creatorId = req.user.id;
else if (req.user.role === 'IT_STAFF' && req.user.branchId) where.branchId = req.user.branchId;
// ADMIN: no restriction, optional ?branchId= query param
```

**Frontend — `dashboard/page.jsx`**
- Badge cabang user tampil di header welcome (nama + kode + ★ untuk HQ)
- Admin mendapat dropdown **filter cabang** — memilih cabang tertentu akan me-refresh semua stats
- `dashboardAPI.stats({ branchId })` meneruskan param ke backend

**Frontend — `reports/page.jsx`**
- IT_STAFF/USER: panel filter menampilkan field "Cabang" read-only (locked ke cabang sendiri), badge cabang tampil di header laporan
- Admin: dropdown filter cabang tersedia di panel filter laporan
- Dropdown "Teknisi" otomatis difilter sesuai cabang yang dipilih
- `effectiveBranchId` diteruskan ke semua query laporan dan ekspor

**Ekspor PDF & Excel**
- Header PDF memuat badge cabang (nama, kode, kota)
- Halaman pengesahan PDF memuat baris "Cabang" di info box
- Excel sheet "Ringkasan" memuat baris cabang berwarna biru di bawah info periode

**Tiket Baru**
Saat user membuat tiket, `branchId` diisi otomatis dari `req.user.branchId` sehingga tiket selalu tercatat di cabang yang benar.

### Skenario Penggunaan

```
1. IT Staff Bandung login → laporan otomatis hanya data cabang Bandung
2. PDF/Excel yang diekspor memuat nama "Cabang Bandung (BDG) — Bandung"
3. Admin login → bisa pilih "Semua Cabang" atau filter ke cabang tertentu
4. Karyawan HQ buat tiket → tiket ter-tag ke cabang HQ
```

---

## 12. Perintah-Perintah Berguna

### Docker

```bash
# Jalankan semua service
docker compose up -d

# Rebuild setelah ada perubahan kode
docker compose up -d --build

# Rebuild satu service saja (lebih cepat)
docker compose up -d --build backend
docker compose up -d --build frontend

# Cek status container
docker compose ps

# Lihat log real-time
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Hentikan semua service
docker compose down

# Hentikan dan hapus semua data (HATI-HATI!)
docker compose down -v

# Restart service tertentu
docker compose restart backend
```

### Database & Prisma

```bash
# Jalankan seeder (isi data dummy)
docker compose exec backend node prisma/seed.js

# Push perubahan schema ke database
docker compose exec backend npx prisma db push

# Buka Prisma Studio (GUI database)
docker compose exec backend npx prisma studio
# Akses di: http://localhost:5555

# Lihat isi database langsung
docker compose exec postgres psql -U postgres -d it_ticketing
```

### Backup & Restore Database

```bash
# Backup database
docker compose exec postgres pg_dump -U postgres it_ticketing > backup_$(date +%Y%m%d).sql

# Restore database
docker compose exec -T postgres psql -U postgres it_ticketing < backup_20260524.sql
```

---

## 13. Troubleshooting

### ❌ Container `backend` terus restart / unhealthy

```bash
# Lihat log error
docker compose logs backend

# Solusi umum:
# 1. Pastikan postgres sudah running dan healthy dulu
docker compose ps postgres

# 2. Coba rebuild backend
docker compose up -d --build backend
```

### ❌ Tampilan website tidak ada CSS (plain text)

Pastikan file `frontend/postcss.config.js` ada dengan isi:
```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```
Lalu rebuild: `docker compose up -d --build frontend`

### ❌ Error "Too many requests" saat login

Rate limiter aktif. Tunggu 15 menit, atau restart backend:
```bash
docker compose restart backend
```

### ❌ Upload logo/file tidak tersimpan setelah restart

Volume `upload_data` seharusnya persisten. Cek:
```bash
docker volume ls | grep upload
docker volume inspect it-tiketing_upload_data
```

### ❌ Halaman admin/settings tidak muncul

Pastikan login sebagai **Admin**. Halaman pengaturan hanya muncul di sidebar untuk role Admin.

### ❌ Export PDF/Excel error

```bash
# Cek log backend saat export
docker compose logs -f backend
# Lalu coba export lagi dari browser
```

### ❌ Socket.IO tidak terhubung (notifikasi real-time tidak berfungsi)

Pastikan `NEXT_PUBLIC_SOCKET_URL` di `.env` sesuai dengan URL backend yang bisa dijangkau dari browser.

### ❌ Perubahan kode tidak terlihat

Setelah edit file, rebuild service yang berubah:
```bash
docker compose up -d --build backend   # jika edit file backend
docker compose up -d --build frontend  # jika edit file frontend
```

---

## 14. Update Aplikasi

### Update Kode

```bash
# 1. Pull perubahan terbaru (jika menggunakan Git)
git pull

# 2. Rebuild dan restart
docker compose up -d --build

# 3. Jika ada perubahan schema database
docker compose exec backend npx prisma db push
```

### Update Schema Database (Tanpa Kehilangan Data)

```bash
# Edit prisma/schema.prisma terlebih dahulu, lalu:
docker compose exec backend npx prisma db push
```

> Schema saat ini sudah mencakup model `CompanySetting` (versi terbaru).
> Jika upgrade dari versi lama, jalankan `db push` untuk menambahkan tabel baru.

### Cek Versi

```bash
# Node.js di backend
docker compose exec backend node --version

# npm
docker compose exec backend npm --version

# Prisma
docker compose exec backend npx prisma --version
```

---

## API Endpoint Utama

| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| POST | `/api/auth/login` | Login | — |
| POST | `/api/auth/logout` | Logout | ✅ |
| GET | `/api/auth/me` | Info user aktif | ✅ |
| GET | `/api/tickets` | Daftar tiket | ✅ |
| POST | `/api/tickets` | Buat tiket baru | ✅ |
| PUT | `/api/tickets/:id` | Update tiket | ✅ |
| DELETE | `/api/tickets/:id` | Hapus tiket | Admin |
| GET | `/api/dashboard` | Statistik dashboard | ✅ |
| GET | `/api/reports` | Data laporan | IT Staff/Admin |
| GET | `/api/reports/export/pdf` | Export PDF | IT Staff/Admin |
| GET | `/api/reports/export/excel` | Export Excel | IT Staff/Admin |
| GET | `/api/users` | Daftar user | Admin/IT Staff |
| POST | `/api/users` | Tambah user | Admin |
| DELETE | `/api/users/:id/permanent` | Hapus user permanen | Admin |
| GET | `/api/settings` | Pengaturan perusahaan | Public |
| PUT | `/api/settings` | Update pengaturan | Admin |
| POST | `/api/settings/logo` | Upload logo | Admin |
| DELETE | `/api/settings/logo` | Hapus logo | Admin |
| GET | `/api/departments` | Daftar departemen | ✅ |
| GET | `/api/categories` | Daftar kategori | ✅ |
| GET | `/api/notifications` | Notifikasi user | ✅ |
| GET | `/api/branches` | Daftar cabang | ✅ |
| POST | `/api/branches` | Tambah cabang | Admin |
| PUT | `/api/branches/:id` | Update cabang | Admin |
| DELETE | `/api/branches/:id` | Hapus cabang | Admin |
| GET | `/api/branches/:id/regulations` | Regulasi cabang | ✅ |
| POST | `/api/branches/:id/regulations` | Tambah regulasi | Admin |
| PUT | `/api/branches/:id/regulations/:regId` | Update regulasi | Admin |
| DELETE | `/api/branches/:id/regulations/:regId` | Hapus regulasi | Admin |

---

## Catatan Penting

> ⚠️ **Sebelum Production:**
> 1. Ganti **semua password akun default**
> 2. Set `JWT_SECRET` dan `JWT_REFRESH_SECRET` dengan string acak yang kuat
> 3. Konfigurasi SMTP untuk email notifikasi
> 4. Isi data perusahaan di **Admin → Pengaturan**
> 5. Pastikan backup database terjadwal

---

*Panduan ini selalu diperbarui setiap ada fitur atau perubahan baru.*

**Changelog:**
- **Mei 2026 (v4)** — Isolasi data per cabang: user/IT_STAFF melihat data sesuai cabang masing-masing, badge cabang di dashboard & laporan, admin dapat filter cabang di dashboard+laporan, PDF/Excel memuat info cabang, tiket otomatis ter-tag ke cabang pembuat
- **Mei 2026 (v3)** — Fitur Cabang Perusahaan & Regulasi: model Branch + BranchRegulation, halaman admin/branches, menu sidebar Cabang, seeder 3 cabang + 7 regulasi contoh, endpoint `/api/branches`
- **Mei 2026 (v2)** — Fitur Pengaturan Perusahaan: upload logo, nama/tagline/alamat tampil di sidebar & header laporan PDF/Excel, simpan nama tanda tangan laporan
- **Mei 2026 (v1)** — Rilis awal: sistem tiket lengkap, dashboard, laporan PDF & Excel, autentikasi JWT multi-role, Docker deployment
