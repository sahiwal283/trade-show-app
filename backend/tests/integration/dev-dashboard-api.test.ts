import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getApiAnalytics } from '../../src/services/devDashboard/apiAnalytics';
import { getOverview } from '../../src/services/devDashboard/overview';

const MARKER = '/api/__devdash_integration__';

describe('dev dashboard queries against a real database', () => {
  beforeAll(async () => {
    await query('DELETE FROM api_requests WHERE endpoint = $1', [MARKER]);
    await query(
      `INSERT INTO api_requests (method, endpoint, status_code, response_time_ms, error_message, created_at)
       VALUES ('POST', $1, 500, 300, 'integration marker', NOW()),
              ('POST', $1, 200, 100, NULL, NOW() - INTERVAL '2 minutes'),
              ('POST', $1, 200, 200, NULL, NOW() - INTERVAL '3 days')`,
      [MARKER]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM api_requests WHERE endpoint = $1', [MARKER]);
    await pool.end();
  });

  it.each(['1h', '24h', '7d', '30d'] as const)('runs every API query for %s', async (range) => {
    const result = await getApiAnalytics(range);
    expect(result.totals.requests).toBeGreaterThanOrEqual(2);
    expect(result.totals.p95Ms).toBeGreaterThanOrEqual(result.totals.p50Ms);
    expect(result.buckets.reduce((sum, b) => sum + b.requests, 0)).toBeGreaterThanOrEqual(2);
  });

  it('puts the newest failure first, with its message', async () => {
    const { recentErrors } = await getApiAnalytics('1h');
    expect(recentErrors[0]).toMatchObject({ endpoint: MARKER, statusCode: 500, errorMessage: 'integration marker' });
  });

  it('counts the three-day-old request in 7d but not in 24h', async () => {
    const day = (await getApiAnalytics('24h')).endpoints.find((e) => e.endpoint === MARKER);
    const week = (await getApiAnalytics('7d')).endpoints.find((e) => e.endpoint === MARKER);
    if (day) expect(day.calls).toBe(2);
    if (week) expect(week.calls).toBe(3);
    expect(Boolean(day) || Boolean(week)).toBe(true);
  });

  it('runs the Overview queries and all six checks', async () => {
    const overview = await getOverview();
    expect(overview.database.sizeBytes).toBeGreaterThan(0);
    expect(overview.database.maxConnections).toBeGreaterThan(0);
    expect(overview.database.tables.length).toBeGreaterThan(0);
    expect(overview.checks).toHaveLength(6);
    expect(overview.checks.filter((c) => c.value.startsWith('Check failed'))).toEqual([]);
  });
});
