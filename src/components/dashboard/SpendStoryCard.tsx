/**
 * SpendStoryCard Component
 *
 * The spend story for the hero show: oversized spend numeral against
 * budget, pace, spend-by-day chart, category mix, and team-on-floor.
 */

import { SpendByDayChart } from './SpendByDayChart';
import { CategoryTotal, SpendPoint } from './hooks/useShowDashboard';
import { money } from './format';

interface SpendStoryCardProps {
  spent: number;
  budget: number;
  budgetPct: number;
  dailyPace: number;
  isLive: boolean;
  spendByDay: SpendPoint[];
  categories: CategoryTotal[];
  teamCount: number;
  receiptsToday: number;
  /** Budget comparison only makes sense against show-wide spend, so it's
   *  hidden for roles whose data is scoped to their own receipts. */
  showBudget: boolean;
}

export function SpendStoryCard({
  spent,
  budget,
  budgetPct,
  dailyPace,
  isLive,
  spendByDay,
  categories,
  teamCount,
  receiptsToday,
  showBudget,
}: SpendStoryCardProps) {
  const overBudget = budget > 0 && spent > budget;

  return (
    <section aria-label="Spend story" className="card p-5 md:p-6">
      {!showBudget && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
          Your spend
        </p>
      )}
      {/* Headline numbers */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-4xl font-bold tracking-tight text-stone-900 md:text-5xl">
          {money(spent)}
        </span>
        {showBudget && (budget > 0 ? (
          <span className={`text-sm font-semibold ${overBudget ? 'text-red-600' : 'text-accent-600'}`}>
            {budgetPct}% of {money(budget)}
          </span>
        ) : (
          <span className="text-sm font-medium text-stone-400">no budget set</span>
        ))}
        {isLive && dailyPace > 0 && (
          <span className="ml-auto text-xs text-stone-400">
            {money(dailyPace)}/day pace
          </span>
        )}
      </div>

      {/* Budget progress */}
      {showBudget && budget > 0 && (
        <div
          role="progressbar"
          aria-valuenow={Math.min(budgetPct, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Budget used"
          className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"
        >
          <div
            className={`h-full rounded-full ${
              overBudget
                ? 'bg-gradient-to-r from-amber-500 to-red-500'
                : 'bg-gradient-to-r from-brand-600 to-accent-500'
            }`}
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
      )}

      {/* Spend by day */}
      <p className="mb-1 mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
        Spend by day
      </p>
      <SpendByDayChart points={spendByDay} />

      {/* Category mix + team */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-stone-100 pt-4">
        {categories.length === 0 && (
          <p className="text-xs text-stone-400">No expenses yet for this show.</p>
        )}
        {categories.map(c => (
          <div key={c.name}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              {c.name}
            </p>
            <p className="text-sm font-bold text-stone-900">{money(c.total)}</p>
          </div>
        ))}
        {teamCount > 0 && (
          <div className="sm:ml-auto">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              Team on floor
            </p>
            <p className="text-sm font-bold text-stone-900">
              {teamCount} {teamCount === 1 ? 'person' : 'people'}
              {isLive && (
                <span className="font-medium text-stone-400">
                  {' '}
                  · {receiptsToday} receipt{receiptsToday === 1 ? '' : 's'} today
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
