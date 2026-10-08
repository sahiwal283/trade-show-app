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

  it('has exactly one SET NULL FK per user column and created_by is nullable and not unique', async () => {
    const { rows } = await query(
      `SELECT contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sample_requests'::regclass`
    );
    const fks = rows.filter((r: { contype: string }) => r.contype === 'f').map((r: { def: string }) => r.def);
    const onCol = (col: string) => fks.filter((d: string) => d.startsWith(`FOREIGN KEY (${col})`));
    expect(onCol('created_by')).toHaveLength(1);
    for (const col of ['created_by', 'submitted_by', 'last_edited_by']) {
      const found = onCol(col);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/REFERENCES users\(id\) ON DELETE SET NULL/);
    }
    const uniques = rows.filter((r: { contype: string }) => r.contype === 'u').map((r: { def: string }) => r.def);
    expect(uniques.some((d: string) => d.includes('created_by'))).toBe(false);
    const nullable = await query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='sample_requests' AND column_name='created_by'`
    );
    expect(nullable.rows[0].is_nullable).toBe('YES');
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
