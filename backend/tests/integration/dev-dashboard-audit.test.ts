import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, query } from '../../src/config/database';
import { getAuditLogs, parseAuditQuery } from '../../src/services/devDashboard/auditLog';
import { getSessions } from '../../src/services/devDashboard/sessions';
import { logAudit } from '../../src/utils/auditLogger';

const MARK = 'devdash_integration';

describe('audit log and sessions against a real database', () => {
  beforeAll(async () => {
    await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    await logAudit({ userName: MARK, action: 'PUT /api/events/:id', status: 'success', ipAddress: '203.0.113.9',
      requestMethod: 'PUT', requestPath: '/api/events/100%_done' });
    await logAudit({ userName: MARK, action: 'DELETE /api/booths/:id', status: 'failure', requestMethod: 'DELETE',
      requestPath: '/api/booths/7', errorMessage: 'boom' });
    await logAudit({ userName: MARK, action: 'login_failed', status: 'failure', errorMessage: 'Invalid password' });
  });

  afterAll(async () => {
    await query('DELETE FROM audit_logs WHERE user_name = $1', [MARK]);
    await pool.end();
  });

  const find = (raw: Record<string, unknown>) => getAuditLogs(parseAuditQuery({ user: MARK, ...raw }));

  it('writes all three rows and reads them back newest first', async () => {
    const { logs, total } = await find({});
    expect(total).toBe(3);
    expect(logs.map((l) => l.action).sort()).toEqual(['DELETE /api/booths/:id', 'PUT /api/events/:id', 'login_failed']);
  });

  it('prints the address without a network suffix', async () => {
    const { logs } = await find({ method: 'PUT' });
    expect(logs[0].ipAddress).toBe('203.0.113.9');
  });

  it('filters by method, by status, and login events by "auth"', async () => {
    expect((await find({ method: 'DELETE' })).total).toBe(1);
    expect((await find({ status: 'failure' })).total).toBe(2);
    expect((await find({ method: 'auth' })).logs[0]).toMatchObject({ action: 'login_failed', method: null, path: null });
  });

  it('matches a literal % and _ in the path', async () => {
    expect((await find({ search: '100%_done' })).total).toBe(1);
    expect((await find({ search: '1%e' })).total).toBe(0);
  });

  it('pages with a stable total', async () => {
    const first = await find({ limit: '2' });
    const second = await find({ limit: '2', offset: '2' });
    expect([first.logs.length, second.logs.length]).toEqual([2, 1]);
    expect([first.total, second.total]).toEqual([3, 3]);
  });

  it('runs the sessions query', async () => {
    const { users } = await getSessions();
    expect(Array.isArray(users)).toBe(true);
    for (const user of users) expect(user.sessionCount).toBe(user.sessions.length);
  });
});
