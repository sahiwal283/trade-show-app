/**
 * Pulls Midas's event feed and turns each event into an Argo notification.
 *
 * Midas hands submitter-facing notifications on our expenses to us instead of
 * delivering them itself. The pull is the delivery path: it is ordered by
 * seq and the cursor moves only after a page is fully handled, so a crash
 * re-reads the page and the notification's dedupe key makes that a no-op.
 * Midas also pings us when it records an event (routes/midasPing.ts calls
 * trigger()), which makes delivery near-instant; the timer is the safety net
 * for a lost ping.
 *
 * Runs whether or not push is configured: the bell row is the durable half.
 */
import { getMidasClient } from './index';
import { isMessagingEnabled } from '../ExpenseMessageService';
import { getCursor, setCursor } from '../../database/repositories/ExpenseMessageNotificationRepository';
import { expenseNotifications } from '../notifications';

/** Key in midas_message_sync_state. Distinct from the retired message scanner's 'trade_show'. */
const CURSOR_KEY = 'trade_show:events';
const STARTUP_DELAY_MS = 20_000;
/** Guards against an unbounded loop if a cursor ever fails to advance. */
const MAX_PAGES = 50;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function intervalMs(): number {
  return positiveInt(process.env.MIDAS_MESSAGE_SCAN_INTERVAL_MS, 120000);
}

function pageSize(): number {
  return positiveInt(process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE, 100);
}

export class MidasEventScanner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** A ping arrived mid-scan: go round once more when this scan finishes. */
  private rerun = false;

  start(): void {
    if (this.timer) return;
    if (!isMessagingEnabled()) {
      console.log('[MidasEvents] Expense messaging not enabled — event scanner idle');
      return;
    }
    setTimeout(() => void this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.scan(), intervalMs());
    console.log(`[MidasEvents] Scanner started (every ${intervalMs()}ms, plus on ping)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Midas says there is something new. Never overlaps a running scan. */
  trigger(): void {
    if (!isMessagingEnabled()) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    void this.scan();
  }

  /** One sweep to the end of the feed. Never throws. */
  async scan(): Promise<void> {
    if (!isMessagingEnabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      const client = getMidasClient();
      const size = pageSize();
      let cursor = (await getCursor(CURSOR_KEY)) ?? '0';

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await client.listEventsSince(cursor, size);
        if (result.events.length === 0) return;

        // A throw here (database down) leaves the cursor unmoved: the next
        // tick re-reads this page and the dedupe key absorbs the repeats.
        // 'skipped' events are decided, not deferred, so the cursor passes them.
        for (const event of result.events) {
          try {
            await expenseNotifications.deliver(event);
          } catch (error) {
            console.error(`[MidasEvents] Delivery failed at seq ${event.seq} (${event.id}); will retry:`, error);
            return;
          }
        }

        // The cursor comes from what was delivered, never from the feed's
        // nextCursor, so a bad feed cannot move it backwards or skip events.
        const lastSeq = Number(result.events[result.events.length - 1].seq);
        if (!Number.isFinite(lastSeq) || !(lastSeq > Number(cursor))) {
          console.error(`[MidasEvents] Feed did not advance past cursor ${cursor} (last seq ${lastSeq}) — stopping this scan`);
          return;
        }
        cursor = String(lastSeq);
        await setCursor(CURSOR_KEY, cursor);
        if (result.events.length < size) return;
      }
      console.warn(`[MidasEvents] Stopped after ${MAX_PAGES} pages with more available`);
    } catch (error) {
      console.error('[MidasEvents] Scan failed:', error);
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.scan();
      }
    }
  }
}

export const midasEventScanner = new MidasEventScanner();
