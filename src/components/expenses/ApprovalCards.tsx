import React from 'react';
import { AlertTriangle, CreditCard, Building2, DollarSign } from 'lucide-react';
import { Expense } from '../../App';

interface ApprovalCardsProps {
  expenses: Expense[];
}

export const ApprovalCards: React.FC<ApprovalCardsProps> = ({ expenses }) => {
  // Calculate stats
  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const pendingReimbursements = expenses.filter(
    e => e.reimbursementRequired && e.reimbursementStatus === 'pending review'
  );
  const unassignedEntities = expenses.filter(e => !e.zohoEntity);
  const totalPendingAmount = pendingExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4">
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        {/* Total Amount */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-md flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">${totalPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-gray-500">Pending Total</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Pending Approval */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-md flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-600">{pendingExpenses.length}</p>
            <p className="text-xs text-gray-500">Pending Approval</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Reimbursements */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-orange-600 rounded-md flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-orange-600">{pendingReimbursements.length}</p>
            <p className="text-xs text-gray-500">Reimbursements</p>
          </div>
        </div>

        <div className="hidden sm:block w-px h-10 bg-gray-200" />

        {/* Unassigned Entities */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-red-600 rounded-md flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{unassignedEntities.length}</p>
            <p className="text-xs text-gray-500">Unassigned</p>
          </div>
        </div>
      </div>
    </div>
  );
};

