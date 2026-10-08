/**
 * Developer dashboard — Usage tab.
 * Which screens are opened and by whom, from page_views. Every active user
 * is listed, including those with no views, so "has not used the app" shows.
 */
import { query } from '../../config/database';
import { TimeRange, intervalFor } from './timeRange';

export interface Usage {
  totals: { views: number; uniqueUsers: number };
  screens: Array<{ page: string; views: number; uniqueUsers: number; daily: Array<{ day: string; views: number }> }>;
  users: Array<{
    userId: string; name: string; role: string; lastSeen: string | null;
    views: number; mobileViews: number; desktopViews: number;
    topPages: Array<{ page: string; views: number }>;
  }>;
}

const TOP_PAGES_PER_USER = 3;

export async function getUsage(range: TimeRange): Promise<Usage> {
  const interval = intervalFor(range);

  const [totals, screens, daily, users, userPages] = await Promise.all([
    query(`/* devdash:usage-totals */
      SELECT COUNT(*)::int AS views, COUNT(DISTINCT user_id)::int AS unique_users
        FROM page_views
       WHERE created_at > NOW() - $1::interval`, [interval]),
    query(`/* devdash:usage-screens */
      SELECT page, COUNT(*)::int AS views, COUNT(DISTINCT user_id)::int AS unique_users
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY page
       ORDER BY views DESC, page`, [interval]),
    query(`/* devdash:usage-daily */
      SELECT page, to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS views
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY page, date_trunc('day', created_at)
       ORDER BY date_trunc('day', created_at)`, [interval]),
    query(`/* devdash:usage-users */
      SELECT u.id, u.name, u.role,
             (SELECT MAX(seen.created_at) FROM page_views seen WHERE seen.user_id = u.id) AS last_seen,
             COUNT(pv.id)::int AS views,
             COUNT(pv.id) FILTER (WHERE pv.device = 'mobile')::int AS mobile_views,
             COUNT(pv.id) FILTER (WHERE pv.device = 'desktop')::int AS desktop_views
        FROM users u
        LEFT JOIN page_views pv ON pv.user_id = u.id AND pv.created_at > NOW() - $1::interval
       WHERE u.is_active
       GROUP BY u.id, u.name, u.role
       ORDER BY views DESC, u.name`, [interval]),
    query(`/* devdash:usage-user-pages */
      SELECT user_id, page, COUNT(*)::int AS views
        FROM page_views
       WHERE created_at > NOW() - $1::interval
       GROUP BY user_id, page
       ORDER BY views DESC, page`, [interval]),
  ]);

  const dailyByPage = new Map<string, Array<{ day: string; views: number }>>();
  for (const row of daily.rows) {
    const list = dailyByPage.get(row.page) ?? [];
    list.push({ day: row.day, views: row.views });
    dailyByPage.set(row.page, list);
  }

  const pagesByUser = new Map<string, Array<{ page: string; views: number }>>();
  for (const row of userPages.rows) {
    const list = pagesByUser.get(row.user_id) ?? [];
    if (list.length < TOP_PAGES_PER_USER) list.push({ page: row.page, views: row.views });
    pagesByUser.set(row.user_id, list);
  }

  return {
    totals: { views: totals.rows[0].views, uniqueUsers: totals.rows[0].unique_users },
    screens: screens.rows.map((row) => ({
      page: row.page,
      views: row.views,
      uniqueUsers: row.unique_users,
      daily: dailyByPage.get(row.page) ?? [],
    })),
    users: users.rows.map((row) => ({
      userId: row.id,
      name: row.name,
      role: row.role,
      lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
      views: row.views,
      mobileViews: row.mobile_views,
      desktopViews: row.desktop_views,
      topPages: pagesByUser.get(row.id) ?? [],
    })),
  };
}
