import type { MidasExpenseDto } from '../midas/MidasTypes';
import { mapMidasStatusToTs, mapMidasReimbursementToTs } from '../midas/statusMaps';
import type { TsExpenseApi } from './ExpenseStore';

export function midasDtoToTsExpense(e: MidasExpenseDto): TsExpenseApi {
  const reimb = mapMidasReimbursementToTs(e.reimbursementStatus);
  const amount = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount));
  const primary = e.receipts?.[0];
  return {
    // Prefer legacy sourceRefId as public id when present (Trade Show UI / offline)
    id: e.sourceRefId || e.id,
    userId: e.externalUserId || e.user?.id || '',
    tradeShowId: e.eventId,
    amount: Number.isFinite(amount) ? amount : null,
    category: e.category?.name || 'Other',
    merchant: e.merchant,
    date: e.date,
    description: e.description,
    cardUsed: e.cardUsed,
    receiptUrl: primary?.contentPath
      ? `/api/expenses/midas-receipt/${e.id}/${primary.id}`
      : null,
    reimbursementRequired: reimb.reimbursementRequired,
    reimbursementStatus: reimb.reimbursementStatus ?? null,
    status: mapMidasStatusToTs(e.status),
    zohoEntity: e.zohoEntity,
    zohoExpenseId: e.zohoExpenseId,
    location: e.location,
    ocrText: primary?.ocrText ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    duplicateCheck: null,
    user_name: e.user?.name,
    event_name: e.sourceLabel || (e.sourceContext?.eventName as string) || undefined,
    midasUrl: e.midasUrl,
    midasExpenseId: e.id,
  };
}
