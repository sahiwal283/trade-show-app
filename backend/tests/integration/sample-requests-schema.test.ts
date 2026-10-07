// backend/tests/integration/sample-requests-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/**
 * Verifies migration 043 actually applied. migrate.ts silently skips a
 * migration on a 42501 permission error, so a clean start is not proof.
 */
const TABLES = [
  'sample_product_lines',
  'sample_products',
  'sample_materials',
  'sample_requests',
  'sample_request_items',
  'sample_request_materials',
  'notifications',
  'sample_request_reminders',
];

async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

describe('sample requests schema (migration 043)', () => {
  afterAll(async () => { await pool.end(); });

  it('creates all eight tables', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TABLES]
    );
    expect(rows.map((r: { table_name: string }) => r.table_name).sort()).toEqual([...TABLES].sort());
  });

  it('items carry the three agreed columns', async () => {
    const cols = await columnsOf('sample_request_items');
    expect(cols.has('singles')).toBe(true);
    expect(cols.has('displays')).toBe(true);
    expect(cols.has('empty_displays')).toBe(true);
  });

  it('seeds both brands and the materials list', async () => {
    const lines = await query(`SELECT brand, count(*)::int AS n FROM sample_product_lines GROUP BY brand`);
    const byBrand = Object.fromEntries(lines.rows.map((r: { brand: string; n: number }) => [r.brand, r.n]));
    expect(byBrand.boomin_brands).toBe(5);
    expect(byBrand.haute_brands).toBe(3);
    const products = await query(`SELECT count(*)::int AS n FROM sample_products`);
    expect(products.rows[0].n).toBe(40);
    const materials = await query(`SELECT count(*)::int AS n FROM sample_materials`);
    expect(materials.rows[0].n).toBe(6);
  });

  it('one request per user per event', async () => {
    const { rows } = await query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'sample_requests' AND indexdef ILIKE '%UNIQUE%'`
    );
    expect(rows.some((r: { indexdef: string }) => /event_id, user_id/.test(r.indexdef))).toBe(true);
  });
});
