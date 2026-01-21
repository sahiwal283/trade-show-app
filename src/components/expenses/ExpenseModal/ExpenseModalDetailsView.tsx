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
  <div className="flex items-start space-x-3">
    <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
      <div className={iconColor}>{icon}</div>
    </div>
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 text-xl" style={{ fontSize: label === 'Amount' ? '1.25rem' : '1rem' }}>
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
          bgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <DetailItem
          icon={<DollarSign className="w-5 h-5" />}
          label="Amount"
          value={`$${expense.amount.toFixed(2)}`}
          bgColor="bg-emerald-100"
          iconColor="text-emerald-600"
        />
        <DetailItem
          icon={<FileText className="w-5 h-5" />}
          label="Category"
          value={expense.category}
          bgColor="bg-purple-100"
          iconColor="text-purple-600"
        />
        <DetailItem
          icon={<Receipt className="w-5 h-5" />}
          label="Merchant"
          value={expense.merchant}
          bgColor="bg-orange-100"
          iconColor="text-orange-600"
        />
        <DetailItem
          icon={<CreditCard className="w-5 h-5" />}
          label="Card Used"
          value={expense.cardUsed || 'N/A'}
          bgColor="bg-indigo-100"
          iconColor="text-indigo-600"
        />
        {expense.location && (
          <DetailItem
            icon={<MapPin className="w-5 h-5" />}
            label="Location"
            value={expense.location}
            bgColor="bg-red-100"
            iconColor="text-red-600"
          />
        )}
        {expense.user_name && (
          <DetailItem
            icon={<User className="w-5 h-5" />}
            label="Submitted By"
            value={expense.user_name}
            bgColor="bg-teal-100"
            iconColor="text-teal-600"
          />
        )}
      </div>

      {/* Description */}
      {expense.description && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-2">Description</p>
          <p className="text-gray-900">{expense.description}</p>
        </div>
      )}
    </>
  );
};

