import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadReceiptFromUploadOrUrl } from '../../src/routes/expenses';

// The receipt_url branch previously hardcoded application/octet-stream, which
// Midas rejects (500 + orphaned receipt-less expense). It must derive the mime
// from the file extension.
describe('loadReceiptFromUploadOrUrl', () => {
  let dir: string;
  const prevUploadDir = process.env.UPLOAD_DIR;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-mime-'));
    process.env.UPLOAD_DIR = dir;
    for (const name of ['r.png', 'r.jpg', 'r.jpeg', 'r.pdf', 'r.webp', 'r.heic', 'r.bin']) {
      fs.writeFileSync(path.join(dir, name), 'x');
    }
  });

  afterAll(() => {
    process.env.UPLOAD_DIR = prevUploadDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uses the multipart file mimetype when a file is present', () => {
    const filePath = path.join(dir, 'r.png');
    const result = loadReceiptFromUploadOrUrl(
      { path: filePath, filename: 'r.png', originalname: 'r.png', mimetype: 'image/png' },
      undefined
    );
    expect(result?.mime).toBe('image/png');
  });

  it.each([
    ['/uploads/r.png', 'image/png'],
    ['/uploads/r.jpg', 'image/jpeg'],
    ['/uploads/r.jpeg', 'image/jpeg'],
    ['/uploads/r.pdf', 'application/pdf'],
    ['/uploads/r.webp', 'image/webp'],
    ['/uploads/r.heic', 'image/heic'],
  ])('derives mime from extension for %s', (url, expected) => {
    const result = loadReceiptFromUploadOrUrl(undefined, url);
    expect(result?.mime).toBe(expected);
  });

  it('falls back to octet-stream for unknown extensions', () => {
    const result = loadReceiptFromUploadOrUrl(undefined, '/uploads/r.bin');
    expect(result?.mime).toBe('application/octet-stream');
  });

  it('returns undefined for a missing file', () => {
    expect(loadReceiptFromUploadOrUrl(undefined, '/uploads/nope.png')).toBeUndefined();
  });
});
