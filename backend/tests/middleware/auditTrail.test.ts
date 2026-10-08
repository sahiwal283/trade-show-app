import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const logAudit = vi.fn();
vi.mock('../../src/utils/auditLogger', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { auditTrail, shouldAudit, auditStatus, clientIp } from '../../src/middleware/auditTrail';

const run = (overrides: Record<string, unknown> = {}, statusCode = 200, body?: unknown) => {
  const req: any = {
    method: 'PUT',
    originalUrl: '/api/events/0b5f1c7e-1111-2222-3333-444455556666?x=1',
    headers: { 'user-agent': 'vitest' },
    ip: '192.168.1.20',
    socket: {},
    user: { id: 'u1', username: 'sahil', role: 'developer' },
    body: { password: 'secret' },
    ...overrides,
  };
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  res.json = vi.fn((b: unknown) => b);
  const next = vi.fn();
  auditTrail(req, res, next);
  if (body !== undefined) res.json(body);
  res.emit('finish');
  return { next };
};

describe('shouldAudit', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('audits %s under /api', (method) => {
    expect(shouldAudit(method, '/api/events')).toBe(true);
  });

  it.each([
    ['GET', '/api/events'],
    ['POST', '/health'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/refresh'],
    ['POST', '/api/page-views'],
    ['POST', '/api/page-views/'],
    ['POST', '/api/push/subscribe'],
    ['POST', '/api/midas/events-ping'],
  ])('skips %s %s', (method, path) => {
    expect(shouldAudit(method, path)).toBe(false);
  });
});

describe('auditStatus', () => {
  it.each([[200, 'success'], [204, 'success'], [400, 'warning'], [404, 'warning'], [500, 'failure'], [503, 'failure']])(
    'maps %i to %s',
    (code, expected) => expect(auditStatus(code)).toBe(expected)
  );
});

describe('clientIp', () => {
  it('prefers the first forwarded address', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, ip: '10.0.0.1', socket: {} } as any))
      .toBe('203.0.113.9');
  });

  it.each(['unknown', 'proxy.internal', ''])('returns undefined for %j', (value) => {
    expect(clientIp({ headers: {}, ip: value, socket: {} } as any)).toBeUndefined();
  });
});

describe('auditTrail', () => {
  beforeEach(() => { logAudit.mockReset(); logAudit.mockResolvedValue(undefined); });

  it('writes one row after the response finishes, with the real path and no body', () => {
    const { next } = run();
    expect(next).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledTimes(1);
    const entry = logAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      userId: 'u1',
      userName: 'sahil',
      userRole: 'developer',
      action: 'PUT /api/events/:id',
      status: 'success',
      ipAddress: '192.168.1.20',
      userAgent: 'vitest',
      requestMethod: 'PUT',
      requestPath: '/api/events/0b5f1c7e-1111-2222-3333-444455556666',
    });
    expect(entry.changes).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('writes nothing for a read', () => {
    run({ method: 'GET' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('records the error message of a failed write', () => {
    run({}, 500, { error: 'Database exploded' });
    expect(logAudit.mock.calls[0][0]).toMatchObject({ status: 'failure', errorMessage: 'Database exploded' });
  });

  it('writes the row with no user when the request was never authenticated', () => {
    run({ user: undefined }, 401, { error: 'Access token required' });
    expect(logAudit.mock.calls[0][0]).toMatchObject({ userId: undefined, status: 'warning' });
  });

  it('writes the row with no IP when the address is not a valid IP', () => {
    run({ ip: 'unknown' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0].ipAddress).toBeUndefined();
  });

  it('truncates an action longer than the column allows', () => {
    run({ originalUrl: `/api/${'segment/'.repeat(30)}end` });
    const entry = logAudit.mock.calls[0][0];
    expect(entry.action.length).toBeLessThanOrEqual(100);
    expect(entry.requestPath.length).toBeLessThanOrEqual(500);
  });

  it('never throws when the audit write rejects', () => {
    logAudit.mockRejectedValue(new Error('db down'));
    expect(() => run()).not.toThrow();
  });
});
