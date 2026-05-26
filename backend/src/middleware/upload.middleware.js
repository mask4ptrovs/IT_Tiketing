const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = path.join(uploadDir, new Date().getFullYear().toString(), String(new Date().getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(subDir, { recursive: true });
    cb(null, subDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

// Default allowed MIME types — images, PDF, Word, Excel
const DEFAULT_ALLOWED = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const fileFilter = (req, file, cb) => {
  const envTypes = process.env.ALLOWED_FILE_TYPES;
  const allowedTypes = envTypes ? envTypes.split(',').map(t => t.trim()).filter(Boolean) : DEFAULT_ALLOWED;
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
    files: 5,
  },
});

const getFileUrl = (filename) => {
  const relativePath = filename.replace(process.cwd(), '').replace(/\\/g, '/');
  return `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`}${relativePath}`;
};

module.exports = { upload, getFileUrl };
