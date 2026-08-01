// Shared Type Definitions
// Version: 0.5.1-alpha

// Receipt and OCR types
export interface ReceiptData {
  total?: number;
  category?: string;
  merchant?: string;
  date?: string;
  location?: string;
  rawText?: string;
  confidence?: number;
  ocrText?: string;
  receiptFile?: File;
  file?: File;
  tradeShowId?: string;
  cardUsed?: string;
  zohoEntity?: string;  // Added: Entity auto-populated from card selection
  description?: string;
  ocrV2Data?: OcrV2Data;
}

// OCR V2 Data types
export interface OcrV2Inference {
  merchant?: { value: string; confidence: number };
  amount?: { value: number; confidence: number };
  date?: { value: string; confidence: number };
  location?: { value: string; confidence: number };
  category?: { value: string; confidence: number };
  cardLastFour?: { value: string; confidence: number };
}

export interface OcrV2Data {
  inference?: OcrV2Inference;
  categories?: Array<{ category: string; confidence: number; keywordsMatched?: string[] }>;
  needsReview?: boolean;
  reviewReasons?: string[];
  ocrProvider?: string;
  ocrText?: string;
  originalValues?: {
    merchant: string;
    amount: number;
    date: string;
    category: string;
    location?: string;
    cardLastFour?: string | null;
  };
}

// Audit Trail types
export interface AuditTrailChange {
  old: string | number | boolean | null | undefined;
  new: string | number | boolean | null | undefined;
}

export interface AuditTrailEntry {
  id: string;
  action: string;
  userName: string;
  timestamp: string;
  user?: string;
  changes?: Record<string, AuditTrailChange>;
  [key: string]: string | number | boolean | Record<string, AuditTrailChange> | undefined;
}

// Expense Edit Form Data
export interface ExpenseEditFormData {
  tradeShowId: string;
  category: string;
  merchant: string;
  amount: number;
  date: string;
  description: string;
  location: string;
  cardUsed: string;
  reimbursementRequired: boolean;
  zohoEntity: string;
}

// Error types
export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}
