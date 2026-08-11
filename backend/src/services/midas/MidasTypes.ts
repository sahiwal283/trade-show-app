/**
 * Types for Midas Ext API (EXT_API_MERGE_LOCK.md).
 */

export type MidasExpenseStatus =
  | 'draft'
  | 'pending'
  | 'in_review'
  | 'awaiting_info'
  | 'approved'
  | 'rejected'
  | 'zoho_sync_failed';

export type MidasReimbursementStatus =
  | 'not_requested'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid';

export type TsExpenseStatus = 'pending' | 'approved' | 'rejected' | 'needs further review';

export type TsReimbursementStatus = 'pending review' | 'approved' | 'rejected' | 'paid';

export interface MidasActor {
  email: string;
  externalUserId: string;
  name?: string;
  requestId?: string;
}

export interface MidasOcrField {
  value: string | number | null;
  confidence: number;
}

export interface MidasOcrResult {
  ocrMode: 'sync';
  fields: {
    merchant: MidasOcrField;
    amount: MidasOcrField;
    date: MidasOcrField;
    category: MidasOcrField;
    location: MidasOcrField;
    cardLastFour: MidasOcrField;
  };
  ocr: { text: string; confidence: number; provider: string };
  quality: {
    overallConfidence: number;
    needsReview: boolean;
    reviewReasons: string[];
  };
  warnings: unknown[];
}

export interface MidasCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Ext GET /payment-methods (scope expenses:read) */
export interface MidasPaymentMethod {
  id: string;
  label: string;
  lastFour: string;
  brand?: string | null;
  /**
   * Company this card bills to. Midas renamed "entity" to "company" and now
   * serves both keys; `defaultZohoEntity` is its deprecated alias. Read through
   * `paymentMethodCompany()` rather than either field directly.
   */
  defaultCompany?: string | null;
  defaultZohoEntity: string | null;
  requiresReimbursement?: boolean;
  zohoPaymentAccountId?: string | null;
  zohoAccountName?: string | null;
}

/**
 * Ext GET /companies (scope expenses:read) — what Trade Show calls an "entity".
 *
 * Keyed by `name`, not id: `expenses.zoho_entity` stores the company name and
 * Midas accepts names on write, so there is no id translation to get wrong.
 *
 * `zohoEnabled: false` companies are real and chargeable but do not sync to
 * Zoho Books. Midas serves them and leaves the decision to the consumer.
 */
export interface MidasCompany {
  name: string;
  zohoEnabled: boolean;
  sortOrder: number;
}

/** Ext GET /health/vocabulary (scope expenses:read) — cutover self-check. */
export interface MidasVocabularyHealth {
  appName: string | null;
  categories: { visible: number; totalActiveInMidas: number; scoped: boolean };
  paymentMethods: { visible: number };
  companies: { visible: number; zohoEnabled: number };
}

/**
 * Company for a payment method, preferring the current key over the alias.
 * Returns null for cards with no company (e.g. "Personal (Need reimbursement)").
 */
export function paymentMethodCompany(pm: MidasPaymentMethod): string | null {
  return pm.defaultCompany ?? pm.defaultZohoEntity ?? null;
}

export interface MidasReceiptDto {
  id: string;
  filename: string;
  mimeType: string;
  ocrStatus: 'pending' | 'processing' | 'done' | 'failed';
  contentPath?: string;
  sha256?: string | null;
  ocrText?: string | null;
  ocrData?: unknown;
}

export interface MidasExpenseDto {
  id: string;
  merchant: string;
  amount: string | number;
  currency: string;
  date: string;
  description: string | null;
  status: MidasExpenseStatus;
  reimbursementStatus: MidasReimbursementStatus;
  sourceApp: string | null;
  sourceRefId: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  eventId: string | null;
  externalUserId: string | null;
  location: string | null;
  cardUsed: string | null;
  sourceContext: Record<string, unknown>;
  category: { id: string; name: string } | null;
  paymentMethod: { id: string; label: string } | null;
  user: { id: string; name: string; email: string };
  receipts: MidasReceiptDto[];
  zohoEntity: string | null;
  zohoExpenseId: string | null;
  zohoSyncedAt: string | null;
  midasUrl: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

export interface MidasCreateExpenseBody {
  sourceApp: 'trade_show';
  sourceRefId: string;
  submitterEmail: string;
  externalUserId: string;
  eventId: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceType?: string;
  merchant: string;
  amount: number;
  currency?: string;
  date: string;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  paymentMethodId?: string | null;
  cardUsed?: string | null;
  location?: string | null;
  reimbursementRequired?: boolean;
  status?: MidasExpenseStatus;
  zohoEntity?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MidasCreateResult {
  expense: MidasExpenseDto;
  midasUrl: string;
  created: boolean;
}

export interface MidasListQuery {
  sourceApp: string;
  eventId?: string;
  eventIds?: string;
  externalUserId?: string;
  status?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface MidasListResult {
  expenses: MidasExpenseDto[];
  nextCursor: string | null;
}

export interface MidasPatchBody {
  merchant?: string;
  amount?: number;
  date?: string;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  paymentMethodId?: string | null;
  cardUsed?: string | null;
  location?: string | null;
  reimbursementRequired?: boolean;
  status?: MidasExpenseStatus;
}

export interface MidasImportReceipt {
  filename: string;
  mimeType: string;
  contentBase64: string;
  skipOcr?: boolean;
  sha256?: string;
}

export interface MidasImportItem {
  sourceRefId: string;
  submitterEmail: string;
  externalUserId: string;
  eventId: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceType?: string;
  merchant: string;
  amount: number;
  currency?: string;
  date: string;
  description?: string | null;
  categoryName?: string;
  paymentMethodId?: string | null;
  cardUsed?: string | null;
  location?: string | null;
  status: string;
  reimbursementRequired?: boolean;
  reimbursementStatus?: string | null;
  zohoEntity?: string | null;
  zohoExpenseId?: string | null;
  ocrText?: string | null;
  extractedData?: unknown;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  comments?: string | null;
  receipt?: MidasImportReceipt;
  auditTrail?: unknown[];
}

export interface MidasImportPayload {
  sourceApp: 'trade_show';
  dryRun: boolean;
  items: MidasImportItem[];
}

export interface MidasImportItemResult {
  sourceRefId: string;
  /** Lock / older mock shape */
  outcome?: 'created' | 'updated' | 'skipped' | 'failed';
  /** Live Ext import response shape */
  status?: 'created' | 'updated' | 'skipped' | 'failed' | 'already_imported';
  expenseId?: string;
  error?: string;
  reason?: string;
  warnings?: string[];
}

export interface MidasImportResult {
  results: MidasImportItemResult[];
  dryRun: boolean;
  warnings?: string[];
  totals?: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export class MidasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly body?: unknown,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'MidasApiError';
  }
}

export interface MidasClientConfig {
  baseUrl: string;
  apiKey: string;
  webBaseUrl: string;
  timeoutMs: number;
}
