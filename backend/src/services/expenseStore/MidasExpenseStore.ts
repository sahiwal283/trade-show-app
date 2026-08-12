import { getMidasClient } from '../midas';
import { mapTsStatusToMidas } from '../midas/statusMaps';
import { resolvePaymentMethod } from '../midas/paymentMethodMap';
import { midasDtoToTsExpense } from './midasAdapter';
import type {
  CreateExpenseInput,
  ExpenseActor,
  ExpenseListFilters,
  ExpenseStore,
  TsExpenseApi,
  UpdateExpenseInput,
} from './ExpenseStore';
import { randomUUID } from 'crypto';
import { MidasApiError, type MidasExpenseDto, type MidasWarning } from '../midas/MidasTypes';

/**
 * A company name safe to send to Midas, or null.
 *
 * Midas validates company names on write and rejects unknown ones with
 * 400 UNKNOWN_COMPANY. Multipart form fields arrive as strings, so an absent
 * value could reach here as the literal text "undefined" or "null" and be
 * forwarded as a company name. The client no longer produces those (see
 * apiClient.upload), but this is the last point before the write leaves us,
 * and a rejected expense is a submission the user loses.
 */
function cleanCompany(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (['undefined', 'null', 'nan'].includes(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * Attach Midas's non-blocking advisories to the expense we return, so the API
 * response carries them to the submitter. Absent on older Midas builds.
 */
function withWarnings(expense: TsExpenseApi, warnings?: MidasWarning[]): TsExpenseApi {
  if (!warnings?.length) return expense;
  return { ...expense, midasWarnings: warnings };
}

export class MidasExpenseStore implements ExpenseStore {
  private async resolveDto(id: string): Promise<MidasExpenseDto> {
    const client = getMidasClient();
    try {
      return await client.getExpense(id);
    } catch (e) {
      if (!(e instanceof MidasApiError) || e.status !== 404) throw e;
    }
    return client.getExpenseByRef('trade_show', id);
  }

  async list(filters: ExpenseListFilters, _actor: ExpenseActor): Promise<TsExpenseApi[]> {
    const client = getMidasClient();
    const expenses: MidasExpenseDto[] = [];
    let cursor: string | undefined;
    // Ext defaults to a page size (~50); walk cursors so TS BFF returns the full set.
    // 200 is Midas's maximum — using it halves the request count on this hot
    // path, which matters more than page size here: this runs on every expense
    // list load, so we take fewer round trips rather than throttling between
    // them and adding latency the user feels.
    for (let page = 0; page < 100; page += 1) {
      const result = await client.listExpenses({
        sourceApp: 'trade_show',
        eventId: filters.eventId,
        externalUserId: filters.userId,
        status: filters.status ? mapTsStatusToMidas(filters.status) : undefined,
        q: filters.q,
        limit: 200,
        cursor,
      });
      expenses.push(...result.expenses);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return expenses.map(midasDtoToTsExpense);
  }

  async getById(id: string, _actor: ExpenseActor): Promise<TsExpenseApi | null> {
    try {
      return midasDtoToTsExpense(await this.resolveDto(id));
    } catch (e) {
      if (e instanceof MidasApiError && e.status === 404) return null;
      throw e;
    }
  }

  async create(input: CreateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    const client = getMidasClient();
    const sourceRefId = input.sourceRefId || randomUUID();
    const payment = await resolvePaymentMethod({
      cardUsed: input.cardUsed,
      paymentMethodId: input.paymentMethodId,
      lister: () => client.listPaymentMethods(),
    });
    const zohoEntity = cleanCompany(input.zohoEntity) ?? payment?.defaultZohoEntity ?? null;

    const created = await client.createExpense(
      {
        sourceApp: 'trade_show',
        sourceRefId,
        submitterEmail: actor.email,
        submitterUsername: actor.username,
        externalUserId: actor.id,
        eventId: input.eventId,
        sourceLabel: input.eventName || 'Trade Show Event',
        sourceType: 'trade_show_event',
        merchant: input.merchant,
        amount: input.amount,
        date: input.date,
        description: input.description ?? null,
        categoryName: input.category ?? null,
        paymentMethodId: payment?.id ?? input.paymentMethodId ?? null,
        cardUsed: input.cardUsed ?? null,
        location: input.location ?? null,
        reimbursementRequired: Boolean(input.reimbursementRequired),
        status: 'pending',
        zohoEntity,
      },
      { email: actor.email, externalUserId: actor.id, name: actor.name }
    );

    if (input.receipt) {
      await client.uploadReceipt(
        created.expense.id,
        input.receipt.buffer,
        input.receipt.filename,
        input.receipt.mime
      );
      const refreshed = await client.getExpense(created.expense.id);
      return withWarnings(midasDtoToTsExpense(refreshed), created.warnings);
    }

    return withWarnings(midasDtoToTsExpense(created.expense), created.warnings);
  }

  async update(id: string, input: UpdateExpenseInput, actor: ExpenseActor): Promise<TsExpenseApi> {
    const client = getMidasClient();
    const current = await this.resolveDto(id);

    let paymentMethodId: string | null | undefined;
    if (input.cardUsed !== undefined || input.paymentMethodId !== undefined) {
      const payment = await resolvePaymentMethod({
        cardUsed: input.cardUsed !== undefined ? input.cardUsed : current.cardUsed,
        paymentMethodId: input.paymentMethodId,
        lister: () => client.listPaymentMethods(),
      });
      paymentMethodId = payment?.id ?? input.paymentMethodId ?? null;
    }

    const { expense: patched, warnings } = await client.updateExpense(
      current.id,
      {
        merchant: input.merchant,
        amount: input.amount,
        date: input.date,
        description: input.description,
        categoryName: input.category ?? undefined,
        paymentMethodId,
        cardUsed: input.cardUsed,
        location: input.location,
        reimbursementRequired: input.reimbursementRequired,
      },
      { email: actor.email, externalUserId: actor.id, name: actor.name }
    );

    if (input.receipt) {
      await client.uploadReceipt(
        patched.id,
        input.receipt.buffer,
        input.receipt.filename,
        input.receipt.mime
      );
      return withWarnings(midasDtoToTsExpense(await client.getExpense(patched.id)), warnings);
    }

    return withWarnings(midasDtoToTsExpense(patched), warnings);
  }

  async replaceReceipt(
    id: string,
    receipt: { buffer: Buffer; filename: string; mime: string },
    actor: ExpenseActor
  ): Promise<TsExpenseApi> {
    return this.update(id, { receipt }, actor);
  }

  async delete(id: string, actor: ExpenseActor): Promise<void> {
    const client = getMidasClient();
    const current = await this.resolveDto(id);
    await client.deleteExpense(current.id, {
      email: actor.email,
      externalUserId: actor.id,
      name: actor.name,
    });
  }
}
