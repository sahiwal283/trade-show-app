/**
 * Polls Midas for new expense messages and turns them into Trade Show
 * notifications.
 *
 * Midas has no outbound webhook infrastructure, so delivery is a pull. The
 * cursor advances only after a batch is persisted, which makes this
 * at-least-once; the UNIQUE constraint on midas_message_id collapses a
 * redelivery into a no-op, so the observable behaviour is effectively-once.
 *
 * Like ReminderScheduler, this does NOT idle when push is unconfigured —
 * the notification rows drive the in-app bell, and push is the optional half.
 */

import { getMidasClient } from './midas';
import { isMessagingEnabled } from './ExpenseMessageService';
import { query } from '../config/database';
import { pushService } from './PushService';
import {
  recordNotifications, getCursor, setCursor,
  type NotificationInsert,
} from '../database/repositories/ExpenseMessageNotificationRepository';
import type { MidasFeedMessage } from './midas/MidasTypes';

const SOURCE_APP = 'trade_show';
const STARTUP_DELAY_MS = 20_000;
const SNIPPET_MAX = 160;

/** Guards against an unbounded loop if a cursor ever fails to advance. */
const MAX_PAGES = 50;

function intervalMs(): number {
  return parseInt(process.env.MIDAS_MESSAGE_SCAN_INTERVAL_MS || '120000', 10);
}

function pageSize(): number {
  return parseInt(process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE || '100', 10);
}

function snippet(body: string): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length <= SNIPPET_MAX ? clean : `${clean.slice(0, SNIPPET_MAX - 1)}…`;
}

export class ExpenseMessageScanner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    // Same three-condition gate the routes use — EXPENSE_MESSAGING_ENABLED
    // alone is not enough: with MIDAS_MODE=disabled this used to start
    // anyway and throw-and-log getMidasClient() every tick.
    if (!isMessagingEnabled()) {
      console.log('[ExpenseMessages] Messaging not enabled — scanner idle');
      return;
    }
    setTimeout(() => this.scan().catch(() => undefined), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.scan().catch(() => undefined), intervalMs());
    console.log(`[ExpenseMessages] Scanner started (every ${intervalMs()}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One full sweep: follow cursors to exhaustion, persisting after each page.
   * Never throws — a messaging failure must not disturb expense review.
   */
  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const client = getMidasClient();
      let cursor = await getCursor(SOURCE_APP);
      // A missing cursor row means this deployment has never scanned. Seeding
      // walks to the current head WITHOUT notifying: replaying history would
      // push every past message at every user the moment the feature is
      // switched on.
      const seeding = cursor === null;
      // Whether this call has durably advanced the watermark yet. Lets the
      // empty-page branch below tell "the very first page of a fresh seed,
      // nothing written yet" apart from "a later empty page reached after
      // real history was already consumed within this same walk" — only the
      // former needs the extra write.
      let advanced = false;
      const size = pageSize();

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await client.listMessagesSince(SOURCE_APP, cursor || undefined, size);

        if (result.messages.length === 0) {
          // A fresh deployment with a genuinely empty feed would otherwise
          // never write a cursor row at all (no setCursor call below ever
          // runs), leaving getCursor() returning null forever — indistinguishable
          // from "never scanned" — so `seeding` stays true and the first real
          // batch that eventually arrives gets walked past unnotified. Mark
          // this deployment seeded now: there is no backlog to skip, since
          // the feed was empty when we looked.
          if (seeding && !advanced) {
            await setCursor(SOURCE_APP, result.nextCursor ?? '');
          }
          // Nothing new. Leave the watermark exactly where it was otherwise.
          return;
        }

        if (!seeding) {
          const rows = await this.toNotifications(result.messages);
          // Push only for rows genuinely inserted this call. Pushing for
          // every row in `rows` regardless of what was written would
          // re-notify on every redelivery once the cursor and the insert
          // fall out of lockstep (insert succeeds, setCursor fails or the
          // process dies before it runs) — the UNIQUE constraint protects
          // the stored row, not the push send layered on top of it.
          const insertedIds = new Set(await recordNotifications(rows));
          for (const row of rows) {
            if (!insertedIds.has(row.midasMessageId)) continue;
            void pushService.sendToUser(row.userId, {
              title: row.requestType ? 'Action required on your expense' : 'New message on your expense',
              body: `${row.senderName}: ${row.bodySnippet}`,
              // This app has no path router — deep links are hashes read by
              // ExpenseSubmission (#new-expense, #event=…). A /expenses/:id URL
              // would just land on the dashboard. row.expenseRefId is the
              // expense's PUBLIC id (midasExpenseId never is — the frontend
              // never sees Midas ids) — omit the link entirely rather than
              // emit one built from midasExpenseId that can never match an
              // expense and would just get silently cleared on open.
              url: row.expenseRefId ? `/#expense=${row.expenseRefId}` : undefined,
            });
          }
        }

        // Advance only after the batch is durable — a throw above leaves the
        // watermark unmoved and the next tick retries the same window, which
        // the UNIQUE constraint makes safe. Skipped messages are decided, not
        // deferred, so the cursor moves past them too.
        if (result.nextCursor) {
          await setCursor(SOURCE_APP, result.nextCursor);
          cursor = result.nextCursor;
          advanced = true;
        }

        // A short page means we reached the head.
        if (result.messages.length < size) return;
      }

      console.warn(`[ExpenseMessages] Stopped after ${MAX_PAGES} pages with more available`);
    } catch (error) {
      console.error('[ExpenseMessages] Scan failed:', error);
    } finally {
      this.running = false;
    }
  }

  private async toNotifications(messages: MidasFeedMessage[]): Promise<NotificationInsert[]> {
    const rows: NotificationInsert[] = [];

    for (const m of messages) {
      // System messages are app-written annotations, not conversation.
      if (m.isSystem) continue;
      // Never notify someone about their own message.
      if (m.sender.id && m.sender.id === m.expense.ownerUserId) continue;

      const externalUserId = m.expense.externalUserId;
      if (!externalUserId) continue;

      const found = await query(`SELECT id FROM users WHERE id = $1`, [externalUserId]);
      if (found.rows.length === 0) {
        console.log(`[ExpenseMessages] No Trade Show user for ${externalUserId} — skipping ${m.id}`);
        continue;
      }

      rows.push({
        userId: externalUserId,
        midasMessageId: m.id,
        midasExpenseId: m.expense.id,
        expenseRefId: m.expense.sourceRefId,
        senderName: m.sender.name,
        senderRole: m.sender.role,
        bodySnippet: snippet(m.body),
        requestType: m.requestType,
        messageCreatedAt: m.createdAt,
      });
    }

    return rows;
  }
}

export const expenseMessageScanner = new ExpenseMessageScanner();
