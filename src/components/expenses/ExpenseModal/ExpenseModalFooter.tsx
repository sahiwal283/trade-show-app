/**
 * ExpenseModalFooter Component
 * 
 * Extracted from ExpenseSubmission.tsx (was lines 1659-1710, ~62 lines)
 * Modal footer with Close/Edit/Download or Cancel/Save buttons
 */

import React, { useState, useMemo } from 'react';
import { CheckCircle, Loader2, Download, Info } from 'lucide-react';

interface ExpenseModalFooterProps {
  isEditingExpense: boolean;
  isSaving: boolean;
  expenseId?: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDownloadPDF?: (expenseId: string) => Promise<void>;
  /** When set while editing, Save is disabled (e.g. Zoho description over limit) */
  saveDisabled?: boolean;
}

export const ExpenseModalFooter: React.FC<ExpenseModalFooterProps> = ({
  isEditingExpense,
  isSaving,
  expenseId,
  onClose,
  onEdit,
  onCancel,
  onSave,
  onDownloadPDF,
  saveDisabled = false,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);

  // Detect if user is using Chrome
  const isChrome = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('chrome') && !userAgent.includes('edg') && !userAgent.includes('opr');
  }, []);

  const handleDownload = async () => {
    if (!expenseId || !onDownloadPDF) return;
    
    setIsDownloading(true);
    try {
      await onDownloadPDF(expenseId);
    } catch (error) {
      console.error('[ExpenseModalFooter] Error downloading PDF:', error);
      // Error handling is done in parent component via toast
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    // Phones: primary action first, full-width stacked buttons (no wrapped
    // orphans). Desktop (sm+): classic right-aligned row.
    <div className="sticky bottom-0 flex flex-col gap-2 rounded-b-none border-t border-stone-200 bg-stone-50/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 sm:rounded-b-xl sm:px-6 sm:py-4 sm:pb-4">
      {!isEditingExpense ? (
        <>
          <button
            onClick={onEdit}
            className="btn-primary order-1 w-full px-4 py-2 sm:order-3 sm:w-auto"
          >
            Edit Expense
          </button>
          {expenseId && onDownloadPDF && (
            <div className="order-2 flex w-full items-center gap-2 sm:w-auto">
              <div className="relative group flex-1 sm:flex-initial">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="btn-secondary w-full px-4 py-2 sm:w-auto"
                  aria-label="Download expense PDF"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </>
                  )}
                </button>

                {/* Browser Compatibility Tooltip */}
                <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                  <div className="rounded-lg bg-gray-900 p-3 text-xs text-white shadow-elevation-3">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-1">Browser Compatibility</p>
                        <p className="text-gray-300">
                          {isChrome
                            ? 'Works with Chrome. Support for other browsers coming soon.'
                            : 'Currently only works with Chrome. Support for other browsers coming soon.'}
                        </p>
                      </div>
                    </div>
                    {/* Tooltip arrow */}
                    <div className="absolute top-full right-4 -mt-1">
                      <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compatibility Note — labeled so the icon isn't an orphan */}
              <div className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
                <Info className="w-3 h-3" />
                <span>Chrome only</span>
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            className="btn-secondary order-3 w-full px-4 py-2 sm:order-1 sm:w-auto"
          >
            Close
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="btn-secondary order-2 w-full px-4 py-2 sm:order-1 sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || saveDisabled}
            className="btn-primary order-1 w-full px-6 py-2 sm:order-2 sm:w-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
};

