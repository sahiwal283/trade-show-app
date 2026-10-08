import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getOverview, getHealthChecks } from '../../../src/services/devDashboard/overview';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/overview.json'), 'utf8')
);

const HEALTHY: Array<[string, any[] | Error]> = [
  ['db-stats', [{ size_bytes: '187432960', connections: 7, max_connections: 100 }]],
  ['db-tables', [{ name: 'api_requests', size_bytes: '98566144' }]],
  ['check-error-rate', [{ total: 100, errors: 1 }]],
  ['check-slow-endpoints', []],
  ['check-stale-sessions', [{ count: 0 }]],
  ['check-endpoint-failures', []],
  ['check-traffic-spike', [{ recent: 40, previous: 38 }]],
  ['check-auth-failures', [{ count: 2 }]],
];

const withRoute = (name: string, answer: any[] | Error) =>
  HEALTHY.map(([n, a]) => (n === name ? [n, answer] : [n, a])) as Array<[string, any[] | Error]>;

describe('getOverview', () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(fs.promises, 'statfs').mockResolvedValue({ blocks: 1000, bfree: 600, bsize: 4096 } as any);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns exactly the contract shape', async () => {
    routeQueries(query, HEALTHY);
    expect(keyShape(await getOverview())).toEqual(keyShape(fixture));
  });

  it('reports numbers, not the strings pg returns for bigint', async () => {
    routeQueries(query, HEALTHY);
    const overview = await getOverview();
    expect(overview.database.sizeBytes).toBe(187432960);
    expect(overview.database.tables[0].sizeBytes).toBe(98566144);
    expect(overview.system.disk).toEqual({ usedBytes: 400 * 4096, totalBytes: 1000 * 4096 });
  });

  it('reports disk as null when the volume cannot be read', async () => {
    routeQueries(query, HEALTHY);
    vi.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('ENOENT'));
    expect((await getOverview()).system.disk).toBeNull();
  });
});

describe('getHealthChecks', () => {
  beforeEach(() => { query.mockReset(); });

  const statusOf = async (id: string) => (await getHealthChecks()).find((c) => c.id === id)!;

  it('returns all six checks, passing, when the app is healthy', async () => {
    routeQueries(query, HEALTHY);
    const checks = await getHealthChecks();
    expect(checks.map((c) => c.id)).toEqual([
      'error-rate', 'slow-endpoints', 'endpoint-failures', 'auth-failures', 'traffic-spike', 'stale-sessions',
    ]);
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('warns on an error rate over 10% once there are more than 20 requests', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 100, errors: 15 }]));
    expect(await statusOf('error-rate')).toMatchObject({ status: 'warn', value: '15.0% of 100 requests' });
  });

  it('does not warn on a high error rate from a handful of requests', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 15, errors: 9 }]));
    expect((await statusOf('error-rate')).status).toBe('pass');
  });

  it('passes with zero requests instead of dividing by zero', async () => {
    routeQueries(query, withRoute('check-error-rate', [{ total: 0, errors: 0 }]));
    expect(await statusOf('error-rate')).toMatchObject({ status: 'pass', value: '0.0% of 0 requests' });
  });

  it('warns and names the slowest endpoint', async () => {
    routeQueries(query, withRoute('check-slow-endpoints', [
      { endpoint: '/api/expenses', avg_ms: 2400.4 },
      { endpoint: '/api/events', avg_ms: 2100 },
    ]));
    expect(await statusOf('slow-endpoints')).toMatchObject({
      status: 'warn',
      value: '2 endpoints, slowest /api/expenses at 2400ms',
    });
  });

  it('fails on repeated server errors and names the endpoint', async () => {
    routeQueries(query, withRoute('check-endpoint-failures', [{ method: 'POST', endpoint: '/api/events', failures: 6 }]));
    expect(await statusOf('endpoint-failures')).toMatchObject({ status: 'fail', value: 'POST /api/events failed 6 times' });
  });

  it('warns on more than 50 rejected logins in an hour', async () => {
    routeQueries(query, withRoute('check-auth-failures', [{ count: 51 }]));
    expect((await statusOf('auth-failures')).status).toBe('warn');
  });

  it('warns when traffic more than triples over a busy hour', async () => {
    routeQueries(query, withRoute('check-traffic-spike', [{ recent: 400, previous: 100 }]));
    expect((await statusOf('traffic-spike')).status).toBe('warn');
  });

  it('does not call a quiet hour following an empty one a spike', async () => {
    routeQueries(query, withRoute('check-traffic-spike', [{ recent: 60, previous: 0 }]));
    expect((await statusOf('traffic-spike')).status).toBe('pass');
  });

  it('warns on more than 10 valid sessions idle for a day', async () => {
    routeQueries(query, withRoute('check-stale-sessions', [{ count: 11 }]));
    expect((await statusOf('stale-sessions')).status).toBe('warn');
  });

  it('reports a check whose query fails as failed, and still runs the rest', async () => {
    routeQueries(query, withRoute('check-auth-failures', new Error('relation "api_requests" does not exist')));
    const checks = await getHealthChecks();
    expect(checks).toHaveLength(6);
    expect(checks.find((c) => c.id === 'auth-failures')).toMatchObject({
      status: 'fail',
      value: 'Check failed: relation "api_requests" does not exist',
    });
    expect(checks.filter((c) => c.status === 'pass')).toHaveLength(5);
  });
});
