/**
 * Developer dashboard — Audit Log tab.
 * Reads audit_logs with every filter applied in SQL. There is no fallback:
 * if the table cannot be read the error reaches the caller, because an
 * empty list would hide exactly the failure this tab exists to show.
 */
import { query } from '../../config/database';
import { TimeRange, parseTimeRange, intervalFor } from './timeRange';

const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const STATUSES = ['success', 'warning', 'failure'] as const;

export interface AuditQuery {
  user?: string;
  /** 'auth' selects login/logout events, which carry no HTTP method. */
  method?: (typeof METHODS)[number] | 'auth';
  status?: (typeof STATUSES)[number];
  search?: string;
  timeRange: TimeRange;
  limit: number;
  offset: number;
}

export interface AuditLogPage {
  logs: Array<{
    id: string; createdAt: string; userName: string | null; userRole: string | null; action: string;
    method: string | null; path: string | null; status: string; ipAddress: string | null; errorMessage: string | null;
  }>;
  total: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const text = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
};

const wholeNumber = (raw: unknown): number | undefined => {
  const parsed = typeof raw === 'string' || typeof raw === 'number' ? Math.floor(Number(raw)) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function parseAuditQuery(raw: Record<string, unknown>): AuditQuery {
  const parsed: AuditQuery = { timeRange: parseTimeRange(raw.timeRange), limit: DEFAULT_LIMIT, offset: 0 };

  const user = text(raw.user);
  if (user) parsed.user = user;

  const search = text(raw.search);
  if (search) parsed.search = search;

  const method = text(raw.method);
  if (method?.toLowerCase() === 'auth') parsed.method = 'auth';
  else if (method && (METHODS as readonly string[]).includes(method.toUpperCase())) {
    parsed.method = method.toUpperCase() as AuditQuery['method'];
  }

  const status = text(raw.status);
  if (status && (STATUSES as readonly string[]).includes(status)) parsed.status = status as AuditQuery['status'];

  const limit = wholeNumber(raw.limit);
  if (limit !== undefined && limit >= 1) parsed.limit = Math.min(limit, MAX_LIMIT);

  const offset = wholeNumber(raw.offset);
  if (offset !== undefined && offset >= 0) parsed.offset = offset;

  return parsed;
}

/** % and _ are wildcards in ILIKE; someone searching for them means the characters. */
const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

export async function getAuditLogs(q: AuditQuery): Promise<AuditLogPage> {
  const params: unknown[] = [intervalFor(q.timeRange)];
  const where = ['created_at > NOW() - $1::interval'];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (q.user) where.push(`user_name ILIKE ${add(likePattern(q.user))}`);
  if (q.method === 'auth') where.push('request_method IS NULL');
  else if (q.method) where.push(`request_method = ${add(q.method)}`);
  if (q.status) where.push(`status = ${add(q.status)}`);
  if (q.search) {
    const p = add(likePattern(q.search));
    where.push(`(action ILIKE ${p} OR request_path ILIKE ${p} OR user_name ILIKE ${p} OR error_message ILIKE ${p})`);
  }

  const whereSql = where.join(' AND ');

  const count = await query(`/* devdash:audit-count */
    SELECT COUNT(*)::int AS total FROM audit_logs WHERE ${whereSql}`, params);

  const page = await query(`/* devdash:audit-rows */
    SELECT id, created_at, user_name, user_role, action, request_method, request_path,
           status, host(ip_address::inet) AS ip_address, error_message
      FROM audit_logs
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.limit, q.offset]);

  return {
    logs: page.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      userName: row.user_name ?? null,
      userRole: row.user_role ?? null,
      action: row.action,
      method: row.request_method ?? null,
      path: row.request_path ?? null,
      status: row.status,
      ipAddress: row.ip_address ?? null,
      errorMessage: row.error_message ?? null,
    })),
    total: count.rows[0].total,
  };
}
