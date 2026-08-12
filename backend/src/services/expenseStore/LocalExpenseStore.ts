import { expenseService } from '../ExpenseService';
import { normalizeExpense } from '../../utils/expenseHelpers';
import type {
  CreateExpenseInput,
  ExpenseActor,
  ExpenseListFilters,
  ExpenseStore,
  TsExpenseApi,
  UpdateExpenseInput,
} from './ExpenseStore';
import { expenseRepository } from '../../database/repositories';
import path from 'path';
import fs from 'fs';

function toApi(expense: any): TsExpenseApi {
  return {
    ...normalizeExpense(expense),
    user_name: expense.user_name,
    event_name: expense.event_name,
  };
}

/**
 * Existing PostgreSQL SoT — used for local + dual + rollback.
 */
export class LocalExpenseStore implements ExpenseStore {
  async list(filters: ExpenseListFilters, _actor: ExpenseActor): Promise<TsExpenseApi[]> {
    const expenses = await expenseService.getExpensesWithDetails({
      eventId: filters.eventId,
      userId: filters.userId,
      status: filters.status,
    });
    return expenses.map(toApi);
  }

  async getById(id: string, _actor: ExpenseActor): Promise<TsExpenseApi | null> {
    try {
      const expense = await expenseService.getExpenseByIdWithDetails(id);
      return toApi(expense);
    } catch {
      return null;
    }
  }

  async create(input: CreateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    let receiptUrl: string | null = null;
    if (input.receipt) {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const abs = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
      fs.mkdirSync(abs, { recursive: true });
      const filename = `${Date.now()}-${input.receipt.filename}`;
      fs.writeFileSync(path.join(abs, filename), input.receipt.buffer);
      receiptUrl = `/uploads/${filename}`;
    }
    const created = await expenseRepository.create({
      user_id: actor.id,
      event_id: input.eventId,
      category: input.category,
      merchant: input.merchant,
      amount: input.amount,
      date: input.date,
      description: input.description || '',
      card_used: input.cardUsed || null,
      reimbursement_required: Boolean(input.reimbursementRequired),
      reimbursement_status: input.reimbursementRequired ? 'pending review' : null,
      receipt_url: receiptUrl,
      ocr_text: input.ocrText || null,
      status: 'pending',
      zoho_entity: input.zohoEntity || null,
      zoho_expense_id: null,
      location: input.location || null,
    } as any);

    try {
      return toApi(await expenseService.getExpenseByIdWithDetails(created.id));
    } catch {
      return normalizeExpense(created as any) as TsExpenseApi;
    }
  }

  async update(id: string, input: UpdateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    const data: Record<string, unknown> = {};
    if (input.eventId !== undefined) data.eventId = input.eventId;
    if (input.merchant !== undefined) data.merchant = input.merchant;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.date !== undefined) data.date = input.date;
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.cardUsed !== undefined) data.cardUsed = input.cardUsed;
    if (input.location !== undefined) data.location = input.location;
    if (input.reimbursementRequired !== undefined) {
      data.reimbursementRequired = input.reimbursementRequired;
    }
    if (input.zohoEntity !== undefined) data.zohoEntity = input.zohoEntity;

    await expenseService.updateExpense(id, actor.id, actor.role, data);

    if (input.receipt) {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const abs = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
      fs.mkdirSync(abs, { recursive: true });
      const filename = `${Date.now()}-${input.receipt.filename}`;
      fs.writeFileSync(path.join(abs, filename), input.receipt.buffer);
      await expenseService.updateExpenseReceipt(
        id,
        actor.id,
        actor.role,
        `/uploads/${filename}`
      );
    }

    return toApi(await expenseService.getExpenseByIdWithDetails(id));
  }

  async replaceReceipt(
    id: string,
    receipt: { buffer: Buffer; filename: string; mime: string },
    actor: ExpenseActor
  ): Promise<TsExpenseApi> {
    return this.update(id, { receipt }, actor);
  }

  async delete(id: string, actor: ExpenseActor): Promise<void> {
    await expenseService.deleteExpense(id, actor.id, actor.role);
  }
}
