// backend/src/services/notifications/ReminderScheduler.ts
/**
 * One loop for every scheduled reminder (see reminderDefinitions.ts).
 *
 * Send-once guarantee: a notification_reminders row is inserted (ON CONFLICT
 * DO NOTHING) BEFORE the notification goes out. A conflict means another
 * pass or instance already handled it. A crash between the claim and the
 * send loses that one reminder and never duplicates it.
 *
 * Runs whether or not push is configured: the bell row is the durable half.
 */
import { query } from '../../config/database';
import { notifyMany } from './notifyMany';
import { REMINDER_DEFINITIONS, ReminderDefinition, DueRow } from './reminderDefinitions';

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // flight reminders need the 5-minute grain
const STARTUP_DELAY_MS = 15 * 1000; // let DB/migrations settle

export class ReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly definitions: ReminderDefinition[] = REMINDER_DEFINITIONS) {}

  start(): void {
    if (this.timer) return;
    setTimeout(() => void this.scan(), STARTUP_DELAY_MS);
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    console.log(`[Reminders] Scheduler started (every 5 minutes: ${this.definitions.map((d) => d.kind).join(', ')})`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One pass over every definition. Never throws. */
  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const definition of this.definitions) {
        try {
          await this.process(definition);
        } catch (error) {
          console.error(`[Reminders] Scan failed for ${definition.kind}:`, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async process(definition: ReminderDefinition): Promise<void> {
    const due = await query(definition.dueSql, [definition.kind]);
    for (const row of due.rows as DueRow[]) {
      // Per recipient: one failed claim must not abort the rest of the pass.
      try {
        const claimed = await query(
          `INSERT INTO notification_reminders (kind, subject_id, user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (kind, subject_id, user_id) DO NOTHING
           RETURNING kind`,
          [definition.kind, row.subject_id, row.user_id]
        );
        if (claimed.rows.length === 0) continue; // another pass/instance got it
        await notifyMany([row.user_id], definition.build(row));
        console.log(`[Reminders] Sent ${definition.kind} for ${row.subject_id} to user ${row.user_id}`);
      } catch (error) {
        console.error(`[Reminders] ${definition.kind} failed for ${row.subject_id}, user ${row.user_id}:`, error);
      }
    }
  }
}

export const reminderScheduler = new ReminderScheduler();
