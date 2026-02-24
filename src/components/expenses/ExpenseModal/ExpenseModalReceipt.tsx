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
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Receipt className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">Receipt</h3>
        </div>
        <button
          onClick={() => setShowFullReceipt(!showFullReceipt)}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center space-x-1"
        >
          <Eye className="w-4 h-4" />
          <span>{showFullReceipt ? 'Hide' : 'View Full Size'}</span>
        </button>
      </div>

      {showFullReceipt && (
        <div className="bg-white rounded-lg p-4 border-2 border-gray-200 shadow-md">
          {pdfReceipt ? (
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-lg bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-300 text-gray-700 no-underline"
            >
              <FileText className="w-14 h-14 text-red-600" />
              <span className="font-medium">PDF Receipt</span>
              <span className="text-sm text-gray-500">Click to open in a new tab</span>
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

