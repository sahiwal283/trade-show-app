import React from 'react';
import { Clock, DollarSign, MapPin, Calendar } from 'lucide-react';
import { Expense } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { StatusBadge, CategoryBadge } from '../common';

interface RecentExpensesProps {
  onPageChange: (page: string) => void;
  expenses: Expense[];
}

export const RecentExpenses: React.FC<RecentExpensesProps> = ({ expenses, onPageChange }) => {
  const recentExpenses = expenses.slice(0, 5);

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-gray-100">
        <h3 className="card-title">Recent Expenses</h3>
        <button onClick={() => onPageChange('expenses')} className="card-link">View All</button>
      </div>

      {recentExpenses.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 ring-1 ring-inset ring-gray-100">
            <DollarSign className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No expenses yet</p>
          <p className="text-sm text-gray-400 mt-1">Submit your first expense to get started</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 px-2 py-2">
          {recentExpenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-gray-900 truncate">{expense.merchant}</p>
                    {expense.event_name && (
                      <span className="chip shrink-0 px-2 py-0.5 text-[11px] bg-brand-50 text-brand-700 ring-brand-200/60">
                        <Calendar className="w-3 h-3" />
                        {expense.event_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatLocalDate(expense.date)}</span>
                    {expense.location && (
                      <>
                        <MapPin className="w-3 h-3 ml-1.5" />
                        <span className="truncate">{expense.location}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="hidden sm:inline-flex"><CategoryBadge category={expense.category} size="sm" /></span>
                <StatusBadge status={expense.status} size="sm" />
                <p className="font-display text-sm font-bold text-gray-900 tabular-nums">${expense.amount.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};