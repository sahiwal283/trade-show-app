/**
 * OcrFailedState Component
 * 
 * Error state displayed when OCR processing fails.
 */

import React from 'react';
import { AlertCircle, Scan, FileText } from 'lucide-react';
import { ReceiptData } from '../../../types/types';
import { getTodayLocalDateString } from '../../../utils/dateUtils';

interface OcrFailedStateProps {
  selectedFile: File | null;
  onRetry: () => void;
  onManualEntry: (defaultData: ReceiptData) => void;
}

export const OcrFailedState: React.FC<OcrFailedStateProps> = ({
  selectedFile,
  onRetry,
  onManualEntry
}) => {
  const handleManualEntry = () => {
    if (!selectedFile) return;
    
    const defaultData: ReceiptData = {
      merchant: '',
      total: '',
      date: getTodayLocalDateString(),
      category: 'Other',
      confidence: 0,
      ocrText: '',
      file: selectedFile
    };
    onManualEntry(defaultData);
  };

  return (
    <div className="rounded-card bg-orange-50 p-6 ring-1 ring-inset ring-orange-200/70">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-orange-900 mb-2">OCR Processing Failed</h3>
          <p className="text-sm text-orange-800 mb-4">
            We couldn't automatically extract data from your receipt. This might be due to image quality, file format, or service availability.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRetry}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-elevation-1 transition-colors duration-150 hover:bg-orange-700 active:translate-y-px focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 lg:min-h-0"
            >
              <Scan className="w-4 h-4" />
              <span>Try OCR Again</span>
            </button>
            <button
              onClick={handleManualEntry}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-elevation-1 transition-colors duration-150 hover:bg-orange-50 active:translate-y-px focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 lg:min-h-0"
            >
              <FileText className="w-4 h-4" />
              <span>Enter Details Manually</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

