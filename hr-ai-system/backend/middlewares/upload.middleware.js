/**
 * Middleware de upload com Multer.
 *
 * Validações:
 *   - Apenas PDF (extensão + mimetype + magic bytes na controller)
 *   - Tamanho limite configurável via env
 *   - Nome de arquivo sanitizado e único
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Garante diretório de uploads
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_FILES = parseInt(process.env.MAX_UPLOAD_FILES || '20', 10);

// ---------------------------------------------------------------------------
//                              STORAGE
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Sanitiza o nome original e adiciona hash único
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 50);
    const hash = crypto.randomBytes(6).toString('hex');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${hash}-${baseName}${ext}`);
  },
});

// ---------------------------------------------------------------------------
//                              FILTER
// ---------------------------------------------------------------------------
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const isExtOk = ext === '.pdf';
  const isMimeOk = file.mimetype === 'application/pdf';

  if (!isExtOk || !isMimeOk) {
    return cb(new Error('Apenas arquivos PDF são permitidos.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE_BYTES,
    files: MAX_FILES,
  },
});

module.exports = { upload, UPLOADS_DIR, MAX_SIZE_MB, MAX_FILES };
