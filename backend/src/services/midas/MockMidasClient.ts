/**
 * In-memory Midas Ext mock for MIDAS_MODE=mock.
 */

import { randomUUID, createHash } from 'crypto';
import { TRADE_SHOW_COMPANY_SEED, TRADE_SHOW_PAYMENT_METHOD_SEED } from './paymentMethodMap';
import {
  MidasActor,
  MidasCategory,
  MidasCompany,
  MidasVocabularyHealth,
  MidasCreateExpenseBody,
  MidasCreateResult,
  MidasExpenseDto,
  MidasImportPayload,
  MidasImportResult,
  MidasListQuery,
  MidasListResult,
  MidasOcrResult,
  MidasPatchBody,
  MidasPaymentMethod,
  MidasReceiptDto,
  MidasApiError,
} from './MidasTypes';

function midasUrl(webBase: string, id: string): string {
  return `${webBase.replace(/\/$/, '')}/expenses/${id}`;
}

/**
 * Category names this mock serves — a fixture for tests and MIDAS_MODE=mock only.
 *
 * Midas is the source of truth for the real vocabulary and nothing in the write
 * path consults this list. Trade Show sends whatever the user picked and lets
 * Midas resolve it (exact name → its per-app category_mappings → Other, with a
 * warning). A local lookup table would silently pre-empt that resolution, which
 * is how "Stationaries" used to become "Other" before it ever reached Midas.
 */
const MOCK_CATEGORY_NAMES = [
  'Accommodation - Hotel',
  'Booth / Marketing / Tools',
  'Gas / Fuel',
  'Meal and Entertainment',
  'Model',
  'Other',
  'Parking Fees',
  'Rental - Car / U-haul',
  'Shipping Charges',
  'Show Allowances - Per Diem',
  'Stationaries',
  'Storage charges',
  'Transportation - Uber / Lyft / Others',
  'Travel - Flight',
  'Travel Expenses',
];

export class MockMidasClient {
  private expenses = new Map<string, MidasExpenseDto>();
  private byRef = new Map<string, string>(); // sourceApp::sourceRefId -> id
  private receipts = new Map<string, Buffer>(); // receiptId -> bytes
  private readonly categories: MidasCategory[];
  private readonly paymentMethods: MidasPaymentMethod[];
  private readonly webBaseUrl: string;

