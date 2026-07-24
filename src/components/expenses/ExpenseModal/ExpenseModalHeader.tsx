/**
 * ExpenseModalHeader Component
 * 
 * Extracted from ExpenseSubmission.tsx (was lines 1082-1098, ~20 lines)
 * Modal header with event name and close button
 */

import React from 'react';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import { X } from 'lucide-react';


interface ExpenseModalHeaderProps {
  eventName: string | undefined;
  onClose: () => void;
}

export const ExpenseModalHeader: React.FC<ExpenseModalHeaderProps> = ({ eventName, onClose }) => {
  useEscapeKey(onClose);
  return (
    <div className="relative overflow-hidden sticky top-0 z-10 flex items-center justify-between rounded-t-xl bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 px-4 py-3 text-white sm:px-6 sm:py-4">
      <div className="min-w-0">
        <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight">Expense Details</h2>
        <p className="truncate text-sm text-brand-100">{eventName || 'N/A'}</p>
      </div>
      <button
        onClick={onClose}
        className="tap-target shrink-0 rounded-lg p-2 transition-colors duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

