/**
 * Badge Card OCR Service
 *
 * Turns a photo of a business card into raw text, and nothing more. Field
 * extraction stays on the client beside the badge parser
 * (src/utils/badge/parseCardText.ts), the single source of truth for what a
 * scan becomes.
 *
 * Two rules:
 *   - The photo is never kept. It is deleted once OCR returns or fails; a
 *     lead is its fields, not a picture of someone's card.
 *   - OCR is reached the same way receipts reach it. When Midas backs
 *     expenses it owns the OCR microservice, so the card goes through Midas
 *     Ext rather than around it.
 */

import fs from 'fs';
import path from 'path';
import { ValidationError, ExternalServiceError } from '../../utils/errors';
import { getExpenseBackend, getMidasMode, getMidasClient } from '../midas';
import {
  checkExternalOcrReady,
  runExternalReceiptOcrWithCleanup,
} from '../ocr/receiptExternalOcr';

export interface CardUpload {
  path: string;
  originalname: string;
  mimetype: string;
}

const isPdf = (file: CardUpload): boolean =>
  path.extname(file.originalname || '').toLowerCase() === '.pdf'
  || (file.mimetype || '').toLowerCase().trim() === 'application/pdf';

async function ocrText(file: CardUpload): Promise<string> {
  const backend = getExpenseBackend();
  const mode = getMidasMode();
  if ((backend === 'midas' || backend === 'dual') && (mode === 'mock' || mode === 'live')) {
    const result = await getMidasClient().processOcr(
      fs.readFileSync(file.path),
      file.originalname || path.basename(file.path),
      file.mimetype || 'application/octet-stream'
    );
    return result.ocr?.text ?? '';
  }

  if (!(await checkExternalOcrReady())) {
    throw new ExternalServiceError('OCR', 'service is currently unavailable');
  }
  const result = await runExternalReceiptOcrWithCleanup(file.path);
  return typeof result?.ocr?.text === 'string' ? result.ocr.text : '';
}

export async function readCardText(file: CardUpload): Promise<string> {
  try {
    if (isPdf(file)) throw new ValidationError('A business card must be a photo, not a PDF');
    return await ocrText(file);
  } finally {
    // The OCR prep step replaces a HEIC upload with a .jpg beside it.
    const converted = file.path.replace(/\.(heic|heif)$/i, '.jpg');
    for (const leftover of new Set([file.path, converted])) {
      try {
        if (fs.existsSync(leftover)) fs.unlinkSync(leftover);
      } catch {
        /* a leftover temp file must not fail the scan */
      }
    }
  }
}
