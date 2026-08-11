/**
 * Expense aggregates for the developer dashboard, sourced from whichever store
 * owns expenses.
 *
 * Under EXPENSE_BACKEND=midas the local `expenses` table is frozen at the
 * migration cutover. Aggregating it there would report pre-cutover numbers as
 * current, which on a diagnostics dashboard is worse than reporting nothing.
 *
 * Midas Ext has no aggregate endpoint, so the Midas branch pages the set and
 * folds it in memory — see midasExpenseReader for the scaling caveat.
 */

import { pool } from '../config/database';
import { resolveExpenseBackend } from './expenseStore';
import { fetchMidasExpenses } from './expenseStore/midasExpenseReader';

export type ExpenseSummaryTotals = {
  total: number;
  pending: number;
  amount: number;
  zohoPushed: number;
};

export async function expenseSummaryTotals(): Promise<ExpenseSummaryTotals> {
  if (resolveExpenseBackend() !== 'midas') {
    const [all, pending, amount, zoho] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM expenses'),
      pool.query(`SELECT COUNT(*) as count FROM expenses WHERE status = 'pending'`),
      pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses'),
      pool.query(`SELECT COUNT(*) as count FROM expenses WHERE zoho_expense_id IS NOT NULL`),
    ]);
    return {
      total: parseInt(all.rows[0].count, 10) || 0,
      pending: parseInt(pending.rows[0].count, 10) || 0,
      amount: parseFloat(amount.rows[0].total) || 0,
      zohoPushed: parseInt(zoho.rows[0].count, 10) || 0,
    };
  }

  const expenses = await fetchMidasExpenses();
  return {
    total: expenses.length,
    pending: expenses.filter((e) => e.status === 'pending').length,
    amount: expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    zohoPushed: expenses.filter((e) => e.zohoExpenseId).length,
  };
}

/**
 * The Date equivalent of the Postgres interval string parseTimeRange produces,
 * so the Midas branch covers the same window as the SQL branch.
 * Unknown values fall back to 24 hours, matching parseTimeRange's default.
 */
export function intervalStart(interval: string, now: Date = new Date()): Date {
  const days = interval === '7 days' ? 7 : interval === '30 days' ? 30 : 0;
  const ms = days > 0 ? days * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export type ExpenseTrendRow = { date: string; count: string; total: string };
export type ExpenseCategoryRow = { category: string; count: string; total: string };

/**
 * Daily totals and category breakdown since `since`.
 * Shapes match the SQL rows the dashboard already renders (counts as strings).
 */
export async function expenseTrendsAndCategories(
  since: Date
): Promise<{ trends: ExpenseTrendRow[]; categories: ExpenseCategoryRow[] }> {
  const expenses = (await fetchMidasExpenses()).filter(
    (e) => e.createdAt && new Date(e.createdAt) > since
  );

  const byDate = new Map<string, { count: number; total: number }>();
  const byCategory = new Map<string, { count: number; total: number }>();

  for (const e of expenses) {
    const day = String(e.createdAt).slice(0, 10);
    const d = byDate.get(day) ?? { count: 0, total: 0 };
    d.count += 1;
    d.total += e.amount ?? 0;
    byDate.set(day, d);

    const c = byCategory.get(e.category) ?? { count: 0, total: 0 };
    c.count += 1;
    c.total += e.amount ?? 0;
    byCategory.set(e.category, c);
  }

  return {
    trends: [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, count: String(v.count), total: String(v.total) })),
    categories: [...byCategory.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([category, v]) => ({ category, count: String(v.count), total: String(v.total) })),
  };
}

export type ReceiptCounts = {
  total_receipts_processed: string;
  receipts_this_month: string;
  receipts_today: string;
};

export async function expenseReceiptCounts(): Promise<ReceiptCounts> {
  if (resolveExpenseBackend() !== 'midas') {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_receipts_processed,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as receipts_this_month,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as receipts_today
      FROM expenses
      WHERE receipt_url IS NOT NULL
    `);
    return result.rows[0] as ReceiptCounts;
  }

  const withReceipts = (await fetchMidasExpenses()).filter((e) => e.receiptUrl);
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);

  return {
    total_receipts_processed: String(withReceipts.length),
    receipts_this_month: String(
      withReceipts.filter((e) => e.createdAt && new Date(e.createdAt).getTime() > thirtyDaysAgo)
        .length
    ),
    receipts_today: String(
      withReceipts.filter((e) => String(e.createdAt).slice(0, 10) === today).length
    ),
  };
}
