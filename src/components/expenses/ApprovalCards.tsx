import React from 'react';
import { AlertTriangle, Building2, CreditCard, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { Expense } from '../../App';

interface ApprovalCardsProps {
  expenses: Expense[];
}

interface KpiCardProps {
  well: string;
  icon: React.ReactNode;
  value: string;
  label: string;
  context: React.ReactNode;
}

// KPI card anatomy: tinted icon well, display-face numeral, micro-label,
// and a quiet context line (trend or what-to-do-next).
function KpiCard({ well, icon, value, label, context }: KpiCardProps) {
  return (
    <div className="card flex flex-col items-start gap-2 p-3 sm:flex-row sm:gap-3 sm:p-4">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:h-10 sm:w-10 ${well}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold tracking-tight tabular-nums text-stone-900 sm:text-xl md:text-2xl">
          {value}
        </p>
        <p className="micro-label">{label}</p>
        <div className="mt-0.5 text-[11px] text-stone-400 sm:mt-1 sm:text-xs">{context}</div>
      </div>
    </div>
  );
}

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const ApprovalCards: React.FC<ApprovalCardsProps> = ({ expenses }) => {
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

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <KpiCard
        well="bg-brand-50 text-brand-600 ring-brand-100"
        icon={<DollarSign className="h-5 w-5" />}
        value={money(totalSpent)}
        label="Total Spent"
        context={
          monthDeltaPct !== null ? (
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
          )
        }
      />
      <KpiCard
        well="bg-amber-50 text-amber-600 ring-amber-100"
        icon={<AlertTriangle className="h-5 w-5" />}
        value={String(pendingExpenses.length)}
        label="Pending Approval"
        context={
          pendingExpenses.length > 0 ? <>{money(pendingTotal)} awaiting review</> : <>All caught up</>
        }
      />
      <KpiCard
        well="bg-orange-50 text-orange-600 ring-orange-100"
        icon={<CreditCard className="h-5 w-5" />}
        value={String(pendingReimbursements.length)}
        label="Reimbursements"
        context={
          pendingReimbursements.length > 0 ? (
            <>{money(reimbursementTotal)} to pay out</>
          ) : (
            <>No actions required</>
          )
        }
      />
      <KpiCard
        well="bg-red-50 text-red-600 ring-red-100"
        icon={<Building2 className="h-5 w-5" />}
        value={String(unassignedEntities.length)}
        label="Unassigned"
        context={unassignedEntities.length > 0 ? <>Need a Zoho entity</> : <>All assigned</>}
      />
    </div>
  );
};
