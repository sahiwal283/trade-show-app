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
import { showKey, aliasKey, normalizeCompany } from '../utils/showNormalization';

// Normalization helpers moved to utils/showNormalization.ts (shared with the
// CRM lead sync without services importing from a route module). Re-exported
// here for backward compatibility with existing importers.
export { showKey, aliasKey, normalizeCompany } from '../utils/showNormalization';

const router = Router();
router.use(authenticateToken);

async function assembleRows() {
  const imported = await query(
      `SELECT show_name, show_key, year, company, category, amount::float, source
       FROM show_summaries
       ORDER BY year, show_key, company, category`
    );

    // Live shows: same aggregate computed from the expense register.
    // Rejected expenses are excluded — they are not part of the investment.
    const live = await query(
      `SELECT e.id AS event_id,
              e.name AS show_name,
              EXTRACT(YEAR FROM e.show_start_date)::int AS year,
              COALESCE(NULLIF(ex.zoho_entity, ''), 'Unassigned') AS company,
              ex.category,
              SUM(ex.amount)::float AS amount
       FROM expenses ex
       JOIN events e ON e.id = ex.event_id
       WHERE ex.status != 'rejected'
       GROUP BY e.id, e.name, year, company, ex.category`
    );

  const importedRows = imported.rows.map((r: any) => ({
    ...r,
    show_key: aliasKey(r.show_key),
    company: normalizeCompany(r.company),
  }));

  // The accountant's workbook is AUTHORITATIVE for any show-year it covers:
  // some 2025 shows were also partially tracked live in the app, and adding
  // both double-counted them (e.g. NACs 2025 = workbook $37,011 + partial
  // live $2,439). Live rows for an imported show-year are dropped.
  const importedPairs = new Set(importedRows.map((r: any) => `${r.show_key}:${r.year}`));

  const liveRows = live.rows
    .map((r: any) => ({
      show_name: r.show_name,
      show_key: showKey(r.show_name),
      year: r.year,
      company: normalizeCompany(r.company),
      category: r.category,
      amount: r.amount,
      source: 'live' as const,
      event_id: r.event_id,
    }))
    .filter((r: any) => !importedPairs.has(`${r.show_key}:${r.year}`));

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
