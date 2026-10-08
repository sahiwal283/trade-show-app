// backend/tests/services/notifications/reminderDefinitions.test.ts
import { describe, it, expect } from 'vitest';
import { REMINDER_DEFINITIONS } from '../../../src/services/notifications/reminderDefinitions';

const def = (kind: string) => {
  const found = REMINDER_DEFINITIONS.find((d) => d.kind === kind);
  if (!found) throw new Error(`no definition for ${kind}`);
  return found;
};
const eventRow = (days: number) => ({ subject_id: 'ev-1', user_id: 'u-1', event_id: 'ev-1', event_name: 'Expo', days });

describe('reminder definitions', () => {
  it('covers exactly the six kinds in the spec', () => {
    expect(REMINDER_DEFINITIONS.map((d) => d.kind)).toEqual([
      'reminder.event_30d', 'reminder.event_7d', 'reminder.expenses_1d', 'reminder.expenses_7d',
      'reminder.flight_checkin_24h', 'reminder.flight_departure_3h',
    ]);
  });

  it('every due query skips what the ledger already holds for its own kind', () => {
    for (const d of REMINDER_DEFINITIONS) {
      expect(d.dueSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM notification_reminders r\s+WHERE r\.kind = \$1/);
      expect(d.dueSql).toContain('u.is_active');
    }
  });

  it('event and expense reminders skip cancelled shows and use the spec anchors', () => {
    for (const kind of ['reminder.event_30d', 'reminder.event_7d']) {
      expect(def(kind).dueSql).toContain("e.status <> 'cancelled'");
      expect(def(kind).dueSql).toContain('COALESCE(e.travel_start_date, e.show_start_date)');
    }
    for (const kind of ['reminder.expenses_1d', 'reminder.expenses_7d']) {
      expect(def(kind).dueSql).toContain("e.status <> 'cancelled'");
      expect(def(kind).dueSql).toContain('COALESCE(e.show_end_date, e.end_date)');
    }
    expect(def('reminder.event_30d').dueSql).toContain('BETWEEN 23 AND 30');
    expect(def('reminder.event_7d').dueSql).toContain('BETWEEN 0 AND 7');
    expect(def('reminder.expenses_1d').dueSql).toContain('BETWEEN 1 AND 6');
    expect(def('reminder.expenses_7d').dueSql).toContain('BETWEEN 7 AND 13');
  });

  it('counts down in plain words', () => {
    const build = def('reminder.event_7d').build;
    expect(build(eventRow(5)).title).toBe('Expo is in 5 days');
    expect(build(eventRow(1)).title).toBe('Expo is tomorrow');
    expect(build(eventRow(0)).title).toBe('Expo is today');
    expect(def('reminder.event_30d').build(eventRow(28))).toEqual(expect.objectContaining({
      kind: 'reminder.event_30d', title: 'Expo is in 28 days', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('expense reminders link to Expenses for that show', () => {
    expect(def('reminder.expenses_1d').build(eventRow(1))).toEqual(expect.objectContaining({
      kind: 'reminder.expenses_1d', title: 'Submit your expenses · Expo', link: { page: 'expenses', eventId: 'ev-1' },
    }));
    expect(def('reminder.expenses_7d').build(eventRow(7)).title).toBe('Reminder: submit your expenses · Expo');
  });

  it('flight reminders keep the wording of the service they replace', () => {
    const row = { subject_id: '12', user_id: 'u-1', event_id: 'ev-1', event_name: 'Expo', carrier: 'Delta', confirmation_number: 'ABC123' };
    expect(def('reminder.flight_checkin_24h').build(row)).toEqual({
      kind: 'reminder.flight_checkin_24h',
      title: '✈️ Time to check in',
      body: 'Delta departs in about 24 hours for Expo. Check in with your airline now. Confirmation ABC123.',
      link: { page: 'checklist', eventId: 'ev-1' },
    });
    expect(def('reminder.flight_departure_3h').build({ subject_id: '12', user_id: 'u-1', event_id: null, event_name: null, carrier: null, confirmation_number: null }))
      .toEqual({
        kind: 'reminder.flight_departure_3h',
        title: '🛫 Flight today',
        body: 'Your flight departs in about 3 hours. Time to head out.',
        link: null,
      });
    expect(def('reminder.flight_checkin_24h').dueSql).toContain("interval '24 hours'");
    expect(def('reminder.flight_departure_3h').dueSql).toContain("interval '3 hours'");
  });
});
