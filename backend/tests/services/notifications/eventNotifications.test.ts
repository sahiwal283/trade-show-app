import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[], opts?: { except?: unknown[] }) =>
    ids.filter((id) => id && !(opts?.except ?? []).includes(id))),
  eventParticipants: vi.fn(async () => ['u-1', 'u-2']),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventById: vi.fn(async () => EVENT),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({
  notifyMany: vi.fn(async () => undefined),
}));

import { eventNotifications, diffEventDetails } from '../../../src/services/notifications/eventNotifications';
import { eventParticipants } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const EVENT = {
  id: 'ev-1', name: 'Expo', status: 'upcoming', venue: 'Hall A', city: 'Las Vegas', state: 'NV',
  show_start_date: '2026-11-01', show_end_date: '2026-11-03',
  travel_start_date: '2026-10-31', travel_end_date: '2026-11-04',
};
const sent = () => vi.mocked(notifyMany).mock.calls.map(([users, input]) => ({ users, kind: input.kind }));

describe('diffEventDetails', () => {
  it('reports nothing when the same days arrive as Date and string', () => {
    const before = { ...EVENT, show_start_date: new Date(2026, 10, 1), travel_start_date: new Date(2026, 9, 31) };
    expect(diffEventDetails(before, EVENT)).toEqual([]);
  });
  it('treats blank and null text as the same', () => {
    expect(diffEventDetails({ ...EVENT, state: '' }, { ...EVENT, state: null })).toEqual([]);
  });
  it('reports each changed field with formatted old and new values', () => {
    const changes = diffEventDetails(EVENT, { ...EVENT, show_start_date: '2026-11-08', venue: 'Hall B' });
    expect(changes).toEqual([
      { field: 'show_start_date', label: 'Show start', from: 'Nov 1, 2026', to: 'Nov 8, 2026' },
      { field: 'venue', label: 'Venue', from: 'Hall A', to: 'Hall B' },
    ]);
  });
  it('ignores fields outside the watch list', () => {
    expect(diffEventDetails(EVENT, { ...EVENT, name: 'Renamed' } as any)).toEqual([]);
  });
});

describe('eventNotifications.added', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells each added user, with a checklist link, and skips the actor', async () => {
    await eventNotifications.added('ev-1', ['u-1', 'adm'], 'adm');
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], expect.objectContaining({
      kind: 'event.added',
      title: "You've been added to Expo",
      link: { page: 'checklist', eventId: 'ev-1' },
    }));
    expect(vi.mocked(notifyMany).mock.calls[0][1].body).toContain('Hall A');
    expect(vi.mocked(notifyMany).mock.calls[0][1].body).toContain('Nov 1, 2026');
  });

  it('sends nothing when nobody is left after removing the actor', async () => {
    await eventNotifications.added('ev-1', ['adm'], 'adm');
    await eventNotifications.added('ev-1', [], 'adm');
    expect(notifyMany).not.toHaveBeenCalled();
  });
});

describe('eventNotifications.afterUpdate', () => {
  beforeEach(() => vi.clearAllMocks());
  const base = { before: EVENT, after: EVENT, previousIds: null, rosterIds: null, actorId: 'adm' };

  it('sends nothing when nothing changed', async () => {
    await eventNotifications.afterUpdate({ ...base, previousIds: ['u-1'], rosterIds: ['u-1'] });
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('tells added and removed users', async () => {
    await eventNotifications.afterUpdate({ ...base, previousIds: ['u-1', 'u-2'], rosterIds: ['u-2', 'u-3'] });
    expect(sent()).toEqual([
      { users: ['u-3'], kind: 'event.added' },
      { users: ['u-1'], kind: 'event.removed' },
    ]);
    const removed = vi.mocked(notifyMany).mock.calls[1][1];
    expect(removed.link).toBeNull();
    expect(removed.title).toBe("You've been removed from Expo");
  });

  it('tells the roster about changed details, but not people added in the same save', async () => {
    await eventNotifications.afterUpdate({
      ...base, after: { ...EVENT, city: 'Reno' }, previousIds: ['u-1'], rosterIds: ['u-1', 'u-3'],
    });
    expect(sent().map((s) => s.kind)).toEqual(['event.added', 'event.details_changed']);
    expect(eventParticipants).toHaveBeenCalledWith('ev-1', { except: ['adm', 'u-3'] });
    expect(vi.mocked(notifyMany).mock.calls[1][1].body).toBe('City: Las Vegas → Reno');
  });

  it('sends only "cancelled" when a save both cancels and changes details', async () => {
    await eventNotifications.afterUpdate({ ...base, after: { ...EVENT, status: 'cancelled', city: 'Reno' } });
    expect(sent().map((s) => s.kind)).toEqual(['event.cancelled']);
    expect(vi.mocked(notifyMany).mock.calls[0][1].link).toBeNull();
  });

  it('does not re-announce an event that was already cancelled', async () => {
    const cancelled = { ...EVENT, status: 'cancelled' };
    await eventNotifications.afterUpdate({ ...base, before: cancelled, after: cancelled });
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('one failing step does not stop the others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(notifyMany).mockRejectedValueOnce(new Error('boom'));
    await expect(eventNotifications.afterUpdate({
      ...base, previousIds: ['u-1'], rosterIds: ['u-3'],
    })).resolves.toBeUndefined();
    expect(sent().map((s) => s.kind)).toEqual(['event.added', 'event.removed']);
    err.mockRestore();
  });
});
