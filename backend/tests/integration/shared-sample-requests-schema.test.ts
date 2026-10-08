// backend/tests/integration/shared-sample-requests-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 044 applied (migrate.ts silently skips on 42501). */
async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

describe('shared sample requests schema (migration 044)', () => {
  afterAll(async () => { await pool.end(); });

  it('reshapes sample_requests to one row per event', async () => {
    const cols = await columnsOf('sample_requests');
    expect(cols.has('created_by')).toBe(true);
    expect(cols.has('user_id')).toBe(false);
    expect(cols.has('submitted_by')).toBe(true);
    expect(cols.has('last_edited_by')).toBe(true);
    expect(cols.has('last_edited_at')).toBe(true);
    const { rows } = await query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sample_requests'::regclass`
    );
    const defs = rows.map((r: { conname: string; def: string }) => `${r.conname}: ${r.def}`);
    expect(defs.some((d: string) => /UNIQUE \(event_id\)$/.test(d))).toBe(true);
    expect(defs.some((d: string) => /\(event_id, user_id\)/.test(d))).toBe(false);
    expect(defs.some((d: string) => /\(created_by\) REFERENCES users\(id\) ON DELETE SET NULL/.test(d))).toBe(true);
  });

  it('creates sample_request_changes with its index', async () => {
    const cols = await columnsOf('sample_request_changes');
    for (const c of ['request_id', 'user_id', 'kind', 'target_id', 'field', 'old_value', 'new_value', 'changed_at']) {
      expect(cols.has(c)).toBe(true);
    }
    const { rows } = await query(`SELECT indexname FROM pg_indexes WHERE tablename = 'sample_request_changes'`);
    expect(rows.map((r: { indexname: string }) => r.indexname)).toContain('sample_request_changes_request_idx');
  });

  it('merged any per-rep rows: no event has more than one request', async () => {
    const { rows } = await query(`SELECT event_id, count(*)::int AS n FROM sample_requests GROUP BY event_id HAVING count(*) > 1`);
    expect(rows).toEqual([]);
  });
});
