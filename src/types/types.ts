// Shared Type Definitions
// Version: 0.5.1-alpha

// Keep in lockstep with the canonical union in src/App.tsx
export type UserRole =
  | 'admin'
  | 'coordinator'
  | 'salesperson'
  | 'accountant'
  | 'developer'
  | 'temporary'
  | 'pending';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  registration_date?: string;
}

export interface TradeShow {
  id: string;
  name: string;
  venue: string;
  city: string;
  state: string;
  startDate: string;
  endDate: string;
  participants: User[];
  budget?: number;
  status: 'upcoming' | 'active' | 'completed';
  coordinatorId: string;
}

export interface DuplicateWarning {
  expenseId: number;
  merchant: string;
  amount: number;
  date: string;
  similarity: {
    merchant: number;
    amount: number;
    dateDiff: number;
  };
}

export interface Expense {
  id: string;
  userId: string;
  tradeShowId: string;
  amount: number;
  category: string;
  merchant: string;
  date: string;
  description: string;
  cardUsed: string;
  reimbursementRequired: boolean;
  reimbursementStatus?: 'pending review' | 'approved' | 'rejected' | 'paid';
  receiptUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  zohoEntity?: string;
  location?: string;
  ocrText?: string;
  duplicateCheck?: DuplicateWarning[] | null;
  extractedData?: {
    total: number;
    category: string;
    merchant: string;
    date: string;
    location: string;
  };
  // Pre-fetched from backend JOINs (when available)
  user_name?: string;
  event_name?: string;
}

export interface AppSettings {
  cardOptions: string[];
  entityOptions: string[];
}

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

export interface CardOption {
  name: string;
  lastFour: string;
  entity?: string | null;  // Entity assigned to this card (null for personal cards)
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  totalPages: number;
  totalItems: number;
}

// Sync Queue types
export interface SyncQueueItem {
  id: string;
  type: 'expense' | 'event' | 'settings';
  action: 'create' | 'update' | 'delete';
  data: unknown;
  timestamp: number;
  status: 'pending' | 'syncing' | 'success' | 'failed';
  retryCount: number;
  error?: string;
}

// Form Handler types
export type FormSubmitHandler<T = void> = (data: T) => void | Promise<void>;
export type FormChangeHandler<T extends HTMLElement = HTMLInputElement> = (
  event: React.ChangeEvent<T>
) => void;

// Error types
export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

// Filter types
export type FilterValue = string | number | boolean | null;
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  [key: string]: FilterValue;
}

// Statistics types
export interface DashboardStats {
  totalExpenses: number;
  pendingExpenses: number;
  upcomingEvents: number;
  activeEvents: number;
  totalEvents: number;
  averageExpense: number;
  teamMembers: number;
}

export interface ReportStats {
  totalAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  expenseCount: number;
  categoryBreakdown: Record<string, number>;
}

export interface EntityTotal {
  entity: string;
  amount: number;
}

// Constants
export const EXPENSE_CATEGORIES = ['Flights', 'Hotels', 'Meals', 'Supplies', 'Transportation', 'Other'] as const;
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const EVENT_STATUSES = ['upcoming', 'active', 'completed'] as const;

export const DEFAULT_CARD_OPTIONS = [
  'Corporate Amex',
  'Corporate Visa',
  'Personal Card (Reimbursement)',
  'Company Debit',
  'Cash'
];

export const DEFAULT_ENTITY_OPTIONS = [
  'Entity A - Main Operations',
  'Entity B - Sales Division',
  'Entity C - Marketing Department',
  'Entity D - International Operations'
];
