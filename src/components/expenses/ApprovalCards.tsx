import React from 'react';
import { AlertTriangle, CreditCard, Building2, DollarSign } from 'lucide-react';
import { Expense } from '../../App';

interface ApprovalCardsProps {
  expenses: Expense[];
}

// Stat-strip anatomy: soft tinted icon wells with an inset ring, uppercase
// micro-labels, and one brand hairline across the strip.
const approvalStats = {
  total: { well: 'bg-brand-50 text-brand-600 ring-brand-100', value: 'text-gray-900' },
  pending: { well: 'bg-amber-50 text-amber-600 ring-amber-100', value: 'text-amber-700' },
  reimbursements: { well: 'bg-orange-50 text-orange-600 ring-orange-100', value: 'text-orange-700' },
  unassigned: { well: 'bg-red-50 text-red-600 ring-red-100', value: 'text-red-700' },
};

export const ApprovalCards: React.FC<ApprovalCardsProps> = ({ expenses }) => {
  // Calculate stats
  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const pendingReimbursements = expenses.filter(
    e => e.reimbursementRequired && e.reimbursementStatus === 'pending review'
  );
  const unassignedEntities = expenses.filter(e => !e.zohoEntity);
  const totalPendingAmount = pendingExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="card relative overflow-hidden p-4 mb-4">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/60 via-accent-500/40 to-transparent"
      />
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        {/* Total Amount */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${approvalStats.total.well}`}>
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-display text-lg font-bold tracking-tight tabular-nums ${approvalStats.total.value}`}>
              ${totalPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pending Total</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Pending Approval */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${approvalStats.pending.well}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-display text-lg font-bold tracking-tight tabular-nums ${approvalStats.pending.value}`}>
              {pendingExpenses.length}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pending Approval</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Reimbursements */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${approvalStats.reimbursements.well}`}>
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-display text-lg font-bold tracking-tight tabular-nums ${approvalStats.reimbursements.value}`}>
              {pendingReimbursements.length}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reimbursements</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Unassigned Entities */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${approvalStats.unassigned.well}`}>
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className={`font-display text-lg font-bold tracking-tight tabular-nums ${approvalStats.unassigned.value}`}>
              {unassignedEntities.length}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Unassigned</p>
          </div>
        </div>
      </div>
    </div>
  );
};
