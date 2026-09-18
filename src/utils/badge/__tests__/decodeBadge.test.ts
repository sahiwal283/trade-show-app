import { describe, it, expect, vi, beforeEach } from 'vitest';

const readBarcodes = vi.fn(async () => [] as any[]);
vi.mock('../zxingReader', () => ({ loadBadgeReader: vi.fn(async () => readBarcodes) }));

import { BADGE_FORMATS, READER_OPTIONS, pickDecodeHit, decodeBadgeImage } from '../decodeBadge';

const hit = (format: string, text: string) => ({ format, text, isValid: true });

describe('badge symbologies', () => {
  it('asks the decoder for the 2D badge formats and the common 1D ones', () => {
    // Show operators pick the symbology, not us. PDF417 is the incumbent,
    // QR is what a rep meets on a printed lead sheet or a phone screen.
    for (const f of ['PDF417', 'QRCode', 'DataMatrix', 'Aztec', 'Code128', 'Code39']) {
      expect(BADGE_FORMATS).toContain(f);
    }
    expect(READER_OPTIONS.formats).toEqual(BADGE_FORMATS);
  });
});

describe('pickDecodeHit', () => {
  it('prefers the PDF417 when a badge carries both it and a QR code', () => {
    // The QR on a badge usually encodes a URL; the PDF417 carries the contact.
    const best = pickDecodeHit([hit('QRCode', 'https://x.example/a'), hit('PDF417', 'A|B|C|d@e.com')]);
    expect(best).toEqual({ text: 'A|B|C|d@e.com', format: 'PDF417' });
  });

  it('prefers a 2D code over a 1D code in the same frame', () => {
    const best = pickDecodeHit([hit('Code128', '8827364001'), hit('QRCode', 'https://x.example/a')]);
    expect(best?.format).toBe('QRCode');
  });

  it('ignores short 1D hits, which are price tags and shelf labels, not badges', () => {
    expect(pickDecodeHit([hit('Code128', '123')])).toBeNull();
    expect(pickDecodeHit([hit('Code39', '9')])).toBeNull();
  });

  it('accepts a 1D code long enough to be a registration number', () => {
    expect(pickDecodeHit([hit('Code128', '8827364')])).toEqual({ text: '8827364', format: 'Code128' });
  });

  it('ignores hits with no text and returns null when nothing usable remains', () => {
    expect(pickDecodeHit([hit('QRCode', ''), { format: 'PDF417' } as any])).toBeNull();
    expect(pickDecodeHit([])).toBeNull();
  });
});

describe('decodeBadgeImage', () => {
  beforeEach(() => readBarcodes.mockReset());

  it('decodes a still photo with the same formats as the live viewfinder', async () => {
    readBarcodes.mockResolvedValue([hit('QRCode', 'MECARD:N:Doe,Jane;;')]);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const result = await decodeBadgeImage(blob);
    expect(readBarcodes).toHaveBeenCalledWith(blob, expect.objectContaining({ formats: BADGE_FORMATS }));
    expect(result).toEqual({ text: 'MECARD:N:Doe,Jane;;', format: 'QRCode' });
  });

  it('returns null rather than throwing when the photo has no code', async () => {
    readBarcodes.mockResolvedValue([]);
    expect(await decodeBadgeImage(new Blob(['x']))).toBeNull();
  });
});
