import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { deleteInBatches } from '../../src/services/devDashboard/RetentionJob';

const PAGE = 'devdash-retention';

describe('page view retention against a real database', () => {
  beforeAll(async () => {
    const userId = (await query('SELECT id FROM users LIMIT 1')).rows[0].id;
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await query(
      `INSERT INTO page_views (user_id, page, device, created_at)
       VALUES ($1, $2, 'mobile', NOW() - INTERVAL '91 days'),
              ($1, $2, 'mobile', NOW() - INTERVAL '120 days'),
              ($1, $2, 'mobile', NOW() - INTERVAL '89 days')`,
      [userId, PAGE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await pool.end();
  });

  it('deletes rows older than 90 days one batch at a time and keeps newer ones', async () => {
    // A batch of one row: both old rows can only go if the loop comes round again.
    const deleted = await deleteInBatches('page_views', 90, { batchSize: 1 });
    expect(deleted).toBeGreaterThanOrEqual(2);
    const left = await query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days')::int AS old
         FROM page_views WHERE page = $1`,
      [PAGE]
    );
    expect(left.rows[0]).toEqual({ n: 1, old: 0 });
  });

  it('runs the same statement against the other two log tables, whatever their id type', async () => {
    // Nothing is ten years old, so this deletes nothing; it proves the SQL is valid for each table.
    expect(await deleteInBatches('api_requests', 3650, { batchSize: 1 })).toBe(0);
    expect(await deleteInBatches('audit_logs', 3650, { batchSize: 1 })).toBe(0);
  });
});
