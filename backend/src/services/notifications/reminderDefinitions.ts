// backend/src/services/notifications/reminderDefinitions.ts
/**
 * Every scheduled reminder Argo sends. A definition is a query for who is
 * due (and not yet in the ledger) plus the words to send. Windows, not
 * deadlines: an event created inside a window still gets that reminder, and
 * one created after it never gets it late.
 */
import type { NotifyInput } from '../NotificationService';
import { SAMPLE_WINDOW_TZ } from '../sampleRequests/sampleRequestWindow';

export interface DueRow { subject_id: string; user_id: string; [key: string]: unknown }

export interface ReminderDefinition {
  kind: string;
  /** $1 = kind. Returns rows not yet claimed in notification_reminders. */
  dueSql: string;
  build(row: DueRow): NotifyInput;
}

/** Today in the business timezone, not the database session's. */
const BUSINESS_TODAY = `(now() AT TIME ZONE '${SAMPLE_WINDOW_TZ}')::date`;
/** Event and expense reminders go out from 9:00 am business time, never overnight. */
export const EVENT_REMINDER_EARLIEST_HOUR = 9;

/** When the trip starts: travel start, or show start if no travel date. */
const DAYS_UNTIL_EVENT = `(COALESCE(e.travel_start_date, e.show_start_date)::date - ${BUSINESS_TODAY})`;
/** Days since the show closed. */
const DAYS_SINCE_SHOW = `(${BUSINESS_TODAY} - COALESCE(e.show_end_date, e.end_date)::date)`;

const EVENT_REMINDER_WINDOWS = {
  'reminder.event_30d': { days: DAYS_UNTIL_EVENT, from: 23, to: 30 },
  'reminder.event_7d': { days: DAYS_UNTIL_EVENT, from: 0, to: 7 },
  'reminder.expenses_1d': { days: DAYS_SINCE_SHOW, from: 1, to: 6 },
  'reminder.expenses_7d': { days: DAYS_SINCE_SHOW, from: 7, to: 13 },
} as const;

export type EventReminderKind = keyof typeof EVENT_REMINDER_WINDOWS;

/**
 * The due query for one event or expense reminder. `earliestHour` is the
 * business-time hour of day from which it may be sent; only tests pass
 * anything but the default.
 */
export function eventDueSql(kind: EventReminderKind, earliestHour: number = EVENT_REMINDER_EARLIEST_HOUR): string {
  const { days, from, to } = EVENT_REMINDER_WINDOWS[kind];
  return `
    SELECT e.id::text AS subject_id, ep.user_id, e.id AS event_id, e.name AS event_name,
           ${days} AS days
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      JOIN users u ON u.id = ep.user_id
     WHERE e.status <> 'cancelled'
       AND u.is_active
       AND ${days} BETWEEN ${from} AND ${to}
       AND EXTRACT(HOUR FROM now() AT TIME ZONE '${SAMPLE_WINDOW_TZ}') >= ${Number(earliestHour)}
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r
          WHERE r.kind = $1 AND r.subject_id = e.id::text AND r.user_id = ep.user_id
       )`;
}

function flightDueSql(hours: number): string {
  return `
    SELECT f.id::text AS subject_id, f.attendee_id AS user_id, e.id AS event_id, e.name AS event_name,
           f.carrier, f.confirmation_number
      FROM checklist_flights f
      JOIN event_checklists c ON c.id = f.checklist_id
      LEFT JOIN events e ON e.id = c.event_id
      JOIN users u ON u.id = f.attendee_id
     WHERE f.booked = true
       AND u.is_active
       AND f.departure_at IS NOT NULL
       AND f.departure_at > now()
       AND f.departure_at <= now() + interval '${hours} hours'
       AND NOT EXISTS (
         SELECT 1 FROM notification_reminders r
          WHERE r.kind = $1 AND r.subject_id = f.id::text AND r.user_id = f.attendee_id
       )`;
}

const countdown = (days: unknown): string => {
  const n = Number(days);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
};

const eventLink = (row: DueRow, page: 'checklist' | 'expenses') =>
  row.event_id ? { page, eventId: String(row.event_id) } : null;

const flightLabel = (row: DueRow): string => (row.carrier ? String(row.carrier) : 'Your flight');
const confirmationSuffix = (row: DueRow): string =>
  row.confirmation_number ? ` Confirmation ${row.confirmation_number}.` : '';

export const REMINDER_DEFINITIONS: ReminderDefinition[] = [
  {
    kind: 'reminder.event_30d',
    dueSql: eventDueSql('reminder.event_30d'),
    build: (row) => ({
      kind: 'reminder.event_30d',
      title: `${row.event_name} is ${countdown(row.days)}`,
      body: `Check that your flight and hotel for ${row.event_name} are booked, and look over the checklist.`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.event_7d',
    dueSql: eventDueSql('reminder.event_7d'),
    build: (row) => ({
      kind: 'reminder.event_7d',
      title: `${row.event_name} is ${countdown(row.days)}`,
      body: `Check your travel details for ${row.event_name} and finish anything left on your checklist.`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.expenses_1d',
    dueSql: eventDueSql('reminder.expenses_1d'),
    build: (row) => ({
      kind: 'reminder.expenses_1d',
      title: `Submit your expenses · ${row.event_name}`,
      body: `${row.event_name} has wrapped up. Submit your receipts and expenses while they are fresh.`,
      link: eventLink(row, 'expenses'),
    }),
  },
  {
    kind: 'reminder.expenses_7d',
    dueSql: eventDueSql('reminder.expenses_7d'),
    build: (row) => ({
      kind: 'reminder.expenses_7d',
      title: `Reminder: submit your expenses · ${row.event_name}`,
      body: `It has been a week since ${row.event_name} ended. If you still have expenses to submit, please submit them now.`,
      link: eventLink(row, 'expenses'),
    }),
  },
  {
    kind: 'reminder.flight_checkin_24h',
    dueSql: flightDueSql(24),
    build: (row) => ({
      kind: 'reminder.flight_checkin_24h',
      title: '✈️ Time to check in',
      body: `${flightLabel(row)} departs in about 24 hours${row.event_name ? ` for ${row.event_name}` : ''}. Check in with your airline now.${confirmationSuffix(row)}`,
      link: eventLink(row, 'checklist'),
    }),
  },
  {
    kind: 'reminder.flight_departure_3h',
    dueSql: flightDueSql(3),
    build: (row) => ({
      kind: 'reminder.flight_departure_3h',
      title: '🛫 Flight today',
      body: `${flightLabel(row)} departs in about 3 hours. Time to head out.${confirmationSuffix(row)}`,
      link: eventLink(row, 'checklist'),
    }),
  },
];
