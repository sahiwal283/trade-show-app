/** The slice of an event a notification needs for its copy and link. */
import { query } from '../../config/database';

export interface EventSnapshot {
  id: string; name: string;
  status?: unknown; venue?: unknown; city?: unknown; state?: unknown;
  show_start_date?: unknown; show_end_date?: unknown;
  travel_start_date?: unknown; travel_end_date?: unknown;
}

const COLUMNS = `e.id, e.name, e.status, e.venue, e.city, e.state,
  e.show_start_date, e.show_end_date, e.travel_start_date, e.travel_end_date`;

export async function eventById(eventId: string): Promise<EventSnapshot | null> {
  const r = await query(`SELECT ${COLUMNS} FROM events e WHERE e.id = $1`, [eventId]);
  return (r.rows[0] as EventSnapshot) || null;
}

export async function eventByChecklistId(checklistId: number): Promise<EventSnapshot | null> {
  const r = await query(
    `SELECT ${COLUMNS} FROM events e JOIN event_checklists c ON c.event_id = e.id WHERE c.id = $1`,
    [checklistId]
  );
  return (r.rows[0] as EventSnapshot) || null;
}
