import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getUsage } from '../../src/services/devDashboard/usage';

const PAGE = 'devdash-integration';
let userId: string;

describe('usage queries against a real database', () => {
  beforeAll(async () => {
    userId = (await query('SELECT id FROM users WHERE is_active ORDER BY created_at LIMIT 1')).rows[0].id;
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await query(
      `INSERT INTO page_views (user_id, page, device, created_at)
       VALUES ($1, $2, 'mobile', NOW()),
              ($1, $2, 'desktop', NOW() - INTERVAL '10 minutes'),
              ($1, $2, 'mobile', NOW() - INTERVAL '3 days')`,
      [userId, PAGE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM page_views WHERE page = $1', [PAGE]);
    await pool.end();
  });

  it('counts the screen within the range only', async () => {
    const day = (await getUsage('24h')).screens.find((s) => s.page === PAGE)!;
    const week = (await getUsage('7d')).screens.find((s) => s.page === PAGE)!;
    expect(day).toMatchObject({ views: 2, uniqueUsers: 1 });
    expect(week).toMatchObject({ views: 3, uniqueUsers: 1 });
    expect(week.daily.reduce((sum, d) => sum + d.views, 0)).toBe(3);
    expect(week.daily.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day))).toBe(true);
  });

  it('splits the person\'s views by device and lists the screen', async () => {
    const person = (await getUsage('24h')).users.find((u) => u.userId === userId)!;
    expect(person.mobileViews).toBeGreaterThanOrEqual(1);
    expect(person.desktopViews).toBeGreaterThanOrEqual(1);
    expect(person.views).toBe(person.mobileViews + person.desktopViews);
    expect(person.lastSeen).not.toBeNull();
  });

  it('lists every active user, including those with no views', async () => {
    const active = (await query('SELECT COUNT(*)::int AS n FROM users WHERE is_active')).rows[0].n;
    expect((await getUsage('1h')).users).toHaveLength(active);
  });
});
