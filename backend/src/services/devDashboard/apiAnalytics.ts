/**
 * Developer dashboard — API tab.
 * Request volume, speed and failures from api_requests. The dashboard's own
 * requests are excluded so looking at it does not change what it shows.
 */
import { query } from '../../config/database';
import { TimeRange, intervalFor, rangeSeconds, bucketSeconds } from './timeRange';

export interface ApiAnalytics {
  totals: { requests: number; errors: number; errorRate: number; p50Ms: number; p95Ms: number };
  buckets: Array<{ start: string; requests: number; errors: number }>;
  endpoints: Array<{
    method: string; endpoint: string; calls: number; avgMs: number; p95Ms: number; maxMs: number; errors: number;
  }>;
  slowest: Array<{ method: string; endpoint: string; calls: number; avgMs: number; maxMs: number }>;
  recentErrors: Array<{
    id: string; createdAt: string; method: string; endpoint: string; statusCode: number;
    userName: string | null; userAgent: string | null; errorMessage: string | null;
  }>;
}

const IN_RANGE = `created_at > NOW() - $1::interval AND endpoint NOT LIKE '/api/dev-dashboard%'`;

/**
 * The query only returns buckets that had traffic. A chart drawn from that
 * would close up the quiet hours, so every bucket in the range is emitted,
 * oldest first, ending with the bucket that contains `now`.
 */
export function fillBuckets(
  rows: Array<{ start: Date | string; requests: number; errors: number }>,
  range: TimeRange,
  now: Date
): ApiAnalytics['buckets'] {
  const stepMs = bucketSeconds(range) * 1000;
  const count = rangeSeconds(range) / bucketSeconds(range);
  const lastStart = Math.floor(now.getTime() / stepMs) * stepMs;
  const byStart = new Map(rows.map((row) => [new Date(row.start).getTime(), row]));

  return Array.from({ length: count }, (_, index) => {
    const start = lastStart - (count - 1 - index) * stepMs;
    const row = byStart.get(start);
    return { start: new Date(start).toISOString(), requests: row?.requests ?? 0, errors: row?.errors ?? 0 };
  });
}

export async function getApiAnalytics(range: TimeRange, now: Date = new Date()): Promise<ApiAnalytics> {
  const interval = intervalFor(range);

  const [totals, buckets, endpoints, slowest, recentErrors] = await Promise.all([
    query(`/* devdash:api-totals */
      SELECT COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
             COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms), 0)::float AS p50,
             COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms), 0)::float AS p95
        FROM api_requests
       WHERE ${IN_RANGE}`, [interval]),
    query(`/* devdash:api-buckets */
      SELECT to_timestamp(floor(extract(epoch FROM created_at) / $2::int) * $2::int) AS start,
             COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY 1
       ORDER BY 1`, [interval, bucketSeconds(range)]),
    query(`/* devdash:api-endpoints */
      SELECT method, endpoint,
             COUNT(*)::int AS calls,
             AVG(response_time_ms)::float AS avg_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)::float AS p95_ms,
             MAX(response_time_ms)::int AS max_ms,
             COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY method, endpoint
       ORDER BY calls DESC
       LIMIT 50`, [interval]),
    query(`/* devdash:api-slowest */
      SELECT method, endpoint,
             COUNT(*)::int AS calls,
             AVG(response_time_ms)::float AS avg_ms,
             MAX(response_time_ms)::int AS max_ms
        FROM api_requests
       WHERE ${IN_RANGE}
       GROUP BY method, endpoint
      HAVING COUNT(*) >= 5
       ORDER BY avg_ms DESC
       LIMIT 10`, [interval]),
    query(`/* devdash:api-recent-errors */
      SELECT a.id, a.created_at, a.method, a.endpoint, a.status_code, u.name AS user_name, a.user_agent, a.error_message
        FROM api_requests a
        LEFT JOIN users u ON u.id = a.user_id
       WHERE a.created_at > NOW() - $1::interval
         AND a.endpoint NOT LIKE '/api/dev-dashboard%'
         AND a.status_code >= 400
       ORDER BY a.created_at DESC
       LIMIT 50`, [interval]),
  ]);

  const { requests, errors, p50, p95 } = totals.rows[0];

  return {
    totals: {
      requests,
      errors,
      errorRate: requests > 0 ? Math.round((errors / requests) * 10000) / 100 : 0,
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
    },
    buckets: fillBuckets(buckets.rows, range, now),
    endpoints: endpoints.rows.map((row) => ({
      method: row.method,
      endpoint: row.endpoint,
      calls: row.calls,
      avgMs: Math.round(row.avg_ms),
      p95Ms: Math.round(row.p95_ms),
      maxMs: row.max_ms,
      errors: row.errors,
    })),
    slowest: slowest.rows.map((row) => ({
      method: row.method,
      endpoint: row.endpoint,
      calls: row.calls,
      avgMs: Math.round(row.avg_ms),
      maxMs: row.max_ms,
    })),
    recentErrors: recentErrors.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      method: row.method,
      endpoint: row.endpoint,
      statusCode: row.status_code,
      userName: row.user_name ?? null,
      userAgent: row.user_agent ?? null,
      errorMessage: row.error_message ?? null,
    })),
  };
}
