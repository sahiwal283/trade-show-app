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
    <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-xl border-t border-gray-200 flex justify-end space-x-3">
      {!isEditingExpense ? (
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
          {expenseId && onDownloadPDF && (
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      <span>Download Expense</span>
                    </>
                  )}
                </button>
                
                {/* Browser Compatibility Tooltip */}
                <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                  <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl">
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
              
              {/* Compatibility Note (always visible, small text) */}
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Info className="w-3 h-3" />
                <span className="hidden sm:inline">Chrome only</span>
              </div>
            </div>
          )}
          <button
            onClick={onEdit}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
          >
            Edit Expense
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || saveDisabled}
            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg hover:from-emerald-700 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

