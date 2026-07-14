/**
 * ExpenseModalStatusManagement Component
 * 
 * Extracted and SIMPLIFIED from ExpenseSubmission.tsx (was lines 1318-1515, ~198 lines)
 * Manages status, reimbursement, entity assignment, and Zoho push status
 * 
 * SIMPLIFICATION: 
 * - Extracted duplicate edit count logic into helper function
 * - Cleaner prop interface for handlers
 * - Separated concerns for approval workflows
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Expense } from '../../../App';
import { getStatusColor, getReimbursementStatusColor, formatReimbursementStatus } from '../../../constants/appConstants';
import { buildReimbursementConfirmation, buildMarkAsPaidConfirmation } from '../../../utils/expenseUtils';

interface AuditEntry {
  action: string;
}

type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'needs further review';

interface ExpenseModalStatusManagementProps {
  expense: Expense;
  hasApprovalPermission: boolean;
  entityOptions: string[];
  auditTrail: AuditEntry[];
  onStatusChange?: (newStatus: ExpenseStatus) => Promise<void>;
  onReimbursementStatusChange: (newStatus: 'pending review' | 'approved' | 'rejected' | 'paid') => Promise<void>;
  onEntityChange: (newEntity: string) => Promise<void>;
}

// System control recipe for compact status selects (matches .input-field anatomy)
const statusSelect =
  'rounded-lg border border-gray-300 bg-white px-3 py-1.5 min-h-[44px] lg:min-h-0 text-base sm:text-sm font-medium text-gray-900 shadow-sm transition-all duration-150 hover:border-gray-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15';

// SIMPLIFIED: Helper to count edits (DRY principle)
const getEditCount = (auditTrail: AuditEntry[]): number => {
  return auditTrail.filter(entry => 
    entry.action !== 'created' && entry.action !== 'pushed_to_zoho'
  ).length;
};

// SIMPLIFIED: Reusable edit warning badge
const EditWarning: React.FC<{ count: number; message: string }> = ({ count, message }) => {
  if (count === 0) return null;
  
  return (
    <div className="relative group">
      <div className="flex items-center text-amber-600 cursor-help">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="absolute left-0 top-6 hidden group-hover:block z-50 w-56 rounded-lg bg-white p-2.5 shadow-elevation-3 ring-1 ring-amber-200">
        <p className="text-xs font-medium text-amber-800">
          Edited {count} {count === 1 ? 'time' : 'times'} {message}
        </p>
      </div>
    </div>
  );
};

export const ExpenseModalStatusManagement: React.FC<ExpenseModalStatusManagementProps> = ({
  expense,
  hasApprovalPermission,
  entityOptions,
  auditTrail,
  onStatusChange,
  onReimbursementStatusChange,
  onEntityChange,
}) => {
  const editCount = getEditCount(auditTrail);

  return (
    <div className="flex flex-wrap gap-6">
      {/* Status - Editable by admin/accountant, or read-only (auto-updates on entity/reimbursement/push) */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Status</p>
        <div className="flex items-center space-x-2">
          {hasApprovalPermission && onStatusChange ? (
            <select
              value={expense.status}
              onChange={async (e) => {
                const newStatus = e.target.value as ExpenseStatus;
                if (
                  !window.confirm(
                    `Change status to "${newStatus === 'needs further review' ? 'Needs Further Review' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}"?`
                  )
                ) {
                  e.target.value = expense.status;
                  return;
                }
                await onStatusChange(newStatus);
              }}
              className={statusSelect}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="needs further review">Needs Further Review</option>
            </select>
          ) : (
            <>
              <span className={`chip px-3 py-1 text-sm ${getStatusColor(expense.status)}`}>
                {expense.status === 'needs further review'
                  ? 'Needs Further Review'
                  : expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
              </span>
              {hasApprovalPermission && <span className="text-xs text-gray-400 italic">(auto-updates)</span>}
            </>
          )}
        </div>
      </div>

      {/* Reimbursement Status */}
      {expense.reimbursementRequired ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Reimbursement</p>
          {hasApprovalPermission ? (
            <select
              value={expense.reimbursementStatus || 'pending review'}
              onChange={async (e) => {
                const newStatus = e.target.value as 'pending review' | 'approved' | 'rejected' | 'paid';
                const statusText = formatReimbursementStatus(newStatus);
                const confirmed = window.confirm(
                  `Change reimbursement status to "${statusText}"?\n\n` +
                    `Expense: $${expense.amount.toFixed(2)} - ${expense.merchant}\n` +
                    (newStatus === 'paid' ? `\nThis indicates the reimbursement has been processed and paid to the user.` : '')
                );

                if (!confirmed) {
                  e.target.value = expense.reimbursementStatus || 'pending review';
                  return;
                }

                await onReimbursementStatusChange(newStatus);
              }}
              className={statusSelect}
            >
              <option value="pending review">Pending Review</option>
              <option value="approved">Approved (pending payment)</option>
              <option value="rejected">Rejected</option>
              {(expense.status === 'approved' || expense.reimbursementStatus === 'paid') && (
                <option value="paid">Paid</option>
              )}
            </select>
          ) : (
            <span
              className={`chip px-3 py-1 text-sm ${getReimbursementStatusColor(
                expense.reimbursementStatus || 'pending review'
              )}`}
            >
              {formatReimbursementStatus(expense.reimbursementStatus)}
            </span>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Reimbursement</p>
          <span className="chip px-3 py-1 text-sm bg-gray-50 text-gray-500 ring-gray-200">
            Not Required
          </span>
        </div>
      )}

      {/* Entity */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Entity</p>
        {hasApprovalPermission ? (
          <select
            value={expense.zohoEntity || ''}
            onChange={async (e) => {
              const newEntity = e.target.value;

              // Confirm if changing entity after Zoho push
              if (expense.zohoEntity && expense.zohoExpenseId && newEntity !== expense.zohoEntity) {
                if (
                  !window.confirm(
                    `This expense was already pushed to Zoho under "${expense.zohoEntity}". Changing the entity will clear the Zoho ID. Continue?`
                  )
                ) {
                  return;
                }
              }

              await onEntityChange(newEntity);
            }}
            className={statusSelect}
          >
            <option value="">Unassigned</option>
            {expense.zohoEntity && !entityOptions.includes(expense.zohoEntity) && (
              <option value={expense.zohoEntity}>{expense.zohoEntity}</option>
            )}
            {entityOptions.map((entity, index) => (
              <option key={index} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        ) : expense.zohoEntity ? (
          <span className="chip px-3 py-1 text-sm bg-brand-50 text-brand-700 ring-brand-200/70">
            {expense.zohoEntity}
          </span>
        ) : (
          <span className="chip px-3 py-1 text-sm bg-gray-50 text-gray-500 ring-gray-200">
            Unassigned
          </span>
        )}
      </div>

      {/* Zoho Push Status */}
      {hasApprovalPermission && expense.zohoEntity && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Zoho Status</p>
          {expense.zohoExpenseId ? (
            <div className="flex items-center space-x-2">
              <span className="chip px-3 py-1 text-sm bg-accent-50 text-accent-800 ring-accent-200/70">
                <span className="chip-dot bg-accent-500" />
                Pushed
              </span>
              <span className="text-xs text-gray-500">ID: {expense.zohoExpenseId}</span>
              <EditWarning count={editCount} message="after push - Zoho data may be stale" />
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="chip px-3 py-1 text-sm bg-amber-50 text-amber-800 ring-amber-200/70">
                <span className="chip-dot bg-amber-500" />
                Not Pushed
              </span>
              <EditWarning count={editCount} message="before push" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

