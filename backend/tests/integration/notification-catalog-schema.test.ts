import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 045 applied (migrate.ts silently skips on 42501). */
describe('notification catalog schema (migration 045)', () => {
  afterAll(async () => { await pool.end(); });

  it('creates the send-once ledger with a three-column primary key', async () => {
    const { rows } = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'notification_reminders'::regclass AND contype = 'p'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].def).toBe('PRIMARY KEY (kind, subject_id, user_id)');
  });

  it('adds the badge failure marker', async () => {
    const { rows } = await query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'badge_scans' AND column_name = 'crm_failure_notified_at'`
    );
    expect(rows[0]?.data_type).toBe('timestamp with time zone');
  });

  it('carried every already-sent flight reminder into the new ledger', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS missing
         FROM travel_reminders r
         JOIN checklist_flights f ON f.id = r.flight_id
        WHERE f.attendee_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM notification_reminders n
             WHERE n.kind = 'reminder.flight_' || r.kind
               AND n.subject_id = r.flight_id::text
               AND n.user_id = f.attendee_id)`
    );
    expect(rows[0].missing).toBe(0);
  });

  it('left no already-exhausted badge scan waiting to notify', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS waiting FROM badge_scans
        WHERE crm_status = 'failed' AND crm_attempts >= 5 AND crm_failure_notified_at IS NULL`
    );
    expect(rows[0].waiting).toBe(0);
  });
});
