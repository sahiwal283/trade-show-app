import React from 'react';
import { BarChart3, PieChart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Expense, TradeShow } from '../../App';
import { formatLocalDate } from '../../utils/dateUtils';
import { CATEGORY_COLORS } from '../../constants/appConstants';

interface ExpenseChartProps {
  expenses: Expense[];
  events: TradeShow[];
  categoryBreakdown: Record<string, number>;
  onTradeShowClick?: (eventId: string) => void;
}

export const ExpenseChart: React.FC<ExpenseChartProps> = ({ 
  expenses, 
  events, 
  categoryBreakdown,
  onTradeShowClick
}) => {
  const categories = Object.keys(categoryBreakdown);
  const maxAmount = Math.max(...Object.values(categoryBreakdown));

  // Monthly data with expense counts
  const monthlyData = expenses.reduce((acc, expense) => {
    const month = expense.date.substring(0, 7); // YYYY-MM
    if (!acc[month]) {
      acc[month] = { amount: 0, count: 0 };
    }
    acc[month].amount += expense.amount;
    acc[month].count += 1;
    return acc;
  }, {} as Record<string, { amount: number; count: number }>);

  const monthlyEntries = Object.entries(monthlyData).sort();

  const eventBreakdown = expenses.reduce((acc, expense) => {
    const event = events.find(e => e.id === expense.tradeShowId);
    const eventName = event?.name || 'No Event';
    const eventId = event?.id || 'no-event';
    acc[eventName] = { amount: (acc[eventName]?.amount || 0) + expense.amount, eventId };
    return acc;
  }, {} as Record<string, { amount: number; eventId: string }>);

  // Define chart bar colors (must be explicit for Tailwind)
  const CHART_BAR_COLORS: Record<string, string> = {
    // Legacy categories
    'Flights': 'bg-blue-500',
    'Hotels': 'bg-emerald-500',
    'Meals': 'bg-orange-500',
    'Supplies': 'bg-purple-500',
    'Transportation': 'bg-yellow-500',
    'Marketing Materials': 'bg-pink-500',
    'Shipping': 'bg-indigo-500',
    
    // Current categories
    'Booth / Marketing / Tools': 'bg-purple-500',
    'Travel - Flight': 'bg-blue-500',
    'Accommodation - Hotel': 'bg-emerald-500',
    'Transportation - Uber / Lyft / Others': 'bg-yellow-500',
    'Parking Fees': 'bg-cyan-500',
    'Rental - Car / U-haul': 'bg-teal-500',
    'Meal and Entertainment': 'bg-orange-500',
    'Gas / Fuel': 'bg-amber-500',
    'Show Allowances - Per Diem': 'bg-lime-500',
    'Model': 'bg-fuchsia-500',
    'Shipping Charges': 'bg-indigo-500',
    'Other': 'bg-gray-500'
  };

  const getCategoryColor = (category: string) => {
    return CHART_BAR_COLORS[category] || 'bg-rose-500';
  };

  return (
    <div className="space-y-6">
      {/* Event Breakdown - MOVED TO TOP */}
      <div className="card p-3 sm:p-5 md:p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Expenses by Trade Show</h3>
            <span className="chip bg-stone-50 px-2 py-1 text-xs text-stone-500 ring-stone-200">Click to view details</span>
          </div>
        </div>
        
        {Object.keys(eventBreakdown).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {Object.entries(eventBreakdown)
              .sort(([, a], [, b]) => b.amount - a.amount)
              .map(([eventName, { amount, eventId }]) => {
                const maxEventAmount = Math.max(...Object.values(eventBreakdown).map(e => e.amount));
                const percentage = (amount / maxEventAmount) * 100;
                
                return (
                  <div 
                    key={eventName} 
                    className="group cursor-pointer rounded-lg border border-stone-200/80 bg-white p-3 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:p-4"
                    onClick={() => onTradeShowClick?.(eventId)}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => e.key === 'Enter' && onTradeShowClick?.(eventId)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-900 truncate transition-colors group-hover:text-brand-700">
                          {eventName}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-stone-900">
                          ${amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-stone-100 rounded-full h-2 ring-1 ring-inset ring-stone-200/60">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-stone-500">
                        {expenses.filter(e => {
                          const event = events.find(ev => ev.id === e.tradeShowId);
                          return (event?.name || 'No Event') === eventName;
                        }).length} expenses
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500">No event data available</p>
          </div>
        )}
      </div>

      {/* Category and Monthly sections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 sm:gap-5 md:gap-6">
        {/* Category Breakdown */}
        <div className="card p-3 sm:p-5 md:p-6">
          <div className="mb-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Expenses by Category</h3>
          </div>
        
        {categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((category) => {
              const amount = categoryBreakdown[category];
              const percentage = (amount / maxAmount) * 100;
              
              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-900">{category}</span>
                    <span className="text-sm font-semibold tabular-nums text-stone-900">
                      ${amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-2 ring-1 ring-inset ring-stone-200/60">
                    <div
                      className={`h-2 rounded-full ${getCategoryColor(category)} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <PieChart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-500">No expense data available</p>
          </div>
        )}
      </div>

      {/* Monthly Trend - Visual Chart */}
      <div className="card p-3 sm:p-5 md:p-6">
        <div className="mb-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Monthly Spending Trend</h3>
          {monthlyEntries.length > 1 && (
            <p className="text-xs text-stone-500 mt-1">Visual comparison across months</p>
          )}
        </div>
        
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
                  
                  const barColor = trend === 'up'
                    ? 'from-red-400 to-red-600'
                    : trend === 'down'
                    ? 'from-accent-400 to-accent-600'
                    : 'from-brand-400 to-brand-600';
                  
                  return (
                    <div key={month} className="flex-1 min-w-[2.5rem] sm:min-w-0 flex flex-col items-center justify-end h-full group relative">
                      {/* Hover tooltip */}
                      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap pointer-events-none z-10 shadow-elevation-3">
                        <div className="font-semibold">{formatLocalDate(month + '-01', { year: 'numeric', month: 'long' })}</div>
                        <div className="text-stone-200 mt-1">${data.amount.toLocaleString()}</div>
                        <div className="text-stone-400 text-[10px]">{data.count} expense{data.count !== 1 ? 's' : ''}</div>
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
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">Total</div>
                <div className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  ${monthlyEntries.reduce((sum, [, data]) => sum + data.amount, 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">Average</div>
                <div className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900">
                  ${(monthlyEntries.reduce((sum, [, data]) => sum + data.amount, 0) / monthlyEntries.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400 mb-1">Months</div>
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
      </div>
      </div>
    </div>
  );
};