/**
 * Upload Configuration
 * Multer configuration for file uploads (receipts, images, booth maps)
 * Uses normalized MIME + extension allowlist so PDFs work when browser sends variant/empty MIME.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';

/** Allowed image extensions (lowercase, with dot). PDF allowed separately. */
const IMAGE_EXT_REGEX = /\.(jpeg|jpg|png|heic|heif|webp)$/i;
/** Allowed image extensions for booth maps (includes gif). */
const BOOTH_MAP_IMAGE_EXT_REGEX = /\.(jpeg|jpg|png|gif|heic|heif|webp)$/i;
const PDF_EXT_REGEX = /\.pdf$/i;
const PDF_MIME = 'application/pdf';

/**
 * Returns true if file is allowed for receipt/OCR uploads.
 * Uses normalized MIME (lowercase, trim) and extension fallback for PDF when MIME is empty/variant.
 */
export function isAllowedReceiptFile(mimetype: string, originalname: string): { allowed: boolean; reason?: string } {
  const mime = (mimetype || '').toLowerCase().trim();
  const ext = path.extname(originalname || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdfMime = mime === PDF_MIME;
  const isPdfExt = PDF_EXT_REGEX.test(ext);
  const isImageExt = IMAGE_EXT_REGEX.test(ext);

  if (isImage && isImageExt) return { allowed: true };
  if (isPdfExt && (isPdfMime || mime === '' || mime === 'application/octet-stream')) return { allowed: true };
  return {
    allowed: false,
    reason: `Only images (JPEG, PNG, HEIC, WebP) and PDF files are allowed. Received ext: ${ext || 'none'}, mime: ${mime || 'none'}`
  };
}

/**
 * Returns true if file is allowed for booth map uploads (images + PDF, includes GIF).
 */
export function isAllowedBoothMapFile(mimetype: string, originalname: string): { allowed: boolean; reason?: string } {
  const mime = (mimetype || '').toLowerCase().trim();
  const ext = path.extname(originalname || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdfMime = mime === PDF_MIME;
  const isPdfExt = PDF_EXT_REGEX.test(ext);
  const isImageExt = BOOTH_MAP_IMAGE_EXT_REGEX.test(ext);

  if (isImage && isImageExt) return { allowed: true };
  if (isPdfExt && (isPdfMime || mime === '' || mime === 'application/octet-stream')) return { allowed: true };
  return {
    allowed: false,
    reason: `Only images (JPEG, PNG, GIF, HEIC, WebP) and PDF files are allowed. Received ext: ${ext || 'none'}, mime: ${mime || 'none'}`
  };
}

/**
 * Ensure directory exists with proper permissions (0o755)
 * Creates directory and parent directories if they don't exist
 * Sets permissions to rwxr-xr-x (owner: read/write/execute, group/others: read/execute)
 */
function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    // Create directory with recursive option and proper permissions
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
    console.log(`[Upload] Created directory: ${dirPath} with permissions 0o755`);
  } else {
    // Verify directory is writable
    try {
      fs.accessSync(dirPath, fs.constants.W_OK);
    } catch (error) {
      console.warn(`[Upload] Directory exists but is not writable: ${dirPath}`);
      // Try to fix permissions
      try {
        fs.chmodSync(dirPath, 0o755);
        console.log(`[Upload] Fixed permissions for directory: ${dirPath}`);
      } catch (chmodError) {
        console.error(`[Upload] Failed to fix permissions for ${dirPath}:`, chmodError);
      }
    }
  }
}

/**
 * Initialize upload directories on startup
 * Verifies all required upload directories exist and are writable
 */
export function initializeUploadDirectories(): void {
  try {
    const baseUploadDir = process.env.UPLOAD_DIR || 'uploads';
    const boothMapsDir = path.join(baseUploadDir, 'booth-maps');

    // Ensure base upload directory exists
    ensureDirectory(baseUploadDir);

    // Ensure booth-maps subdirectory exists
    ensureDirectory(boothMapsDir);

    // Verify write permissions
    try {
      const testFile = path.join(boothMapsDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[Upload] ✓ Upload directories verified and writable`);
    } catch (error) {
      console.error(`[Upload] ⚠️ Warning: Upload directories may not be writable:`, error);
    }
  } catch (error) {
    console.error(`[Upload] ⚠️ Failed to initialize upload directories:`, error);
  }
}

// Configure multer storage for receipts
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    ensureDirectory(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer storage for booth maps
const boothMapStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseUploadDir = process.env.UPLOAD_DIR || 'uploads';
    const uploadDir = path.join(baseUploadDir, 'booth-maps');
    
    // Ensure parent directory exists first
    ensureDirectory(baseUploadDir);
    // Then ensure booth-maps directory exists
    ensureDirectory(uploadDir);
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'booth-map-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer upload middleware for receipts
export const upload = multer({
  storage: receiptStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') }, // 10MB default
  fileFilter: (req, file, cb) => {
    const { allowed, reason } = isAllowedReceiptFile(file.mimetype, file.originalname);
    if (allowed) {
      console.log(`[Upload] Accepting file: ${file.originalname} (mime: ${file.mimetype || 'none'})`);
      return cb(null, true);
    }
    console.warn(`[Upload] Rejected file: ${file.originalname} (${reason})`);
    cb(new Error(reason || 'Only images (JPEG, PNG, HEIC, WebP) and PDF files are allowed'));
  }
});

// Configure multer upload middleware for booth maps
export const uploadBoothMap = multer({
  storage: boothMapStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const { allowed, reason } = isAllowedBoothMapFile(file.mimetype, file.originalname);
    if (allowed) {
      console.log(`[Upload] Accepting booth map: ${file.originalname} (mime: ${file.mimetype || 'none'})`);
      return cb(null, true);
    }
    console.warn(`[Upload] Rejected booth map: ${file.originalname} (${reason})`);
    cb(new Error(reason || 'Only images (JPEG, PNG, GIF, HEIC, WebP) and PDF files are allowed'));
  }
});

