/**
 * The only place that answers "who gets this notification". Every function
 * drops inactive users and whoever is listed in `except` (the actor).
 */
import { query } from '../../config/database';

export interface RecipientOptions { except?: Array<string | null | undefined> }

function without(ids: string[], opts?: RecipientOptions): string[] {
  const skip = new Set((opts?.except ?? []).filter((id): id is string => Boolean(id)));
  return [...new Set(ids)].filter((id) => !skip.has(id));
}

export async function eventParticipants(eventId: string, opts?: RecipientOptions): Promise<string[]> {
  const r = await query(
    `SELECT ep.user_id FROM event_participants ep
       JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id = $1 AND u.is_active`,
    [eventId]
  );
  return without(r.rows.map((row: { user_id: string }) => row.user_id), opts);
}

export async function usersWithRole(roles: string[], opts?: RecipientOptions): Promise<string[]> {
  const r = await query(`SELECT id FROM users WHERE role = ANY($1::text[]) AND is_active`, [roles]);
  return without(r.rows.map((row: { id: string }) => row.id), opts);
}

/** Narrows named users (an assignee, people just added) to the active ones. */
export async function activeUsers(
  userIds: Array<string | null | undefined>,
  opts?: RecipientOptions
): Promise<string[]> {
  const ids = without(userIds.filter((id): id is string => Boolean(id)), opts);
  if (ids.length === 0) return [];
  const r = await query(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active`, [ids]);
  const active = new Set(r.rows.map((row: { id: string }) => row.id));
  return ids.filter((id) => active.has(id));
}
