/**
 * One-off: probe Ext import validation with a single TS expense.
 */
import { query } from '../config/database';
import { getMidasClient, resetMidasClientSingleton } from '../services/midas';
import { mapTsStatusToMidas, mapTsReimbursementToMidas } from '../services/midas/statusMaps';

function dateOnly(v: unknown): string {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Invalid expense date value: ${s}`);
}

async function main() {
  resetMidasClientSingleton();
  const r = (
    await query(
      `SELECT e.*, u.email AS user_email, u.name AS user_name, ev.name AS event_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN events ev ON ev.id = e.event_id
       ORDER BY e.id LIMIT 1`
    )
  ).rows[0];

  const reimb = mapTsReimbursementToMidas(
    Boolean(r.reimbursement_required),
    r.reimbursement_status
  );

  const item = {
    sourceRefId: String(r.id),
    submitterEmail: r.user_email,
    externalUserId: String(r.user_id),
    eventId: String(r.event_id),
    sourceLabel: r.event_name || 'Trade Show Event',
    sourceType: 'trade_show_event',
    merchant: r.merchant,
    amount: Number(r.amount),
    currency: 'USD',
    date: dateOnly(r.date),
    description: r.description || null,
    categoryName: r.category || null,
    cardUsed: r.card_used || null,
    location: r.location || null,
    status: mapTsStatusToMidas(r.status),
    reimbursementRequired: Boolean(r.reimbursement_required),
    reimbursementStatus: reimb,
    zohoEntity: r.zoho_entity || null,
    zohoExpenseId: r.zoho_expense_id || null,
    ocrText: r.ocr_text || null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };

  console.log('ITEM', JSON.stringify(item, null, 2));
  try {
    const res = await getMidasClient().importExpenses({
      sourceApp: 'trade_show',
      dryRun: true,
      items: [item],
    });
    console.log('OK', JSON.stringify(res, null, 2));
  } catch (e: any) {
    console.log('ERR', e.status, e.code);
    console.log(JSON.stringify(e.body, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
