import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n' })) },
}));

import { sampleRequestReminderService } from '../../src/services/sampleRequests/SampleRequestReminderService';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

// travel Oct 31 − 10 days = Oct 21 (close day); 23:59:59 EDT (UTC−4) = 2026-10-22T03:59:59Z
const EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-31', show_start_date: '2026-11-01' };

describe('SampleRequestReminderService.scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('reminds unsubmitted participants inside the 48h window, once', async () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z')); // Oct 22 03:59:59Z − Oct 20 12:00Z = 39h59m ≈ 40h, inside 48h
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [EVENT] } as any)                                  // candidate events
      .mockResolvedValueOnce({ rows: [{ user_id: 'u-1' }, { user_id: 'u-2' }] } as any)  // unsubmitted
      .mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any)                    // claim u-1 ok
      .mockResolvedValueOnce({ rows: [] } as any);                                       // claim u-2 conflict
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({
      kind: 'sample_request.closing_48h', link: { page: 'checklist', eventId: 'ev-1' },
    }));
  });

  it('skips events whose close is more than 48h away or already past', async () => {
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z')); // ~160h before close, more than 48h
    vi.mocked(query).mockResolvedValueOnce({ rows: [EVENT] } as any);
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-10-23T12:00:00Z')); // after close (Oct 22 03:59:59Z)
    vi.mocked(query).mockResolvedValueOnce({ rows: [EVENT] } as any);
    await sampleRequestReminderService.scan();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('never throws out of scan', async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error('db down'));
    await expect(sampleRequestReminderService.scan()).resolves.toBeUndefined();
  });
});
