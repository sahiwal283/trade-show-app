import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getAuditLogs, parseAuditQuery } from '../../../src/services/devDashboard/auditLog';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/auditLogs.json'), 'utf8')
);

const ROW = {
  id: 'a1', created_at: new Date('2026-10-08T15:40:00.000Z'), user_name: 'sahil', user_role: 'developer',
  action: 'PUT /api/events/:id', request_method: 'PUT', request_path: '/api/events/abc',
  status: 'success', ip_address: '203.0.113.9', error_message: null,
};

describe('parseAuditQuery', () => {
  it('defaults to the last 24 hours, 50 rows, from the start', () => {
    expect(parseAuditQuery({})).toEqual({ timeRange: '24h', limit: 50, offset: 0 });
  });

  it('keeps recognised filters and trims text', () => {
    expect(parseAuditQuery({
      user: '  sahil ', method: 'delete', status: 'failure', search: ' events ', timeRange: '7d', limit: '25', offset: '50',
    })).toEqual({ user: 'sahil', method: 'DELETE', status: 'failure', search: 'events', timeRange: '7d', limit: 25, offset: 50 });
  });

  it('accepts "auth" as the method for login events', () => {
    expect(parseAuditQuery({ method: 'auth' }).method).toBe('auth');
  });

  it.each([
    ['an unknown method', { method: 'GET' }, 'method'],
    ['an unknown status', { status: 'pending' }, 'status'],
    ['blank search', { search: '   ' }, 'search'],
    ['a non-string user', { user: ['a', 'b'] }, 'user'],
  ])('drops %s', (_name, raw, key) => {
    expect(parseAuditQuery(raw)).not.toHaveProperty(key);
  });

  it.each([
    [{ limit: '1000' }, 200, 0],
    [{ limit: '0' }, 50, 0],
    [{ limit: 'abc' }, 50, 0],
    [{ limit: '-5' }, 50, 0],
    [{ offset: '-10' }, 50, 0],
    [{ offset: 'abc' }, 50, 0],
    [{ limit: '10.9', offset: '20.2' }, 10, 20],
  ])('clamps %j to limit %i offset %i', (raw, limit, offset) => {
    expect(parseAuditQuery(raw)).toMatchObject({ limit, offset });
  });
});

describe('getAuditLogs', () => {
  beforeEach(() => {
    query.mockReset();
    routeQueries(query, [['audit-count', [{ total: 37 }]], ['audit-rows', [ROW]]]);
  });

  const sqlFor = (tag: string) => query.mock.calls.find(([sql]) => sql.includes(`devdash:${tag}`))!;

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getAuditLogs(parseAuditQuery({})))).toEqual(keyShape(fixture));
  });

  it('returns the total across all pages, not the page length', async () => {
    expect((await getAuditLogs(parseAuditQuery({ limit: '1' }))).total).toBe(37);
  });

  it('applies every filter in SQL, to the count and the page alike', async () => {
    await getAuditLogs(parseAuditQuery({ user: 'sahil', method: 'PUT', status: 'success', search: 'events', timeRange: '7d' }));
    const [countSql, countParams] = sqlFor('audit-count');
    const [rowsSql, rowsParams] = sqlFor('audit-rows');
    expect(countParams).toEqual(['7 days', '%sahil%', 'PUT', 'success', '%events%']);
    expect(rowsParams).toEqual([...countParams, 50, 0]);
    for (const sql of [countSql, rowsSql]) {
      expect(sql).toContain('user_name ILIKE $2');
      expect(sql).toContain('request_method = $3');
      expect(sql).toContain('status = $4');
      expect(sql).toContain('ILIKE $5');
    }
  });

  it('finds login events by their missing method', async () => {
    await getAuditLogs(parseAuditQuery({ method: 'auth' }));
    const [sql, params] = sqlFor('audit-count');
    expect(sql).toContain('request_method IS NULL');
    expect(params).toEqual(['24 hours']);
  });

  it('matches % and _ in a search literally', async () => {
    await getAuditLogs(parseAuditQuery({ search: '50%_off' }));
    expect(sqlFor('audit-count')[1]).toEqual(['24 hours', '%50\\%\\_off%']);
  });

  it('never puts filter text into the SQL itself', async () => {
    await getAuditLogs(parseAuditQuery({ user: "x'; DROP TABLE users;--", search: 'needle' }));
    for (const [sql] of query.mock.calls) {
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain('needle');
    }
  });

  it('lets a query failure reach the caller instead of returning an empty list', async () => {
    routeQueries(query, [['audit-count', new Error('permission denied for table audit_logs')], ['audit-rows', []]]);
    await expect(getAuditLogs(parseAuditQuery({}))).rejects.toThrow('permission denied');
  });
});
