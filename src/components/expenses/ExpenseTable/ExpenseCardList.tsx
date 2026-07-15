/**
 * ExpenseCardList Component
 *
 * Mobile replacement for the expenses table (< lg): each expense is a
 * tappable ledger card — merchant + amount lead, metadata stays quiet,
 * status chips close the row. Tapping opens the detail modal, which
 * carries all actions (status, entity, receipt, delete).
 */

import { ChevronRight, Paperclip } from 'lucide-react';
import { Expense, TradeShow, User } from '../../../App';
import { formatLocalDate } from '../../../utils/dateUtils';
import { StatusBadge } from '../../common/StatusBadge';

interface ExpenseCardListProps {
  expenses: Expense[];
  events: TradeShow[];
  users: User[];
  hasApprovalPermission: boolean;
  onViewExpense: (expense: Expense) => void;
}

function toBadgeStatus(status: Expense['status']): 'pending' | 'approved' | 'rejected' | 'needs_further_review' {
  if (status === 'needs further review') return 'needs_further_review';
  return status;
}

export function ExpenseCardList({
  expenses,
  events,
  users,
  hasApprovalPermission,
  onViewExpense,
}: ExpenseCardListProps) {
  return (
    <ul className="divide-y divide-stone-100">
      {expenses.map(expense => {
        const eventName = events.find(e => e.id === expense.tradeShowId)?.name;
        const userName =
          expense.user_name || users.find(u => u.id === expense.userId)?.name || 'Unknown';
        const needsEntity = hasApprovalPermission && !expense.zohoEntity;
        const needsReimbursement =
          expense.reimbursementRequired &&
          expense.reimbursementStatus !== 'paid' &&
          expense.reimbursementStatus !== 'rejected';

        return (
          <li key={expense.id}>
            <button
              type="button"
              onClick={() => onViewExpense(expense)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-stone-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-stone-900">{expense.merchant}</p>
                  {expense.receiptUrl && (
                    <Paperclip aria-label="Has receipt" className="h-3 w-3 shrink-0 text-stone-300" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-400">
                  {expense.category}
                  {hasApprovalPermission ? ` · ${userName}` : ''}
                  {' · '}
                  {formatLocalDate(expense.date, { month: 'short', day: 'numeric' })}
                </p>
                {eventName && (
                  <p className="truncate text-xs text-stone-400">{eventName}</p>
                )}
                {(needsEntity || needsReimbursement) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {needsEntity && (
                      <span className="chip bg-red-50 px-2 py-0.5 text-[10px] text-red-700 ring-red-200/70">
                        No entity
                      </span>
                    )}
                    {needsReimbursement && (
                      <span className="chip bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 ring-amber-200/70">
                        Reimbursement {expense.reimbursementStatus === 'approved' ? 'approved' : 'due'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className="text-sm font-bold tabular-nums text-stone-900">
                  ${expense.amount.toFixed(2)}
                </p>
                <StatusBadge status={toBadgeStatus(expense.status)} size="xs" />
              </div>
              <ChevronRight aria-hidden="true" className="mt-3 h-4 w-4 shrink-0 text-stone-300" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
