import React, { useMemo } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { TradeShow, Expense } from '../../App';

interface BudgetOverviewProps {
  events: TradeShow[];
  expenses: Expense[];
}

export const BudgetOverview: React.FC<BudgetOverviewProps> = ({ events, expenses }) => {
  const budgetData = useMemo(() => {
    return events
      .filter(event => event.budget && event.budget > 0) // Only show events with budget set
      .map(event => {
        const eventExpenses = expenses.filter(expense => expense.tradeShowId === event.id);
        const totalSpent = eventExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const budget = event.budget || 0;
        const budgetUsed = budget > 0 ? (totalSpent / budget) * 100 : 0;
        
        return {
          ...event,
          budget,
          totalSpent,
          budgetUsed,
          remaining: budget - totalSpent,
          expenseCount: eventExpenses.length
        };
      })
      .slice(0, 4);
  }, [events, expenses]);

  const getBudgetStatus = (percentage: number) => {
    if (percentage >= 90) return { color: 'red', status: 'Critical', icon: AlertTriangle };
    if (percentage >= 75) return { color: 'orange', status: 'Warning', icon: AlertTriangle };
    return { color: 'emerald', status: 'Good', icon: CheckCircle };
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 md:px-6 pt-5 pb-4 border-b border-gray-100">
        <h3 className="card-title">Budget Overview</h3>
        <TrendingUp className="w-4 h-4 text-brand-500" />
      </div>

      {budgetData.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 ring-1 ring-inset ring-gray-100">
            <CheckCircle className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-600">No budget data available</p>
          <p className="text-sm text-gray-400 mt-1">Create events and add expenses to see budget tracking</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {budgetData.map(event => {
            const status = getBudgetStatus(event.budgetUsed);
            const StatusIcon = status.icon;

            return (
              <div key={event.id} className="px-5 md:px-6 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">{event.name}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{event.expenseCount} expenses submitted</p>
                  </div>
                  <span className={`chip shrink-0 px-2 py-0.5 text-xs ${
                    status.color === 'red' ? 'bg-red-50 text-red-700 ring-red-200/70' :
                    status.color === 'orange' ? 'bg-orange-50 text-orange-700 ring-orange-200/70' :
                    'bg-accent-50 text-accent-800 ring-accent-200/70'
                  }`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.status}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Spent <span className="font-semibold text-gray-700 tabular-nums">${event.totalSpent.toLocaleString()}</span></span>
                    <span>Budget <span className="font-semibold text-gray-700 tabular-nums">${event.budget.toLocaleString()}</span></span>
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden ring-1 ring-inset ring-gray-200/60">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        status.color === 'red' ? 'bg-gradient-to-r from-red-400 to-red-500' :
                        status.color === 'orange' ? 'bg-gradient-to-r from-orange-400 to-orange-500' :
                        'bg-gradient-to-r from-brand-500 to-accent-500'
                      }`}
                      style={{ width: `${Math.min(event.budgetUsed, 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className={`font-semibold tabular-nums ${
                      status.color === 'red' ? 'text-red-600' :
                      status.color === 'orange' ? 'text-orange-600' : 'text-accent-700'
                    }`}>
                      {event.budgetUsed.toFixed(1)}% used
                    </span>
                    <span className="text-gray-500 tabular-nums">
                      ${event.remaining.toLocaleString()} remaining
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};