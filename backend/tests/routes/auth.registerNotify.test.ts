import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import router from '../../src/routes/auth';
import { query } from '../../src/config/database';
import { adminNotifications } from '../../src/services/notifications';
import { routeHandler } from '../helpers/routeHandler';

const register = routeHandler(router, 'post', '/register');
const mockRes = () => ({ json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() }) as any;
const req = (body: Record<string, unknown>) => ({ body, headers: {}, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' });
const valid = { username: 'jane', password: 'Str0ng!Pass', name: 'Jane Doe', email: 'jane@x.com' };

describe('POST /register -> admin notification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells admins once the pending user is stored', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] } as any)   // duplicate check
      .mockResolvedValueOnce({ rows: [{ id: 'u-9', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' }] } as any);
    const res = mockRes();
    await register(req(valid), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(adminNotifications.userPending).toHaveBeenCalledWith({ name: 'Jane Doe', email: 'jane@x.com', via: 'registration' });
  });

  it('says nothing when registration is rejected', async () => {
    const res = mockRes();
    await register(req({ ...valid, password: 'weak' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(adminNotifications.userPending).not.toHaveBeenCalled();
  });

  it('a rejecting notifier never fails the registration', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'u-9', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' }] } as any);
    vi.mocked(adminNotifications.userPending).mockRejectedValueOnce(new Error('boom'));
    const res = mockRes();
    await register(req(valid), res);
    await new Promise((r) => setImmediate(r));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
