import { describe, it, expect, afterAll } from 'vitest';
import { pool, query } from '../../src/config/database';

/** Verifies migration 047 applied (migrate.ts silently skips on 42501). */
describe('page_views schema (migration 047)', () => {
  afterAll(async () => { await pool.end(); });

  it('has the expected columns', async () => {
    const { rows } = await query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'page_views' ORDER BY column_name`
    );
    expect(rows).toEqual([
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
      { column_name: 'device', data_type: 'character varying' },
      { column_name: 'id', data_type: 'bigint' },
      { column_name: 'page', data_type: 'character varying' },
      { column_name: 'user_id', data_type: 'uuid' },
    ]);
  });

  it('rejects a device that is not mobile or desktop', async () => {
    const user = await query('SELECT id FROM users LIMIT 1');
    await expect(
      query(`INSERT INTO page_views (user_id, page, device) VALUES ($1, 'x', 'tablet')`, [user.rows[0].id])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('has both indexes', async () => {
    const { rows } = await query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'page_views' ORDER BY indexname`
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'idx_page_views_created_at',
      'idx_page_views_user_created',
      'page_views_pkey',
    ]);
  });
});
