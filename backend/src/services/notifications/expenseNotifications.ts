/**
 * Expense notifications that originate in Midas: a decision, a message, a
 * reimbursement. Midas hands each one to us as a feed event (it sends the
 * submitter nothing itself); this file turns an event into the one bell row
 * and push the submitter gets in Argo.
 */
import { activeUsers } from './recipients';
import { isValidUuid } from '../../utils/uuid';
import { notificationService, type NotifyInput } from '../NotificationService';
import type { MidasFeedEvent } from '../midas/MidasTypes';

/** Kinds that are about the conversation; opening the thread marks them read. */
export const CONVERSATION_KINDS = ['expense.message', 'expense.mention', 'expense.info_requested'];

/** "12.5" | 12.5 → "$12.50"; falls back to the raw value when not numeric. */
function money(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : `$${amount}`;
}

/** Collapse whitespace and cut to `max` characters (with a trailing …); the text comes from another system. */
function clip(text: unknown, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

type Wording = { kind: string; title: string; body: string };

function wordingFor(event: MidasFeedEvent): Wording | null {
  const known = ['approved', 'rejected', 'action_required', 'message', 'mention', 'reimbursement_paid', 'expense_incomplete'];
  if (!known.includes(event.type)) return null;

  const amount = money(event.expense.amount);
  const merchant = clip(event.expense.merchant, 80);
  const sender = event.senderName ? clip(event.senderName, 80) : '';
  const at = `${amount} expense at ${merchant}`;
  const quote = event.excerpt ? `: "${clip(event.excerpt, 200)}"` : '';
  const note = event.note ? clip(event.note, 300) : '';

  switch (event.type) {
    case 'approved':
      return { kind: 'expense.approved', title: 'Expense approved', body: `Your ${at} was approved.` };
    case 'rejected':
      return {
        kind: 'expense.rejected', title: 'Expense rejected',
        body: `Your ${at} was rejected.${note ? ` Note: ${note}` : ''}`,
      };
    case 'action_required':
      return {
        kind: 'expense.info_requested', title: 'More info needed on your expense',
        body: `${sender || 'Your accountant'} needs more information for your ${at}${quote}`,
      };
    case 'message':
      return {
        kind: 'expense.message', title: 'New message on your expense',
        body: `${sender || 'Your accountant'} on your ${at}${quote}`,
      };
    case 'mention':
      return {
        kind: 'expense.mention', title: `${sender || 'Someone'} mentioned you on your expense`,
        body: `${sender || 'Your accountant'} on your ${at}${quote}`,
      };
    case 'reimbursement_paid':
      return {
        kind: 'expense.reimbursement_paid', title: 'Reimbursement paid',
        body: `Your ${amount} reimbursement for ${merchant} was marked paid.`,
      };
    case 'expense_incomplete': {
      const missing = (Array.isArray(event.missing) ? event.missing : [])
        .filter((m): m is string => typeof m === 'string').slice(0, 6).map((m) => clip(m, 40));
      return {
        kind: 'expense.incomplete', title: 'Your expense is missing details',
        body: `Your ${at} is missing: ${missing.join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} so the accountant can approve it.`,
      };
    }
    default:
      return null;
  }
}

export const expenseNotifications = {
  /** The notification for a feed event, or null for a type this build does not know. */
  fromMidasEvent(event: MidasFeedEvent): NotifyInput | null {
    const wording = wordingFor(event);
    if (!wording) return null;
    const refId = event.expense.sourceRefId;
    return {
      ...wording,
      link: typeof refId === 'string' && refId ? { page: 'expense', expenseId: refId } : null,
    };
  },

  /**
   * Deliver one event to its Argo user, at most once (the event id is the
   * dedupe key; a duplicate is already delivered, so it counts as 'sent').
   * 'skipped' is a decision, not a failure: an event we cannot or should not
   * deliver, including a malformed one, must not hold up the feed. Throws
   * only when the database does (the notification insert is not swallowed),
   * so the scanner retries the page and the event is never lost.
   */
  async deliver(event: MidasFeedEvent): Promise<'sent' | 'skipped'> {
    const e = event as unknown as Record<string, unknown> | null;
    const okString = (v: unknown) => typeof v === 'string' && v.length > 0;
    if (
      !e || typeof e !== 'object' ||
      !e.expense || typeof e.expense !== 'object' ||
      !okString(e.id) || !okString(e.type)
    ) {
      const id = e && typeof e === 'object' && okString(e.id) ? ` ${String(e.id)}` : '';
      console.log(`[MidasEvents] Malformed event${id} — skipped`);
      return 'skipped';
    }
    const input = expenseNotifications.fromMidasEvent(event);
    if (!input) {
      console.log(`[MidasEvents] Unknown event type "${event.type}" (${event.id}) — skipped`);
      return 'skipped';
    }
    if (!isValidUuid(event.externalUserId)) {
      console.log(`[MidasEvents] Event ${event.id} has no Argo user id — skipped`);
      return 'skipped';
    }
    const recipients = await activeUsers([event.externalUserId]);
    if (recipients.length === 0) {
      console.log(`[MidasEvents] No active Argo user ${event.externalUserId} for event ${event.id} — skipped`);
      return 'skipped';
    }
    await notificationService.notify(recipients[0], { ...input, dedupeKey: event.id });
    return 'sent';
  },
};