  constructor(webBaseUrl = 'http://localhost:5174') {
    this.webBaseUrl = webBaseUrl;
    this.categories = MOCK_CATEGORY_NAMES.map((name, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      name,
      description: null,
      isActive: true,
    }));
    this.paymentMethods = TRADE_SHOW_PAYMENT_METHOD_SEED.map((m) => ({
      id: m.id,
      label: m.label,
      lastFour: m.lastFour,
      brand: 'other',
      defaultZohoEntity: m.defaultZohoEntity,
      zohoPaymentAccountId: m.zohoPaymentAccountId,
      zohoAccountName: m.zohoPaymentAccountId,
    }));
  }

  private refKey(app: string, ref: string): string {
    return `${app}::${ref}`;
  }

  private resolveCategory(categoryId?: string | null, categoryName?: string | null) {
    if (categoryId) {
      const c = this.categories.find((x) => x.id === categoryId);
      if (c) return { id: c.id, name: c.name };
    }
    if (categoryName) {
      const c = this.categories.find((x) => x.name === categoryName) || this.categories.find((x) => x.name === 'Other')!;
      return { id: c.id, name: c.name };
    }
    return null;
  }

  private resolvePaymentMethod(paymentMethodId?: string | null) {
    if (!paymentMethodId) return null;
    const m = this.paymentMethods.find((x) => x.id === paymentMethodId);
    return m ? { id: m.id, label: m.label } : null;
  }

  async processOcr(_file: Buffer, filename: string, _mime: string): Promise<MidasOcrResult> {
    return {
      ocrMode: 'sync',
      fields: {
        merchant: { value: `Mock Merchant (${filename})`, confidence: 0.9 },
        amount: { value: 12.34, confidence: 0.85 },
        date: { value: new Date().toISOString().slice(0, 10), confidence: 0.8 },
        category: { value: 'Meal and Entertainment', confidence: 0.7 },
        location: { value: 'Mock City', confidence: 0.6 },
        cardLastFour: { value: '1234', confidence: 0.5 },
      },
      ocr: { text: 'MOCK OCR TEXT', confidence: 0.8, provider: 'mock' },
      quality: { overallConfidence: 0.8, needsReview: false, reviewReasons: [] },
      warnings: [],
    };
  }

  async createExpense(body: MidasCreateExpenseBody, actor: MidasActor): Promise<MidasCreateResult> {
    if (!body.sourceApp || !body.sourceRefId) {
      throw new MidasApiError('sourceApp and sourceRefId required', 400, 'BAD_REQUEST');
    }
    if (body.sourceApp === 'trade_show' && !body.eventId) {
      throw new MidasApiError('eventId required for trade_show', 400, 'BAD_REQUEST');
    }
    const key = this.refKey(body.sourceApp, body.sourceRefId);
    const existingId = this.byRef.get(key);
    if (existingId) {
      const expense = this.expenses.get(existingId)!;
      return { expense, midasUrl: expense.midasUrl, created: false };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const category = this.resolveCategory(body.categoryId, body.categoryName);
    const paymentMethod = this.resolvePaymentMethod(body.paymentMethodId);
    const expense: MidasExpenseDto = {
      id,
      merchant: body.merchant,
      amount: body.amount.toFixed(2),
      currency: body.currency || 'USD',
      date: body.date,
      description: body.description ?? null,
      status: body.status || 'pending',
      reimbursementStatus: body.reimbursementRequired ? 'pending' : 'not_requested',
      sourceApp: body.sourceApp,
      sourceRefId: body.sourceRefId,
      sourceLabel: body.sourceLabel,
      sourceUrl: body.sourceUrl ?? null,
      sourceType: body.sourceType || 'trade_show_event',
      eventId: body.eventId,
      externalUserId: body.externalUserId || actor.externalUserId,
      location: body.location ?? null,
      cardUsed: body.cardUsed ?? null,
      sourceContext: {
        eventId: body.eventId,
        eventName: body.sourceLabel,
        location: body.location ?? null,
        cardUsed: body.cardUsed ?? null,
        externalUserId: body.externalUserId || actor.externalUserId,
      },
      category,
      paymentMethod,
      user: {
        id: randomUUID(),
        name: actor.name || actor.email.split('@')[0],
        email: body.submitterEmail || actor.email,
      },
      receipts: [],
      zohoEntity: body.zohoEntity ?? null,
      zohoExpenseId: null,
      zohoSyncedAt: null,
      midasUrl: midasUrl(this.webBaseUrl, id),
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
    };
    this.expenses.set(id, expense);
    this.byRef.set(key, id);
    return { expense, midasUrl: expense.midasUrl, created: true };
  }

  async listExpenses(query: MidasListQuery): Promise<MidasListResult> {
    let items = [...this.expenses.values()].filter((e) => e.sourceApp === query.sourceApp);
    if (query.eventId) items = items.filter((e) => e.eventId === query.eventId);
    if (query.externalUserId) items = items.filter((e) => e.externalUserId === query.externalUserId);
    if (query.status) items = items.filter((e) => e.status === query.status);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter(
        (e) =>
          e.merchant.toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q)
      );
    }
    return { expenses: items, nextCursor: null };
  }

  async getExpense(id: string): Promise<MidasExpenseDto> {
    const e = this.expenses.get(id);
    if (!e) throw new MidasApiError('Expense not found', 404, 'NOT_FOUND');
    return e;
  }

  async getExpenseByRef(sourceApp: string, sourceRefId: string): Promise<MidasExpenseDto> {
    const id = this.byRef.get(this.refKey(sourceApp, sourceRefId));
    if (!id) throw new MidasApiError('Expense not found', 404, 'NOT_FOUND');
    return this.getExpense(id);
  }

  async updateExpense(id: string, patch: MidasPatchBody, _actor: MidasActor): Promise<MidasExpenseDto> {
    const e = await this.getExpense(id);
    if (!['draft', 'pending', 'awaiting_info'].includes(e.status)) {
      throw new MidasApiError('Expense not editable', 409, 'CONFLICT');
    }
    if (patch.merchant != null) e.merchant = patch.merchant;
    if (patch.amount != null) e.amount = patch.amount.toFixed(2);
    if (patch.date != null) e.date = patch.date;
    if (patch.description !== undefined) e.description = patch.description;
    if (patch.location !== undefined) e.location = patch.location;
    if (patch.cardUsed !== undefined) e.cardUsed = patch.cardUsed;
    if (patch.paymentMethodId !== undefined) {
      e.paymentMethod = this.resolvePaymentMethod(patch.paymentMethodId);
    }
    if (patch.categoryId || patch.categoryName) {
      e.category = this.resolveCategory(patch.categoryId, patch.categoryName);
    }
    if (patch.reimbursementRequired === true) e.reimbursementStatus = 'pending';
    if (patch.reimbursementRequired === false) e.reimbursementStatus = 'not_requested';
    if (patch.status) e.status = patch.status;
    e.updatedAt = new Date().toISOString();
    this.expenses.set(id, e);
    return e;
  }

  async deleteExpense(id: string, _actor: MidasActor): Promise<void> {
    const e = await this.getExpense(id);
    const allowed =
      e.status === 'draft' ||
      (e.status === 'pending' && !e.reviewedAt && !e.zohoExpenseId);
    if (!allowed) throw new MidasApiError('Delete not allowed', 409, 'CONFLICT');
    this.expenses.delete(id);
    if (e.sourceApp && e.sourceRefId) this.byRef.delete(this.refKey(e.sourceApp, e.sourceRefId));
    for (const r of e.receipts) this.receipts.delete(r.id);
  }

  async uploadReceipt(
    id: string,
    file: Buffer,
    filename: string,
    mime: string,
    _opts?: { async?: boolean }
  ): Promise<MidasReceiptDto> {
    const e = await this.getExpense(id);
    const rid = randomUUID();
    const sha256 = createHash('sha256').update(file).digest('hex');
    this.receipts.set(rid, file);
    const receipt: MidasReceiptDto = {
      id: rid,
      filename,
      mimeType: mime,
      ocrStatus: 'done',
      contentPath: `/api/v1/ext/expenses/${id}/receipts/${rid}/content`,
      sha256,
      ocrText: 'MOCK OCR TEXT',
    };
    e.receipts = [receipt, ...e.receipts];
    e.updatedAt = new Date().toISOString();
    this.expenses.set(id, e);
    return receipt;
  }

  async getReceiptContent(_expenseId: string, receiptId: string): Promise<Buffer> {
    const buf = this.receipts.get(receiptId);
    if (!buf) throw new MidasApiError('Receipt not found', 404, 'NOT_FOUND');
    return buf;
  }

  async importExpenses(payload: MidasImportPayload): Promise<MidasImportResult> {
    const results = [];
    for (const item of payload.items) {
      try {
        if (payload.dryRun) {
          results.push({ sourceRefId: item.sourceRefId, outcome: 'skipped' as const, warnings: ['dryRun'] });
          continue;
        }
        const actor: MidasActor = {
          email: item.submitterEmail,
          externalUserId: item.externalUserId,
        };
        const created = await this.createExpense(
          {
            sourceApp: 'trade_show',
            sourceRefId: item.sourceRefId,
            submitterEmail: item.submitterEmail,
            externalUserId: item.externalUserId,
            eventId: item.eventId,
            sourceLabel: item.sourceLabel,
            sourceUrl: item.sourceUrl,
            sourceType: item.sourceType || 'trade_show_event',
            merchant: item.merchant,
            amount: item.amount,
            currency: item.currency,
            date: item.date,
            description: item.description,
            categoryName: item.categoryName,
            paymentMethodId: item.paymentMethodId,
            cardUsed: item.cardUsed,
            location: item.location,
            reimbursementRequired: item.reimbursementRequired,
            status: (item.status === 'needs further review' ? 'awaiting_info' : item.status) as any,
            zohoEntity: item.zohoEntity,
          },
          actor
        );
        if (item.receipt?.contentBase64) {
          const buf = Buffer.from(item.receipt.contentBase64, 'base64');
          await this.uploadReceipt(
            created.expense.id,
            buf,
            item.receipt.filename,
            item.receipt.mimeType
          );
        }
        results.push({
          sourceRefId: item.sourceRefId,
          outcome: created.created ? ('created' as const) : ('updated' as const),
          expenseId: created.expense.id,
        });
      } catch (err) {
        results.push({
          sourceRefId: item.sourceRefId,
          outcome: 'failed' as const,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results, dryRun: payload.dryRun };
  }

  async listCategories(): Promise<MidasCategory[]> {
    return this.categories;
  }

  async listPaymentMethods(): Promise<MidasPaymentMethod[]> {
    return this.paymentMethods;
  }

  async listCompanies(): Promise<MidasCompany[]> {
    return TRADE_SHOW_COMPANY_SEED.map((c) => ({ ...c }));
  }

  async vocabularyHealth(): Promise<MidasVocabularyHealth> {
    const companies = TRADE_SHOW_COMPANY_SEED;
    return {
      appName: 'trade_show',
      categories: {
        visible: this.categories.length,
        totalActiveInMidas: this.categories.length,
        scoped: false,
      },
      paymentMethods: { visible: this.paymentMethods.length },
      companies: {
        visible: companies.length,
        zohoEnabled: companies.filter((c) => c.zohoEnabled).length,
      },
    };
  }
}
