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
  return title
    .toLowerCase()
    .replace(/20\d\d/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\b(show|account|accou|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

router.get(
  '/',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
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

    const liveRows = live.rows.map((r: any) => ({
      show_name: r.show_name,
      show_key: showKey(r.show_name),
      year: r.year,
      company: r.company,
      category: r.category,
      amount: r.amount,
      source: 'live' as const,
    }));

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json([...imported.rows, ...liveRows]);
  })
);

export default router;
