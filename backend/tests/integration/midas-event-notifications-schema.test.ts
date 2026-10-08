import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 046 applied (migrate.ts silently skips on 42501) and that its dedupe key behaves. */
const PREFIX = `mig046-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userId: string;

beforeAll(async () => {
  userId = (await query(
    `INSERT INTO users (username, password, name, email, role) VALUES ($1, 'x', $1, $2, 'salesperson') RETURNING id`,
    [PREFIX, `${PREFIX}@example.test`]
  )).rows[0].id;
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
  await pool.end();
});

describe('migration 046', () => {
  it('adds a unique, nullable source_event_id', async () => {
    const col = await query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'source_event_id'`
    );
    expect(col.rows[0]?.is_nullable).toBe('YES');
    const uniq = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'notifications'::regclass AND contype = 'u'`
    );
    expect(uniq.rows.map((r: { def: string }) => r.def)).toContain('UNIQUE (source_event_id)');
  });

  it('a second insert with the same event id is a no-op, and rows without one never collide', async () => {
    const insert = (eventId: string | null) => query(
      `INSERT INTO notifications (user_id, kind, title, body, source_event_id) VALUES ($1, 'expense.approved', 'T', 'B', $2)
       ON CONFLICT (source_event_id) DO NOTHING RETURNING id`,
      [userId, eventId]
    );
    const key = `${PREFIX}-evt`;
    expect((await insert(key)).rows).toHaveLength(1);
    expect((await insert(key)).rows).toHaveLength(0);
    expect((await insert(null)).rows).toHaveLength(1);
    expect((await insert(null)).rows).toHaveLength(1);
  });

  it('left no unread legacy message notification behind', async () => {
    const { rows } = await query(
      `SELECT count(*)::int AS missing FROM expense_message_notifications m
        WHERE m.read_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.source_event_id = 'legacy-message:' || m.midas_message_id::text)`
    );
    expect(rows[0].missing).toBe(0);
  });
});
