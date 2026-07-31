/**
 * ApprovalCards Component
 *
 * Compact summary band above the expenses table. Total Spent is the
 * headline (display numeral + month-over-month delta); Pending Approval,
 * Reimbursements, and Unassigned are quiet hairline-separated secondary
 * stats. Stats with a matching filter are clickable and pre-filter the
 * table; zero-value stats are hidden entirely.
 */

import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Expense } from '../../App';

interface ApprovalCardsProps {
  expenses: Expense[];
  /** Applies the pending status filter to the table below. */
  onFilterPending?: () => void;
  /** Applies the reimbursement-required filter to the table below. */
  onFilterReimbursements?: () => void;
}

interface SecondaryStatProps {
  label: string;
  value: number;
  context: string;
  onClick?: () => void;
}

// Quiet stat anatomy borrowed from SpendStoryCard: micro-label, bold
// numeral, muted context line. Clickable stats get hover/focus states.
function SecondaryStat({ label, value, context, onClick }: SecondaryStatProps) {
  const body = (
    <>
      <p className="micro-label">{label}</p>
      <p className="font-display text-lg font-bold tabular-nums tracking-tight text-stone-900 sm:text-xl">
        {value}
      </p>
      <p className="text-[11px] text-stone-400">{context}</p>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 px-4 py-1 first:pl-0 sm:px-5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 rounded-lg px-4 py-1 text-left transition-colors duration-150 first:pl-0 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-5"
      title={`Filter table: ${label}`}
    >
      {body}
    </button>
  );
}

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const ApprovalCards: React.FC<ApprovalCardsProps> = ({
  expenses,
  onFilterPending,
  onFilterReimbursements,
}) => {
  const counted = expenses.filter(e => e.status !== 'rejected');
  const totalSpent = counted.reduce((sum, e) => sum + (e.amount || 0), 0);

  const thisMonth = monthKey(0);
  const lastMonth = monthKey(-1);
  const thisMonthTotal = counted
    .filter(e => e.date.startsWith(thisMonth))
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const lastMonthTotal = counted
    .filter(e => e.date.startsWith(lastMonth))
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const monthDeltaPct =
    lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const pendingTotal = pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const pendingReimbursements = expenses.filter(
    e => e.reimbursementRequired && e.reimbursementStatus === 'pending review'
  );
  const reimbursementTotal = pendingReimbursements.reduce((sum, e) => sum + (e.amount || 0), 0);
  const unassignedEntities = expenses.filter(e => !e.zohoEntity);

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hasSecondaryStats =
    pendingExpenses.length > 0 || pendingReimbursements.length > 0 || unassignedEntities.length > 0;

  return (
    <section aria-label="Expense summary" className="card p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Headline: total spent */}
        <div className="min-w-0">
          <p className="micro-label">Total Spent</p>
          <p className="font-display text-3xl font-bold tracking-tight tabular-nums text-stone-900 md:text-4xl">
            {money(totalSpent)}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {monthDeltaPct !== null ? (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  monthDeltaPct > 0 ? 'text-red-600' : 'text-accent-600'
                }`}
              >
                {monthDeltaPct > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {Math.abs(monthDeltaPct)}% vs last month
              </span>
            ) : (
              <>across {counted.length} expense{counted.length === 1 ? '' : 's'}</>
            )}
          </p>
        </div>

        {/* Secondary stats — hairline separated, zero-value stats hidden */}
        {hasSecondaryStats && (
          <div className="flex flex-wrap items-stretch divide-x divide-stone-100 border-t border-stone-100 pt-3 lg:border-t-0 lg:pt-0">
            {pendingExpenses.length > 0 && (
              <SecondaryStat
                label="Pending Approval"
                value={pendingExpenses.length}
                context={`${money(pendingTotal)} awaiting review`}
                onClick={onFilterPending}
              />
            )}
            {pendingReimbursements.length > 0 && (
              <SecondaryStat
                label="Reimbursements"
                value={pendingReimbursements.length}
                context={`${money(reimbursementTotal)} to pay out`}
                onClick={onFilterReimbursements}
              />
            )}
            {unassignedEntities.length > 0 && (
              <SecondaryStat
                label="Unassigned"
                value={unassignedEntities.length}
                context="Need a Zoho entity"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
};
