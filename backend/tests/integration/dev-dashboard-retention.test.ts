import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { pageViewRepository } from '../../src/database/repositories';

const PAGE = 'devdash-retention';

describe('page view retention against a real database', () => {
  beforeAll(async () => {
    const userId = (await query('SELECT id FROM users LIMIT 1')).rows[0].id;
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await query(
      `INSERT INTO page_views (user_id, page, device, created_at)
       VALUES ($1, $2, 'mobile', NOW() - INTERVAL '91 days'),
              ($1, $2, 'mobile', NOW() - INTERVAL '89 days')`,
      [userId, PAGE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await pool.end();
  });

  it('deletes rows older than 90 days and keeps newer ones', async () => {
    const deleted = await pageViewRepository.deleteOlderThan(90);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const left = await query('SELECT COUNT(*)::int AS n FROM page_views WHERE page = $1', [PAGE]);
    expect(left.rows[0].n).toBe(1);
  });
});
