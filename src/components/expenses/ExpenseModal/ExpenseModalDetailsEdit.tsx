/**
 * ExpenseModalDetailsEdit Component
 * 
 * Extracted and SIMPLIFIED from ExpenseSubmission.tsx (was lines 1203-1316, ~113 lines)
 * Editable form for expense details
 * 
 * SIMPLIFICATION: Separated from view mode, uses cleaner prop interface
 */

import React, { useState, useRef } from 'react';
import { Edit2, Upload, Loader2, Receipt, X, AlertCircle, FileText } from 'lucide-react';
import { isPdfReceiptUrl } from '../../../utils/fileValidation';
import { ConfirmModal } from '../../common/ConfirmModal';

interface EditFormData {
  tradeShowId: string;
  date: string;
  amount: number;
  category: string;
  merchant: string;
  cardUsed: string;
  location?: string;
  description?: string;
  reimbursementRequired: boolean;
}

interface EventOption {
  id: string;
  name: string;
}

interface ExpenseModalDetailsEditProps {
  formData: EditFormData;
  onChange: (updates: Partial<EditFormData>) => void;
  events: EventOption[];
  uniqueCategories: string[];
  uniqueCards: string[];
  onCancel: () => void;
  onSave: () => void;
  receiptUrl?: string;
  onReceiptUpload?: (file: File) => Promise<void>;
}

export const ExpenseModalDetailsEdit: React.FC<ExpenseModalDetailsEditProps> = ({
  formData,
  onChange,
  events,
  uniqueCategories,
  uniqueCards,
  onCancel,
  onSave,
  receiptUrl,
  onReceiptUpload,
}) => {
  const [showReplaceWarning, setShowReplaceWarning] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please upload an image file (JPEG, PNG, GIF) or PDF');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    setUploadError(null);
    setUploadingReceipt(true);

    try {
      if (onReceiptUpload) {
        await onReceiptUpload(file);
        // Clear any previous errors on success
        setUploadError(null);
      }
    } catch (error) {
      console.error('[ExpenseModalDetailsEdit] Error uploading receipt:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload receipt');
    } finally {
      setUploadingReceipt(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddReceipt = () => {
    fileInputRef.current?.click();
  };

  const handleReplaceReceipt = () => {
    setShowReplaceWarning(true);
  };

  const handleConfirmReplace = () => {
    setShowReplaceWarning(false);
    fileInputRef.current?.click();
  };

  // Construct receipt image URL
  const receiptImageUrl = receiptUrl 
    ? receiptUrl.replace(/^\/uploads/, '/api/uploads')
    : null;

  return (
    <div className="space-y-4">
      {/* Edit Mode Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-800 flex items-center gap-2">
          <Edit2 className="w-4 h-4" />
          <span>Editing expense - make changes below and click Save</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Event - editable to correct wrong event assignment */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Event *</label>
          <select
            value={formData.tradeShowId || ''}
            onChange={(e) => onChange({ tradeShowId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select event</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
          <input
            type="date"
            value={formData.date || ''}
            onChange={(e) => onChange({ date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
          <input
            type="number"
            step="0.01"
            value={formData.amount || 0}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
          <select
            value={formData.category || ''}
            onChange={(e) => onChange({ category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select category</option>
            {uniqueCategories.map((cat, idx) => (
              <option key={idx} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Merchant */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Merchant *</label>
          <input
            type="text"
            value={formData.merchant || ''}
            onChange={(e) => onChange({ merchant: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Card Used */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Card Used *</label>
          <select
            value={formData.cardUsed || ''}
            onChange={(e) => onChange({ cardUsed: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select card used</option>
            {uniqueCards.map((card, idx) => (
              <option key={idx} value={card}>
                {card}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={formData.location || ''}
            onChange={(e) => onChange({ location: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Optional additional details"
        />
      </div>

      {/* Reimbursement */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="edit-reimbursement"
          checked={formData.reimbursementRequired || false}
          onChange={(e) => onChange({ reimbursementRequired: e.target.checked })}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="edit-reimbursement" className="text-sm font-medium text-gray-700">
          Reimbursement Required (Personal Card)
        </label>
      </div>

      {/* Receipt Management */}
      {onReceiptUpload && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">Receipt</label>
          
          {/* Current Receipt Display */}
          {receiptImageUrl ? (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-purple-600" />
                    <span className="text-sm font-medium text-gray-900">Current Receipt</span>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  {isPdfReceiptUrl(receiptUrl ?? '') ? (
                    <a
                      href={receiptImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-2 py-6 rounded bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 text-gray-700 no-underline"
                    >
                      <FileText className="w-10 h-10 text-red-600" />
                      <span className="text-sm font-medium">PDF Receipt – click to open</span>
                    </a>
                  ) : (
                    <img
                      src={receiptImageUrl}
                      alt="Current receipt"
                      className="w-full h-auto max-h-48 object-contain rounded"
                    />
                  )}
                </div>
              </div>
              
              {/* Replace Button */}
              <button
                onClick={handleReplaceReceipt}
                disabled={uploadingReceipt}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingReceipt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Replace Receipt</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Add Receipt Button */
            <button
              onClick={handleAddReceipt}
              disabled={uploadingReceipt}
              className="w-full px-4 py-2 border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 text-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingReceipt ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Add Receipt</span>
                </>
              )}
            </button>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium">Upload Failed</p>
                <p className="text-xs text-red-700 mt-1">{uploadError}</p>
              </div>
              <button
                onClick={() => setUploadError(null)}
                className="p-1 hover:bg-red-100 rounded transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
            </div>
          )}

          {/* File Input (Hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Replace Receipt Warning Modal */}
      <ConfirmModal
        isOpen={showReplaceWarning}
        title="Replace Receipt"
        message="Are you sure you want to replace the current receipt? This action cannot be undone."
        confirmText="Confirm Replace"
        cancelText="Cancel"
        variant="warning"
        onConfirm={handleConfirmReplace}
        onCancel={() => setShowReplaceWarning(false)}
      />
    </div>
  );
};

