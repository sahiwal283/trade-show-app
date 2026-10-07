/**
 * General in-app notifications (the header bell). Sample requests are the
 * first producer; expense/message notifications are NOT migrated here.
 */
import { query } from '../../config/database';

export interface NotificationLink { page: string; eventId?: string }

export interface NotificationRow {
  id: string; user_id: string; kind: string; title: string; body: string;
  link: NotificationLink | null; read_at: string | null; created_at: string;
}

export interface NotificationInsert {
  user_id: string; kind: string; title: string; body: string; link: NotificationLink | null;
}

class NotificationRepository {
  async insert(data: NotificationInsert): Promise<NotificationRow> {
    const r = await query(
      `INSERT INTO notifications (user_id, kind, title, body, link)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.user_id, data.kind, data.title, data.body, data.link ? JSON.stringify(data.link) : null]
    );
    return r.rows[0] as NotificationRow;
  }

  async listUnread(userId: string, limit = 50): Promise<NotificationRow[]> {
    const r = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return r.rows as NotificationRow[];
  }

  /** Scoped to the user so one caller cannot mark another's rows. */
  async markRead(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const r = await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
      [userId, ids]
    );
    return r.rowCount ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return r.rowCount ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
