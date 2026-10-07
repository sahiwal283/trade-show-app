import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/NotificationService', () => ({
  notificationService: {
    listUnread: vi.fn(async () => [{ id: 'n-1' }]),
    markRead: vi.fn(async () => 1),
    markAllRead: vi.fn(async () => 3),
  },
}));

import { handleListUnread, handleMarkRead, handleMarkAllRead } from '../../src/routes/notifications';
import { notificationService } from '../../src/services/NotificationService';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
  };
}

describe('notification routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists unread for the caller only', async () => {
    const res = mockRes();
    await handleListUnread({ user: { id: 'u-1' } } as any, res);
    expect(notificationService.listUnread).toHaveBeenCalledWith('u-1');
    expect(res.json).toHaveBeenCalledWith({ notifications: [{ id: 'n-1' }] });
  });

  it('rejects a read call without a string id array', async () => {
    const res = mockRes();
    await handleMarkRead({ user: { id: 'u-1' }, body: { ids: 'n-1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(notificationService.markRead).not.toHaveBeenCalled();
  });

  it('marks the given ids read for the caller', async () => {
    const res = mockRes();
    await handleMarkRead({ user: { id: 'u-1' }, body: { ids: ['n-1', 7] } } as any, res);
    expect(notificationService.markRead).toHaveBeenCalledWith('u-1', ['n-1']);
    expect(res.json).toHaveBeenCalledWith({ updated: 1 });
  });

  it('marks all read', async () => {
    const res = mockRes();
    await handleMarkAllRead({ user: { id: 'u-1' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });
});
