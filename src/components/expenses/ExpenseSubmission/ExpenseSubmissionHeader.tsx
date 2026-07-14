/**
 * ExpenseSubmissionHeader Component
 *
 * Header section with title, description, and action buttons.
 */

import React from 'react';
import { Receipt, X, Clock } from 'lucide-react';

interface ExpenseSubmissionHeaderProps {
  hasApprovalPermission: boolean;
  hasActiveFilters: boolean;
  pendingCount: number;
  onClearFilters: () => void;
  onShowPendingSync: () => void;
  onAddExpense: () => void;
}

export const ExpenseSubmissionHeader: React.FC<ExpenseSubmissionHeaderProps> = ({
  hasApprovalPermission,
  hasActiveFilters,
  pendingCount,
  onClearFilters,
  onShowPendingSync,
  onAddExpense
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-2">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
          Expenses
        </p>
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
          Expense Management
        </h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {hasApprovalPermission
            ? 'Review, approve, and manage expense submissions'
            : 'Submit and track your trade show expenses'}
        </p>
      </div>
      <div className="flex flex-row flex-wrap gap-2 w-full sm:w-auto">
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="btn-ghost">
            <X className="w-4 h-4" />
            <span>Clear Filters</span>
          </button>
        )}
        {pendingCount > 0 && (
          <button
            onClick={onShowPendingSync}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200/70 transition-colors duration-150 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <Clock className="w-4 h-4" />
            <span>Pending Sync</span>
            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {pendingCount}
            </span>
          </button>
        )}
        <button onClick={onAddExpense} className="btn-primary flex-1 sm:flex-initial">
          <Receipt className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
      </div>
    </div>
  );
};
