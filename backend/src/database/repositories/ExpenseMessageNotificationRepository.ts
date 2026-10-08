/**
 * Cursor storage for the Midas event scanner (table midas_message_sync_state).
 *
 * This file used to hold the message-notification rows too; those now live
 * in the general notifications table (see migration 046). The
 * expense_message_notifications table is left in place, unused.
 */

import { query } from '../../config/database';

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
