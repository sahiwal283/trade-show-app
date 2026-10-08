/**
 * Developer dashboard — Overview tab.
 * What is running, what it is running on, and whether anything is wrong
 * right now. Health checks are computed on every call and never stored.
 */
import os from 'os';
import fs from 'fs';
import { query } from '../../config/database';
import backendPkg from '../../../package.json';
import { FRONTEND_VERSION } from '../../config/version';

export interface HealthCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  value: string;
  threshold: string;
}

export interface Overview {
  version: { frontend: string; backend: string; node: string; environment: string; uptimeSeconds: number };
  system: {
    memory: { usedBytes: number; totalBytes: number };
    cpu: { load1: number; cores: number };
    disk: { usedBytes: number; totalBytes: number } | null;
  };
  database: {
    sizeBytes: number;
    connections: number;
    maxConnections: number;
    tables: Array<{ name: string; sizeBytes: number }>;
  };
  checks: HealthCheck[];
}

type CheckResult = Pick<HealthCheck, 'status' | 'value'>;
type CheckDefinition = Pick<HealthCheck, 'id' | 'label' | 'threshold'> & { run: () => Promise<CheckResult> };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const CHECKS: CheckDefinition[] = [
  {
    id: 'error-rate',
    label: 'API error rate',
    threshold: 'under 10% in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-error-rate */
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'`);
      const total = rows[0].total;
      const rate = total > 0 ? (rows[0].errors / total) * 100 : 0;
      return {
        status: rate > 10 && total > 20 ? 'warn' : 'pass',
        value: `${rate.toFixed(1)}% of ${plural(total, 'request')}`,
      };
    },
  },
  {
    id: 'slow-endpoints',
    label: 'Slow endpoints',
    threshold: 'none averaging over 2000ms',
    run: async () => {
      const { rows } = await query(`/* devdash:check-slow-endpoints */
        SELECT endpoint, AVG(response_time_ms)::float AS avg_ms
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND endpoint NOT LIKE '/api/dev-dashboard%'
         GROUP BY endpoint
        HAVING AVG(response_time_ms) > 2000 AND COUNT(*) >= 5
         ORDER BY avg_ms DESC`);
      if (rows.length === 0) return { status: 'pass', value: 'none' };
      return {
        status: 'warn',
        value: `${plural(rows.length, 'endpoint')}, slowest ${rows[0].endpoint} at ${Math.round(rows[0].avg_ms)}ms`,
      };
    },
  },
  {
    id: 'endpoint-failures',
    label: 'Repeated server errors',
    threshold: 'no endpoint with 5 or more 500s in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-endpoint-failures */
        SELECT method, endpoint, COUNT(*)::int AS failures
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND status_code >= 500
         GROUP BY method, endpoint
        HAVING COUNT(*) >= 5
         ORDER BY failures DESC`);
      if (rows.length === 0) return { status: 'pass', value: 'none' };
      const worst = rows[0];
      const more = rows.length > 1 ? ` (and ${plural(rows.length - 1, 'other')})` : '';
      return { status: 'fail', value: `${worst.method} ${worst.endpoint} failed ${plural(worst.failures, 'time')}${more}` };
    },
  },
  {
    id: 'auth-failures',
    label: 'Rejected requests (401)',
    threshold: '50 or fewer in the last hour',
    run: async () => {
      const { rows } = await query(`/* devdash:check-auth-failures */
        SELECT COUNT(*)::int AS count
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '1 hour'
           AND status_code = 401`);
      return { status: rows[0].count > 50 ? 'warn' : 'pass', value: String(rows[0].count) };
    },
  },
  {
    id: 'traffic-spike',
    label: 'Traffic against the previous hour',
    threshold: 'under triple, once past 100 requests',
    run: async () => {
      const { rows } = await query(`/* devdash:check-traffic-spike */
        SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS recent,
               COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '1 hour')::int AS previous
          FROM api_requests
         WHERE created_at > NOW() - INTERVAL '2 hours'`);
      const { recent, previous } = rows[0];
      const spiking = previous > 0 && recent > 100 && recent > previous * 3;
      return { status: spiking ? 'warn' : 'pass', value: `${recent} this hour, ${previous} the hour before` };
    },
  },
  {
    id: 'stale-sessions',
    label: 'Valid sessions idle over a day',
    threshold: '10 or fewer',
    run: async () => {
      const { rows } = await query(`/* devdash:check-stale-sessions */
        SELECT COUNT(*)::int AS count
          FROM user_sessions
         WHERE expires_at > NOW()
           AND last_activity < NOW() - INTERVAL '24 hours'`);
      return { status: rows[0].count > 10 ? 'warn' : 'pass', value: String(rows[0].count) };
    },
  },
];

/** Every check, every time. One failing query fails that check only. */
export async function getHealthChecks(): Promise<HealthCheck[]> {
  return Promise.all(
    CHECKS.map(async ({ run, ...meta }) => {
      try {
        return { ...meta, ...(await run()) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ...meta, status: 'fail' as const, value: `Check failed: ${message}` };
      }
    })
  );
}

async function diskUsage(): Promise<Overview['system']['disk']> {
  try {
    const stats = await fs.promises.statfs(process.env.UPLOAD_DIR || 'uploads');
    return { usedBytes: (stats.blocks - stats.bfree) * stats.bsize, totalBytes: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

export async function getOverview(): Promise<Overview> {
  const [stats, tables, checks, disk] = await Promise.all([
    query(`/* devdash:db-stats */
      SELECT pg_database_size(current_database())::bigint AS size_bytes,
             (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections,
             current_setting('max_connections')::int AS max_connections`),
    query(`/* devdash:db-tables */
      SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS size_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT 10`),
    getHealthChecks(),
    diskUsage(),
  ]);

  const totalMemory = os.totalmem();

  return {
    version: {
      frontend: FRONTEND_VERSION,
      backend: backendPkg.version,
      node: process.version,
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    system: {
      memory: { usedBytes: totalMemory - os.freemem(), totalBytes: totalMemory },
      cpu: { load1: os.loadavg()[0], cores: os.cpus().length },
      disk,
    },
    database: {
      sizeBytes: Number(stats.rows[0].size_bytes),
      connections: stats.rows[0].connections,
      maxConnections: stats.rows[0].max_connections,
      tables: tables.rows.map((row) => ({ name: row.name, sizeBytes: Number(row.size_bytes) })),
    },
    checks,
  };
}
