/**
 * ExpenseModalDetailsView Component
 * 
 * Extracted and SIMPLIFIED from ExpenseSubmission.tsx (was lines 1128-1201, ~73 lines)
 * Read-only view of expense details with clean icon layout
 * 
 * SIMPLIFICATION: Separated from edit mode to eliminate complex conditional rendering
 */

import React from 'react';
import { Calendar, DollarSign, FileText, Receipt, CreditCard, MapPin, User } from 'lucide-react';
import { Expense } from '../../../App';
import { formatLocalDate } from '../../../utils/dateUtils';

interface ExpenseModalDetailsViewProps {
  expense: Expense;
}

interface DetailItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bgColor: string;
  iconColor: string;
}

const DetailItem: React.FC<DetailItemProps> = ({ icon, label, value, bgColor, iconColor }) => (
  <div className="flex items-start gap-3">
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 ${bgColor}`}
    >
      <div className={iconColor}>{icon}</div>
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`mt-0.5 font-semibold text-gray-900 ${
          label === 'Amount' ? 'font-display text-xl tracking-tight tabular-nums' : 'text-base'
        }`}
      >
        {value}
      </p>
    </div>
  </div>
);

export const ExpenseModalDetailsView: React.FC<ExpenseModalDetailsViewProps> = ({ expense }) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetailItem
          icon={<Calendar className="w-5 h-5" />}
          label="Date"
          value={formatLocalDate(expense.date)}
          bgColor="bg-brand-50"
          iconColor="text-brand-600"
        />
        <DetailItem
          icon={<DollarSign className="w-5 h-5" />}
          label="Amount"
          value={`$${expense.amount.toFixed(2)}`}
          bgColor="bg-accent-50"
          iconColor="text-accent-600"
        />
        <DetailItem
          icon={<FileText className="w-5 h-5" />}
          label="Category"
          value={expense.category}
          bgColor="bg-purple-50"
          iconColor="text-purple-600"
        />
        <DetailItem
          icon={<Receipt className="w-5 h-5" />}
          label="Merchant"
          value={expense.merchant}
          bgColor="bg-orange-50"
          iconColor="text-orange-600"
        />
        <DetailItem
          icon={<CreditCard className="w-5 h-5" />}
          label="Card Used"
          value={expense.cardUsed || 'N/A'}
          bgColor="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        {expense.location && (
          <DetailItem
            icon={<MapPin className="w-5 h-5" />}
            label="Location"
            value={expense.location}
            bgColor="bg-red-50"
            iconColor="text-red-600"
          />
        )}
        {expense.user_name && (
          <DetailItem
            icon={<User className="w-5 h-5" />}
            label="Submitted By"
            value={expense.user_name}
            bgColor="bg-teal-50"
            iconColor="text-teal-600"
          />
        )}
      </div>

      {/* Description */}
      {expense.description && (
        <div className="rounded-lg bg-gray-50/80 p-4 ring-1 ring-inset ring-gray-200/70">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Description</p>
          <p className="text-sm text-gray-900">{expense.description}</p>
        </div>
      )}
    </>
  );
};

