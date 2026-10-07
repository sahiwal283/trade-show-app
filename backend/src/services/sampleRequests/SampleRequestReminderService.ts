/**
 * Every 15 minutes: for each show whose sample window closes within 48h,
 * remind every participant who has not submitted. Ledger-first send-once,
 * same pattern as TravelReminderService. Bell rows are written even when
 * push is not configured, so this scheduler always runs.
 */
import { query } from '../../config/database';
import { notificationService } from '../NotificationService';
import { computeSampleWindow, SAMPLE_CLOSE_DAYS_BEFORE } from './sampleRequestWindow';

const SCAN_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 20 * 1000;
const WINDOW_MS = 48 * 60 * 60 * 1000;
export const REMINDER_KIND = 'closing_48h';

interface CandidateEvent {
  id: string; name: string; created_at: string;
  travel_start_date: string | null; show_start_date: string | null;
}

const hoursLeft = (closesAt: string, now: number): number => Math.max(1, Math.round((new Date(closesAt).getTime() - now) / 3_600_000));

class SampleRequestReminderService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    setTimeout(() => this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
    console.log('[SampleReminders] Scheduler started (every 15 minutes: closing T-48h)');
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** One pass. Never throws. */
  async scan(): Promise<void> {
    try {
      const now = Date.now();
      // Candidate shows: close = anchor − SAMPLE_CLOSE_DAYS_BEFORE days, so a close inside the
      // next 48h means an anchor at most CLOSE_DAYS + 2 days out; +4 leaves timezone slack.
      const events = await query(
        `SELECT id, name, created_at, travel_start_date, show_start_date
         FROM events
         WHERE status <> 'cancelled'
           AND COALESCE(travel_start_date, show_start_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
        [SAMPLE_CLOSE_DAYS_BEFORE + 4]
      );
      for (const event of events.rows as CandidateEvent[]) {
        const w = computeSampleWindow(event, new Date(now));
        if (!w.closesAt) continue;
        const closeMs = new Date(w.closesAt).getTime();
        if (closeMs <= now || closeMs - now > WINDOW_MS) continue;
        await this.remindEvent(event, w.closesAt, now);
      }
    } catch (error) {
      console.error('[SampleReminders] Scan failed:', error);
    }
  }

  private async remindEvent(event: CandidateEvent, closesAt: string, now: number): Promise<void> {
    const due = await query(
      `SELECT ep.user_id
       FROM event_participants ep
       LEFT JOIN sample_requests sr ON sr.event_id = ep.event_id AND sr.user_id = ep.user_id
       WHERE ep.event_id = $1 AND (sr.status IS NULL OR sr.status <> 'submitted')`,
      [event.id]
    );
    for (const { user_id } of due.rows as Array<{ user_id: string }>) {
      const claimed = await query(
        `INSERT INTO sample_request_reminders (event_id, user_id, kind) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id, kind) DO NOTHING RETURNING event_id`,
        [event.id, user_id, REMINDER_KIND]
      );
      if (claimed.rows.length === 0) continue;
      await notificationService.notify(user_id, {
        kind: `sample_request.${REMINDER_KIND}`,
        title: `Sample request closes in ${hoursLeft(closesAt, now)}h · ${event.name}`,
        body: `You have not submitted your sample request for ${event.name}. Submit it before the window closes.`,
        link: { page: 'checklist', eventId: event.id },
      });
      console.log(`[SampleReminders] Sent ${REMINDER_KIND} for event ${event.id} to ${user_id}`);
    }
  }
}

export const sampleRequestReminderService = new SampleRequestReminderService();
