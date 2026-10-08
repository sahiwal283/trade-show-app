/**
 * Expense notifications that originate in Midas: a decision, a message, a
 * reimbursement. Midas hands each one to us as a feed event (it sends the
 * submitter nothing itself); this file turns an event into the one bell row
 * and push the submitter gets in Argo.
 */
import { activeUsers } from './recipients';
import { notifyMany } from './notifyMany';
import { isValidUuid } from '../../utils/uuid';
import type { NotifyInput } from '../NotificationService';
import type { MidasFeedEvent } from '../midas/MidasTypes';

/** Kinds that are about the conversation; opening the thread marks them read. */
export const CONVERSATION_KINDS = ['expense.message', 'expense.mention', 'expense.info_requested'];

/** "12.5" | 12.5 → "$12.50"; falls back to the raw value when not numeric. */
function money(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : `$${amount}`;
}

type Wording = { kind: string; title: string; body: string };

function wordingFor(event: MidasFeedEvent): Wording | null {
  const amount = money(event.expense.amount);
  const at = `${amount} expense at ${event.expense.merchant}`;
  const quote = event.excerpt ? `: "${event.excerpt}"` : '';

  switch (event.type) {
    case 'approved':
      return { kind: 'expense.approved', title: 'Expense approved', body: `Your ${at} was approved.` };
    case 'rejected':
      return {
        kind: 'expense.rejected', title: 'Expense rejected',
        body: `Your ${at} was rejected.${event.note ? ` Note: ${event.note}` : ''}`,
      };
    case 'action_required':
      return {
        kind: 'expense.info_requested', title: 'More info needed on your expense',
        body: `${event.senderName ?? 'Your accountant'} needs more information for your ${at}${quote}`,
      };
    case 'message':
      return {
        kind: 'expense.message', title: 'New message on your expense',
        body: `${event.senderName ?? 'Your accountant'} on your ${at}${quote}`,
      };
    case 'mention':
      return {
        kind: 'expense.mention', title: `${event.senderName ?? 'Someone'} mentioned you on your expense`,
        body: `${event.senderName ?? 'Your accountant'} on your ${at}${quote}`,
      };
    case 'reimbursement_paid':
      return {
        kind: 'expense.reimbursement_paid', title: 'Reimbursement paid',
        body: `Your ${amount} reimbursement for ${event.expense.merchant} was marked paid.`,
      };
    case 'expense_incomplete': {
      const missing = event.missing ?? [];
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
    return {
      ...wording,
      link: event.expense.sourceRefId ? { page: 'expense', expenseId: event.expense.sourceRefId } : null,
    };
  },

  /**
   * Deliver one event to its Argo user, at most once (the event id is the
   * dedupe key). 'skipped' is a decision, not a failure: an event we cannot
   * or should not deliver must not hold up the feed. Throws only when the
   * database does, so the scanner retries the page.
   */
  async deliver(event: MidasFeedEvent): Promise<'sent' | 'skipped'> {
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
    await notifyMany(recipients, { ...input, dedupeKey: event.id });
    return 'sent';
  },
};
