/**
 * migrateExpensesToMidas.ts
 *
 * Zero-loss migration: export ALL Trade Show `expenses` rows (+ receipt files)
 * into Midas via POST /ext/expenses/import.
 *
 * Guarantees:
 * - sourceRefId = expenses.id (idempotent; re-run → skipped, never duplicates)
 * - receipt bytes inlined as contentBase64 with skipOcr=true (no OCR re-bill)
 * - preserve timestamps, Zoho ids, reimbursement, OCR text / extracted_data
 * - resumable checkpoint under backend/.migration/
 *
 * Usage:
 *   cd backend
 *   npm run migrate:expenses:midas -- --dry-run
 *   npm run migrate:expenses:midas -- --dry-run --report=/tmp/mig-report.json
 *   npm run migrate:expenses:midas -- --limit=50
 *   npm run migrate:expenses:midas -- --resume
 *
 * Requires MIDAS_MODE=live (or mock for shape tests) + MIDAS_* env.
 * Never run against production Trade Show write path until Phase 4/5 approval.
 * Sandbox first (CT 2600 DB copy), then prod freeze window.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import type { MidasImportItem, MidasImportItemResult } from '../services/midas/MidasTypes';

dotenv.config();

type Checkpoint = {
  lastProcessedId: string | null;
  imported: number;
  updated: number;
  failed: number;
  skipped: number;
  missingReceiptFiles: number;
  updatedAt: string;
};

const CHECKPOINT_DIR = path.join(__dirname, '../../.migration');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'expenses-to-midas.json');

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const resume = argv.includes('--resume');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  const batchArg = argv.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) : 25;
  const reportArg = argv.find((a) => a.startsWith('--report='));
  const reportPath = reportArg ? reportArg.split('=')[1] : undefined;
  const fromJsonArg = argv.find((a) => a.startsWith('--from-json='));
  const fromJson = fromJsonArg ? fromJsonArg.split('=')[1] : undefined;
  const uploadsArg = argv.find((a) => a.startsWith('--uploads-dir='));
  const uploadsDir = uploadsArg ? uploadsArg.split('=')[1] : undefined;
  return { dryRun, resume, limit, batchSize, reportPath, fromJson, uploadsDir };
}

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CHECKPOINT_FILE)) {
    return emptyCheckpoint();
  }
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')) as Checkpoint;
}

function emptyCheckpoint(): Checkpoint {
  return {
    lastProcessedId: null,
    imported: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    missingReceiptFiles: 0,
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  cp.updatedAt = new Date().toISOString();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function resolveReceiptPath(
  receiptUrl: string | null | undefined,
  uploadsDir?: string
): string | null {
  if (!receiptUrl) return null;
  let rel = receiptUrl;
  if (rel.startsWith('/uploads/')) rel = rel.slice('/uploads/'.length);
  else if (rel.startsWith('/api/uploads/')) rel = rel.slice('/api/uploads/'.length);
  else if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);

  const uploadDir = uploadsDir || process.env.UPLOAD_DIR || 'uploads';
  const candidates = [
    path.isAbsolute(uploadDir) ? path.join(uploadDir, rel) : path.join(process.cwd(), uploadDir, rel),
    path.join('/var/lib/expenseapp/uploads', rel),
    path.join('/opt/trade-show-app/backend/uploads', rel),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    case '.heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function dateOnly(v: unknown): string {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Expense dates are calendar dates; prefer UTC Y-M-D from the stored instant
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Invalid expense date value: ${s}`);
}

function importOutcome(
  r: MidasImportItemResult
): 'created' | 'updated' | 'skipped' | 'failed' {
  const s = r.outcome || r.status;
  if (s === 'already_imported') return 'skipped';
  if (s === 'created' || s === 'updated' || s === 'skipped' || s === 'failed') return s;
  return 'failed';
}

function importError(r: MidasImportItemResult): string | undefined {
  return r.error || r.reason;
}

async function main() {
  const { dryRun, resume, limit, batchSize, reportPath, fromJson, uploadsDir } = parseArgs(
    process.argv.slice(2)
  );
  const midasMode = (process.env.MIDAS_MODE || 'disabled').toLowerCase();

  console.log('[migrateExpensesToMidas] starting', {
    dryRun,
    resume,
    limit,
    batchSize,
    midasMode,
    fromJson: fromJson || null,
    uploadsDir: uploadsDir || null,
  });

  if (midasMode === 'disabled' && !dryRun) {
    console.error('Set MIDAS_MODE=mock|live before running a live import (or pass --dry-run).');
    process.exit(1);
  }

  const { getMidasClient } = await import('../services/midas');
  const { resolveCategoryName } = await import('../services/midas/categoryMap');
  const { matchPaymentMethod } = await import('../services/midas/paymentMethodMap');
  const { mapTsStatusToMidas, mapTsReimbursementToMidas } = await import(
    '../services/midas/statusMaps'
  );

  let paymentCatalog: import('../services/midas/MidasTypes').MidasPaymentMethod[] = [];
  if (midasMode === 'live' || midasMode === 'mock') {
    try {
      paymentCatalog = await getMidasClient().listPaymentMethods();
      console.log(
        `[migrateExpensesToMidas] loaded ${paymentCatalog.length} payment method(s) from Ext`
      );
    } catch (err) {
      console.warn('[migrateExpensesToMidas] payment-methods list failed; continuing without IDs:', err);
    }
  }

  const checkpoint = resume ? loadCheckpoint() : emptyCheckpoint();

  let rows: any[];
  if (fromJson) {
    const raw = JSON.parse(fs.readFileSync(fromJson, 'utf8'));
    if (!Array.isArray(raw)) {
      console.error('--from-json must be a JSON array of expense rows');
      process.exit(1);
    }
    rows = raw;
    if (checkpoint.lastProcessedId) {
      rows = rows.filter((r) => String(r.id) > String(checkpoint.lastProcessedId));
    }
    if (limit != null) rows = rows.slice(0, limit);
  } else {
    const { query } = await import('../config/database');
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (checkpoint.lastProcessedId) {
      params.push(checkpoint.lastProcessedId);
      where += ` AND e.id > $${params.length}`;
    }

    params.push(limit ?? 100000);
    const sql = `
    SELECT e.*, u.email AS user_email, u.name AS user_name, ev.name AS event_name,
           ev.start_date AS event_start, ev.end_date AS event_end
    FROM expenses e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN events ev ON ev.id = e.event_id
    ${where}
    ORDER BY e.id ASC
    LIMIT $${params.length}
  `;

    const result = await query(sql, params);
    rows = result.rows as any[];
  }
  console.log(`[migrateExpensesToMidas] loaded ${rows.length} expense(s)`);

  const inventory = {
    total: rows.length,
    withReceiptUrl: rows.filter((r) => r.receipt_url).length,
    withReceiptFile: 0,
    missingReceiptFile: 0,
    withOcrText: rows.filter((r) => r.ocr_text).length,
    withZohoId: rows.filter((r) => r.zoho_expense_id).length,
    missingEmail: rows.filter((r) => !r.user_email).length,
    missingEventId: rows.filter((r) => !r.event_id).length,
  };

  const buildItem = (r: any): { item: MidasImportItem; warnings: string[] } => {
    const warnings: string[] = [];
    const reimb = mapTsReimbursementToMidas(
      Boolean(r.reimbursement_required),
      r.reimbursement_status
    );
    const item: MidasImportItem = {
      sourceRefId: String(r.id),
      submitterEmail: r.user_email || `user-${r.user_id}@tradeshow.local`,
      externalUserId: String(r.user_id),
      eventId: String(r.event_id || ''),
      sourceLabel: r.event_name || 'Trade Show Event',
      sourceType: 'trade_show_event',
      merchant: r.merchant || 'Unknown',
      amount: Number(r.amount),
      currency: 'USD',
      date: dateOnly(r.date),
      description: r.description || null,
      categoryName: resolveCategoryName(r.category),
      cardUsed: r.card_used || null,
      location: r.location || null,
      status: mapTsStatusToMidas(r.status),
      reimbursementRequired: Boolean(r.reimbursement_required),
      reimbursementStatus: reimb,
      zohoEntity: r.zoho_entity || null,
      zohoExpenseId: r.zoho_expense_id || null,
      ocrText: r.ocr_text || null,
      createdAt: iso(r.created_at) || undefined,
      updatedAt: iso(r.updated_at) || undefined,
      submittedAt: iso(r.submitted_at),
      reviewedAt: iso(r.reviewed_at),
      comments: r.comments || null,
    };

    if (paymentCatalog.length > 0 && item.cardUsed) {
      const payment = matchPaymentMethod(paymentCatalog, item.cardUsed);
      if (payment) {
        item.paymentMethodId = payment.id;
        if (!item.zohoEntity || !String(item.zohoEntity).trim()) {
          item.zohoEntity = payment.defaultZohoEntity;
        }
      } else {
        warnings.push(`unmatched_payment_method:${item.cardUsed}`);
      }
    }

    if (r.extracted_data && typeof r.extracted_data === 'object' && !Array.isArray(r.extracted_data)) {
      item.extractedData = r.extracted_data;
    }

    if (!r.user_email) warnings.push('missing_submitter_email');
    if (!r.event_id) warnings.push('missing_event_id');

    const receiptAbs = resolveReceiptPath(r.receipt_url, uploadsDir);
    if (r.receipt_url && !receiptAbs) {
      inventory.missingReceiptFile += 1;
      warnings.push(`missing_receipt_file:${r.receipt_url}`);
    } else if (receiptAbs) {
      inventory.withReceiptFile += 1;
      const buf = fs.readFileSync(receiptAbs);
      const filename = path.basename(receiptAbs);
      item.receipt = {
        filename,
        mimeType: mimeFromFilename(filename),
        contentBase64: buf.toString('base64'),
        skipOcr: true,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      };
    }

    return { item, warnings };
  };

  if (dryRun) {
    const built = rows.map(buildItem);
    const sample = built.slice(0, 3).map(({ item, warnings }) => ({
      sourceRefId: item.sourceRefId,
      merchant: item.merchant,
      amount: item.amount,
      status: item.status,
      categoryName: item.categoryName,
      cardUsed: item.cardUsed,
      paymentMethodId: item.paymentMethodId ?? null,
      zohoEntity: item.zohoEntity,
      hasReceipt: Boolean(item.receipt),
      receiptBytes: item.receipt ? Buffer.from(item.receipt.contentBase64, 'base64').length : 0,
      skipOcr: item.receipt?.skipOcr,
      zohoExpenseId: item.zohoExpenseId,
      warnings,
    }));
    const report: Record<string, unknown> = {
      mode: 'dry-run',
      inventory: {
        ...inventory,
        paymentMethodsLoaded: paymentCatalog.length,
        withPaymentMethodId: built.filter((b) => b.item.paymentMethodId).length,
        unmatchedPaymentMethod: built.filter((b) =>
          b.warnings.some((w) => w.startsWith('unmatched_payment_method:'))
        ).length,
      },
      sample,
      wouldImport: rows.length,
      batchSize,
      at: new Date().toISOString(),
    };

    // When Midas is reachable, also exercise Ext import dryRun (per-item results).
    if (midasMode === 'live' || midasMode === 'mock') {
      const client = getMidasClient();
      const extResults: Array<{
        batch: number;
        created: number;
        skipped: number;
        failed: number;
        failures: Array<{ sourceRefId: string; error?: string }>;
      }> = [];
      for (let i = 0; i < built.length; i += batchSize) {
        const batch = built.slice(i, i + batchSize).map((b) => b.item);
        const importResult = await client.importExpenses({
          sourceApp: 'trade_show',
          dryRun: true,
          items: batch,
        });
        const summary = { batch: Math.floor(i / batchSize) + 1, created: 0, skipped: 0, failed: 0, failures: [] as Array<{ sourceRefId: string; error?: string }> };
        for (const r of importResult.results) {
          const outcome = importOutcome(r);
          if (outcome === 'created' || outcome === 'updated') summary.created += 1;
          else if (outcome === 'skipped') summary.skipped += 1;
          else {
            summary.failed += 1;
            summary.failures.push({ sourceRefId: r.sourceRefId, error: importError(r) });
          }
        }
        extResults.push(summary);
        console.log('[migrateExpensesToMidas] ext dry-run batch', summary);
      }
      report.extDryRun = {
        batches: extResults.length,
        totals: extResults.reduce(
          (acc, b) => {
            acc.created += b.created;
            acc.skipped += b.skipped;
            acc.failed += b.failed;
            return acc;
          },
          { created: 0, skipped: 0, failed: 0 }
        ),
        failures: extResults.flatMap((b) => b.failures).slice(0, 50),
      };
    }

    console.log('[migrateExpensesToMidas] dry-run report:', JSON.stringify(report, null, 2));
    if (reportPath) {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`[migrateExpensesToMidas] wrote ${reportPath}`);
    }
    const extFailed = (report.extDryRun as { totals?: { failed: number } } | undefined)?.totals?.failed ?? 0;
    process.exit(
      inventory.missingEventId > 0 || inventory.missingEmail > 0 || extFailed > 0 ? 2 : 0
    );
  }

  if (midasMode === 'disabled') {
    console.error('MIDAS_MODE is disabled');
    process.exit(1);
  }

  const client = getMidasClient();
  const failures: Array<{ sourceRefId: string; error?: string }> = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const built = batch.map(buildItem);
    const items = built.map((b) => b.item);

    try {
      const importResult = await client.importExpenses({
        sourceApp: 'trade_show',
        dryRun: false,
        items,
      });
      for (const r of importResult.results) {
        const outcome = importOutcome(r);
        if (outcome === 'created') checkpoint.imported += 1;
        else if (outcome === 'updated') checkpoint.updated += 1;
        else if (outcome === 'skipped') checkpoint.skipped += 1;
        else {
          checkpoint.failed += 1;
          failures.push({ sourceRefId: r.sourceRefId, error: importError(r) });
        }
      }
      checkpoint.missingReceiptFiles = inventory.missingReceiptFile;
      checkpoint.lastProcessedId = String(batch[batch.length - 1].id);
      saveCheckpoint(checkpoint);
      console.log('[migrateExpensesToMidas] batch ok', {
        size: batch.length,
        checkpoint,
      });
    } catch (err) {
      console.error('[migrateExpensesToMidas] batch failed', err);
      saveCheckpoint(checkpoint);
      process.exit(1);
    }
  }

  const finalReport = {
    mode: 'apply',
    inventory,
    checkpoint,
    failures,
    at: new Date().toISOString(),
  };
  console.log('[migrateExpensesToMidas] complete', JSON.stringify(finalReport, null, 2));
  if (reportPath) {
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
  }

  if (checkpoint.failed > 0 || inventory.missingReceiptFile > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
