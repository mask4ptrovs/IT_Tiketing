const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getSettings, updateSettings, uploadLogo, deleteLogo } = require('../controllers/setting.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// ── Logo upload storage ──────────────────────────────────────────────────────
const logoDir = path.join(process.cwd(), 'uploads', 'logo');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `company-logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan (JPG, PNG, SVG, WebP)'));
  },
});

// GET  /api/settings         — public (for sidebar branding)
router.get('/', getSettings);

// PUT  /api/settings         — admin only
router.put('/', authenticate, authorize('ADMIN'), updateSettings);

// POST /api/settings/logo    — admin only
router.post('/logo', authenticate, authorize('ADMIN'), upload.single('logo'), uploadLogo);

// DELETE /api/settings/logo  — admin only
router.delete('/logo', authenticate, authorize('ADMIN'), deleteLogo);

module.exports = router;
