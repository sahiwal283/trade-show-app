/**
 * ExpenseTableRow Component
 *
 * Extracted from ExpenseSubmission.tsx (was lines 869-1068, ~200 lines)
 * Single expense row with all columns, approval actions, and entity management
 */

import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  X,
  DollarSign,
  CheckCircle2,
  Upload,
  Loader2,
  Eye,
  Trash2,
} from 'lucide-react';
import { Expense, TradeShow, User } from '../../../App';
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
  entityOptions: string[];
  pushingExpenseId: string | null;
  pushedExpenses: Set<string>;
  onReimbursementApproval: (expense: Expense, status: 'approved' | 'rejected') => void;
  onMarkAsPaid: (expense: Expense) => void;
  onAssignEntity: (expense: Expense, entity: string) => void;
  onPushToZoho: (expense: Expense) => void;
  onViewExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  currentUserId: string;
}

// Dot colors matching the shared REIMBURSEMENT_COLORS tints
const reimbursementDotColors: Record<string, string> = {
  'pending review': 'bg-amber-500',
  approved: 'bg-accent-500',
  rejected: 'bg-red-500',
  paid: 'bg-brand-500',
};

// Compact icon-button recipe for inline row actions.
// 44px touch target below lg; desktop keeps the original compact footprint.
const rowIconButton =
  'inline-flex items-center justify-center rounded-md p-1 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

export const ExpenseTableRow: React.FC<ExpenseTableRowProps> = ({
  expense,
  event,
  userName,
  hasApprovalPermission,
  entityOptions,
  pushingExpenseId,
  pushedExpenses,
  onReimbursementApproval,
  onMarkAsPaid,
  onAssignEntity,
  onPushToZoho,
  onViewExpense,
  onDeleteExpense,
  currentUserId,
}) => {
  return (
    <tr key={expense.id} className="group transition-colors duration-150 hover:bg-brand-50/40">
      {/* Date */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-stone-600 tabular-nums whitespace-nowrap">
        {formatLocalDate(expense.date)}
      </td>

      {/* User (Approval Users Only) */}
      {hasApprovalPermission && (
        <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-stone-700">{userName}</td>
      )}

      {/* Event */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-stone-900">
        {event ? event.name : <span className="text-stone-400">No Event</span>}
      </td>

      {/* Category */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <CategoryBadge category={expense.category} size="sm" />
      </td>

      {/* Merchant */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs sm:text-sm font-medium text-stone-900">{expense.merchant}</div>
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
          {expense.location && <div className="text-xs text-stone-500">{expense.location}</div>}
        </div>
      </td>

      {/* Amount */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-right text-xs sm:text-sm font-semibold text-stone-900 tabular-nums whitespace-nowrap">
        ${expense.amount.toFixed(2)}
      </td>

      {/* Card Used */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-stone-600">{expense.cardUsed}</td>

      {/* Status */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <StatusBadge
          status={expense.status as React.ComponentProps<typeof StatusBadge>['status']}
          size="sm"
        />
      </td>

      {/* Reimbursement */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
        <div className="space-y-1">
          {expense.reimbursementRequired ? (
            <span
              className={`chip px-2 py-1 text-xs ${getReimbursementStatusColor(expense.reimbursementStatus || 'pending review')}`}
            >
              <span
                className={`chip-dot ${reimbursementDotColors[expense.reimbursementStatus || 'pending review'] || 'bg-amber-500'}`}
              />
              {formatReimbursementStatus(expense.reimbursementStatus)}
            </span>
          ) : (
            <span className="chip px-2 py-1 text-xs bg-stone-50 text-stone-500 ring-stone-200">
              Not Required
            </span>
          )}
          {hasApprovalPermission && expense.reimbursementRequired && (
            <>
              {(!expense.reimbursementStatus || expense.reimbursementStatus === 'pending review') && (
                <div className="flex items-center gap-1 mt-1">
                  <button
                    onClick={() => onReimbursementApproval(expense, 'approved')}
                    className={`${rowIconButton} text-accent-600 hover:bg-accent-50 hover:text-accent-700`}
                    title="Approve Reimbursement"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onReimbursementApproval(expense, 'rejected')}
                    className={`${rowIconButton} text-red-600 hover:bg-red-50 hover:text-red-700`}
                    title="Reject Reimbursement"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {expense.reimbursementStatus === 'approved' && (
                <div className="flex items-center gap-1 mt-1">
                  <button
                    onClick={() => onMarkAsPaid(expense)}
                    className={`${rowIconButton} text-brand-600 hover:bg-brand-50 hover:text-brand-700`}
                    title="Mark as Paid"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </td>

      {/* Entity (Approval Users Only) */}
      {hasApprovalPermission && (
        <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
          <select
            value={expense.zohoEntity || ''}
            onChange={(e) => onAssignEntity(expense, e.target.value)}
            className={`w-full min-w-[120px] rounded-lg border px-2 py-2 min-h-[44px] text-base sm:py-1 sm:min-h-0 sm:text-xs shadow-sm transition-all duration-150 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 ${
              expense.zohoEntity
                ? 'border-stone-200 bg-stone-50 text-stone-500 cursor-not-allowed'
                : 'border-stone-300 bg-white text-stone-900 hover:border-stone-400'
            }`}
            disabled={!!expense.zohoEntity}
            title={expense.zohoEntity ? 'Entity assigned - use View Details to change' : ''}
          >
            <option value="">Unassigned</option>
            {/* If expense has an entity that's not in options, show it first */}
            {expense.zohoEntity && !entityOptions.includes(expense.zohoEntity) && (
              <option value={expense.zohoEntity}>{expense.zohoEntity}</option>
            )}
            {entityOptions.map((entity, index) => (
              <option key={index} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </td>
      )}

      {/* Zoho Push (Approval Users Only) */}
      {hasApprovalPermission && (
        <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5">
          <div className="flex justify-center">
            {!expense.zohoEntity ? (
              <span className="text-xs text-stone-400 italic">No entity</span>
            ) : expense.zohoExpenseId || pushedExpenses.has(expense.id) ? (
              <span className="chip px-2 py-1 text-xs bg-accent-50 text-accent-800 ring-accent-200/70">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pushed
              </span>
            ) : pushingExpenseId === expense.id ? (
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 cursor-not-allowed"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Pushing...</span>
              </button>
            ) : (
              <button
                onClick={() => onPushToZoho(expense)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors duration-150 hover:bg-brand-100 hover:text-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 lg:min-h-0"
                title={`Push to ${expense.zohoEntity} Zoho Books`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Push</span>
              </button>
            )}
          </div>
        </td>
      )}

      {/* Actions */}
      <td className="px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* View Details (All Users) */}
          <button
            onClick={() => onViewExpense(expense)}
            className="tap-target rounded-lg p-2 text-stone-400 transition-colors duration-150 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            title="View Details & Receipt"
          >
            <Eye className="w-4 h-4" />
          </button>
          {/* Delete (Own Expenses OR Approval Users) */}
          {(expense.userId === currentUserId || hasApprovalPermission) && (
            <button
              onClick={() => onDeleteExpense(expense.id)}
              className="tap-target rounded-lg p-2 text-stone-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
