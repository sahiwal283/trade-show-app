/**
 * ExpenseSubmissionEmptyState Component
 *
 * Empty state displayed when no expenses are found.
 */

import React from 'react';
import { Receipt } from 'lucide-react';

interface ExpenseSubmissionEmptyStateProps {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onAddExpense: () => void;
}

export const ExpenseSubmissionEmptyState: React.FC<ExpenseSubmissionEmptyStateProps> = ({
  hasActiveFilters,
  onClearFilters,
  onAddExpense
}) => {
  return (
    <div className="card relative overflow-hidden p-12 text-center">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/60 to-transparent"
      />
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100">
        <Receipt className="w-8 h-8" />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight text-stone-900 mb-1.5">
        No Expenses Found
      </h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-stone-500">
        {hasActiveFilters
          ? 'Try adjusting your filters to see more expenses.'
          : 'Start by submitting your first expense with automatic OCR extraction from receipts.'
        }
      </p>
      <div className="flex justify-center gap-3">
        {hasActiveFilters && (
          <button onClick={onClearFilters} className="btn-secondary">
            Clear Filters
          </button>
        )}
        <button onClick={onAddExpense} className="btn-primary">
          <Receipt className="w-4 h-4" />
          Add Expense
        </button>
      </div>
    </div>
  );
};
