import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../../src/services/notifications/recipients', () => ({
  eventParticipants: vi.fn(async () => ['u-1', 'u-2']),
  usersWithRole: vi.fn(async () => ['adm-1', 'coord-1']),
}));
vi.mock('../../../src/services/notifications/eventRefs', () => ({
  eventByChecklistId: vi.fn(async () => ({ id: 'ev-1', name: 'Expo' })),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { query } from '../../../src/config/database';
import { boothNotifications } from '../../../src/services/notifications/boothNotifications';
import { eventParticipants, usersWithRole } from '../../../src/services/notifications/recipients';
import { eventByChecklistId } from '../../../src/services/notifications/eventRefs';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

const lastInput = () => vi.mocked(notifyMany).mock.calls.at(-1)![1];

describe('boothNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ordered tells everyone on the event except the actor', async () => {
    await boothNotifications.ordered(7, 'adm');
    expect(eventByChecklistId).toHaveBeenCalledWith(7);
    expect(eventParticipants).toHaveBeenCalledWith('ev-1', { except: ['adm'] });
    expect(notifyMany).toHaveBeenCalledWith(['u-1', 'u-2'], expect.objectContaining({
      kind: 'booth.ordered', title: 'Booth ordered · Expo', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('shipped carries carrier, tracking number and arrival day when present', async () => {
    await boothNotifications.shipped(7, { carrier_name: 'FedEx', tracking_number: '1Z999', delivery_date: '2026-10-29' }, 'adm');
    expect(lastInput().kind).toBe('booth.shipped');
    expect(lastInput().body).toBe('The booth for Expo has shipped with FedEx · Tracking 1Z999 · Arrives Oct 29, 2026');
  });

  it('shipped stays readable with no carrier details', async () => {
    await boothNotifications.shipped(7, {}, 'adm');
    expect(lastInput().body).toBe('The booth for Expo has shipped');
  });

  it('mapUploaded links to the checklist', async () => {
    await boothNotifications.mapUploaded(7, 'adm');
    expect(lastInput()).toEqual(expect.objectContaining({
      kind: 'booth.map_uploaded', title: 'Booth map available · Expo', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('sends nothing when the checklist has no event or nobody is left', async () => {
    vi.mocked(eventByChecklistId).mockResolvedValueOnce(null);
    await boothNotifications.ordered(7, 'adm');
    vi.mocked(eventParticipants).mockResolvedValueOnce([]);
    await boothNotifications.ordered(7, 'adm');
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('componentReported tells admins and coordinators, naming the piece and reporter', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ component: 'Back wall fabric', booth: '10x20 Haute', reporter: 'Ana' }] } as any);
    await boothNotifications.componentReported({ componentId: 'c-1', kind: 'damage', notes: 'torn corner' }, 'u-9');
    expect(usersWithRole).toHaveBeenCalledWith(['admin', 'coordinator'], { except: ['u-9'] });
    expect(notifyMany).toHaveBeenCalledWith(['adm-1', 'coord-1'], {
      kind: 'booth.component_reported',
      title: 'Booth component reported damaged',
      body: 'Ana reported "Back wall fabric" (10x20 Haute) as damaged. Note: torn corner',
      link: { page: 'booth-inventory' },
    });
  });

  it('componentReported words a missing report and survives an unknown reporter', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ component: 'Light', booth: 'Booth B', reporter: null }] } as any);
    await boothNotifications.componentReported({ componentId: 'c-1', kind: 'missing' }, 'u-9');
    expect(lastInput().title).toBe('Booth component reported missing');
    expect(lastInput().body).toBe('Someone reported "Light" (Booth B) as missing.');
  });

  it('componentReported sends nothing when the component is gone', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await boothNotifications.componentReported({ componentId: 'c-x', kind: 'missing' }, 'u-9');
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
