/**
 * ExpenseTableRow Component
 *
 * Pure-data expense row: the entire row is clickable and opens the detail
 * modal, which carries every action (entity, Zoho push, approve/reject,
 * delete). The only interactive control left in the row is the bulk-select
 * checkbox; Zoho state appears as a quiet indicator in the status stack.
 */

import React from 'react';
import { AlertTriangle, Check, Paperclip } from 'lucide-react';
import { Expense, TradeShow } from '../../../App';
import { formatLocalDate } from '../../../utils/dateUtils';
import {
  getReimbursementStatusColor,
  formatReimbursementStatus,
} from '../../../constants/appConstants';
import { StatusBadge } from '../../common/StatusBadge';
import { CategoryBadge } from '../../common/CategoryBadge';

interface ExpenseTableRowProps {
  expense: Expense;
  event: TradeShow | undefined;
  userName: string;
  hasApprovalPermission: boolean;
  pushedExpenses: Set<string>;
  onViewExpense: (expense: Expense) => void;
  isSelected?: boolean;
  onToggleSelect?: (expenseId: string) => void;
}

// Dot colors matching the shared REIMBURSEMENT_COLORS tints
const reimbursementDotColors: Record<string, string> = {
  'pending review': 'bg-amber-500',
  approved: 'bg-accent-500',
  rejected: 'bg-red-500',
  paid: 'bg-brand-500',
};

export const ExpenseTableRow: React.FC<ExpenseTableRowProps> = ({
  expense,
  event,
  userName,
  hasApprovalPermission,
  pushedExpenses,
  onViewExpense,
  isSelected = false,
  onToggleSelect,
}) => {
  const isPushed = !!expense.zohoExpenseId || pushedExpenses.has(expense.id);

  return (
    <tr
      key={expense.id}
      tabIndex={0}
      onClick={() => onViewExpense(expense)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewExpense(expense);
        }
      }}
      className={`group cursor-pointer transition-colors duration-150 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${isSelected ? 'bg-brand-50/60' : ''}`}
    >
      {/* Bulk select (approval users only) — clicks stay inside the cell */}
      {hasApprovalPermission && onToggleSelect && (
        <td
          className="w-10 px-2 py-2 text-center sm:px-3 sm:py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(expense.id)}
            aria-label={`Select expense at ${expense.merchant}`}
            className="h-4 w-4 cursor-pointer rounded border-stone-300 accent-brand-600"
          />
        </td>
      )}

      {/* Date */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-stone-600 tabular-nums whitespace-nowrap">
        {formatLocalDate(expense.date)}
      </td>

      {/* Person / Show: submitter with event beneath (approvers) or event alone */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        {hasApprovalPermission ? (
          <div>
            <div className="text-xs sm:text-sm font-medium text-stone-900">{userName}</div>
            <div className="text-xs text-stone-500">
              {event ? event.name : <span className="text-stone-400">No Event</span>}
            </div>
          </div>
        ) : (
          <div className="text-xs sm:text-sm text-stone-900">
            {event ? event.name : <span className="text-stone-400">No Event</span>}
          </div>
        )}
      </td>

      {/* Expense: merchant with category chip beneath */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs sm:text-sm font-semibold text-stone-900">{expense.merchant}</div>
            {expense.duplicateCheck && expense.duplicateCheck.length > 0 && (
              <div className="relative group/dup">
                <div className="flex items-center text-amber-500 cursor-help">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                {/* Tooltip on hover */}
                <div className="absolute left-0 top-6 hidden group-hover/dup:block z-50 w-80 rounded-card bg-white p-4 shadow-elevation-3 ring-1 ring-amber-200">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Possible duplicate expenses
                  </p>
                  <div className="space-y-1">
                    {expense.duplicateCheck.map((dup, idx) => {
                      const dupDate = new Date(dup.date);
                      const formattedDate = dupDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      });
                      return (
                        <div key={idx} className="text-xs text-stone-700 tabular-nums">
                          <span className="font-semibold text-stone-900">${dup.amount.toFixed(2)}</span>{' '}
                          at {dup.merchant} on {formattedDate}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <CategoryBadge category={expense.category} size="xs" />
            {expense.location && (
              <span className="max-w-[160px] truncate text-xs text-stone-400">{expense.location}</span>
            )}
          </div>
        </div>
      </td>

      {/* Amount with card used beneath */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-right whitespace-nowrap">
        <div className="text-xs sm:text-sm font-semibold text-stone-900 tabular-nums">
          ${expense.amount.toFixed(2)}
        </div>
        {expense.cardUsed && <div className="text-xs text-stone-500">{expense.cardUsed}</div>}
      </td>

      {/* Status stack: status chip, reimbursement (when required), Zoho state */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <div className="space-y-1">
          <StatusBadge
            status={expense.status as React.ComponentProps<typeof StatusBadge>['status']}
            size="sm"
          />
          {expense.reimbursementRequired && (
            <div>
              <span
                className={`chip px-1.5 py-0.5 text-[10px] ${getReimbursementStatusColor(expense.reimbursementStatus || 'pending review')}`}
              >
                <span
                  className={`chip-dot ${reimbursementDotColors[expense.reimbursementStatus || 'pending review'] || 'bg-amber-500'}`}
                />
                Reimb. {formatReimbursementStatus(expense.reimbursementStatus)}
              </span>
            </div>
          )}
          {hasApprovalPermission && !expense.zohoEntity && (
            <div>
              <span className="chip bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 ring-amber-200/70">
                Needs entity
              </span>
            </div>
          )}
          {hasApprovalPermission && isPushed && (
            <div className="flex items-center gap-1 text-[10px] font-medium text-stone-400">
              <Check aria-hidden="true" className="h-3 w-3 text-accent-500" />
              Pushed
            </div>
          )}
        </div>
      </td>

      {/* Receipt indicator — the row click opens the detail with the receipt */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 whitespace-nowrap">
        {expense.receiptUrl ? (
          <span className="chip bg-stone-50 px-2 py-1 text-xs text-stone-500 ring-stone-200">
            <Paperclip className="h-3 w-3" />
            1 receipt
          </span>
        ) : (
          <span className="text-xs text-stone-300">—</span>
        )}
      </td>
    </tr>
  );
};
