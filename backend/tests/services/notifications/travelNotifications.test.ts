import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[], opts?: { except?: unknown[] }) =>
    ids.filter((id) => id && !(opts?.except ?? []).includes(id))),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventByChecklistId: vi.fn(async () => ({ id: 'ev-1', name: 'Expo' })),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import {
  classifyBooking, travelNotifications, FLIGHT, HOTEL, CAR_RENTAL,
} from '../../../src/services/notifications/travelNotifications';
import { eventByChecklistId } from '../../../src/services/notifications/eventRefs';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const flight = (over: Record<string, unknown> = {}) => ({
  id: 1, checklist_id: 7, attendee_id: 'u-1', carrier: 'Delta', confirmation_number: 'ABC123',
  booked: true, departure_at: '2026-10-31T14:30:00.000Z', notes: null, ...over,
});
const types = (effects: Array<{ type: string; userId: string }>) => effects.map((e) => `${e.type}:${e.userId}`);

describe('classifyBooking', () => {
  it('created booked -> booked', () => {
    expect(types(classifyBooking(null, flight(), FLIGHT))).toEqual(['booked:u-1']);
  });
  it('not booked -> booked on update', () => {
    expect(types(classifyBooking(flight({ booked: false }), flight(), FLIGHT))).toEqual(['booked:u-1']);
  });
  it('unchanged save -> nothing, even when the timestamp arrives as a Date', () => {
    const before = flight({ departure_at: new Date('2026-10-31T14:30:00.000Z'), carrier: ' Delta ' });
    expect(classifyBooking(before, flight(), FLIGHT)).toEqual([]);
  });
  it('a note-only edit -> nothing', () => {
    expect(classifyBooking(flight(), flight({ notes: 'aisle seat' }), FLIGHT)).toEqual([]);
  });
  it('a watched field changed -> changed, naming the fields', () => {
    const effects = classifyBooking(flight(), flight({ confirmation_number: 'XYZ9', departure_at: '2026-10-31T18:00:00.000Z' }), FLIGHT);
    expect(types(effects)).toEqual(['changed:u-1']);
    expect(effects[0].changed).toEqual(['Confirmation number', 'Departure time']);
  });
  it('booked -> un-booked -> cancelled', () => {
    expect(types(classifyBooking(flight(), flight({ booked: false }), FLIGHT))).toEqual(['cancelled:u-1']);
  });
  it('booked row deleted -> cancelled', () => {
    expect(types(classifyBooking(flight(), null, FLIGHT))).toEqual(['cancelled:u-1']);
  });
  it('reassigned -> cancelled for the old person, booked for the new', () => {
    const before = { id: 3, checklist_id: 7, assigned_to_id: 'u-1', provider: 'Hertz', confirmation_number: 'H1', booked: true };
    expect(types(classifyBooking(before, { ...before, assigned_to_id: 'u-2' }, CAR_RENTAL)))
      .toEqual(['cancelled:u-1', 'booked:u-2']);
  });
  it('nothing for a row that never counted as booked', () => {
    expect(classifyBooking(null, flight({ booked: false }), FLIGHT)).toEqual([]);
    expect(classifyBooking(null, flight({ confirmation_number: '  ' }), FLIGHT)).toEqual([]);
    expect(classifyBooking(null, flight({ attendee_id: null }), FLIGHT)).toEqual([]);
    expect(classifyBooking(flight({ booked: false }), null, FLIGHT)).toEqual([]);
    expect(classifyBooking(null, null, FLIGHT)).toEqual([]);
  });
  it('hotel dates compare by day, whatever shape they arrive in', () => {
    const hotel = { id: 2, checklist_id: 7, attendee_id: 'u-1', property_name: 'Venetian', confirmation_number: 'H9', booked: true,
      check_in_date: new Date(2026, 9, 31), check_out_date: new Date(2026, 10, 4) };
    expect(classifyBooking(hotel, { ...hotel, check_in_date: '2026-10-31', check_out_date: '2026-11-04' }, HOTEL)).toEqual([]);
    expect(types(classifyBooking(hotel, { ...hotel, check_out_date: '2026-11-05' }, HOTEL))).toEqual(['changed:u-1']);
  });
});

describe('travelNotifications', () => {
  beforeEach(() => vi.clearAllMocks());
  const last = () => vi.mocked(notifyMany).mock.calls.at(-1)!;

  it('flight booked: tells the attendee with a checklist link', async () => {
    await travelNotifications.flightSaved(null, flight(), 'adm');
    expect(eventByChecklistId).toHaveBeenCalledWith(7);
    expect(last()).toEqual([['u-1'], {
      kind: 'travel.booked',
      title: 'Flight booked ✈️ · Expo',
      body: 'Delta · Confirmation ABC123',
      link: { page: 'checklist', eventId: 'ev-1' },
    }]);
  });

  it('hotel changed: says what changed and gives the current details', async () => {
    const hotel = { id: 2, checklist_id: 7, attendee_id: 'u-1', property_name: 'Venetian', confirmation_number: 'H9', booked: true,
      check_in_date: '2026-10-31', check_out_date: '2026-11-04' };
    await travelNotifications.hotelSaved(hotel, { ...hotel, check_in_date: '2026-11-01' }, 'adm');
    expect(last()[1]).toEqual(expect.objectContaining({
      kind: 'travel.changed',
      title: 'Hotel updated 🏨 · Expo',
      body: 'Check-in date changed. Venetian · Confirmation H9 · Check-in Nov 1, 2026',
    }));
  });

  it('car rental cancelled: tells the assignee', async () => {
    const car = { id: 3, checklist_id: 7, assigned_to_id: 'u-1', provider: 'Hertz', confirmation_number: 'C7', booked: true };
    await travelNotifications.carRentalSaved(car, null, 'adm');
    expect(last()).toEqual([['u-1'], expect.objectContaining({
      kind: 'travel.cancelled',
      title: 'Car rental cancelled · Expo',
      body: 'Your car rental for Expo was cancelled. Confirmation C7.',
    })]);
  });

  it('does not notify someone about a booking they made for themselves', async () => {
    await travelNotifications.flightSaved(null, flight(), 'u-1');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('does not look anything up when there is nothing to say', async () => {
    await travelNotifications.flightSaved(flight(), flight(), 'adm');
    expect(eventByChecklistId).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('still notifies, without a link, when the checklist has no event', async () => {
    vi.mocked(eventByChecklistId).mockResolvedValueOnce(null);
    await travelNotifications.flightSaved(null, flight(), 'adm');
    expect(last()[1]).toEqual(expect.objectContaining({ title: 'Flight booked ✈️', link: null }));
  });
});
