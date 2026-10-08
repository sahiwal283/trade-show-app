/**
 * Trade Show side of Midas-owned expense message threads.
 *
 * Two responsibilities Midas cannot do for us:
 *   1. Translate a Trade Show expense id into the Midas id a thread is keyed
 *      by. midasDtoToTsExpense publishes sourceRefId as the public id, so the
 *      frontend never sees a Midas id and must not have to.
 *   2. Gate requestType by Trade Show role before it reaches Ext.
 *   3. Authorize access to the thread itself. getExpenseStore().getById()
 *      does NOT enforce per-user access — both MidasExpenseStore and
 *      LocalExpenseStore ignore the actor argument entirely — so
 *      resolveMidasId is the only gate a private accountant<->submitter
 *      conversation has. It must run for both reads and writes.
 */

import { getMidasClient, getExpenseBackend, getMidasMode } from './midas';
import { getExpenseStore } from './expenseStore';
import { notificationRepository } from '../database/repositories/NotificationRepository';
import { CONVERSATION_KINDS } from './notifications/expenseNotifications';
import type { ExpenseActor } from './expenseStore/ExpenseStore';
import type { MidasMessageDto } from './midas/MidasTypes';

/** Roles permitted to attach a requestType, mirroring Midas privilege. */
const PRIVILEGED_ROLES = new Set(['admin', 'accountant', 'coordinator', 'developer']);

export interface PostMessageInput {
  body: string;
  requestType?: string | null;
}

export class MessagingUnavailableError extends Error {
  code = 'MESSAGING_UNAVAILABLE';
}

/**
 * Messaging needs an explicit opt-in AND a Midas-backed expense store. A local
 * store has no threads at all, so a half-working panel would be worse than none.
 */
export function isMessagingEnabled(): boolean {
  return (
    process.env.EXPENSE_MESSAGING_ENABLED === 'true' &&
    getExpenseBackend() === 'midas' &&
    getMidasMode() !== 'disabled'
  );
}

export class ExpenseMessageService {
  private async resolveMidasId(expenseId: string, actor: ExpenseActor): Promise<string> {
    const expense = await getExpenseStore().getById(expenseId, actor);
    if (!expense) throw new Error('Expense not found');
    const isOwner = expense.userId === actor.id;
    if (!isOwner && !PRIVILEGED_ROLES.has(actor.role)) {
      // Same message a genuinely missing expense throws — a distinct
      // "forbidden" response would let a caller confirm the expense UUID
      // exists just by trying it, which is exactly what this gate exists
      // to prevent.
      throw new Error('Expense not found');
    }
    if (!expense.midasExpenseId) throw new Error('Expense is not linked to Midas');
    return expense.midasExpenseId;
  }

  /**
   * Thread messages, each flagged with whether the viewer wrote it.
   *
   * sender.id is a MIDAS user id and actor.id is a TRADE SHOW user id — they
   * are different id spaces and never compare equal. Email is the identity the
   * two systems already share (it is how expenses are attributed on create),
   * so it is the join key here too.
   */
  async getThread(
    expenseId: string,
    actor: ExpenseActor
  ): Promise<Array<MidasMessageDto & { isMine: boolean }>> {
    const midasId = await this.resolveMidasId(expenseId, actor);
    const messages = await getMidasClient().listExpenseMessages(midasId);
    const mine = actor.email.trim().toLowerCase();
    return messages.map((m) => ({
      ...m,
      // sender.email is only needed to compute isMine — it must not leak to
      // the browser (and from there into the IndexedDB message cache).
      sender: { ...m.sender, email: null },
      isMine: !!m.sender.email && m.sender.email.trim().toLowerCase() === mine,
    }));
  }

  async postMessage(
    expenseId: string,
    input: PostMessageInput,
    actor: ExpenseActor
  ): Promise<MidasMessageDto> {
    if (input.requestType && !PRIVILEGED_ROLES.has(actor.role)) {
      throw new Error('Setting requestType is not permitted for this role');
    }
    const midasId = await this.resolveMidasId(expenseId, actor);
    return getMidasClient().postExpenseMessage(
      midasId,
      { body: input.body, requestType: input.requestType ?? null },
      {
        email: actor.email,
        externalUserId: actor.id,
        name: actor.name,
        requestId: undefined,
      }
    );
  }

  /**
   * The user opened this expense's conversation: clear their message,
   * mention and info-request notifications for it. Scoped to the caller's
   * own notifications, so it needs no access check against the expense and
   * no call to Midas.
   */
  async markRead(expenseId: string, actor: ExpenseActor): Promise<number> {
    return notificationRepository.markReadForExpense(actor.id, expenseId, CONVERSATION_KINDS);
  }
}

export const expenseMessageService = new ExpenseMessageService();
