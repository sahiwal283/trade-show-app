import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';

/**
 * Real-database proof that applyRows serializes per request: overlapping
 * patches neither lose history, nor deadlock, nor drop rows, and field-level
 * patches to the same row merge instead of overwriting each other.
 */
const PREFIX = `sdd-concurrency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userA: string, userB: string, eventId: string, requestId: string;
let productIds: string[] = [];

const mkUser = async (tag: string) => (await query(
  `INSERT INTO users (username, password, name, email, role) VALUES ($1, 'x', $2, $3, 'admin') RETURNING id`,
  [`${PREFIX}-${tag}`, `${PREFIX} ${tag}`, `${PREFIX}-${tag}@example.test`]
)).rows[0].id as string;

const p = (productId: string, singles: number, displays = 0, emptyDisplays = 0) => ({ productId, singles, displays, emptyDisplays });

beforeAll(async () => {
  userA = await mkUser('a');
  userB = await mkUser('b');
  eventId = (await query(
    `INSERT INTO events (name, venue, city, state, start_date, end_date, show_start_date, show_end_date, travel_start_date, travel_end_date)
     VALUES ($1, 'v', 'c', 's', '2030-01-01', '2030-01-02', '2030-01-01', '2030-01-02', '2030-01-01', '2030-01-02') RETURNING id`,
    [PREFIX]
  )).rows[0].id;
  requestId = (await query(`INSERT INTO sample_requests (event_id, created_by) VALUES ($1, $2) RETURNING id`, [eventId, userA])).rows[0].id;
  productIds = (await query(`SELECT id FROM sample_products ORDER BY created_at, id LIMIT 24`)).rows.map((r: any) => r.id);
});

afterAll(async () => {
  await query(`DELETE FROM events WHERE id = $1`, [eventId]);
  await query(`DELETE FROM users WHERE id = ANY($1)`, [[userA, userB]]);
  await pool.end();
});

describe('applyRows concurrency (real database)', () => {
  it('concurrent single-field patches to one row both survive, and the history replays to the stored row', async () => {
    const pid = productIds[0];
    await Promise.all([
      sampleRequestRepository.applyRows(requestId, userA, { items: [{ productId: pid, singles: 5 }], materials: [] }),
      sampleRequestRepository.applyRows(requestId, userB, { items: [{ productId: pid, displays: 2 }], materials: [] }),
    ]);
    const stored = (await query(
      `SELECT singles, displays, empty_displays FROM sample_request_items WHERE request_id = $1 AND product_id = $2`, [requestId, pid]
    )).rows[0];
    expect(stored).toEqual({ singles: 5, displays: 2, empty_displays: 0 });

    const changes = (await query(
      `SELECT field, old_value, new_value FROM sample_request_changes WHERE request_id = $1 AND target_id = $2 ORDER BY changed_at, id`,
      [requestId, pid]
    )).rows;
    const state: Record<string, number> = { singles: 0, displays: 0, empty_displays: 0 };
    for (const c of changes) {
      expect(String(state[c.field])).toBe(c.old_value);
      state[c.field] = Number(c.new_value);
    }
    expect(changes).toHaveLength(2);
    expect(state).toEqual(stored);
  });

  it('does not deadlock when two patches list the same products in opposite order', async () => {
    const [a, b] = [productIds[1], productIds[2]];
    await expect(Promise.all([
      sampleRequestRepository.applyRows(requestId, userA, { items: [p(a, 1), p(b, 1)], materials: [] }),
      sampleRequestRepository.applyRows(requestId, userB, { items: [p(b, 2), p(a, 2)], materials: [] }),
    ])).resolves.toBeDefined();
  });

  it('persists twenty overlapping single-row patches to different products', async () => {
    const ids = productIds.slice(3, 23);
    expect(ids).toHaveLength(20);
    await Promise.all(ids.map((id, i) =>
      sampleRequestRepository.applyRows(requestId, i % 2 ? userA : userB, { items: [p(id, i + 1)], materials: [] })));
    const rows = (await query(
      `SELECT product_id, singles FROM sample_request_items WHERE request_id = $1 AND product_id = ANY($2)`, [requestId, ids]
    )).rows;
    expect(rows).toHaveLength(20);
    for (const r of rows) expect(r.singles).toBe(ids.indexOf(r.product_id) + 1);
  });
});
