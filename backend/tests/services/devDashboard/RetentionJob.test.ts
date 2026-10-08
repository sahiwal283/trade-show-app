import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiRequests = vi.fn();
const pageViews = vi.fn();
const auditLogs = vi.fn();
const sessions = vi.fn();

vi.mock('../../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));
vi.mock('../../../src/database/repositories', () => ({
  apiRequestRepository: { deleteOlderThan: (d: number) => apiRequests(d) },
  pageViewRepository: { deleteOlderThan: (d: number) => pageViews(d) },
  auditLogRepository: { deleteOlderThan: (d: number) => auditLogs(d) },
}));
vi.mock('../../../src/middleware/sessionTracker', () => ({ cleanupExpiredSessions: () => sessions() }));

import { RetentionJob } from '../../../src/services/devDashboard/RetentionJob';

describe('RetentionJob', () => {
  beforeEach(() => {
    [apiRequests, pageViews, auditLogs, sessions].forEach((m) => { m.mockReset(); m.mockResolvedValue(0); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('prunes each table to its retention period', async () => {
    await new RetentionJob().run();
    expect(apiRequests).toHaveBeenCalledWith(30);
    expect(pageViews).toHaveBeenCalledWith(90);
    expect(auditLogs).toHaveBeenCalledWith(365);
    expect(sessions).toHaveBeenCalledTimes(1);
  });

  it('carries on when one table fails', async () => {
    apiRequests.mockRejectedValue(new Error('permission denied'));
    await expect(new RetentionJob().run()).resolves.toBeUndefined();
    expect(pageViews).toHaveBeenCalled();
    expect(auditLogs).toHaveBeenCalled();
    expect(sessions).toHaveBeenCalled();
  });

  it('runs once shortly after start and then every 24 hours', async () => {
    vi.useFakeTimers();
    const job = new RetentionJob();
    job.start();
    expect(sessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(sessions).toHaveBeenCalledTimes(2);
    job.stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it('does not start twice', async () => {
    vi.useFakeTimers();
    const job = new RetentionJob();
    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sessions).toHaveBeenCalledTimes(1);
    job.stop();
  });
});
