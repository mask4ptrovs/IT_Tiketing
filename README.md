# 🖥️ IT Ticketing System

Sistem Ticketing IT & Pelaporan Internal Perusahaan — Full-stack production-ready application.

![Stack](https://img.shields.io/badge/Next.js-14-black) ![Stack](https://img.shields.io/badge/Node.js-20-green) ![Stack](https://img.shields.io/badge/PostgreSQL-16-blue) ![Stack](https://img.shields.io/badge/Prisma-5-teal)

---

## 📋 Fitur Lengkap

### Role & Akses
| Fitur | User | IT Staff | Admin |
|-------|------|----------|-------|
| Buat tiket baru | ✅ | ✅ | ✅ |
| Lihat tiket sendiri | ✅ | ✅ | ✅ |
| Lihat semua tiket | ❌ | ✅ | ✅ |
| Update status tiket | ❌ | ✅ | ✅ |
| Assign tiket ke teknisi | ❌ | ✅ | ✅ |
| Internal notes | ❌ | ✅ | ✅ |
| Dashboard analytics | ⬛ | ✅ | ✅ |
| Export PDF/Excel | ❌ | ✅ | ✅ |
| Kelola user | ❌ | ❌ | ✅ |
| Kelola departemen | ❌ | ❌ | ✅ |
| Kelola kategori | ❌ | ❌ | ✅ |
| Monitoring SLA | ❌ | ✅ | ✅ |

### Modul Utama
- **Ticketing**: Nomor otomatis, prioritas 4 level, 5 status, SLA timer, timeline aktivitas, lampiran file
- **Dashboard**: Chart interaktif (Recharts), statistik real-time, performa teknisi, distribusi kategori
- **Laporan**: Filter tanggal/divisi/teknisi, export Excel (ExcelJS) & PDF (PDFKit)
- **Notifikasi**: In-app + email notification, SLA warning/overdue alerts, real-time via Socket.IO
- **Dark Mode**: Full dark mode support via next-themes

---

## 🛠️ Teknologi

```
Frontend  │ Next.js 14 + React 18 + TailwindCSS + Recharts + Zustand + React Query
Backend   │ Node.js 20 + Express 4 + Socket.IO + JWT Auth
Database  │ PostgreSQL 16 + Prisma ORM
Security  │ Bcrypt + JWT + Rate Limiting + Helmet + Validation
Export    │ ExcelJS (XLSX) + PDFKit (PDF)
Deploy    │ Docker + Docker Compose
```

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- Docker & Docker Compose installed
- Port 3000, 5000, 5432 available

```bash
# 1. Clone / navigate to project folder
cd "IT Tiketing"

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env — change passwords and JWT secrets!
# nano .env  or  notepad .env

# 4. Start all services
docker-compose up -d

# 5. Run database migrations & seed data
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend node prisma/seed.js

# 6. Open browser
# Frontend:  http://localhost:3000
# Backend:   http://localhost:5000
# API docs:  http://localhost:5000/health
```

---

## 💻 Development Setup (Without Docker)

### Prerequisites
- Node.js >= 18
- PostgreSQL running locally

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy and configure env
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, etc.

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed dummy data
npm run seed

# Start development server (port 5000)
npm run dev
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy and configure env
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Start development server (port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | password123 |
| IT Staff | budi@company.com | password123 |
| IT Staff | siti@company.com | password123 |
| User | rina@company.com | password123 |
| User | doni@company.com | password123 |

---

## 📁 Struktur Project

```
IT Tiketing/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema
│   │   └── seed.js                # Dummy data seeder
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js        # Prisma client
│   │   │   ├── socket.js          # Socket.IO setup
│   │   │   └── cron.js            # Scheduled jobs (SLA check)
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── ticket.controller.js
│   │   │   ├── user.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   └── report.controller.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js  # JWT + role check
│   │   │   ├── errorHandler.js
│   │   │   ├── rateLimiter.js
│   │   │   ├── upload.middleware.js
│   │   │   └── validate.middleware.js
│   │   ├── routes/                 # Express routes
│   │   ├── services/
│   │   │   └── email.service.js
│   │   └── utils/
│   │       ├── jwt.js
│   │       ├── logger.js (Winston)
│   │       ├── response.js
│   │       └── ticketNumber.js
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/login/        # Login page
│   │   │   ├── dashboard/         # Dashboard with charts
│   │   │   ├── tickets/           # Ticket list + detail
│   │   │   ├── reports/           # Reports + export
│   │   │   ├── notifications/     # Notification center
│   │   │   ├── profile/           # User profile
│   │   │   └── admin/             # Admin pages
│   │   │       ├── users/
│   │   │       ├── departments/
│   │   │       └── categories/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── DashboardLayout.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Topbar.jsx
│   │   │   │   └── Providers.jsx
│   │   │   └── ui/
│   │   │       ├── Badge.jsx      # Status/Priority badges
│   │   │       ├── Modal.jsx      # Reusable modal
│   │   │       ├── Skeleton.jsx   # Loading skeletons
│   │   │       ├── EmptyState.jsx
│   │   │       └── Pagination.jsx
│   │   └── lib/
│   │       ├── api.js             # Axios + API functions
│   │       ├── store.js           # Zustand state management
│   │       └── utils.js           # Helpers + constants
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔌 REST API Endpoints

### Authentication
```
POST   /api/auth/login          # Login
POST   /api/auth/refresh        # Refresh access token
POST   /api/auth/logout         # Logout
GET    /api/auth/me             # Get current user
PUT    /api/auth/change-password
```

### Tickets
```
GET    /api/tickets             # List tickets (with filters, pagination)
POST   /api/tickets             # Create ticket
GET    /api/tickets/:id         # Get ticket detail
PUT    /api/tickets/:id         # Update ticket (status, priority, assign)
DELETE /api/tickets/:id         # Delete ticket (Admin only)
POST   /api/tickets/:id/comments # Add comment
```

### Dashboard
```
GET    /api/dashboard           # Stats, charts, recent activity
```

### Reports
```
GET    /api/reports             # Get report data
GET    /api/reports/export/excel # Export Excel
GET    /api/reports/export/pdf  # Export PDF
```

### Users (Admin)
```
GET    /api/users               # List users
POST   /api/users               # Create user
GET    /api/users/:id           # Get user
PUT    /api/users/:id           # Update user
DELETE /api/users/:id           # Deactivate user
PUT    /api/users/profile       # Update own profile
```

### Others
```
GET    /api/departments         # List departments
POST   /api/departments         # Create (Admin)
GET    /api/categories          # List categories
POST   /api/notifications       # List notifications
PATCH  /api/notifications/read-all
POST   /api/upload/ticket/:id   # Upload files (multipart)
```

---

## 🔧 Environment Variables

### Backend (.env)
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | required |
| `JWT_REFRESH_SECRET` | Refresh token secret | required |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `SMTP_HOST` | SMTP server host | optional |
| `SMTP_USER` | SMTP username | optional |
| `SMTP_PASS` | SMTP password / app password | optional |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `UPLOAD_DIR` | File upload directory | `uploads` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `10485760` (10MB) |

### Frontend (.env.local)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server URL |

---

## 🐳 Production Deployment

### Using Docker Compose (Recommended)

```bash
# 1. Set strong secrets in .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Build and start
docker-compose up -d --build

# 3. Check logs
docker-compose logs -f

# 4. Run seed (first time only)
docker-compose exec backend node prisma/seed.js
```

### Using Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 🔒 Security Considerations

1. **Change all default secrets** in `.env` before production
2. Use HTTPS in production (with SSL certificate)
3. Set `FRONTEND_URL` to your actual domain to restrict CORS
4. Use strong PostgreSQL passwords
5. Keep Node.js and dependencies updated
6. Enable firewall — only expose ports 80/443

---

## 🛠️ Useful Commands

```bash
# View running containers
docker-compose ps

# View backend logs
docker-compose logs -f backend

# Access Prisma Studio (database GUI)
docker-compose exec backend npx prisma studio

# Run database migrations
docker-compose exec backend npx prisma migrate deploy

# Rebuild after code changes
docker-compose up -d --build backend
docker-compose up -d --build frontend

# Stop all services
docker-compose down

# Stop and remove volumes (DANGER: deletes data!)
docker-compose down -v
```

---

## 📝 License

MIT — For internal company use.

---

*Dibuat dengan ❤️ untuk efisiensi operasional IT perusahaan*
