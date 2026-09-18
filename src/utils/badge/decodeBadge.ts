/**
 * Which symbologies count as a badge, and how to choose between several
 * decoded in one frame.
 *
 * Show operators pick the badge symbology and we rarely know it in advance.
 * PDF417 is the incumbent for attendee badges; QR is what a rep meets on a
 * printed lead sheet, a phone screen, or a vendor's profile link. The 1D
 * formats cover registration numbers printed as a plain bar.
 */

import type { ReaderOptions } from 'zxing-wasm/reader';
import { loadBadgeReader } from './zxingReader';

export const BADGE_FORMATS = ['PDF417', 'QRCode', 'DataMatrix', 'Aztec', 'Code128', 'Code39'] as const;
export type BadgeFormat = (typeof BADGE_FORMATS)[number];

export const READER_OPTIONS: ReaderOptions = { formats: [...BADGE_FORMATS], tryHarder: true };

export interface DecodeHit {
  text: string;
  format: string;
}

// Earlier wins. A badge that carries both a PDF417 and a QR usually has the
// contact in the PDF417 and a URL in the QR.
const PRIORITY: readonly string[] = BADGE_FORMATS;
const ONE_DIMENSIONAL = new Set<string>(['Code128', 'Code39']);
// Shorter 1D reads are shelf labels and price tags, not registration numbers.
const MIN_1D_LENGTH = 4;

const FORMAT_LABELS: Record<string, string> = {
  PDF417: 'PDF417', QRCode: 'QR code', DataMatrix: 'Data Matrix', Aztec: 'Aztec',
  Code128: 'Code 128', Code39: 'Code 39', Manual: 'manual entry',
};

export function formatLabel(format: string | undefined): string {
  return (format && FORMAT_LABELS[format]) || format || 'barcode';
}

export function pickDecodeHit(
  results: ReadonlyArray<{ text?: string; format?: string } | null | undefined>
): DecodeHit | null {
  let best: DecodeHit | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const r of results) {
    const text = r?.text ?? '';
    const format = r?.format ?? '';
    if (!text || !format) continue;
    if (ONE_DIMENSIONAL.has(format) && text.length < MIN_1D_LENGTH) continue;
    const rank = PRIORITY.indexOf(format);
    const effective = rank === -1 ? PRIORITY.length : rank;
    if (effective < bestRank) { best = { text, format }; bestRank = effective; }
  }
  return best;
}

/** Decodes a still photo (the permission-free fallback). Never throws. */
export async function decodeBadgeImage(image: Blob): Promise<DecodeHit | null> {
  try {
    const readBarcodes = await loadBadgeReader();
    return pickDecodeHit(await readBarcodes(image, READER_OPTIONS));
  } catch {
    return null;
  }
}
