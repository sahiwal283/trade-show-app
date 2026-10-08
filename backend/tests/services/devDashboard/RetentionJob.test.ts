import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const query = vi.fn();
const sessions = vi.fn();

vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));
vi.mock('../../../src/middleware/sessionTracker', () => ({ cleanupExpiredSessions: () => sessions() }));

import { RetentionJob, deleteInBatches } from '../../../src/services/devDashboard/RetentionJob';

/** Answers each DELETE with the next row count from the list, then with 0. */
const deleting = (...counts: number[]) => {
  const left = [...counts];
  query.mockImplementation(async () => ({ rows: [], rowCount: left.shift() ?? 0 }));
};

const tableOf = (sql: string) => /DELETE FROM (\w+)/.exec(sql)![1];

describe('deleteInBatches', () => {
  const pause = vi.fn(async () => {});

  beforeEach(() => {
    query.mockReset();
    pause.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps deleting full batches and stops at the first short one', async () => {
    deleting(5000, 5000, 5000, 12);
    expect(await deleteInBatches('api_requests', 30, { pause })).toBe(15012);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('stops after one statement when there is nothing old enough', async () => {
    deleting(0);
    expect(await deleteInBatches('page_views', 90, { pause })).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it('deletes by id from a bounded subquery, with the age and the batch size as parameters', async () => {
    deleting(0);
    await deleteInBatches('audit_logs', 365, { pause });
    const [sql, params] = query.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ')).toContain(
      'DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs WHERE created_at < NOW() - make_interval(days => $1) LIMIT $2)'
    );
    expect(params).toEqual([365, 5000]);
  });

  it('pauses 100 ms between batches, and not after the last', async () => {
    deleting(5000, 5000, 1);
    await deleteInBatches('api_requests', 30, { pause });
    expect(pause.mock.calls).toEqual([[100], [100]]);
  });

  it('gives up at 400 batches and says so; the next run continues', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 5000 });
    expect(await deleteInBatches('api_requests', 30, { pause })).toBe(400 * 5000);
    expect(query).toHaveBeenCalledTimes(400);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('api_requests'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('400'));
  });

  it('honours a smaller batch size and cap', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 2 });
    expect(await deleteInBatches('page_views', 90, { batchSize: 2, maxBatches: 3, pause })).toBe(6);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toEqual([90, 2]);
  });

  it('refuses a table that is not on its list, before running anything', async () => {
    await expect(deleteInBatches('users; DROP TABLE users' as any, 1, { pause })).rejects.toThrow('not a pruned table');
    expect(query).not.toHaveBeenCalled();
  });

  it('lets a failing statement reach the caller', async () => {
    query.mockRejectedValue(new Error('permission denied'));
    await expect(deleteInBatches('audit_logs', 365, { pause })).rejects.toThrow('permission denied');
  });
});

describe('RetentionJob', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    sessions.mockReset();
    sessions.mockResolvedValue(0);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('prunes each table to its retention period', async () => {
    await new RetentionJob().run();
    expect(query.mock.calls.map(([sql, params]) => [tableOf(sql), params[0]])).toEqual([
      ['api_requests', 30],
      ['page_views', 90],
      ['audit_logs', 365],
    ]);
    expect(sessions).toHaveBeenCalledTimes(1);
  });

  it('carries on when one table fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (tableOf(sql) === 'api_requests') throw new Error('permission denied');
      return { rows: [], rowCount: 0 };
    });
    await expect(new RetentionJob().run()).resolves.toBeUndefined();
    expect(query.mock.calls.map(([sql]) => tableOf(sql))).toEqual(['api_requests', 'page_views', 'audit_logs']);
    expect(sessions).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('api_requests'), expect.any(Error));
  });

  it('works through a backlog in batches without real waiting', async () => {
    vi.useFakeTimers();
    const left: Record<string, number[]> = { api_requests: [5000, 5000, 40] };
    query.mockImplementation(async (sql: string) => ({ rows: [], rowCount: left[tableOf(sql)]?.shift() ?? 0 }));
    const done = new RetentionJob().run();
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(query.mock.calls.filter(([sql]) => tableOf(sql) === 'api_requests')).toHaveLength(3);
    expect(console.log).toHaveBeenCalledWith('[Retention] Deleted 10040 rows from api_requests');
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
