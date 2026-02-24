/**
 * File validation helpers for receipt uploads.
 * Accepts PDF by MIME or .pdf extension when browser MIME is missing/unreliable.
 */

const PDF_MIME = 'application/pdf';
const PDF_EXT = '.pdf';

/**
 * Returns true if the file is an acceptable receipt: image (any image/*) or PDF.
 * PDF is accepted by canonical MIME or by .pdf extension when MIME is empty/variant.
 */
export function isAcceptableReceiptFile(file: File): boolean {
  if (!file || !file.name) return false;
  const mime = (file.type || '').toLowerCase().trim();
  const ext = file.name.toLowerCase().slice(-4);
  const isImage = mime.startsWith('image/');
  const isPdfByMime = mime === PDF_MIME;
  const isPdfByExt = ext === PDF_EXT;
  return isImage || isPdfByMime || isPdfByExt;
}

/** True if the URL points to a PDF (by path extension). Use for receipt display (img vs link). */
export function isPdfReceiptUrl(url: string): boolean {
  return /\.pdf$/i.test((url || '').split('?')[0] ?? '');
}

/**
 * Returns true if the file is a PDF (by MIME or extension).
 */
export function isPdfFile(file: File): boolean {
  if (!file || !file.name) return false;
  const mime = (file.type || '').toLowerCase().trim();
  const ext = file.name.toLowerCase().slice(-4);
  return mime === PDF_MIME || ext === PDF_EXT;
}

/** Data URL of a minimal placeholder image for PDF preview (img-safe). */
export const PDF_PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260" viewBox="0 0 200 260"><rect fill="#f3f4f6" width="200" height="260" rx="8"/><text x="100" y="120" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="14">PDF Document</text><text x="100" y="145" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="12">Receipt will be processed by OCR</text></svg>'
  );
