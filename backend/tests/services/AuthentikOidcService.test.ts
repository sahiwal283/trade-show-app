import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories', () => ({
  userRepository: {
    findByAuthentikSub: vi.fn(),
    findByEmailCiWithSso: vi.fn(),
    linkAuthentikSub: vi.fn(),
    updateLastSsoLogin: vi.fn(),
    createSsoUser: vi.fn(),
  },
}));

import { userRepository } from '../../src/database/repositories';
import {
  readOidcEnv,
  isOidcConfigured,
  encodeTxnCookie,
  decodeTxnCookie,
  resolveSsoUser,
} from '../../src/services/AuthentikOidcService';

const repo = userRepository as unknown as {
  findByAuthentikSub: ReturnType<typeof vi.fn>;
  findByEmailCiWithSso: ReturnType<typeof vi.fn>;
  linkAuthentikSub: ReturnType<typeof vi.fn>;
  updateLastSsoLogin: ReturnType<typeof vi.fn>;
  createSsoUser: ReturnType<typeof vi.fn>;
};

const CLAIMS = { sub: 'ak-uuid-1', email: 'jane@x.com', preferred_username: 'jane', name: 'Jane Doe' };

describe('env gating', () => {
  beforeEach(() => {
    delete process.env.AUTHENTIK_ISSUER;
    delete process.env.AUTHENTIK_CLIENT_ID;
    delete process.env.AUTHENTIK_CLIENT_SECRET;
    delete process.env.OIDC_REDIRECT_URI;
  });

  it('isOidcConfigured false when any var missing', () => {
    expect(isOidcConfigured()).toBe(false);
    process.env.AUTHENTIK_ISSUER = 'https://auth.example/application/o/trade-show/';
    process.env.AUTHENTIK_CLIENT_ID = 'cid';
    expect(isOidcConfigured()).toBe(false);
  });

  it('isOidcConfigured true when all four set', () => {
    process.env.AUTHENTIK_ISSUER = 'https://auth.example/application/o/trade-show/';
    process.env.AUTHENTIK_CLIENT_ID = 'cid';
    process.env.AUTHENTIK_CLIENT_SECRET = 'sec';
    process.env.OIDC_REDIRECT_URI = 'https://app.example/api/auth/oidc/callback';
    expect(isOidcConfigured()).toBe(true);
    expect(readOidcEnv().redirectUri).toBe('https://app.example/api/auth/oidc/callback');
  });
});

describe('txn cookie codec', () => {
  it('round-trips', () => {
    const txn = { v: 'verifier', s: 'state', n: 'nonce' };
    expect(decodeTxnCookie(encodeTxnCookie(txn))).toEqual(txn);
  });
  it('returns null on garbage or null', () => {
    expect(decodeTxnCookie(null)).toBeNull();
    expect(decodeTxnCookie('not-base64-json')).toBeNull();
    expect(decodeTxnCookie(Buffer.from('{"v":1}').toString('base64url'))).toBeNull();
  });
});

describe('resolveSsoUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sub match → ok, updates last_sso_login', async () => {
    repo.findByAuthentikSub.mockResolvedValue({ id: 'u1', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'admin', authentik_sub: 'ak-uuid-1' });
    const res = await resolveSsoUser(CLAIMS);
    expect(res).toEqual({ status: 'ok', user: { id: 'u1', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'admin' } });
    expect(repo.updateLastSsoLogin).toHaveBeenCalledWith('u1');
  });

  it('sub match but role pending → pending, no token path', async () => {
    repo.findByAuthentikSub.mockResolvedValue({ id: 'u1', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'pending', authentik_sub: 'ak-uuid-1' });
    expect(await resolveSsoUser(CLAIMS)).toEqual({ status: 'pending' });
  });

  it('email match on unlinked account → links and returns ok', async () => {
    repo.findByAuthentikSub.mockResolvedValue(null);
    repo.findByEmailCiWithSso.mockResolvedValue({ id: 'u2', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'coordinator', authentik_sub: null });
    const res = await resolveSsoUser(CLAIMS);
    expect(repo.linkAuthentikSub).toHaveBeenCalledWith('u2', 'ak-uuid-1');
    expect(res.status).toBe('ok');
  });

  it('email match on account linked to a DIFFERENT sub → identity_conflict', async () => {
    repo.findByAuthentikSub.mockResolvedValue(null);
    repo.findByEmailCiWithSso.mockResolvedValue({ id: 'u2', username: 'jane', name: 'Jane', email: 'jane@x.com', role: 'coordinator', authentik_sub: 'other-sub' });
    expect(await resolveSsoUser(CLAIMS)).toEqual({ status: 'identity_conflict' });
    expect(repo.linkAuthentikSub).not.toHaveBeenCalled();
  });

  it('no match → provisions pending user with claims-derived username', async () => {
    repo.findByAuthentikSub.mockResolvedValue(null);
    repo.findByEmailCiWithSso.mockResolvedValue(null);
    repo.createSsoUser.mockResolvedValue({ id: 'u3', username: 'jane', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' });
    expect(await resolveSsoUser(CLAIMS)).toEqual({ status: 'pending' });
    const arg = repo.createSsoUser.mock.calls[0][0];
    expect(arg.username).toBe('jane');
    expect(arg.email).toBe('jane@x.com');
    expect(arg.authentikSub).toBe('ak-uuid-1');
    expect(arg.password).toMatch(/^\$2[aby]\$/); // bcrypt hash, not a raw secret
  });

  it('username collision (23505) retries with numeric suffix', async () => {
    repo.findByAuthentikSub.mockResolvedValue(null);
    repo.findByEmailCiWithSso.mockResolvedValue(null);
    repo.createSsoUser
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'users_username_key' }))
      .mockResolvedValueOnce({ id: 'u4', username: 'jane2', name: 'Jane Doe', email: 'jane@x.com', role: 'pending' });
    expect(await resolveSsoUser(CLAIMS)).toEqual({ status: 'pending' });
    expect(repo.createSsoUser.mock.calls[1][0].username).toBe('jane2');
  });

  it('no email claim → missing_email (cannot link or provision)', async () => {
    repo.findByAuthentikSub.mockResolvedValue(null);
    expect(await resolveSsoUser({ sub: 'ak-uuid-9' })).toEqual({ status: 'missing_email' });
  });
});
