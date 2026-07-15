/**
 * Shared path for calling the external OCR microservice (same as /api/ocr/v2/process).
 * Ensures Telegram and the web app use identical preprocessing and post-processing.
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RuleBasedInferenceEngine } from './inference/RuleBasedInferenceEngine';
import type { FieldInference, OCRResult } from './types';

const execAsync = promisify(exec);

const EXTERNAL_OCR_URL = process.env.OCR_SERVICE_URL || 'http://192.168.1.195:8000';
const OCR_TIMEOUT = parseInt(process.env.OCR_TIMEOUT || '120000', 10);

// The OCR microservice enforces service-token auth (OCR_REQUIRE_SERVICE_TOKEN)
// on /ocr/ — requests without X-Internal-Token get 401. /health/ready stays
// open, which is why readiness probes pass even when this is misconfigured.
const OCR_SERVICE_TOKEN = process.env.OCR_SERVICE_INTERNAL_TOKEN || '';
if (!OCR_SERVICE_TOKEN) {
  console.warn(
    '[receiptExternalOcr] OCR_SERVICE_INTERNAL_TOKEN is not set — OCR requests will be rejected (401) if the OCR service enforces service-token auth'
  );
}

function ocrAuthHeaders(): Record<string, string> {
  return OCR_SERVICE_TOKEN ? { 'X-Internal-Token': OCR_SERVICE_TOKEN } : {};
}

export async function checkExternalOcrReady(): Promise<boolean> {
  try {
    const response = await axios.get(`${EXTERNAL_OCR_URL}/health/ready`, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function convertHEICToJPEG(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') {
    return filePath;
  }
  const jpegPath = filePath.replace(/\.(heic|heif)$/i, '.jpg');
  try {
    await execAsync(`convert "${filePath}" -resize 2000x2000\\> -quality 85 "${jpegPath}"`);
    fs.unlinkSync(filePath);
    return jpegPath;
  } catch (error: any) {
    console.error('[receiptExternalOcr] HEIC conversion failed:', error.message);
    throw new Error('Failed to process HEIC file. Please convert to JPEG and try again.');
  }
}

/**
 * Auto-orient and cap max dimension (matches web OCR v2 behavior for raster images).
 */
async function normalizeRasterForOcr(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return filePath;
  }
  const base = filePath.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  const outExt = ext === '.png' ? '.png' : '.jpg';
  const outPath = `${base}-ocrprep${outExt}`;
  try {
    await execAsync(`convert "${filePath}" -auto-orient -resize 2000x2000\\> -strip "${outPath}"`);
    return outPath;
  } catch (error: any) {
    console.warn('[receiptExternalOcr] Raster normalize skipped (ImageMagick?):', error.message);
    return filePath;
  }
}

/**
 * Prepare file before POST to external /ocr/ (HEIC → JPEG, raster normalize). PDF unchanged.
 */
export async function prepareReceiptImageForExternalOcr(filePath: string): Promise<{
  pathForRequest: string;
  cleanup: string[];
}> {
  const ext = path.extname(filePath).toLowerCase();
  const cleanup: string[] = [];
  if (ext === '.pdf') {
    return { pathForRequest: filePath, cleanup };
  }

  let current = await convertHEICToJPEG(filePath);
  const normalized = await normalizeRasterForOcr(current);
  if (normalized !== current) {
    cleanup.push(normalized);
  }
  return { pathForRequest: normalized, cleanup };
}

export async function postFileToExternalOcr(processedPath: string): Promise<any> {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(processedPath));
  const start = Date.now();
  const response = await axios.post(`${EXTERNAL_OCR_URL}/ocr/`, formData, {
    headers: { ...formData.getHeaders(), ...ocrAuthHeaders() },
    timeout: OCR_TIMEOUT,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  const elapsed = Date.now() - start;
  console.log(
    `[receiptExternalOcr] External OCR completed in ${elapsed}ms (Provider: ${response.data?.ocr?.provider || 'unknown'})`
  );
  return response.data;
}

function unwrapField(f: any): any {
  if (f == null) return null;
  if (typeof f === 'object' && f !== null && 'value' in f) return f.value;
  return f;
}

function fieldConfidence(ext: any, hasValue: boolean): number {
  if (ext && typeof ext === 'object' && typeof ext.confidence === 'number') {
    return ext.confidence;
  }
  return hasValue ? 0.65 : 0;
}

/**
 * When the external parser returns weak or empty fields, supplement from raw OCR text
 * using the same rule-based engine as the embedded OCR stack.
 */
export async function enrichOcrApiResultWithRuleInference(apiResult: any): Promise<any> {
  const text = apiResult?.ocr?.text;
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return apiResult;
  }

  const ocrResult: OCRResult = {
    text,
    confidence: typeof apiResult.ocr?.confidence === 'number' ? apiResult.ocr.confidence : 0.5,
    provider: apiResult.ocr?.provider || 'external',
    processingTime: typeof apiResult.ocr?.processingTime === 'number' ? apiResult.ocr.processingTime : 0,
  };

  const engine = new RuleBasedInferenceEngine();
  const inferred = await engine.infer(ocrResult);
  const fields = { ...(apiResult.fields || {}) };
  const overall = apiResult.quality?.overallConfidence;

  const pick = (key: keyof FieldInference) => {
    const ext = fields[key];
    const inf = inferred[key] as any;
    if (!inf) return;

    const ev = unwrapField(ext);
    const iv = inf.value;
    const hasEv =
      ev != null &&
      ev !== '' &&
      !(typeof ev === 'number' && !isFinite(ev));
    const hasIv =
      iv != null &&
      iv !== '' &&
      !(typeof iv === 'number' && !isFinite(iv));

    const ec = fieldConfidence(ext, hasEv);
    const ic = typeof inf.confidence === 'number' ? inf.confidence : 0;

    const extWeak =
      !hasEv ||
      ec < 0.45 ||
      (typeof overall === 'number' && overall < 0.48);

    if (hasIv && extWeak) {
      fields[key] = { value: iv, confidence: ic, source: 'inference' };
      return;
    }
    if (hasIv && hasEv && ic > ec + 0.08) {
      fields[key] = { value: iv, confidence: ic, source: 'inference' };
    }
  };

  pick('merchant');
  pick('amount');
  pick('date');
  pick('category');
  pick('location');

  return { ...apiResult, fields };
}

export async function runExternalReceiptOcrWithCleanup(filePath: string): Promise<any> {
  const { pathForRequest, cleanup } = await prepareReceiptImageForExternalOcr(filePath);
  try {
    const raw = await postFileToExternalOcr(pathForRequest);
    return await enrichOcrApiResultWithRuleInference(raw);
  } finally {
    for (const p of cleanup) {
      try {
        if (p !== filePath && fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}
