/**
 * OCR Correction Tracking
 * 
 * Captures user corrections to OCR-extracted fields and sends them to
 * the backend for continuous learning and model improvement.
 */

export interface OCRCorrection {
  expenseId?: string;
  originalOCRText: string;
  originalInference: any;
  correctedFields: {
    merchant?: string;
    amount?: number;
    date?: string;
    cardLastFour?: string;
    category?: string;
  };
  receiptImagePath?: string;
  notes?: string;
}

/**
 * Send user corrections to backend for learning
 * 
 * @param correction - OCR correction data including original and corrected values
 * @returns Promise that resolves when correction is logged (non-blocking)
 */
export async function sendOCRCorrection(correction: OCRCorrection): Promise<void> {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.warn('[OCR Correction] No auth token found, skipping correction logging');
      return;
    }
    
    const response = await fetch('/api/ocr/v2/corrections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(correction)
    });

    if (!response.ok) {
      throw new Error(`Failed to send correction: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[OCR Correction] Sent successfully:', result.correctionId);
  } catch (error) {
    console.error('[OCR Correction] Failed to send:', error);
    // Don't throw - corrections are nice-to-have, not critical
  }
}

/**
 * Helper: Check if a single field was corrected
 * 
 * @param originalInference - Original OCR inference object
 * @param submittedData - User-submitted form data
 * @param fieldName - Name of the field to check
 * @returns The corrected value if changed, undefined otherwise
 */
function detectFieldCorrection(
  originalInference: any,
  submittedData: any,
  fieldName: string
): any | undefined {
  const originalValue = originalInference?.[fieldName]?.value;
  const submittedValue = submittedData[fieldName];
  
  if (!originalValue || !submittedValue) {
    return undefined;
  }
  
  // Convert to same type for comparison (handle number/string differences)
  const normalizedOriginal = String(originalValue);
  const normalizedSubmitted = String(submittedValue);
  
  if (normalizedOriginal !== normalizedSubmitted) {
    return submittedValue;
  }
  
  return undefined;
}

/**
 * Helper: Extract last 4 digits from card string
 * 
 * @param cardString - Card string like "Corporate Amex (...1234)"
 * @returns Last 4 digits or undefined
 */
function extractCardLastFour(cardString: string): string | undefined {
  const match = cardString.match(/\(\.\.\.(\d{4})\)/);
  return match ? match[1] : undefined;
}

/**
 * Track which fields user changed from OCR-extracted values
 * 
 * @param originalInference - Original OCR inference data
 * @param submittedData - User-submitted form data
 * @returns Object containing only the fields that were corrected
 * 
 * @example
 * ```typescript
 * const corrections = detectCorrections(ocrInference, formData);
 * // Returns: { merchant: "Corrected Name", amount: 123.45 }
 * ```
 */
export function detectCorrections(
  originalInference: any,
  submittedData: any
): { merchant?: string; amount?: number; date?: string; category?: string; cardLastFour?: string } {
  const corrections: any = {};

  // Check standard fields using helper
  const fieldNames = ['merchant', 'amount', 'date', 'category'];
  for (const field of fieldNames) {
    const correctedValue = detectFieldCorrection(originalInference, submittedData, field);
    if (correctedValue !== undefined) {
      corrections[field] = correctedValue;
    }
  }

  // Special handling for card field (needs extraction)
  if (originalInference?.cardLastFour?.value && submittedData.cardUsed) {
    const submittedLastFour = extractCardLastFour(submittedData.cardUsed);
    if (submittedLastFour && originalInference.cardLastFour.value !== submittedLastFour) {
      corrections.cardLastFour = submittedLastFour;
      console.log(`[OCR Correction] Card changed: ...${originalInference.cardLastFour.value} → ...${submittedLastFour}`);
    }
  }

  return corrections;
}
