/**
 * Travel Reminder Service
 *
 * Periodically scans booked flights with a departure_at and pushes:
 *   - checkin_24h  — "check in now", fires inside the 24h window before departure
 *   - departure_3h — "flight today",  fires inside the 3h window before departure
 *
 * Send-once guarantee: a travel_reminders row is inserted (ON CONFLICT DO
 * NOTHING) BEFORE the push goes out. If the insert reports a conflict the
 * reminder was already handled — safe across restarts and multiple instances.
 * A flight edited to a new departure time re-arms nothing by design (the
 * ledger is per flight+kind); coordinators who reschedule should delete and
 * re-add the flight row if reminders must re-fire.
 *
 * No-ops silently when push is not configured (PushService disabled).
 */

import { query } from '../config/database';
import { pushService } from './PushService';

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 15 * 1000; // let DB/migrations settle

interface DueFlightRow {
  id: number;
  attendee_id: string;
  carrier: string | null;
  confirmation_number: string | null;
  departure_at: string;
  event_name: string | null;
}

interface ReminderKind {
  kind: string;
  windowHours: number;
  title: string;
  body: (flight: DueFlightRow) => string;
}

const flightLabel = (flight: DueFlightRow): string => flight.carrier || 'Your flight';

const confirmationSuffix = (flight: DueFlightRow): string =>
  flight.confirmation_number ? ` Confirmation ${flight.confirmation_number}.` : '';

const REMINDER_KINDS: ReminderKind[] = [
  {
    kind: 'checkin_24h',
    windowHours: 24,
    title: '✈️ Time to check in',
    body: (flight) =>
      `${flightLabel(flight)} departs in about 24 hours${flight.event_name ? ` for ${flight.event_name}` : ''}. Check in with your airline now.${confirmationSuffix(flight)}`
  },
  {
    kind: 'departure_3h',
    windowHours: 3,
    title: '🛫 Flight today',
    body: (flight) =>
      `${flightLabel(flight)} departs in about 3 hours. Time to head out.${confirmationSuffix(flight)}`
  }
];

class TravelReminderService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    if (!pushService.isEnabled()) {
      console.log('[TravelReminders] Push not configured — reminder scheduler idle');
      return;
    }
    setTimeout(() => this.scan().catch(() => undefined), STARTUP_DELAY_MS);
    this.timer = setInterval(() => this.scan().catch(() => undefined), SCAN_INTERVAL_MS);
    console.log('[TravelReminders] Scheduler started (every 5 minutes: check-in T-24h, departure T-3h)');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scan pass over all reminder kinds. Never throws. */
  async scan(): Promise<void> {
    for (const reminder of REMINDER_KINDS) {
      try {
        await this.processKind(reminder);
      } catch (error) {
        console.error(`[TravelReminders] Scan failed for ${reminder.kind}:`, error);
      }
    }
  }

  private async processKind(reminder: ReminderKind): Promise<void> {
    const due = await query(
      `SELECT f.id, f.attendee_id, f.carrier, f.confirmation_number, f.departure_at,
              e.name AS event_name
       FROM checklist_flights f
       JOIN event_checklists c ON c.id = f.checklist_id
       LEFT JOIN events e ON e.id = c.event_id
       WHERE f.booked = true
         AND f.attendee_id IS NOT NULL
         AND f.departure_at IS NOT NULL
         AND f.departure_at > now()
         AND f.departure_at <= now() + ($1 || ' hours')::interval
         AND NOT EXISTS (
           SELECT 1 FROM travel_reminders r
           WHERE r.flight_id = f.id AND r.kind = $2
         )`,
      [String(reminder.windowHours), reminder.kind]
    );

    for (const flight of due.rows as DueFlightRow[]) {
      // Claim the reminder first — the ledger row is the send-once lock.
      const claimed = await query(
        `INSERT INTO travel_reminders (flight_id, kind)
         VALUES ($1, $2)
         ON CONFLICT (flight_id, kind) DO NOTHING
         RETURNING id`,
        [flight.id, reminder.kind]
      );
      if (claimed.rows.length === 0) continue; // another pass/instance got it

      await pushService.sendToUser(flight.attendee_id, {
        title: reminder.title,
        body: reminder.body(flight),
        url: '/'
      });
      console.log(
        `[TravelReminders] Sent ${reminder.kind} for flight ${flight.id} to user ${flight.attendee_id}`
      );
    }
  }
}

export const travelReminderService = new TravelReminderService();
