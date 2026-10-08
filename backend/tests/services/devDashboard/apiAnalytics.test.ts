import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getApiAnalytics, fillBuckets } from '../../../src/services/devDashboard/apiAnalytics';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/apiAnalytics.json'), 'utf8')
);

const NOW = new Date('2026-10-08T14:20:00.000Z');

const ROWS: Array<[string, any[]]> = [
  ['api-totals', [{ requests: 200, errors: 3, p50: 24.4, p95: 180.6 }]],
  ['api-buckets', [{ start: new Date('2026-10-08T13:00:00.000Z'), requests: 12, errors: 1 }]],
  ['api-endpoints', [{ method: 'GET', endpoint: '/api/expenses', calls: 47, avg_ms: 137.2, p95_ms: 300.9, max_ms: 349, errors: 2 }]],
  ['api-slowest', [{ method: 'GET', endpoint: '/api/expenses', calls: 47, avg_ms: 137.2, max_ms: 349 }]],
  ['api-recent-errors', [{
    id: 'e1', created_at: new Date('2026-10-08T14:02:55.000Z'), method: 'POST', endpoint: '/api/events',
    status_code: 500, user_name: null, error_message: null,
  }]],
];

describe('getApiAnalytics', () => {
  beforeEach(() => { query.mockReset(); routeQueries(query, ROWS); });

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getApiAnalytics('24h', NOW))).toEqual(keyShape(fixture));
  });

  it('rounds timings and computes the error rate to two places', async () => {
    const result = await getApiAnalytics('24h', NOW);
    expect(result.totals).toEqual({ requests: 200, errors: 3, errorRate: 1.5, p50Ms: 24, p95Ms: 181 });
    expect(result.endpoints[0]).toMatchObject({ avgMs: 137, p95Ms: 301, maxMs: 349 });
  });

  it('reports a zero error rate when there were no requests', async () => {
    routeQueries(query, ROWS.map(([n, r]) => (n === 'api-totals' ? [n, [{ requests: 0, errors: 0, p50: 0, p95: 0 }]] : [n, r])) as any);
    expect((await getApiAnalytics('24h', NOW)).totals.errorRate).toBe(0);
  });

  it('passes the range as a parameter and never as SQL text', async () => {
    await getApiAnalytics('7d', NOW);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).not.toContain('7 days');
      expect(params[0]).toBe('7 days');
    }
  });

  it('leaves the dashboard\'s own requests out of every query', async () => {
    await getApiAnalytics('24h', NOW);
    for (const [sql] of query.mock.calls) expect(sql).toContain("NOT LIKE '/api/dev-dashboard%'");
  });
});

describe('fillBuckets', () => {
  it('returns every bucket in the range in order, with zeros where nothing happened', () => {
    const buckets = fillBuckets(
      [
        { start: new Date('2026-10-08T14:00:00.000Z'), requests: 9, errors: 1 },
        { start: new Date('2026-10-08T11:00:00.000Z'), requests: 4, errors: 0 },
      ],
      '24h',
      NOW
    );
    expect(buckets).toHaveLength(24);
    expect(buckets[0].start).toBe('2026-10-07T15:00:00.000Z');
    expect(buckets[23]).toEqual({ start: '2026-10-08T14:00:00.000Z', requests: 9, errors: 1 });
    expect(buckets[20]).toEqual({ start: '2026-10-08T11:00:00.000Z', requests: 4, errors: 0 });
    expect(buckets.filter((b) => b.requests === 0)).toHaveLength(22);
  });

  it('uses 12 five-minute buckets for the last hour', () => {
    const buckets = fillBuckets([], '1h', NOW);
    expect(buckets).toHaveLength(12);
    expect(buckets[11].start).toBe('2026-10-08T14:20:00.000Z');
    expect(buckets[0].start).toBe('2026-10-08T13:25:00.000Z');
  });

  it('accepts bucket starts that arrive as strings', () => {
    const buckets = fillBuckets([{ start: '2026-10-08T14:00:00.000Z', requests: 2, errors: 0 }], '24h', NOW);
    expect(buckets[23].requests).toBe(2);
  });

  it.each([['7d', 7], ['30d', 30]] as const)('uses %s daily buckets', (range, count) => {
    expect(fillBuckets([], range, NOW)).toHaveLength(count);
  });
});
