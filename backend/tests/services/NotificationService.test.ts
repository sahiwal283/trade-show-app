import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/NotificationRepository', () => ({
  notificationRepository: {
    insert: vi.fn(async (d: any) => ({ id: 'n-1', read_at: null, created_at: '2026-10-07T00:00:00Z', ...d })),
    listUnread: vi.fn(async () => []),
    markRead: vi.fn(async () => 1),
    markAllRead: vi.fn(async () => 2),
  },
}));
vi.mock('../../src/services/PushService', () => ({
  pushService: { sendToUser: vi.fn(async () => undefined), isEnabled: vi.fn(() => true) },
}));

import { notificationService } from '../../src/services/NotificationService';
import { notificationRepository } from '../../src/database/repositories/NotificationRepository';
import { pushService } from '../../src/services/PushService';

describe('NotificationService.notify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the bell row and sends a push with the link as the url', async () => {
    const row = await notificationService.notify('u-1', {
      kind: 'sample_request.open', title: 'T', body: 'B', link: { page: 'checklist', eventId: 'ev-1' },
    });
    expect(row.id).toBe('n-1');
    expect(notificationRepository.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u-1', kind: 'sample_request.open', title: 'T', body: 'B',
    }));
    expect(pushService.sendToUser).toHaveBeenCalledWith('u-1', { title: 'T', body: 'B', url: '/#event=ev-1&tab=my' });
  });

  it('still returns the row when the push fails', async () => {
    vi.mocked(pushService.sendToUser).mockRejectedValueOnce(new Error('boom'));
    const row = await notificationService.notify('u-1', { kind: 'x', title: 'T', body: 'B' });
    expect(row.id).toBe('n-1');
  });

  it('uses "/" as the push url when there is no link', async () => {
    await notificationService.notify('u-1', { kind: 'x', title: 'T', body: 'B' });
    expect(pushService.sendToUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ url: '/' }));
  });

  it('passes the dedupe key to the repository as the event id', async () => {
    await notificationService.notify('u-1', { kind: 'expense.approved', title: 'T', body: 'B', dedupeKey: 'evt-1' });
    expect(notificationRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ source_event_id: 'evt-1' }));
  });

  it('sends no push and returns null when the event was already stored', async () => {
    vi.mocked(notificationRepository.insert).mockResolvedValueOnce(null as never);
    const row = await notificationService.notify('u-1', { kind: 'expense.approved', title: 'T', body: 'B', dedupeKey: 'evt-1' });
    expect(row).toBeNull();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });
});
