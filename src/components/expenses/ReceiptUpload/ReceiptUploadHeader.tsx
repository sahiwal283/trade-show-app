/**
 * ReceiptUploadHeader Component
 * 
 * Header section with back button and title.
 */

import React from 'react';
import { ArrowLeft, X } from 'lucide-react';

interface ReceiptUploadHeaderProps {
  onCancel: () => void;
}

export const ReceiptUploadHeader: React.FC<ReceiptUploadHeaderProps> = ({ onCancel }) => {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center space-x-4">
        <button
          onClick={onCancel}
          className="btn-ghost tap-target p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Expenses
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-stone-900">Receipt Scanner</h1>
          <p className="mt-0.5 text-sm text-stone-500">Upload your receipt for automatic data extraction</p>
        </div>
      </div>
      <button
        onClick={onCancel}
        className="btn-ghost tap-target p-2"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

