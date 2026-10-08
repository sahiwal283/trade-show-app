/**
 * Local delivery state for Midas-owned message threads.
 *
 * Trade Show never stores message content as a source of truth — body_snippet
 * exists only so the notification bell can render without a round-trip to
 * Midas. Read state is the one thing that is genuinely ours.
 */

import { query } from '../../config/database';

export interface NotificationInsert {
  userId: string;
  midasMessageId: string;
  midasExpenseId: string;
  expenseRefId: string | null;
  senderName: string;
  senderRole: string | null;
  bodySnippet: string;
  requestType: string | null;
  messageCreatedAt: string;
}

export interface NotificationRow {
  id: string;
  midas_expense_id: string;
  expense_ref_id: string | null;
  sender_name: string;
  sender_role: string | null;
  body_snippet: string;
  request_type: string | null;
  message_created_at: string;
  read_at: string | null;
}

/**
 * Insert a batch, skipping any message already recorded. Returns the ids
 * actually inserted — a replayed batch returns [] rather than re-notifying.
 *
 * The caller (MidasEventScanner) uses this to gate push sends: pushing
 * for every row in the input batch, rather than only the ids this function
 * reports back, would re-notify on every redelivery once the cursor and the
 * insert fall out of lockstep (e.g. insert succeeds, then setCursor fails or
 * the process dies before it runs) — the UNIQUE constraint only protects the
 * stored notification row, not anything downstream of it.
 */
export async function recordNotifications(rows: NotificationInsert[]): Promise<string[]> {
  if (rows.length === 0) return [];

  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const b = i * 9;
    values.push(
      r.userId, r.midasMessageId, r.midasExpenseId, r.expenseRefId,
      r.senderName, r.senderRole, r.bodySnippet, r.requestType, r.messageCreatedAt
    );
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
  });

  const result = await query(
    `INSERT INTO expense_message_notifications
       (user_id, midas_message_id, midas_expense_id, expense_ref_id,
        sender_name, sender_role, body_snippet, request_type, message_created_at)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (midas_message_id) DO NOTHING
     RETURNING midas_message_id`,
    values
  );
  return result.rows.map((r: { midas_message_id: string }) => r.midas_message_id);
}

export async function listUnread(userId: string): Promise<NotificationRow[]> {
  const result = await query(
    `SELECT id, midas_expense_id, expense_ref_id, sender_name, sender_role,
            body_snippet, request_type, message_created_at, read_at
       FROM expense_message_notifications
      WHERE user_id = $1 AND read_at IS NULL
      ORDER BY message_created_at DESC`,
    [userId]
  );
  return result.rows as NotificationRow[];
}

/** Mark this user's unread rows on one thread as read. Returns rows affected. */
export async function markThreadRead(userId: string, midasExpenseId: string): Promise<number> {
  const result = await query(
    `UPDATE expense_message_notifications
        SET read_at = now()
      WHERE user_id = $1 AND midas_expense_id = $2 AND read_at IS NULL`,
    [userId, midasExpenseId]
  );
  return result.rowCount || 0;
}

export async function getCursor(sourceApp: string): Promise<string | null> {
  const result = await query(
    `SELECT cursor FROM midas_message_sync_state WHERE source_app = $1`,
    [sourceApp]
  );
  if (result.rows.length === 0) return null;
  return (result.rows[0] as { cursor: string | null }).cursor;
}

export async function setCursor(sourceApp: string, cursor: string | null): Promise<void> {
  await query(
    `INSERT INTO midas_message_sync_state (source_app, cursor, last_scan_at, updated_at)
     VALUES ($1, $2, now(), now())
     ON CONFLICT (source_app)
     DO UPDATE SET cursor = EXCLUDED.cursor, last_scan_at = now(), updated_at = now()`,
    [sourceApp, cursor]
  );
}
