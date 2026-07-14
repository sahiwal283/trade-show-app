import React from 'react';
import { Building2, DollarSign, FileText } from 'lucide-react';
import { Expense, TradeShow } from '../../App';
import { CategoryBadge } from '../common';

interface EntityBreakdownProps {
  expenses: Expense[];
  events: TradeShow[];
}

export const EntityBreakdown: React.FC<EntityBreakdownProps> = ({ expenses, events }) => {
  const entityData = expenses.reduce((acc, expense) => {
    const entity = expense.zohoEntity || 'Unassigned';
    if (!acc[entity]) {
      acc[entity] = {
        totalAmount: 0,
        expenseCount: 0,
        categories: {},
        events: new Set()
      };
    }
    
    acc[entity].totalAmount += expense.amount;
    acc[entity].expenseCount += 1;
    acc[entity].categories[expense.category] = (acc[entity].categories[expense.category] || 0) + expense.amount;
    
    const event = events.find(e => e.id === expense.tradeShowId);
    if (event) {
      acc[entity].events.add(event.name);
    }
    
    return acc;
  }, {} as Record<string, {
    totalAmount: number;
    expenseCount: number;
    categories: Record<string, number>;
    events: Set<string>;
  }>);

  const entities = Object.keys(entityData);
  const totalAmount = Object.values(entityData).reduce((sum, data) => sum + data.totalAmount, 0);

  return (
    <div className="space-y-6">
      {entities.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100">
            <Building2 className="w-8 h-8" />
          </div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900 mb-1.5">No Entity Data Available</h3>
          <p className="mx-auto max-w-md text-sm text-gray-500">
            Assign expenses to Zoho entities to see detailed breakdowns by organization.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 sm:gap-5 md:gap-6">
          {entities.map((entityName) => {
            const data = entityData[entityName];
            const percentage = (data.totalAmount / totalAmount) * 100;
            const topCategories = Object.entries(data.categories)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 3);

            return (
              <div key={entityName} className="card card-hover relative overflow-hidden p-3 sm:p-5 md:p-6">
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/60 to-transparent" />
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">
                        {entityName === 'Unassigned' ? '⚠️ Unassigned' : entityName}
                      </h3>
                      <p className="text-sm text-gray-500 tabular-nums">
                        {percentage.toFixed(1)}% of total expenses
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-gray-900">
                      ${data.totalAmount.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {data.expenseCount} expenses
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                  <div className="w-full bg-gray-100 rounded-full h-2 ring-1 ring-inset ring-gray-200/60">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>

                {/* Top Categories */}
                <div className="space-y-4">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Top Categories</h4>
                  <div className="space-y-2">
                    {topCategories.map(([category, amount]) => (
                      <div key={category} className="flex items-center justify-between">
                        <CategoryBadge category={category} size="sm" />
                        <span className="text-sm font-semibold tabular-nums text-gray-900">
                          ${amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Associated Events */}
                {data.events.size > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Associated Events</h4>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(data.events).slice(0, 3).map((eventName) => (
                        <span
                          key={eventName}
                          className="chip bg-brand-50 px-2 py-1 text-xs text-brand-700 ring-brand-200/70"
                        >
                          {eventName}
                        </span>
                      ))}
                      {data.events.size > 3 && (
                        <span className="chip bg-gray-50 px-2 py-1 text-xs text-gray-500 ring-gray-200">
                          +{data.events.size - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Section */}
      {entities.length > 0 && (
        <div className="card p-3 sm:p-5 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display text-lg font-semibold tracking-tight text-gray-900">Entity Summary</h3>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200/70">
              <FileText className="w-4 h-4" />
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 sm:gap-5 md:gap-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                <Building2 className="w-7 h-7" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-gray-900">{entities.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Entities</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 ring-1 ring-inset ring-accent-100">
                <DollarSign className="w-7 h-7" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-gray-900">
                ${Math.round(totalAmount / entities.length).toLocaleString()}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Avg per Entity</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-100">
                <FileText className="w-7 h-7" />
              </div>
              <p className="font-display text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-gray-900">
                {entityData['Unassigned']?.expenseCount || 0}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Unassigned Expenses</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};