/**
 * Flight, hotel and car rental notifications for the one person a booking is
 * for. Routes hand over the row before and after their write; classifyBooking
 * decides whether that is a new booking, a change, a cancellation, a
 * reassignment, or nothing worth a notification.
 */
import { activeUsers } from './recipients';
import { eventByChecklistId } from './eventRefs';
import { notifyMany } from './notifyMany';
import { dayKey, instantKey, textKey, formatDay } from './values';

/**
 * Any flight, hotel or car rental row. Deliberately has no index signature so
 * the repository's row interfaces are assignable to it; read other columns
 * through `col`.
 */
export interface BookingRow { checklist_id: number; booked?: unknown; confirmation_number?: unknown }

const col = (row: BookingRow, name: string): unknown => (row as unknown as Record<string, unknown>)[name];

type FieldType = 'text' | 'day' | 'instant';
interface WatchedField { field: string; label: string; type: FieldType }

export interface BookingConfig {
  noun: string;
  emoji: string;
  /** Column naming the person the booking is for. */
  assigneeField: string;
  watched: WatchedField[];
  /** One line describing the booking as it stands. */
  summary(row: BookingRow): string;
}

export interface BookingEffect {
  type: 'booked' | 'changed' | 'cancelled';
  userId: string;
  row: BookingRow;
  /** Labels of the watched fields that changed; empty unless type is 'changed'. */
  changed: string[];
}

const parts = (...items: Array<string | null | false | undefined>): string => items.filter(Boolean).join(' · ');
const confirmation = (row: BookingRow): string => `Confirmation ${textKey(row.confirmation_number)}`;

export const FLIGHT: BookingConfig = {
  noun: 'Flight', emoji: '✈️', assigneeField: 'attendee_id',
  watched: [
    { field: 'carrier', label: 'Carrier', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'departure_at', label: 'Departure time', type: 'instant' },
  ],
  summary: (row) => parts(textKey(col(row, 'carrier')), confirmation(row)),
};

export const HOTEL: BookingConfig = {
  noun: 'Hotel', emoji: '🏨', assigneeField: 'attendee_id',
  watched: [
    { field: 'property_name', label: 'Hotel', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'check_in_date', label: 'Check-in date', type: 'day' },
    { field: 'check_out_date', label: 'Check-out date', type: 'day' },
  ],
  summary: (row) => {
    const checkIn = formatDay(col(row, 'check_in_date'));
    return parts(textKey(col(row, 'property_name')), confirmation(row), checkIn && `Check-in ${checkIn}`);
  },
};

export const CAR_RENTAL: BookingConfig = {
  noun: 'Car rental', emoji: '🚗', assigneeField: 'assigned_to_id',
  watched: [
    { field: 'provider', label: 'Rental company', type: 'text' },
    { field: 'confirmation_number', label: 'Confirmation number', type: 'text' },
    { field: 'pickup_date', label: 'Pickup date', type: 'day' },
    { field: 'return_date', label: 'Return date', type: 'day' },
  ],
  summary: (row) => {
    const pickup = formatDay(col(row, 'pickup_date'));
    return parts(textKey(col(row, 'provider')), confirmation(row), pickup && `Pickup ${pickup}`);
  },
};

const KEY: Record<FieldType, (v: unknown) => string | number | null> = { text: textKey, day: dayKey, instant: instantKey };

/** The assignee if this row counts as a real booking, otherwise null. */
function bookedFor(row: BookingRow | null, config: BookingConfig): string | null {
  if (!row || row.booked !== true || !textKey(row.confirmation_number)) return null;
  return textKey(col(row, config.assigneeField));
}

export function classifyBooking(
  before: BookingRow | null, after: BookingRow | null, config: BookingConfig
): BookingEffect[] {
  const was = bookedFor(before, config);
  const is = bookedFor(after, config);
  if (!was && !is) return [];
  if (!was && is) return [{ type: 'booked', userId: is, row: after!, changed: [] }];
  if (was && !is) return [{ type: 'cancelled', userId: was, row: before!, changed: [] }];
  if (was !== is) {
    return [
      { type: 'cancelled', userId: was!, row: before!, changed: [] },
      { type: 'booked', userId: is!, row: after!, changed: [] },
    ];
  }
  const changed = config.watched
    .filter((w) => KEY[w.type](col(before!, w.field)) !== KEY[w.type](col(after!, w.field)))
    .map((w) => w.label);
  return changed.length > 0 ? [{ type: 'changed', userId: is!, row: after!, changed }] : [];
}

function message(effect: BookingEffect, config: BookingConfig, eventName: string | null) {
  const suffix = eventName ? ` · ${eventName}` : '';
  if (effect.type === 'booked') {
    return { kind: 'travel.booked', title: `${config.noun} booked ${config.emoji}${suffix}`, body: config.summary(effect.row) };
  }
  if (effect.type === 'changed') {
    return {
      kind: 'travel.changed',
      title: `${config.noun} updated ${config.emoji}${suffix}`,
      body: `${effect.changed.join(', ')} changed. ${config.summary(effect.row)}`,
    };
  }
  return {
    kind: 'travel.cancelled',
    title: `${config.noun} cancelled${suffix}`,
    body: `Your ${config.noun.toLowerCase()}${eventName ? ` for ${eventName}` : ''} was cancelled. ${confirmation(effect.row)}.`,
  };
}

type Actor = string | null | undefined;

async function saved(
  config: BookingConfig, before: BookingRow | null, after: BookingRow | null, actorId: Actor
): Promise<void> {
  const effects = classifyBooking(before, after, config);
  if (effects.length === 0) return;
  const event = await eventByChecklistId((after ?? before)!.checklist_id);
  for (const effect of effects) {
    const recipients = await activeUsers([effect.userId], { except: [actorId] });
    if (recipients.length === 0) continue;
    await notifyMany(recipients, {
      ...message(effect, config, event?.name ?? null),
      link: event ? { page: 'checklist', eventId: event.id } : null,
    });
  }
}

export const travelNotifications = {
  flightSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(FLIGHT, before, after, actorId),
  hotelSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(HOTEL, before, after, actorId),
  carRentalSaved: (before: BookingRow | null, after: BookingRow | null, actorId?: Actor) => saved(CAR_RENTAL, before, after, actorId),
};
