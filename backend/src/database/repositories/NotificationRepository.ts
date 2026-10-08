/**
 * General in-app notifications (the header bell). Sample requests were the
 * first producer; expense notifications from Midas's event feed live here too.
 */
import { query } from '../../config/database';

export type NotificationPage =
  | 'checklist' | 'samples' | 'expenses' | 'admin-users' | 'booth-inventory' | 'badge-scans' | 'expense';

export interface NotificationLink { page: NotificationPage | string; eventId?: string; expenseId?: string }

export interface NotificationRow {
  id: string; user_id: string; kind: string; title: string; body: string;
  link: NotificationLink | null; read_at: string | null; created_at: string;
}

export interface NotificationInsert {
  user_id: string; kind: string; title: string; body: string; link: NotificationLink | null; source_event_id?: string | null;
}

class NotificationRepository {
  /**
   * Null means a row for this source event already exists: the caller must
   * treat the notification as already delivered (no second push).
   */
  async insert(data: NotificationInsert): Promise<NotificationRow | null> {
    const r = await query(
      `INSERT INTO notifications (user_id, kind, title, body, link, source_event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_event_id) DO NOTHING
       RETURNING *`,
      [
        data.user_id, data.kind, data.title, data.body,
        data.link ? JSON.stringify(data.link) : null,
        data.source_event_id ?? null,
      ]
    );
    return (r.rows[0] as NotificationRow) ?? null;
  }

  /** Mark one user's unread notifications of the given kinds for one expense as read. */
  async markReadForExpense(userId: string, expenseId: string, kinds: string[]): Promise<number> {
    if (kinds.length === 0) return 0;
    const r = await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND link->>'expenseId' = $2 AND kind = ANY($3::text[]) AND read_at IS NULL`,
      [userId, expenseId, kinds]
    );
    return r.rowCount ?? 0;
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
