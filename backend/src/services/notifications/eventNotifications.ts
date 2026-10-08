// backend/src/services/notifications/eventNotifications.ts
/**
 * Event roster and detail notifications: added, removed, details changed,
 * cancelled. Routes hand over what they already know (who was on the roster,
 * the row before and after) and this file decides what to send.
 */
import { activeUsers, eventParticipants } from './recipients';
import { eventById, EventSnapshot } from './eventRefs';
import { notifyMany } from './notifyMany';
import { dayKey, textKey, formatDay } from './values';

export interface DetailChange { field: string; label: string; from: string | null; to: string | null }

type Field = keyof EventSnapshot;

const DAY_FIELDS: Array<[Field, string]> = [
  ['show_start_date', 'Show start'], ['show_end_date', 'Show end'],
  ['travel_start_date', 'Travel start'], ['travel_end_date', 'Travel end'],
];
const TEXT_FIELDS: Array<[Field, string]> = [['venue', 'Venue'], ['city', 'City'], ['state', 'State']];

/** Watched fields that differ. Compares normalised values, never raw ones. */
export function diffEventDetails(before: EventSnapshot, after: EventSnapshot): DetailChange[] {
  const changes: DetailChange[] = [];
  for (const [field, label] of DAY_FIELDS) {
    if (dayKey(before[field]) !== dayKey(after[field])) {
      changes.push({ field, label, from: formatDay(before[field]), to: formatDay(after[field]) });
    }
  }
  for (const [field, label] of TEXT_FIELDS) {
    if (textKey(before[field]) !== textKey(after[field])) {
      changes.push({ field, label, from: textKey(before[field]), to: textKey(after[field]) });
    }
  }
  return changes;
}

const becameCancelled = (before: EventSnapshot, after: EventSnapshot): boolean =>
  before.status !== 'cancelled' && after.status === 'cancelled';

function whereAndWhen(event: EventSnapshot): string {
  const place = [textKey(event.venue), textKey(event.city)].filter(Boolean).join(', ');
  const start = formatDay(event.show_start_date);
  const end = formatDay(event.show_end_date);
  const when = start && end && start !== end ? `${start} to ${end}` : start;
  return [place, when].filter(Boolean).join(' · ');
}

export interface AfterUpdateInput {
  before: EventSnapshot;
  after: EventSnapshot;
  /** Roster before the save; null when the save did not touch participants. */
  previousIds: string[] | null;
  /** Roster after the save; null when the save did not touch participants. */
  rosterIds: string[] | null;
  actorId: string | null;
}

async function step(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[Notifications] ${label} failed:`, error);
  }
}

export const eventNotifications = {
  async added(eventId: string, userIds: string[], actorId?: string | null): Promise<void> {
    const recipients = await activeUsers(userIds, { except: [actorId] });
    if (recipients.length === 0) return;
    const event = await eventById(eventId);
    if (!event) return;
    const details = whereAndWhen(event);
    await notifyMany(recipients, {
      kind: 'event.added',
      title: `You've been added to ${event.name}`,
      body: details ? `${details}. Open the checklist for your travel details.` : 'Open the checklist for your travel details.',
      link: { page: 'checklist', eventId: event.id },
    });
  },

  async removed(event: EventSnapshot, userIds: string[], actorId?: string | null): Promise<void> {
    const recipients = await activeUsers(userIds, { except: [actorId] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.removed',
      title: `You've been removed from ${event.name}`,
      body: `You are no longer on the roster for ${event.name}.`,
      link: null,
    });
  },

  async detailsChanged(
    event: EventSnapshot, changes: DetailChange[], actorId?: string | null, alsoExcept: string[] = []
  ): Promise<void> {
    if (changes.length === 0) return;
    const recipients = await eventParticipants(event.id, { except: [actorId, ...alsoExcept] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.details_changed',
      title: `${event.name}: details changed`,
      body: changes.map((c) => `${c.label}: ${c.from ?? 'not set'} → ${c.to ?? 'not set'}`).join(' · '),
      link: { page: 'checklist', eventId: event.id },
    });
  },

  async cancelled(event: EventSnapshot, actorId?: string | null, alsoExcept: string[] = []): Promise<void> {
    const recipients = await eventParticipants(event.id, { except: [actorId, ...alsoExcept] });
    if (recipients.length === 0) return;
    await notifyMany(recipients, {
      kind: 'event.cancelled',
      title: `${event.name} was cancelled`,
      body: `${event.name} has been cancelled.`,
      link: null,
    });
  },

  /** Everything an Edit Event save can trigger, each step isolated. */
  async afterUpdate(input: AfterUpdateInput): Promise<void> {
    const { before, after, previousIds, rosterIds, actorId } = input;
    const previous = new Set(previousIds ?? []);
    const roster = new Set(rosterIds ?? []);
    const added = rosterIds && previousIds ? rosterIds.filter((id) => !previous.has(id)) : [];
    const removed = rosterIds && previousIds ? previousIds.filter((id) => !roster.has(id)) : [];

    if (added.length > 0) {
      await step('event.added', () => eventNotifications.added(after.id, added, actorId));
    }
    if (removed.length > 0) {
      await step('event.removed', () => eventNotifications.removed(after, removed, actorId));
    }
    if (becameCancelled(before, after)) {
      await step('event.cancelled', () => eventNotifications.cancelled(after, actorId, added));
      return;
    }
    const changes = diffEventDetails(before, after);
    if (changes.length > 0) {
      await step('event.details_changed', () => eventNotifications.detailsChanged(after, changes, actorId, added));
    }
  },
};
