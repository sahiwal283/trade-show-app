/**
 * Show Summaries Routes
 *
 * Aggregate trade-show cost totals for the Reports comparison views:
 *   - source 'imported': historical rows seeded from the accountant's
 *     workbook (migration 033) — totals only, no line items.
 *   - source 'live': the same shape computed on the fly from real expenses,
 *     so current-year shows are directly comparable with history.
 */

import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';

const router = Router();
router.use(authenticateToken);

/** Mirror of the import script's show_key normalization (keep in sync). */
export function showKey(title: string): string {
  return aliasKey(
    title
      .toLowerCase()
      .replace(/20\d\d/g, '')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\b(show|account|accou|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Same show, different spellings across the workbook and live events —
 * fold known variants onto one canonical key so YoY pairing works.
 */
const KEY_ALIASES: Array<[RegExp, string]> = [
  [/champs (winter ?\/? ?)?spring (lv|las vegas)|champs (lv|las vegas) spring/, 'champs spring lv'],
  [/champs (las vegas|lv) summer|champs summer (lv|las vegas)/, 'champs summer lv'],
  [/champs f(or)?t\.? lauderd?ale?(dale)?/, 'champs fort lauderdale'],
  [/^tpe\b.*|total products expo/, 'tpe'],
  [/americasmart|atlanta market|america s mart/, 'americasmart'],
  [/sweet\s*&?\s*snack/, 'sweet and snack'],
  [/^nacs?\b.*/, 'nacs'],
  [/asd market\s*(week)?/, 'asd market week'],
  [/fancy food|fancy faire?/, 'fancy food'],
];

export function aliasKey(key: string): string {
  for (const [pattern, canonical] of KEY_ALIASES) {
    if (pattern.test(key)) return canonical;
  }
  return key;
}

/** Company name hygiene: singular/plural variants, undefined, blanks. */
export function normalizeCompany(raw: string | null | undefined): string {
  const c = (raw || '').trim();
  const k = c.toLowerCase();
  if (!k || k === 'undefined' || k === 'null' || k === 'n/a') return 'Unassigned';
  if (k.startsWith('boomin')) return 'Boomin Brands';
  if (k.startsWith('haute')) return 'Haute Brands';
  if (k.startsWith('summit')) return 'Summitt Labs';
  if (k.startsWith('nirvana')) return 'Nirvana Kulture';
  return c;
}

async function assembleRows() {
  const imported = await query(
      `SELECT show_name, show_key, year, company, category, amount::float, source
       FROM show_summaries
       ORDER BY year, show_key, company, category`
    );

    // Live shows: same aggregate computed from the expense register.
    // Rejected expenses are excluded — they are not part of the investment.
    const live = await query(
      `SELECT e.name AS show_name,
              EXTRACT(YEAR FROM e.show_start_date)::int AS year,
              COALESCE(NULLIF(ex.zoho_entity, ''), 'Unassigned') AS company,
              ex.category,
              SUM(ex.amount)::float AS amount
       FROM expenses ex
       JOIN events e ON e.id = ex.event_id
       WHERE ex.status != 'rejected'
       GROUP BY e.name, year, company, ex.category`
    );

  const importedRows = imported.rows.map((r: any) => ({
    ...r,
    show_key: aliasKey(r.show_key),
    company: normalizeCompany(r.company),
  }));

  const liveRows = live.rows.map((r: any) => ({
    show_name: r.show_name,
    show_key: showKey(r.show_name),
    year: r.year,
    company: normalizeCompany(r.company),
    category: r.category,
    amount: r.amount,
    source: 'live' as const,
  }));

  return [...importedRows, ...liveRows];
}

router.get(
  '/',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(await assembleRows());
  })
);

// Business-grade exports: charted PDF report + formatted Excel workbook
router.get(
  '/report.pdf',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { generateInvestmentReportPDF } = await import('../services/ReportExportService');
    const pdf = await generateInvestmentReportPDF(await assembleRows());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="trade-show-investment-report.pdf"');
    res.send(pdf);
  })
);

router.get(
  '/report.xlsx',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { generateInvestmentWorkbook } = await import('../services/ReportExportService');
    const wb = await generateInvestmentWorkbook(await assembleRows());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="trade-show-investment.xlsx"');
    res.send(wb);
  })
);

export default router;
