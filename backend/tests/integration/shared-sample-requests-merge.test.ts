import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../src/config/database';

/**
 * Runs migration 044 against fixtures in a throwaway schema (pre-044 shape,
 * default constraint names as in production) and checks the merge.
 */
const schema = `merge_044_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
let c: PoolClient;

const id = () => randomUUID();
const U1 = id(), U2 = id();
const P = id(), Q = id(), LINE = id(), MAT = id();
const EA = id(), EB = id(), EC = id(), ED = id(), EE = id();
const A1 = id(), A2 = id(), B1 = id(), B2 = id(), C1 = id(), C2 = id(), D1 = id(), E1 = id();

const t = (s: string) => `'${s}'::timestamptz`;

async function req(rid: string, ev: string, user: string, status: string, created: string, updated: string, submitted: string | null) {
  await c.query(
    `INSERT INTO sample_requests (id, event_id, user_id, status, submitted_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,${submitted ? t(submitted) : 'NULL'},${t(created)},${t(updated)})`,
    [rid, ev, user, status]
  );
}
const item = (rid: string, prod: string, singles: number) =>
  c.query(`INSERT INTO sample_request_items (request_id, product_id, singles) VALUES ($1,$2,$3)`, [rid, prod, singles]);
const mat = (rid: string, qty: number, notes: string | null) =>
  c.query(`INSERT INTO sample_request_materials (request_id, material_id, qty, notes) VALUES ($1,$2,$3,$4)`, [rid, MAT, qty, notes]);

beforeAll(async () => {
  c = await pool.connect();
  await c.query(`CREATE SCHEMA ${schema}`);
  await c.query(`SET search_path TO ${schema}`);
  await c.query(`
    CREATE TABLE users (id uuid PRIMARY KEY, name text);
    CREATE TABLE events (id uuid PRIMARY KEY, name text);
    CREATE TABLE sample_product_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand TEXT NOT NULL CHECK (brand IN ('haute_brands', 'boomin_brands')),
      name TEXT NOT NULL, position INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (brand, name));
    CREATE TABLE sample_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_line_id UUID NOT NULL REFERENCES sample_product_lines(id) ON DELETE RESTRICT,
      name TEXT NOT NULL, position INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (product_line_id, name));
    CREATE TABLE sample_materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE, position INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE sample_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, user_id));
    CREATE TABLE sample_request_items (
      request_id UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES sample_products(id) ON DELETE RESTRICT,
      singles INT NOT NULL DEFAULT 0 CHECK (singles >= 0),
      displays INT NOT NULL DEFAULT 0 CHECK (displays >= 0),
      empty_displays INT NOT NULL DEFAULT 0 CHECK (empty_displays >= 0),
      PRIMARY KEY (request_id, product_id));
    CREATE TABLE sample_request_materials (
      request_id UUID NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
      material_id UUID NOT NULL REFERENCES sample_materials(id) ON DELETE RESTRICT,
      qty INT NOT NULL DEFAULT 0 CHECK (qty >= 0), notes TEXT,
      PRIMARY KEY (request_id, material_id));
    CREATE INDEX sample_requests_event_idx ON sample_requests (event_id);
  `);
  await c.query(`INSERT INTO users VALUES ($1,'u1'),($2,'u2')`, [U1, U2]);
  for (const e of [EA, EB, EC, ED, EE]) await c.query(`INSERT INTO events VALUES ($1,'e')`, [e]);
  await c.query(`INSERT INTO sample_product_lines (id, brand, name) VALUES ($1,'haute_brands','L')`, [LINE]);
  await c.query(`INSERT INTO sample_products (id, product_line_id, name) VALUES ($1,$3,'P'),($2,$3,'Q')`, [P, Q, LINE]);
  await c.query(`INSERT INTO sample_materials (id, name) VALUES ($1,'M')`, [MAT]);

  // A: earlier submitted (U1), later draft (U2)
  await req(A1, EA, U1, 'submitted', '2026-01-01T10:00Z', '2026-01-02T10:00Z', '2026-01-02T10:00Z');
  await req(A2, EA, U2, 'draft', '2026-01-03T10:00Z', '2026-01-04T10:00Z', null);
  await item(A1, P, 2); await item(A2, P, 3); await item(A2, Q, 4);
  await mat(A1, 1, 'first'); await mat(A2, 2, ' second ');
  // B: two drafts
  await req(B1, EB, U1, 'draft', '2026-01-01T10:00Z', '2026-01-02T10:00Z', null);
  await req(B2, EB, U2, 'draft', '2026-01-03T10:00Z', '2026-01-04T10:00Z', null);
  await item(B1, P, 1); await item(B2, P, 6);
  // C: earlier draft (U1) keeper, later submitted (U2)
  await req(C1, EC, U1, 'draft', '2026-01-01T10:00Z', '2026-01-02T10:00Z', null);
  await req(C2, EC, U2, 'submitted', '2026-01-03T10:00Z', '2026-01-04T10:00Z', '2026-01-04T10:00Z');
  await item(C1, P, 1); await item(C2, P, 1);
  // D: single submitted with item + material with padded notes
  await req(D1, ED, U2, 'submitted', '2026-01-01T10:00Z', '2026-01-02T10:00Z', '2026-01-02T10:00Z');
  await item(D1, P, 7); await mat(D1, 5, '  padded  ');
  // E: single untouched draft
  await req(E1, EE, U1, 'draft', '2026-01-01T10:00Z', '2026-01-02T10:00Z', null);

  await c.query(fs.readFileSync(path.join(__dirname, '../../src/database/migrations/044_shared_sample_requests.sql'), 'utf8'));
});

afterAll(async () => {
  try {
    await c.query(`SET search_path TO public`);
    await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    c.release();
    await pool.end();
  }
});

const reqs = async (ev: string) => (await c.query(`SELECT * FROM sample_requests WHERE event_id = $1`, [ev])).rows;
const singles = async (rid: string, prod: string) =>
  (await c.query(`SELECT singles FROM sample_request_items WHERE request_id=$1 AND product_id=$2`, [rid, prod])).rows[0]?.singles;
const material = async (rid: string) =>
  (await c.query(`SELECT qty, notes FROM sample_request_materials WHERE request_id=$1 AND material_id=$2`, [rid, MAT])).rows[0];

describe('migration 044 merge', () => {
  it('A: sums items and materials, keeps earlier notes, submitted', async () => {
    const r = await reqs(EA);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(A1);
    expect(await singles(A1, P)).toBe(5);
    expect(await singles(A1, Q)).toBe(4);
    expect(await material(A1)).toEqual({ qty: 3, notes: 'first' });
    expect(r[0].status).toBe('submitted');
    expect(r[0].submitted_by).toBe(U1);
    expect(r[0].last_edited_by).toBe(U2);
  });

  it('B: two drafts stay a draft with summed quantities', async () => {
    const r = await reqs(EB);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('draft');
    expect(r[0].submitted_by).toBeNull();
    expect(await singles(r[0].id, P)).toBe(7);
  });

  it('C: draft keeper becomes submitted, submitted_by is the later row user', async () => {
    const r = await reqs(EC);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(C1);
    expect(r[0].status).toBe('submitted');
    expect(r[0].submitted_by).toBe(U2);
  });

  it('D: single-row event is untouched in quantities and notes, attribution backfilled', async () => {
    const r = await reqs(ED);
    expect(r).toHaveLength(1);
    expect(await singles(D1, P)).toBe(7);
    expect(await material(D1)).toEqual({ qty: 5, notes: '  padded  ' });
    expect(r[0].submitted_by).toBe(U2);
    expect(r[0].last_edited_by).toBe(U2);
  });

  it('E: untouched single draft gets no attribution', async () => {
    const r = await reqs(EE);
    expect(r).toHaveLength(1);
    expect(r[0].submitted_by).toBeNull();
    expect(r[0].last_edited_by).toBeNull();
  });

  it('globally: one request per event and UNIQUE (event_id) exists', async () => {
    const dup = await c.query(`SELECT event_id FROM sample_requests GROUP BY event_id HAVING count(*) > 1`);
    expect(dup.rows).toEqual([]);
    const u = await c.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sample_requests'::regclass AND contype = 'u'`
    );
    expect(u.rows.map((x: { def: string }) => x.def)).toContain('UNIQUE (event_id)');
  });
});
