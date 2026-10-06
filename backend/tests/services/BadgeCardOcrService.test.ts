import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs', () => {
  const fns = {
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('image-bytes')),
  };
  return { default: fns, ...fns };
});
vi.mock('../../src/services/midas', () => ({
  getExpenseBackend: vi.fn(() => 'local'),
  getMidasMode: vi.fn(() => 'off'),
  getMidasClient: vi.fn(),
}));
vi.mock('../../src/services/ocr/receiptExternalOcr', () => ({
  checkExternalOcrReady: vi.fn(async () => true),
  runExternalReceiptOcrWithCleanup: vi.fn(async () => ({ ocr: { text: 'Jordan Rivera\njordan@example.com' } })),
}));

import fs from 'fs';
import { readCardText } from '../../src/services/badge/BadgeCardOcrService';
import { getExpenseBackend, getMidasMode, getMidasClient } from '../../src/services/midas';
import { checkExternalOcrReady, runExternalReceiptOcrWithCleanup } from '../../src/services/ocr/receiptExternalOcr';

const FILE = { path: 'uploads/card-1.jpg', originalname: 'card.jpg', mimetype: 'image/jpeg' };

describe('readCardText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getExpenseBackend).mockReturnValue('local' as any);
    vi.mocked(getMidasMode).mockReturnValue('off' as any);
    vi.mocked(checkExternalOcrReady).mockResolvedValue(true);
  });

  it('returns the raw OCR text from the OCR service', async () => {
    await expect(readCardText(FILE)).resolves.toBe('Jordan Rivera\njordan@example.com');
    expect(runExternalReceiptOcrWithCleanup).toHaveBeenCalledWith(FILE.path);
  });

  it('goes through Midas, never the OCR service directly, when Midas backs expenses', async () => {
    vi.mocked(getExpenseBackend).mockReturnValue('midas' as any);
    vi.mocked(getMidasMode).mockReturnValue('live' as any);
    const processOcr = vi.fn(async () => ({ ocr: { text: 'via midas' } }));
    vi.mocked(getMidasClient).mockReturnValue({ processOcr } as any);

    await expect(readCardText(FILE)).resolves.toBe('via midas');
    expect(processOcr).toHaveBeenCalledWith(expect.any(Buffer), 'card.jpg', 'image/jpeg');
    expect(runExternalReceiptOcrWithCleanup).not.toHaveBeenCalled();
  });

  it('yields an empty string when OCR found no text', async () => {
    vi.mocked(runExternalReceiptOcrWithCleanup).mockResolvedValueOnce({ ocr: {} });
    await expect(readCardText(FILE)).resolves.toBe('');
  });

  it('refuses a PDF: a card is a photo', async () => {
    await expect(
      readCardText({ path: 'uploads/x.pdf', originalname: 'x.pdf', mimetype: 'application/pdf' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(runExternalReceiptOcrWithCleanup).not.toHaveBeenCalled();
  });

  it('reports an unavailable OCR service as a 502, not a crash', async () => {
    vi.mocked(checkExternalOcrReady).mockResolvedValue(false);
    await expect(readCardText(FILE)).rejects.toMatchObject({ statusCode: 502 });
  });

  it('deletes the photo whether OCR succeeds, fails or is refused', async () => {
    await readCardText(FILE);
    expect(fs.unlinkSync).toHaveBeenCalledWith(FILE.path);

    vi.mocked(fs.unlinkSync).mockClear();
    vi.mocked(runExternalReceiptOcrWithCleanup).mockRejectedValueOnce(new Error('boom'));
    await expect(readCardText(FILE)).rejects.toThrow('boom');
    expect(fs.unlinkSync).toHaveBeenCalledWith(FILE.path);

    vi.mocked(fs.unlinkSync).mockClear();
    await expect(
      readCardText({ path: 'uploads/x.pdf', originalname: 'x.pdf', mimetype: 'application/pdf' })
    ).rejects.toBeTruthy();
    expect(fs.unlinkSync).toHaveBeenCalledWith('uploads/x.pdf');
  });
});
