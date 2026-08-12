/**
 * Quick Actions Service
 * 
 * Handles dashboard quick actions and pending task aggregations.
 * Extracted from quickActions.ts to separate complex query logic.
 */

import { query } from '../config/database';
import { expenseRepository, eventRepository } from '../database/repositories';
import { resolveExpenseBackend } from './expenseStore';
import { fetchMidasExpenses } from './expenseStore/midasExpenseReader';

export interface QuickActionTask {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  count: number;
  action: string;
  link: string;
  icon: string;
  [key: string]: unknown; // For additional fields like users, eventIds, etc.
}

/**
 * Get unpushed expenses to Zoho (complex aggregation)
 */
export async function getUnpushedZohoExpenses(): Promise<{
  count: number;
  eventIds: string[];
  primaryEventId?: string;
}> {
  // Not stale — obsolete. This counts expenses awaiting a Zoho push *by Trade
  // Show*, but under EXPENSE_BACKEND=midas Midas owns Zoho posting entirely and
  // `zoho_expense_id` is a local-only column. There is nothing for the user to
  // action here, so the quick action is suppressed rather than reimplemented.
  if (resolveExpenseBackend() === 'midas') {
    return { count: 0, eventIds: [] };
  }

  // Get count and primary event (event with most unpushed expenses)
  const unpushedResult = await query(
    `SELECT COUNT(*) as count, 
            ARRAY_AGG(DISTINCT event_id) as event_ids,
            event_id as primary_event
     FROM expenses 
     WHERE status = 'approved' 
       AND zoho_entity IS NOT NULL 
       AND zoho_expense_id IS NULL
     GROUP BY event_id
     ORDER BY COUNT(*) DESC
     LIMIT 1`
  );

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as count 
     FROM expenses 
     WHERE status = 'approved' 
       AND zoho_entity IS NOT NULL 
       AND zoho_expense_id IS NULL`
  );

  // Get all unique event IDs
  const eventsResult = await query(
    `SELECT DISTINCT event_id 
     FROM expenses 
     WHERE status = 'approved' 
       AND zoho_entity IS NOT NULL 
       AND zoho_expense_id IS NULL
     ORDER BY event_id`
  );

  const count = parseInt(countResult.rows[0].count, 10);
  const eventIds = eventsResult.rows.map(row => row.event_id).filter(id => id !== null);
  const primaryEventId = unpushedResult.rows[0]?.primary_event;

  return {
    count,
    eventIds,
    primaryEventId
  };
}

/**
 * Get reimbursement count
 */
export async function getReimbursementCount(): Promise<number> {
  if (resolveExpenseBackend() === 'midas') {
    const expenses = await fetchMidasExpenses();
    return expenses.filter(
      (e) =>
        e.reimbursementRequired &&
        (e.reimbursementStatus === 'pending review' || e.reimbursementStatus === 'approved')
    ).length;
  }
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM expenses 
     WHERE reimbursement_required = TRUE 
       AND (reimbursement_status = 'pending review' OR reimbursement_status = 'approved')`
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get events near budget limit for coordinator
 */
export async function getEventsNearBudgetLimit(coordinatorId: string): Promise<Array<{
  id: string;
  name: string;
  spent: number;
  budget: number;
  percent_spent: number;
}>> {
  const result = await query(
    `SELECT e.id, e.name, 
            SUM(ex.amount) as spent,
            e.budget,
            (SUM(ex.amount) / NULLIF(e.budget, 0) * 100) as percent_spent
     FROM events e
     LEFT JOIN expenses ex ON e.id = ex.event_id AND ex.status = 'approved'
     WHERE e.coordinator_id = $1
       AND e.status != 'completed'
       AND e.budget IS NOT NULL
     GROUP BY e.id, e.name, e.budget
     HAVING SUM(ex.amount) / NULLIF(e.budget, 0) >= 0.8`,
    [coordinatorId]
  );

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    spent: parseFloat(row.spent) || 0,
    budget: parseFloat(row.budget) || 0,
    percent_spent: parseFloat(row.percent_spent) || 0
  }));
}

/**
 * Get user's pending expenses count
 */
export async function getUserPendingExpensesCount(userId: string): Promise<number> {
  if (resolveExpenseBackend() === 'midas') {
    const expenses = await fetchMidasExpenses({ externalUserId: userId, status: 'pending' });
    return expenses.length;
  }
  const expenses = await expenseRepository.findWithFilters({
    userId,
    status: 'pending'
  });
  return expenses.length;
}

/**
 * Get user's expenses missing receipts count
 */
export async function getUserMissingReceiptsCount(userId: string): Promise<number> {
  if (resolveExpenseBackend() === 'midas') {
    const expenses = await fetchMidasExpenses({ externalUserId: userId });
    return expenses.filter((e) => !e.receiptUrl).length;
  }
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM expenses 
     WHERE user_id = $1 AND receipt_url IS NULL`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}


/**
 * Count of expenses awaiting approval, across all users.
 * Sourced from whichever store owns expenses — the local table is frozen at
 * the migration cutover under EXPENSE_BACKEND=midas.
 */
export async function getPendingApprovalCount(): Promise<number> {
  if (resolveExpenseBackend() === 'midas') {
    return (await fetchMidasExpenses({ status: 'pending' })).length;
  }
  return expenseRepository.countByStatus('pending');
}
