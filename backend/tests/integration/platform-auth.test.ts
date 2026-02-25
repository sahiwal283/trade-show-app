/**
 * Platform SSO and hybrid auth middleware tests.
 * Covers: platform JWT validation, slug check, local user resolution, local JWT fallback, exempt routes.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

const mockFindByUsernameSafe = vi.fn();
vi.mock('../../src/database/repositories', () => ({
  userRepository: {
    findByUsernameSafe: (...args: unknown[]) => mockFindByUsernameSafe(...args),
  },
}));

let getToken: (req: Request) => string | null;
let getCookieValue: (req: Request, name: string) => string | null;
let tryVerifyPlatformJwt: (token: string) => ReturnType<typeof import('../../src/middleware/auth').tryVerifyPlatformJwt>;
let authenticateToken: typeof import('../../src/middleware/auth').authenticateToken;
type AuthRequest = import('../../src/middleware/auth').AuthRequest;

beforeAll(async () => {
  process.env.PLATFORM_JWT_SECRET = 'test-platform-secret';
  process.env.APP_SLUG = 'trade-show';
  process.env.JWT_SECRET = 'test-local-secret';
  const auth = await import('../../src/middleware/auth');
  getToken = auth.getToken;
  getCookieValue = auth.getCookieValue;
  tryVerifyPlatformJwt = auth.tryVerifyPlatformJwt;
  authenticateToken = auth.authenticateToken;
});

function mockRequest(overrides: Partial<Request> = {}): AuthRequest {
  return {
    headers: {},
    path: '/api/users',
    method: 'GET',
    get: (name: string) => (overrides.headers as Record<string, string>)?.[name.toLowerCase()] ?? null,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as AuthRequest;
}

function mockResponse() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return vi.fn();
}

function flushAsync() {
  return new Promise<void>((r) => setImmediate(r));
}

describe('Platform auth helpers', () => {
  describe('getCookieValue', () => {
    it('returns cookie value by name', () => {
      const req = mockRequest({ headers: { cookie: 'token=abc123; other=xyz' } });
      expect(getCookieValue(req, 'token')).toBe('abc123');
    });
    it('returns null when cookie missing', () => {
      const req = mockRequest();
      expect(getCookieValue(req, 'token')).toBeNull();
    });
  });

  describe('getToken', () => {
    it('prefers Authorization Bearer over cookie', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer bearer-token', cookie: 'token=cookie-token' },
      });
      expect(getToken(req)).toBe('bearer-token');
    });
    it('falls back to cookie when no Bearer', () => {
      const req = mockRequest({ headers: { cookie: 'token=cookie-token' } });
      expect(getToken(req)).toBe('cookie-token');
    });
    it('returns null when no token', () => {
      expect(getToken(mockRequest())).toBeNull();
    });
  });

  describe('tryVerifyPlatformJwt', () => {
    it('returns decoded payload for valid platform JWT', () => {
      const payload = {
        user_id: 'u1',
        username: 'alice',
        global_role: 'user',
        assigned_apps: ['trade-show'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = jwt.sign(payload, 'test-platform-secret', { algorithm: 'HS256' });
      const decoded = tryVerifyPlatformJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.username).toBe('alice');
      expect(decoded?.assigned_apps).toContain('trade-show');
    });
    it('returns null for invalid signature', () => {
      const payload = {
        user_id: 'u1',
        username: 'alice',
        global_role: 'user',
        assigned_apps: ['trade-show'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = jwt.sign(payload, 'wrong-secret', { algorithm: 'HS256' });
      expect(tryVerifyPlatformJwt(token)).toBeNull();
    });
    it('returns null for expired token', () => {
      const payload = {
        user_id: 'u1',
        username: 'alice',
        global_role: 'user',
        assigned_apps: ['trade-show'],
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };
      const token = jwt.sign(payload, 'test-platform-secret', { algorithm: 'HS256' });
      expect(tryVerifyPlatformJwt(token)).toBeNull();
    });
  });
});

describe('authenticateToken middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no token', async () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'unauthenticated', error: 'Access token required' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when platform token valid but slug not in assigned_apps', async () => {
    const payload = {
      user_id: 'u1',
      username: 'alice',
      global_role: 'user',
      assigned_apps: ['other-app'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = jwt.sign(payload, 'test-platform-secret', { algorithm: 'HS256' });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ detail: 'not_assigned_to_app' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when platform user has no local account', async () => {
    const payload = {
      user_id: 'u1',
      username: 'nobody',
      global_role: 'user',
      assigned_apps: ['trade-show'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = jwt.sign(payload, 'test-platform-secret', { algorithm: 'HS256' });
    mockFindByUsernameSafe.mockResolvedValue(null);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(mockFindByUsernameSafe).toHaveBeenCalledWith('nobody');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'no_local_user' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.user when platform token valid and local user exists', async () => {
    const payload = {
      user_id: 'u1',
      username: 'alice',
      global_role: 'user',
      assigned_apps: ['trade-show'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = jwt.sign(payload, 'test-platform-secret', { algorithm: 'HS256' });
    const localUser = {
      id: 'local-id',
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'coordinator',
      created_at: '',
      updated_at: '',
    };
    mockFindByUsernameSafe.mockResolvedValue(localUser);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(mockFindByUsernameSafe).toHaveBeenCalledWith('alice');
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'local-id', username: 'alice', role: 'coordinator' });
    expect(req.authSource).toBe('platform');
  });

  it('accepts valid local JWT and sets req.user', async () => {
    const token = jwt.sign(
      { id: 'local-1', username: 'bob', role: 'admin' },
      'test-local-secret',
      { expiresIn: '1h' }
    );
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'local-1', username: 'bob', role: 'admin' });
    expect(req.authSource).toBe('local');
  });

  it('returns 401 for invalid local JWT when no platform token', async () => {
    const req = mockRequest({ headers: { authorization: 'Bearer invalid-token' } });
    const res = mockResponse();
    const next = mockNext();
    authenticateToken(req, res, next);
    await flushAsync();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'unauthenticated' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
