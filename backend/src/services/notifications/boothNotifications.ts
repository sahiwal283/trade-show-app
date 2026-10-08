/**
 * Booth notifications. Checklist progress (ordered, shipped, map) goes to
 * everyone on the show; an inventory damage or missing report goes to the
 * people who look after the booths.
 */
import { query } from '../../config/database';
import { eventParticipants, usersWithRole } from './recipients';
import { eventByChecklistId } from './eventRefs';
import { notifyMany } from './notifyMany';
import { formatDay, textKey } from './values';
import type { NotifyInput } from '../NotificationService';

type Actor = string | null | undefined;

async function toEvent(
  checklistId: number, actorId: Actor, build: (eventName: string) => Omit<NotifyInput, 'link'>
): Promise<void> {
  const event = await eventByChecklistId(checklistId);
  if (!event) return;
  const recipients = await eventParticipants(event.id, { except: [actorId] });
  if (recipients.length === 0) return;
  await notifyMany(recipients, { ...build(event.name), link: { page: 'checklist', eventId: event.id } });
}

export interface ComponentReport { componentId: string; kind: 'damage' | 'missing'; notes?: string | null }

export const boothNotifications = {
  ordered(checklistId: number, actorId?: Actor): Promise<void> {
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.ordered',
      title: `Booth ordered · ${name}`,
      body: `The booth for ${name} has been ordered.`,
    }));
  },

  async shipped(
    checklistId: number,
    shipping: { carrier_name?: unknown; tracking_number?: unknown; delivery_date?: unknown },
    actorId?: Actor
  ): Promise<void> {
    const carrier = textKey(shipping.carrier_name);
    const tracking = textKey(shipping.tracking_number);
    const arrives = formatDay(shipping.delivery_date);
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.shipped',
      title: `Booth shipped · ${name}`,
      body: `The booth for ${name} has shipped${carrier ? ` with ${carrier}` : ''}`
        + `${tracking ? ` · Tracking ${tracking}` : ''}${arrives ? ` · Arrives ${arrives}` : ''}`,
    }));
  },

  mapUploaded(checklistId: number, actorId?: Actor): Promise<void> {
    return toEvent(checklistId, actorId, (name) => ({
      kind: 'booth.map_uploaded',
      title: `Booth map available · ${name}`,
      body: `The booth map for ${name} has been uploaded. Open the checklist to see where the booth is.`,
    }));
  },

  async componentReported(report: ComponentReport, actorId?: Actor): Promise<void> {
    const r = await query(
      `SELECT c.name AS component, b.name AS booth,
              (SELECT u.name FROM users u WHERE u.id = $2) AS reporter
         FROM booth_components c JOIN booths b ON b.id = c.booth_id
        WHERE c.id = $1`,
      [report.componentId, actorId ?? null]
    );
    const row = r.rows[0] as { component: string; booth: string; reporter: string | null } | undefined;
    if (!row) return;
    const recipients = await usersWithRole(['admin', 'coordinator'], { except: [actorId] });
    if (recipients.length === 0) return;
    const state = report.kind === 'missing' ? 'missing' : 'damaged';
    const note = textKey(report.notes);
    await notifyMany(recipients, {
      kind: 'booth.component_reported',
      title: `Booth component reported ${state}`,
      body: `${row.reporter ?? 'Someone'} reported "${row.component}" (${row.booth}) as ${state}.${note ? ` Note: ${note}` : ''}`,
      link: { page: 'booth-inventory' },
    });
  },
};
