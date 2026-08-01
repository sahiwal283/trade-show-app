/**
 * Expense Utility Functions
 * 
 * Extracted complex expense-related logic for reusability and maintainability
 */

import { Expense } from '../App';
import { formatLocalDate } from './dateUtils';

/**
 * Builds a confirmation message for expense deletion
 */
export function buildExpenseDeleteConfirmation(
  expense: Expense,
  userName: string,
  eventName: string | undefined
): string {
  return (
    `⚠️ DELETE EXPENSE?\n\n` +
    `User: ${userName}\n` +
    `Amount: $${expense.amount.toFixed(2)}\n` +
    `Merchant: ${expense.merchant}\n` +
    `Category: ${expense.category}\n` +
    `Event: ${eventName || 'Unknown'}\n` +
    `Date: ${formatLocalDate(expense.date)}\n\n` +
    `This action cannot be undone.`
  );
}

/**
 * Builds a confirmation message for reimbursement approval/rejection
 */
export function buildReimbursementConfirmation(
  expense: Expense,
  status: 'approved' | 'rejected'
): string {
  return (
    `Are you sure you want to ${status === 'approved' ? 'approve' : 'reject'} this reimbursement?\n\n` +
    `Expense: $${expense.amount.toFixed(2)} - ${expense.merchant}\n` +
    `${status === 'approved' ? 'The user will be notified of approval.' : 'The user will be notified of rejection.'}`
  );
}

/**
 * Builds a confirmation message for marking reimbursement as paid
 */
export function buildMarkAsPaidConfirmation(
  expense: Expense,
  userName: string
): string {
  return (
    `Mark this reimbursement as PAID?\n\n` +
    `Expense: $${expense.amount.toFixed(2)} - ${expense.merchant}\n` +
    `User: ${userName}\n\n` +
    `This indicates the reimbursement has been processed and paid to the user.`
  );
}

/**
 * Builds a confirmation message for entity change on pushed expense
 */
export function buildEntityChangeConfirmation(
  currentEntity: string | undefined,
  newEntity: string
): string {
  return (
    `⚠️ This expense has already been pushed to "${currentEntity || 'Unassigned'}" Zoho Books.\n\n` +
    `Changing the entity will allow you to push it to "${newEntity || 'Unassigned'}" instead, ` +
    `but it will NOT remove it from "${currentEntity || 'Unassigned'}" Zoho Books.\n\n` +
    `Are you sure you want to change entities?`
  );
}

/**
 * Converts expense data to API payload format (camelCase to snake_case)
 */
export function expenseToApiPayload(expenseData: Omit<Expense, 'id'>): {
  event_id: string;
  category: string;
  merchant: string;
  amount: number;
  date: string;
  description: string;
  card_used: string;
  reimbursement_required: boolean;
  location?: string;
  zoho_entity?: string;
} {
  return {
    event_id: expenseData.tradeShowId,
    category: expenseData.category,
    merchant: expenseData.merchant,
    amount: expenseData.amount,
    date: expenseData.date,
    description: expenseData.description,
    card_used: expenseData.cardUsed,
    reimbursement_required: expenseData.reimbursementRequired,
    location: expenseData.location,
    zoho_entity: expenseData.zohoEntity,
  };
}

/**
 * Extracts card last four digits from card string
 */
export function extractCardLastFour(cardUsed: string | undefined): string | null {
  if (!cardUsed) return null;
  const match = cardUsed.match(/\(\.\.\.(\d{4})\)/);
  return match ? match[1] : null;
}


