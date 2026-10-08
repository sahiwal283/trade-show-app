// backend/tests/integration/reminder-windows.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { eventDueSql, EventReminderKind } from '../../src/services/notifications/reminderDefinitions';

/**
 * Real-database proof of the reminder windows. The windows live in SQL, so
 * only Postgres can say which events are due on a given day.
 */
const PREFIX = `reminder-windows-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;
let inactiveUserId: string;
const eventIds = new Map<string, string>();

/**
 * "Today" exactly as the due queries see it, so the fixtures line up with the
 * windows at any time of day and in any database session timezone.
 */
const TODAY = `(now() AT TIME ZONE 'America/New_York')::date`;

/** Offsets are days from today. */
async function mkEvent(tag: string, travel: number, showStart: number, showEnd: number, status = 'upcoming') {
  const { rows } = await query(
    `INSERT INTO events (name, venue, city, state, start_date, end_date,
                         show_start_date, show_end_date, travel_start_date, travel_end_date, status)
     VALUES ($1, 'v', 'c', 's',
             ${TODAY} + $3::int, ${TODAY} + $4::int,
             ${TODAY} + $3::int, ${TODAY} + $4::int,
             ${TODAY} + $2::int,
             ${TODAY} + $4::int, $5)
     RETURNING id`,
    [`${PREFIX}-${tag}`, travel, showStart, showEnd, status]
  );
  eventIds.set(tag, rows[0].id);
  await query(`INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2), ($1, $3)`, [rows[0].id, userId, inactiveUserId]);
}

/**
 * HOUR GATE NEUTRALISED ON PURPOSE: production sends these reminders only
 * from 9 am Eastern. The windows are tested with earliestHour = 0 (the same
 * query, gate always open) so this file passes at any time of day; the gate
 * itself is covered by its own test below.
 */
const GATE_OPEN = 0;

async function dueTags(kind: EventReminderKind, earliestHour = GATE_OPEN): Promise<string[]> {
  const { rows } = await query(eventDueSql(kind, earliestHour), [kind]);
  const byId = new Map([...eventIds].map(([tag, id]) => [id, tag]));
  return rows
    .filter((r: any) => byId.has(r.subject_id))
    .map((r: any) => { expect(r.user_id).toBe(userId); return byId.get(r.subject_id)!; })
    .sort();
}

beforeAll(async () => {
  const mkUser = async (tag: string, active: boolean) => (await query(
    `INSERT INTO users (username, password, name, email, role, is_active) VALUES ($1, 'x', $2, $3, 'salesperson', $4) RETURNING id`,
    [`${PREFIX}-${tag}`, `${PREFIX} ${tag}`, `${PREFIX}-${tag}@example.test`, active]
  )).rows[0].id as string;
  userId = await mkUser('active', true);
  inactiveUserId = await mkUser('inactive', false);

  // Upcoming shows: travel starts N days out, show runs N+1 .. N+3.
  for (const n of [31, 30, 23, 22, 8, 7, 0]) await mkEvent(`in-${n}`, n, n + 1, n + 3);
  await mkEvent('started-yesterday', -1, 0, 2);
  await mkEvent('in-5', 5, 6, 8);
  await mkEvent('cancelled-in-5', 5, 6, 8, 'cancelled');
  await mkEvent('claimed-in-5', 5, 6, 8);
  await query(
    `INSERT INTO notification_reminders (kind, subject_id, user_id) VALUES ('reminder.event_7d', $1, $2)`,
    [eventIds.get('claimed-in-5'), userId]
  );

  // Finished shows: show ended N days ago.
  for (const n of [0, 1, 6, 7, 13, 14]) await mkEvent(`ended-${n}`, -n - 5, -n - 3, -n, 'completed');
  await mkEvent('cancelled-ended-2', -7, -5, -2, 'cancelled');
});

afterAll(async () => {
  const ids = [...eventIds.values()];
  await query(`DELETE FROM notification_reminders WHERE subject_id = ANY($1::text[])`, [ids]);
  await query(`DELETE FROM events WHERE id = ANY($1::uuid[])`, [ids]);
  await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userId, inactiveUserId]]);
  await pool.end();
});

describe('reminder windows (real database)', () => {
  it('30-day reminder: days 30 down to 23 only', async () => {
    expect(await dueTags('reminder.event_30d')).toEqual(['in-23', 'in-30']);
  });

  it('7-day reminder: days 7 down to 0, never cancelled or already claimed', async () => {
    expect(await dueTags('reminder.event_7d')).toEqual(['in-0', 'in-5', 'in-7']);
  });

  it('first expense reminder: 1 to 6 days after the show ends', async () => {
    expect(await dueTags('reminder.expenses_1d')).toEqual(['ended-1', 'ended-6']);
  });

  it('second expense reminder: 7 to 13 days after the show ends', async () => {
    expect(await dueTags('reminder.expenses_7d')).toEqual(['ended-13', 'ended-7']);
  });

  it('hour gate: nothing is due before the earliest hour (24 never arrives)', async () => {
    for (const kind of ['reminder.event_30d', 'reminder.event_7d', 'reminder.expenses_1d', 'reminder.expenses_7d'] as const) {
      expect(await dueTags(kind, 24)).toEqual([]);
    }
  });
});
