/**
 * ExpenseModalDuplicateWarning Component
 * 
 * Extracted from ExpenseSubmission.tsx (was lines 1102-1124, ~23 lines)
 * Warning banner for possible duplicate expenses
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DuplicateCheck {
  expenseId: string;
  date: string;
  merchant: string;
  amount: number;
}

interface ExpenseModalDuplicateWarningProps {
  duplicateCheck: DuplicateCheck[] | undefined;
}

export const ExpenseModalDuplicateWarning: React.FC<ExpenseModalDuplicateWarningProps> = ({
  duplicateCheck,
}) => {
  if (!duplicateCheck || duplicateCheck.length === 0) return null;

  return (
    <div className="rounded-card border-l-4 border-amber-400 bg-amber-50 p-4 ring-1 ring-inset ring-amber-200/70">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="w-4 h-4" />
        </span>
        <p className="font-display font-semibold tracking-tight text-amber-900">Possible Duplicate Expenses</p>
      </div>
      <div className="space-y-2">
        {duplicateCheck.map((dup, index) => {
          const dupDate = new Date(dup.date);
          const formattedDate = dupDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          return (
            <div
              key={index}
              className="rounded-lg bg-white p-2.5 text-sm text-gray-700 ring-1 ring-inset ring-amber-200/60"
            >
              Expense #{dup.expenseId} —{' '}
              <span className="font-semibold text-gray-900 tabular-nums">${dup.amount.toFixed(2)}</span> at{' '}
              {dup.merchant} on {formattedDate}
            </div>
          );
        })}
      </div>
    </div>
  );
};

