/**
 * Screen opens by signed-in users. Written by POST /api/page-views, read by
 * the developer dashboard's Usage tab, pruned by RetentionJob.
 */
import { query } from '../../config/database';

export type PageViewDevice = 'mobile' | 'desktop';

export class PageViewRepository {
  async record(userId: string, page: string, device: PageViewDevice): Promise<void> {
    await query('INSERT INTO page_views (user_id, page, device) VALUES ($1, $2, $3)', [userId, page, device]);
  }

  async deleteOlderThan(days: number): Promise<number> {
    const result = await query('DELETE FROM page_views WHERE created_at < NOW() - make_interval(days => $1)', [days]);
    return result.rowCount || 0;
  }
}

export const pageViewRepository = new PageViewRepository();
