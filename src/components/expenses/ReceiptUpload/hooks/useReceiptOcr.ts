/**
 * useReceiptOcr Hook
 * 
 * Handles OCR processing logic for receipt upload.
 */

import { useState, useCallback } from 'react';
import { TokenManager } from '../../../../utils/api';
import { ReceiptData } from '../../../../types/types';
import { getTodayLocalDateString } from '../../../../utils/dateUtils';

interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;
}

interface FieldWarning {
  field: string;
  reason: string;
  severity: string;
  suggestedAction?: string;
}

interface UseReceiptOcrReturn {
  processing: boolean;
  ocrResults: ReceiptData | null;
  setOcrResults: React.Dispatch<React.SetStateAction<ReceiptData | null>>;
  ocrFailed: boolean;
  setOcrFailed: (failed: boolean) => void;
  /** Server-provided failure reason, when one was returned (e.g. service
   *  misconfiguration vs. image quality) — null for generic failures. */
  ocrErrorMessage: string | null;
  fieldWarnings: FieldWarning[];
  processReceipt: (file: File, cardOptions: CardOption[]) => Promise<void>;
  getFieldWarnings: (fieldName: string) => FieldWarning[];
}

export function useReceiptOcr(): UseReceiptOcrReturn {
  const [processing, setProcessing] = useState(false);
  const [ocrResults, setOcrResults] = useState<ReceiptData | null>(null);
  const [ocrFailed, setOcrFailed] = useState(false);
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);
  const [fieldWarnings, setFieldWarnings] = useState<FieldWarning[]>([]);

  const getFieldWarnings = useCallback((fieldName: string) => {
    return fieldWarnings.filter(w => w.field === fieldName);
  }, [fieldWarnings]);

  const processReceipt = useCallback(async (file: File, cardOptions: CardOption[]) => {
    setProcessing(true);
    setOcrFailed(false);
    setOcrErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('receipt', file);
      
      const token = TokenManager.getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      const response = await fetch('/api/ocr/v2/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OCR v2 failed:', errorText);
        // Surface the backend's reason (it distinguishes timeouts, service
        // misconfiguration, PDFs, etc.) instead of a one-size-fits-all error.
        let serverMessage: string | null = null;
        try {
          const parsed = JSON.parse(errorText) as { error?: string; message?: string };
          serverMessage = parsed.error || parsed.message || null;
        } catch {
          serverMessage = null;
        }
        throw new Error(serverMessage || 'OCR processing failed');
      }

      const result = await response.json();
      
      console.log('[OCR v2] Response:', result);
      
      // Store field warnings
      if (result.warnings && result.warnings.length > 0) {
        console.log('[OCR v2] Field warnings:', result.warnings);
        setFieldWarnings(result.warnings);
      } else {
        setFieldWarnings([]);
      }
      
      // Transform OCR v2 response to match expected format
      const fields = result.fields || {};
      const ocrData: ReceiptData = {
        file: file,
        total: parseFloat(fields.amount?.value) || 0,
        merchant: fields.merchant?.value || 'Unknown Merchant',
        date: fields.date?.value || getTodayLocalDateString(),
        location: fields.location?.value || 'Unknown Location',
        category: fields.category?.value || result.categories?.[0]?.category || 'Other',
        ocrText: result.ocr?.text || '',
        confidence: result.quality?.overallConfidence || result.ocr?.confidence || 0,
        receiptFile: file,
        ocrV2Data: {
          inference: fields,
          categories: result.categories || [],
          needsReview: result.quality?.needsReview,
          reviewReasons: result.quality?.reviewReasons || [],
          ocrProvider: result.ocr?.provider
        }
      };

      setOcrResults(ocrData);
      
      // Auto-match card if last 4 digits extracted
      if (fields.cardLastFour?.value && cardOptions.length > 0) {
        const lastFour = fields.cardLastFour.value;
        const matchingCard = cardOptions.find(card => card.lastFour === lastFour);
        if (matchingCard) {
          console.log(`[ReceiptUpload] Auto-matched card: ${matchingCard.name} (...${lastFour})`);
        } else {
          console.log(`[ReceiptUpload] Card last 4 extracted (...${lastFour}) but no matching card found in options`);
        }
      }
    } catch (error) {
      console.error('OCR v2 Error:', error);
      setOcrErrorMessage(error instanceof Error && error.message !== 'OCR processing failed' ? error.message : null);
      setOcrFailed(true);
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    processing,
    ocrResults,
    setOcrResults,
    ocrFailed,
    setOcrFailed,
    ocrErrorMessage,
    fieldWarnings,
    processReceipt,
    getFieldWarnings
  };
}

