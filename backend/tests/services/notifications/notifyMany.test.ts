import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n' })) },
}));

import { notificationService } from '../../../src/services/NotificationService';
import { notifyMany, logNotifyError } from '../../../src/services/notifications/notifyMany';

const input = { kind: 'k', title: 'T', body: 'B', link: null };

describe('notifyMany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies each user once', async () => {
    await notifyMany(['u-1', 'u-2'], input);
    expect(vi.mocked(notificationService.notify).mock.calls.map((c) => c[0])).toEqual(['u-1', 'u-2']);
  });

  it('does nothing for an empty list', async () => {
    await notifyMany([], input);
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('logs one failure and still notifies the rest, without throwing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(notificationService.notify).mockRejectedValueOnce(new Error('down'));
    await expect(notifyMany(['u-1', 'u-2'], input)).resolves.toBeUndefined();
    expect(notificationService.notify).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('u-1'), expect.any(Error));
    err.mockRestore();
  });

  it('logNotifyError returns a logger that names the trigger', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logNotifyError('booth.ordered')(new Error('x'));
    expect(err).toHaveBeenCalledWith(expect.stringContaining('booth.ordered'), expect.any(Error));
    err.mockRestore();
  });
});
