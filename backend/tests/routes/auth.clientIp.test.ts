import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn() } }));
vi.mock('../../src/middleware/sessionTracker', () => ({ createSession: vi.fn(), deleteSession: vi.fn() }));
vi.mock('../../src/middleware/auth', () => ({
  getToken: vi.fn(), tryVerifyPlatformJwt: vi.fn(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../src/utils/auditLogger', () => ({ logAuth: vi.fn(async () => undefined) }));
vi.mock('../../src/database/repositories', () => ({ userRepository: {} }));
vi.mock('../../src/services/notifications', () => ({
  adminNotifications: { userPending: vi.fn(async () => undefined) },
  logNotifyError: () => () => undefined,
}));

import bcrypt from 'bcrypt';
import router from '../../src/routes/auth';
import { query } from '../../src/config/database';
import { logAuth } from '../../src/utils/auditLogger';
import { routeHandler } from '../helpers/routeHandler';

const CLIENT = '203.0.113.9';
const PROXY = '10.0.0.1';

/** A request as it arrives through the reverse proxy: the socket is the proxy, the header is the person. */
const proxied = (extra: Record<string, unknown>) => ({
  headers: { 'x-real-ip': CLIENT },
  ip: PROXY,
  socket: { remoteAddress: PROXY },
  get: () => undefined,
  method: 'POST',
  url: '/',
  ...extra,
});
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const USER = { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin', password: 'hash', is_active: true };
const loggedIp = () => vi.mocked(logAuth).mock.calls.map((call) => call[2]);

describe('sign-in audit rows record the client address, not the proxy', () => {
  const login = routeHandler(router, 'post', '/login');
  const credentials = { body: { username: 'jane', password: 'pw' } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('on a login for a user that does not exist', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await login(proxied(credentials), mockRes());
    expect(vi.mocked(logAuth).mock.calls[0]).toEqual(['login_failed', { username: 'jane' }, CLIENT, 'User not found']);
  });

  it('on a wrong password', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [USER] } as any);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    await login(proxied(credentials), mockRes());
    expect(vi.mocked(logAuth).mock.calls[0]).toEqual(['login_failed', { username: 'jane' }, CLIENT, 'Invalid password']);
  });

  it('on a deactivated account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ ...USER, is_active: false }] } as any);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    await login(proxied(credentials), mockRes());
    expect(vi.mocked(logAuth).mock.calls[0]).toEqual(['login_failed', { username: 'jane' }, CLIENT, 'Account deactivated']);
  });

  it('on a successful login', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [USER] } as any);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const res = mockRes();
    await login(proxied(credentials), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }));
    expect(vi.mocked(logAuth).mock.calls[0][0]).toBe('login_success');
    expect(loggedIp()).toEqual([CLIENT]);
  });

  it('on registration', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'u-9', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' }] } as any);
    const res = mockRes();
    await routeHandler(router, 'post', '/register')(
      proxied({ body: { username: 'jane', password: 'Str0ng!Pass', name: 'Jane Doe', email: 'jane@x.com' } }), res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(loggedIp()).toEqual([CLIENT]);
  });

  it('on logout', async () => {
    await routeHandler(router, 'post', '/logout')(
      proxied({ user: { id: 'u1', username: 'jane', role: 'admin' } }), mockRes()
    );
    expect(vi.mocked(logAuth).mock.calls[0][0]).toBe('logout');
    expect(loggedIp()).toEqual([CLIENT]);
  });
});
