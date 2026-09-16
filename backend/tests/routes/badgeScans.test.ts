import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/badge/BadgeScanService', () => ({
  badgeScanService: {
    create: vi.fn(async (i: any, u: string) => ({ id: 'scan-1', ...i, scanned_by: u })),
    list: vi.fn(async () => [{ id: 'scan-1' }]),
    update: vi.fn(async (id: string, p: any) => ({ id, ...p })),
    getById: vi.fn(async () => ({ id: 'scan-1' })),
    requeueForCrm: vi.fn(async (id: string) => ({ id, crm_status: 'pending' })),
  },
}));

import { handleCreateScan, handleListScans, handlePatchScan, handleGetScan, handleRetryPush } from '../../src/routes/badgeScans';
import { badgeScanService } from '../../src/services/badge/BadgeScanService';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('badge scan route handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a scan attributed to the authenticated user, not a client-supplied id', async () => {
    const res = mockRes();
    await handleCreateScan(
      { user: { id: 'user-1', role: 'salesperson' }, body: { eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW', scannedBy: 'somebody-else' } } as any,
      res
    );
    expect(badgeScanService.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: 'Haute Brands' }),
      'user-1'
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('requires eventId on list so one rep cannot enumerate every show', async () => {
    const res = mockRes();
    await handleListScans({ user: { id: 'user-1' }, query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(badgeScanService.list).not.toHaveBeenCalled();
  });

  it('passes through the company and status filters', async () => {
    const res = mockRes();
    await handleListScans(
      { user: { id: 'user-1' }, query: { eventId: 'ev-1', entity: 'Haute Brands', crmStatus: 'failed' } } as any,
      res
    );
    expect(badgeScanService.list).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: 'Haute Brands', crmStatus: 'failed' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it('ignores a non-string query param instead of passing it to SQL', async () => {
    const res = mockRes();
    await handleListScans({ user: { id: 'user-1' }, query: { eventId: 'ev-1', entity: ['a', 'b'] } } as any, res);
    expect(badgeScanService.list).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'ev-1', entity: undefined })
    );
  });

  it('patches editable contact fields', async () => {
    const res = mockRes();
    await handlePatchScan({ user: { id: 'user-1' }, params: { id: 'scan-1' }, body: { email: 'x@y.com' } } as any, res);
    expect(badgeScanService.update).toHaveBeenCalledWith('scan-1', expect.objectContaining({ email: 'x@y.com' }));
    expect(res.json).toHaveBeenCalled();
  });
});

describe('badge scan retry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requeues a failed scan for another CRM attempt', async () => {
    const res = mockRes();
    await handleRetryPush({ user: { id: 'u1' }, params: { id: 'scan-1' } } as any, res);
    expect(badgeScanService.requeueForCrm).toHaveBeenCalledWith('scan-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ crm_status: 'pending' }));
  });

  it('404s on a scan that does not exist rather than returning an empty body', async () => {
    vi.mocked(badgeScanService.getById).mockResolvedValueOnce(null as any);
    const res = mockRes();
    await handleGetScan({ user: { id: 'u1' }, params: { id: 'gone' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
