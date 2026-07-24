import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Expense } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { CollapsibleCard } from './CollapsibleCard';

interface ExpenseChartProps {
  expenses: Expense[];
}

export const ExpenseChart: React.FC<ExpenseChartProps> = ({ expenses }) => {
  // Monthly data with expense counts
  const monthlyData = expenses.reduce(
    (acc, expense) => {
      const month = expense.date.substring(0, 7); // YYYY-MM
      if (!acc[month]) {
        acc[month] = { amount: 0, count: 0 };
      }
      acc[month].amount += expense.amount;
      acc[month].count += 1;
      return acc;
    },
    {} as Record<string, { amount: number; count: number }>
  );

  const monthlyEntries = Object.entries(monthlyData).sort();

  return (
    <div className="space-y-6">
      {/* Monthly Trend — collapsed by default on phones
          (category breakdown now lives in WhoPaidBreakdown, split by entity) */}
      <CollapsibleCard
        title="Monthly Spending Trend"
        subtitle={monthlyEntries.length > 1 ? 'Visual comparison across months' : undefined}
        icon={BarChart3}
        iconClassName="bg-brand-50 text-brand-600 ring-brand-100"
      >
        {monthlyEntries.length > 0 ? (
          <div className="space-y-6">
            {/* Visual Bar Chart — scrolls horizontally inside its own container on
                phones (min bar width per month) instead of squeezing the page */}
            <div className="relative h-80 overflow-x-auto sm:overflow-x-visible">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 bottom-12 w-12 flex flex-col justify-between text-[10px] font-medium tabular-nums text-stone-400">
                {[...Array(5)].map((_, i) => {
                  const maxMonthly = Math.max(...monthlyEntries.map(([, d]) => d.amount));
                  const value = maxMonthly * (1 - i * 0.25);
                  return (
                    <div key={i} className="text-right pr-2">
                      ${(value / 1000).toFixed(1)}k
                    </div>
                  );
                })}
              </div>

              {/* Chart area */}
              <div className="ml-12 h-full w-max min-w-full sm:w-auto sm:min-w-0 flex items-end justify-around gap-4 pb-12 border-l-2 border-b-2 border-stone-200">
                {/* Bars */}
                {monthlyEntries.map(([month, data], index) => {
                  const maxMonthly = Math.max(...monthlyEntries.map(([, d]) => d.amount));
                  const heightPercentage = Math.max((data.amount / maxMonthly) * 100, 5); // Min 5% height
                  const monthLabel = formatLocalDate(month + '-01', { month: 'short' });

                  // Calculate trend
                  let trend: 'up' | 'down' | 'flat' = 'flat';
                  if (index > 0) {
                    const prevAmount = monthlyEntries[index - 1][1].amount;
                    const change = data.amount - prevAmount;
                    if (Math.abs(change / prevAmount) < 0.01) {
                      trend = 'flat';
                    } else if (change > 0) {
                      trend = 'up';
                    } else {
                      trend = 'down';
                    }
                  }

                  const barColor =
                    trend === 'up'
                      ? 'from-red-400 to-red-600'
                      : trend === 'down'
                        ? 'from-accent-400 to-accent-600'
                        : 'from-brand-400 to-brand-600';

                  // max-w keeps sparse data (1-2 months) from rendering as a
                  // wall-to-wall slab; justify-around centers the columns
                  return (
                    <div
                      key={month}
                      className="flex-1 min-w-[2.5rem] max-w-28 sm:min-w-0 flex flex-col items-center justify-end h-full group relative"
                    >
                      {/* Hover tooltip */}
                      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap pointer-events-none z-10 shadow-elevation-3">
                        <div className="font-semibold">
                          {formatLocalDate(month + '-01', { year: 'numeric', month: 'long' })}
                        </div>
                        <div className="text-stone-200 mt-1">${data.amount.toLocaleString()}</div>
                        <div className="text-stone-400 text-[10px]">
                          {data.count} expense{data.count !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Trend indicator above bar */}
                      {index > 0 && (
                        <div className="mb-1">
                          {trend === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
                          {trend === 'down' && <TrendingDown className="w-3 h-3 text-accent-500" />}
                          {trend === 'flat' && <Minus className="w-3 h-3 text-stone-400" />}
                        </div>
                      )}

                      {/* Bar */}
                      <div
                        className={`w-full bg-gradient-to-t ${barColor} rounded-t-lg cursor-pointer transition-all duration-500 hover:opacity-80 shadow-md`}
                        style={{ height: `${heightPercentage}%` }}
                      />

                      {/* Month label */}
                      <div className="absolute -bottom-8 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                        {monthLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-stone-200">
              <div className="text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                  Total
                </div>
                <div className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  ${monthlyEntries.reduce((sum, [, data]) => sum + data.amount, 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                  Average
                </div>
                <div className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  $
                  {(
                    monthlyEntries.reduce((sum, [, data]) => sum + data.amount, 0) /
                    monthlyEntries.length
                  ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">
                  Months
                </div>
                <div className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  {monthlyEntries.length}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500">No monthly data available</p>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
};
