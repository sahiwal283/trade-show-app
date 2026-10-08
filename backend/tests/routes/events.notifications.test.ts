// backend/tests/routes/events.notifications.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/config/database', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
const BEFORE = { id: 'ev-1', name: 'Expo', status: 'upcoming', city: 'Las Vegas' };
vi.mock('../../src/database/repositories', () => ({
  eventRepository: {
    create: vi.fn(async (d: any) => ({ id: 'ev-new', ...d })),
    findById: vi.fn(async () => BEFORE),
    updateWithTransaction: vi.fn(async (id: string, d: any) => ({ id, ...d })),
  },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  processParticipants: vi.fn(async () => ['u-1', 'u-2']),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
  removeAllParticipants: vi.fn(),
}));
vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: { announceIfOpen: vi.fn(async () => undefined) },
}));
vi.mock('../../src/services/notifications', () => ({
  eventNotifications: { added: vi.fn(async () => undefined), afterUpdate: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import { handleCreateEvent, handleAddParticipants, handleUpdateEvent } from '../../src/routes/events';
import { pool } from '../../src/config/database';
import { eventRepository } from '../../src/database/repositories';
import { processParticipants } from '../../src/services/EventParticipantService';
import { eventNotifications } from '../../src/services/notifications';

const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as unknown as Response & {
  json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
};
const body = { name: 'Expo', venue: 'V', city: 'Reno', state: 'NV', start_date: '2026-12-01', end_date: '2026-12-02' };
const mockClient = () => {
  const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  vi.mocked(pool.connect).mockResolvedValueOnce(client as any);
  return client;
};

describe('events routes -> event notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create tells everyone added, naming the creator as actor', async () => {
    await handleCreateEvent({ user: { id: 'adm', role: 'admin' }, body: { ...body, participant_ids: ['u-1', 'u-2'] } } as any, mockRes());
    expect(eventNotifications.added).toHaveBeenCalledWith('ev-new', ['u-1', 'u-2'], 'adm');
  });

  it('inline add tells only the newly added', async () => {
    await handleAddParticipants({ user: { id: 'adm' }, params: { id: 'ev-1' }, body: { user_ids: ['u-1', 'u-2'] } } as any, mockRes());
    expect(eventNotifications.added).toHaveBeenCalledWith('ev-1', ['u-2'], 'adm');
  });

  it('update hands before, after and both rosters to afterUpdate, after commit', async () => {
    const client = mockClient();
    vi.mocked(processParticipants).mockResolvedValueOnce(['u-2', 'u-3']);
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body: { ...body, participant_ids: ['u-2', 'u-3'] } } as any, mockRes());
    expect(eventNotifications.afterUpdate).toHaveBeenCalledWith({
      before: BEFORE,
      after: expect.objectContaining({ id: 'ev-1', city: 'Reno' }),
      previousIds: ['u-1'],
      rosterIds: ['u-2', 'u-3'],
      actorId: 'adm',
    });
    const commitOrder = client.query.mock.invocationCallOrder[client.query.mock.calls.findIndex((c) => c[0] === 'COMMIT')];
    expect(commitOrder).toBeLessThan(vi.mocked(eventNotifications.afterUpdate).mock.invocationCallOrder[0]);
  });

  it('update without participants passes null rosters', async () => {
    mockClient();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, mockRes());
    expect(eventNotifications.afterUpdate).toHaveBeenCalledWith(expect.objectContaining({ previousIds: null, rosterIds: null }));
  });

  it('a failed "before" read skips notifications but not the update', async () => {
    mockClient();
    vi.mocked(eventRepository.findById).mockRejectedValueOnce(new Error('db blip'));
    const res = mockRes();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, res);
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(eventNotifications.afterUpdate).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the response', async () => {
    mockClient();
    vi.mocked(eventNotifications.afterUpdate).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await handleUpdateEvent({ user: { id: 'adm', role: 'admin' }, params: { id: 'ev-1' }, body } as any, res);
    await new Promise((r) => setImmediate(r));
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
