import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/config/database', () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/database/repositories', () => ({
  eventRepository: { create: vi.fn(async (d: any) => ({ id: 'ev-new', ...d })) },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  processParticipants: vi.fn(async () => ['u-1', 'u-2']),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
  removeAllParticipants: vi.fn(),
}));
vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: { announceIfOpen: vi.fn(async () => undefined) },
}));

import { handleCreateEvent, handleAddParticipants } from '../../src/routes/events';
import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('events -> sample request announcements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('announces to every participant after create', async () => {
    const res = mockRes();
    await handleCreateEvent(
      { user: { id: 'adm', role: 'admin' }, body: { name: 'X', venue: 'V', city: 'C', state: 'S', start_date: '2026-12-01', end_date: '2026-12-02', participant_ids: ['u-1', 'u-2'] } } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(sampleRequestService.announceIfOpen).toHaveBeenCalledWith('ev-new', ['u-1', 'u-2']);
  });

  it('announces only to newly added participants', async () => {
    const res = mockRes();
    await handleAddParticipants({ user: { id: 'adm' }, params: { id: 'ev-1' }, body: { user_ids: ['u-1', 'u-2'] } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ added: ['u-2'] });
    expect(sampleRequestService.announceIfOpen).toHaveBeenCalledWith('ev-1', ['u-2']);
  });

  it('does not fail the response when the announcement rejects', async () => {
    vi.mocked(sampleRequestService.announceIfOpen).mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    await handleAddParticipants({ user: { id: 'adm' }, params: { id: 'ev-1' }, body: { user_ids: ['u-1', 'u-2'] } } as any, res);
    await new Promise((r) => setImmediate(r));
    expect(res.json).toHaveBeenCalledWith({ added: ['u-2'] });
    expect(res.status).not.toHaveBeenCalledWith(500);
    errSpy.mockRestore();
  });
});
