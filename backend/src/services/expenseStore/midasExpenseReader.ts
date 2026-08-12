/**
 * Read helpers for consumers that need trade-show expenses in bulk.
 *
 * Reporting and detection code used to query the local `expenses` table
 * directly. Under EXPENSE_BACKEND=midas that table is frozen at the migration
 * cutover, so those queries answer from stale data. These helpers read the
 * same information from Midas, which is the system of record.
 *
 * Midas Ext exposes no aggregate or count endpoint — only cursor paging at up
 * to 200 rows per request — so callers that need SUM/COUNT/GROUP BY page the
 * set and fold it in memory. That is fine at the current scale (a few hundred
 * expenses, one or two requests) and degrades linearly beyond it. An Ext
 * aggregates endpoint is the real fix and is tracked as a follow-up with Midas;
 * see docs/superpowers/specs/2026-08-11-midas-picklist-cutover-design.md.
 */

import { getMidasClient } from '../midas';
import { midasDtoToTsExpense } from './midasAdapter';
import type { TsExpenseApi } from './ExpenseStore';
import type { MidasListQuery } from '../midas/MidasTypes';

const SOURCE_APP = 'trade_show';
const PAGE_SIZE = 200;

/**
 * Guards against an unbounded loop if a cursor ever fails to advance.
 * 200 pages is 40k expenses — far past the point where paging is the right
 * tool, so hitting this ceiling is a signal to move aggregation into Midas.
 */
const MAX_PAGES = 200;

/**
 * Minimum spacing between page requests. Midas has no rate limit on /ext but
 * asked consumers to stay under ~10 req/s; this caps a paging loop at 8/s so a
 * large fold cannot monopolise their API. Only applies between pages, so the
 * common one-page case is unaffected.
 */
const MIN_PAGE_INTERVAL_MS = 125;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type MidasExpenseQuery = Omit<MidasListQuery, 'sourceApp' | 'limit' | 'cursor'>;

/**
 * Every trade-show expense in Midas matching `filters`, following cursors to
 * completion. Narrow with `dateFrom`/`dateTo`/`externalUserId`/`eventIds`
 * wherever possible rather than fetching everything and filtering in Node.
 */
export async function fetchMidasExpenses(
  filters: MidasExpenseQuery = {}
): Promise<TsExpenseApi[]> {
  const client = getMidasClient();
  const all: TsExpenseApi[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    if (pages > 0) await sleep(MIN_PAGE_INTERVAL_MS);

    const result = await client.listExpenses({
      ...filters,
      sourceApp: SOURCE_APP,
      limit: PAGE_SIZE,
      cursor,
    });

    all.push(...result.expenses.map(midasDtoToTsExpense));
    cursor = result.nextCursor ?? undefined;
    pages += 1;

    if (pages >= MAX_PAGES && cursor) {
      console.warn(
        `[MidasExpenseReader] Stopped after ${MAX_PAGES} pages (${all.length} expenses) with more available. ` +
          'Aggregation belongs in Midas at this volume.'
      );
      break;
    }
  } while (cursor);

  return all;
}

/** Count matching expenses. Pages the set — Midas Ext has no count endpoint. */
export async function countMidasExpenses(filters: MidasExpenseQuery = {}): Promise<number> {
  return (await fetchMidasExpenses(filters)).length;
}
