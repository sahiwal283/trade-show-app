/**
 * ExpenseModalReceipt Component
 *
 * Displays receipt image or PDF (image inline; PDF as "View PDF" link since img cannot render PDFs).
 */

import React, { useState } from 'react';
import { Receipt, Eye, FileText } from 'lucide-react';
import { isPdfReceiptUrl } from '../../../utils/fileValidation';

interface ExpenseModalReceiptProps {
  receiptUrl: string;
}

export const ExpenseModalReceipt: React.FC<ExpenseModalReceiptProps> = ({ receiptUrl }) => {
  const [showFullReceipt, setShowFullReceipt] = useState(true);
  const displayUrl = receiptUrl.replace(/^\/uploads/, '/api/uploads');

  if (!receiptUrl) return null;

  const pdfReceipt = isPdfReceiptUrl(receiptUrl);

  return (
    <div className="rounded-card bg-stone-50/80 p-6 ring-1 ring-inset ring-stone-200/70">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <Receipt className="w-4 h-4" />
          </span>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Receipt</h3>
        </div>
        <button
          onClick={() => setShowFullReceipt(!showFullReceipt)}
          className="card-link flex min-h-[44px] items-center gap-1 lg:min-h-0"
        >
          <Eye className="w-4 h-4" />
          <span>{showFullReceipt ? 'Hide' : 'View Full Size'}</span>
        </button>
      </div>

      {showFullReceipt && (
        <div className="card rounded-lg p-4">
          {pdfReceipt ? (
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-stone-700 no-underline transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50/40"
            >
              <FileText className="w-14 h-14 text-red-600" />
              <span className="font-medium">PDF Receipt</span>
              <span className="text-sm text-stone-500">Click to open in a new tab</span>
            </a>
          ) : (
            <img
              src={displayUrl}
              alt="Receipt"
              className="w-full h-auto max-h-[600px] object-contain rounded-lg"
            />
          )}
        </div>
      )}
    </div>
  );
};

