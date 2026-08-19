# Authentik SSO Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Authentik OIDC login to the trade show app alongside the existing password login, with auto-provisioning, email auto-linking, and a scripted account-merge path.

**Architecture:** Backend-driven Authorization Code + PKCE using `openid-client` v6. `GET /api/auth/oidc/login` redirects to Authentik; `GET /api/auth/oidc/callback` validates the ID token, resolves/links/creates the local user, and mints the app's **existing** 12h HS256 JWT, so all downstream auth (middleware, sessions, refresh, offline sync) is unchanged. Authentik-side provider/application creation, env wiring, and E2E verification are fully scripted.

**Tech Stack:** Express 4 + TypeScript, `openid-client` ^6, `jsonwebtoken`, `bcrypt`, raw `pg`, Vitest (backend only — the frontend has **no test runner**; frontend tasks verify via `npm run lint` + build + the scripted E2E, a deliberate deviation from the spec's "extend frontend tests" line). React 18 + Vite frontend.

**Spec:** `docs/superpowers/specs/2026-08-19-authentik-sso-design.md`

## Global Constraints

- Version bump to **2.16.0** in BOTH `package.json` and `backend/package.json` before deploying (Task 8).
- **No secrets in the repo** — client secret / API tokens are written only to `.env` files on the containers.
- Raw parameterized SQL only; never modify an existing migration; new migration is `036_add_authentik_sso.sql`.
- New backend dependency allowed: `openid-client` only. Requires Node ≥ 20 on the target containers (verify in Task 10 before relying on it).
- OIDC issuer: `https://auth.booute.duckdns.org/application/o/trade-show/`. Provider `sub_mode = user_uuid`.
- Redirect URIs: prod `https://expapp.duckdns.org/api/auth/oidc/callback`, sandbox `http://192.168.1.144/api/auth/oidc/callback`.
- SSO mints the app's existing JWT payload `{ id, username, role }`, 12h expiry, `createSession(..., 43200)` — byte-for-byte the same contract as password login.
- All infra work runs over SSH as `root@192.168.1.190` (Proxmox); Authentik is LXC 111, sandbox app LXC 2600, prod backend LXC 2220, prod frontend LXC 2120, prod DB LXC 2320, NPMplus LXC 104.
- Error codes surfaced to the frontend via URL hash: `sso_error=pending | not_configured | idp_unreachable | retry | identity_conflict | missing_email`.

---

### Task 1: Migration 036 + UserRepository SSO methods

**Files:**
- Create: `backend/src/database/migrations/036_add_authentik_sso.sql`
- Modify: `backend/src/database/repositories/UserRepository.ts` (append methods before the closing brace of the class, ~line 203)
- Test: `backend/tests/repositories/UserRepository.sso.test.ts`

**Interfaces:**
- Consumes: existing `BaseRepository.executeQuery`, `UserWithoutPassword` interface.
- Produces (used by Task 2):
  - `findByAuthentikSub(sub: string): Promise<(UserWithoutPassword & { authentik_sub: string }) | null>`
  - `findByEmailCiWithSso(email: string): Promise<(UserWithoutPassword & { authentik_sub: string | null }) | null>`
  - `linkAuthentikSub(id: string, sub: string): Promise<void>`
  - `updateLastSsoLogin(id: string): Promise<void>`
  - `createSsoUser(data: { username: string; name: string; email: string; password: string; authentikSub: string }): Promise<UserWithoutPassword>` — always inserts with role `'pending'` and sets `authentik_sub` + `sso_linked_at`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Authentik SSO identity columns on users
-- Description: authentik_sub stores the OIDC subject (Authentik user UUID,
--   provider sub_mode=user_uuid). sso_linked_at records when the identity was
--   linked (merge script, email auto-link, or auto-provision). last_sso_login
--   is bookkeeping for admins. All columns nullable — password login is
--   unaffected. Unique partial index: one app account per Authentik identity.
-- Version: 2.16.0
-- Date: August 19, 2026

ALTER TABLE users ADD COLUMN IF NOT EXISTS authentik_sub VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_linked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sso_login TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_authentik_sub
  ON users (authentik_sub)
  WHERE authentik_sub IS NOT NULL;

COMMENT ON COLUMN users.authentik_sub IS
  'OIDC subject from Authentik (user UUID under sub_mode=user_uuid); null = never linked';
COMMENT ON COLUMN users.sso_linked_at IS
  'When the Authentik identity was linked (merge script, email auto-link, or auto-provision)';
```

- [ ] **Step 2: Write the failing repository test**

`backend/tests/repositories/UserRepository.sso.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from '../../src/database/repositories/UserRepository';

describe('UserRepository SSO methods', () => {
  let repo: UserRepository;
  let executeQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new UserRepository();
    executeQuery = vi.fn();
    (repo as any).executeQuery = executeQuery;
  });

  it('findByAuthentikSub queries by authentik_sub and returns the row', async () => {
    const row = { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin', authentik_sub: 'sub-1', created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [row] });
    const result = await repo.findByAuthentikSub('sub-1');
    expect(result).toEqual(row);
    expect(executeQuery.mock.calls[0][0]).toContain('authentik_sub = $1');
    expect(executeQuery.mock.calls[0][1]).toEqual(['sub-1']);
  });

  it('findByAuthentikSub returns null when no row', async () => {
    executeQuery.mockResolvedValue({ rows: [] });
    expect(await repo.findByAuthentikSub('nope')).toBeNull();
  });

  it('findByEmailCiWithSso matches email case-insensitively and includes authentik_sub', async () => {
    const row = { id: 'u2', username: 'bob', name: 'Bob', email: 'Bob@X.com', role: 'salesperson', authentik_sub: null, created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [row] });
    const result = await repo.findByEmailCiWithSso('bob@x.COM');
    expect(result).toEqual(row);
    expect(executeQuery.mock.calls[0][0]).toContain('LOWER(TRIM(email)) = LOWER($1)');
    expect(executeQuery.mock.calls[0][1]).toEqual(['bob@x.COM']);
  });

  it('linkAuthentikSub sets authentik_sub and sso_linked_at', async () => {
    executeQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await repo.linkAuthentikSub('u2', 'sub-2');
    const sql = executeQuery.mock.calls[0][0];
    expect(sql).toContain('authentik_sub = $1');
    expect(sql).toContain('sso_linked_at = CURRENT_TIMESTAMP');
    expect(executeQuery.mock.calls[0][1]).toEqual(['sub-2', 'u2']);
  });

  it('updateLastSsoLogin touches last_sso_login', async () => {
    executeQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    await repo.updateLastSsoLogin('u1');
    expect(executeQuery.mock.calls[0][0]).toContain('last_sso_login = CURRENT_TIMESTAMP');
    expect(executeQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('createSsoUser inserts with pending role and sso columns', async () => {
    const returned = { id: 'u3', username: 'new', name: 'New', email: 'n@x.com', role: 'pending', created_at: '', updated_at: '' };
    executeQuery.mockResolvedValue({ rows: [returned] });
    const result = await repo.createSsoUser({
      username: 'new', name: 'New', email: 'n@x.com', password: 'hash', authentikSub: 'sub-3',
    });
    expect(result).toEqual(returned);
    const sql = executeQuery.mock.calls[0][0];
    expect(sql).toContain("'pending'");
    expect(sql).toContain('authentik_sub');
    expect(sql).toContain('sso_linked_at');
    expect(executeQuery.mock.calls[0][1]).toEqual(['new', 'New', 'n@x.com', 'hash', 'sub-3']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/repositories/UserRepository.sso.test.ts`
Expected: FAIL — `repo.findByAuthentikSub is not a function` (and siblings).

- [ ] **Step 4: Implement the repository methods**

Append inside the `UserRepository` class (before its closing `}`):

```typescript
  /**
   * Find user by Authentik OIDC subject (user UUID).
   */
  async findByAuthentikSub(sub: string): Promise<(UserWithoutPassword & { authentik_sub: string }) | null> {
    const result = await this.executeQuery<UserWithoutPassword & { authentik_sub: string }>(
      `SELECT id, username, name, email, role, authentik_sub, created_at, updated_at
       FROM ${this.tableName}
       WHERE authentik_sub = $1
       LIMIT 1`,
      [sub]
    );
    return result.rows[0] || null;
  }

  /**
   * Find user by email, case-insensitive, including SSO link state.
   */
  async findByEmailCiWithSso(email: string): Promise<(UserWithoutPassword & { authentik_sub: string | null }) | null> {
    const result = await this.executeQuery<UserWithoutPassword & { authentik_sub: string | null }>(
      `SELECT id, username, name, email, role, authentik_sub, created_at, updated_at
       FROM ${this.tableName}
       WHERE LOWER(TRIM(email)) = LOWER($1)
       LIMIT 1`,
      [typeof email === 'string' ? email.trim() : '']
    );
    return result.rows[0] || null;
  }

  /**
   * Link an Authentik identity to an existing account.
   */
  async linkAuthentikSub(id: string, sub: string): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET authentik_sub = $1, sso_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [sub, id]
    );
  }

  /**
   * Bookkeeping: record an SSO login.
   */
  async updateLastSsoLogin(id: string): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName}
       SET last_sso_login = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Auto-provision a user from an Authentik login. Always role 'pending';
   * password is a random unusable bcrypt hash (schema requires NOT NULL).
   */
  async createSsoUser(data: {
    username: string;
    name: string;
    email: string;
    password: string;
    authentikSub: string;
  }): Promise<UserWithoutPassword> {
    const result = await this.executeQuery<User>(
      `INSERT INTO ${this.tableName}
         (username, name, email, password, role, authentik_sub, sso_linked_at, registration_date)
       VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username, name, email, role, created_at, updated_at`,
      [data.username, data.name, data.email, data.password, data.authentikSub]
    );
    return result.rows[0];
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/repositories/UserRepository.sso.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/migrations/036_add_authentik_sso.sql backend/src/database/repositories/UserRepository.ts backend/tests/repositories/UserRepository.sso.test.ts
git commit -m "feat(sso): migration 036 + UserRepository Authentik identity methods"
```

---

### Task 2: AuthentikOidcService — env gating, txn cookie, user resolution

**Files:**
- Create: `backend/src/services/AuthentikOidcService.ts`
- Test: `backend/tests/services/AuthentikOidcService.test.ts`
- Modify: `backend/package.json` (add dependency)

**Interfaces:**
- Consumes: Task 1's repository methods via the `userRepository` singleton; `bcrypt`; `openid-client`.
- Produces (used by Tasks 3, 10):
  - `readOidcEnv(): { issuer?: string; clientId?: string; clientSecret?: string; redirectUri?: string; frontendUrl: string }` — reads `process.env` **at call time** (test-friendly).
  - `isOidcConfigured(): boolean` — true only when issuer, clientId, clientSecret, and redirectUri are all set.
  - `getOidcConfig(): Promise<oidc.Configuration>` — discovery, cached in a module-level variable; throws if unconfigured.
  - `encodeTxnCookie(txn: { v: string; s: string; n: string }): string` / `decodeTxnCookie(raw: string | null): { v: string; s: string; n: string } | null` — base64url JSON.
  - `resolveSsoUser(claims: { sub: string; email?: string; preferred_username?: string; name?: string }): Promise<SsoResolution>` where
    `type SsoResolution = { status: 'ok'; user: { id: string; username: string; name: string; email: string; role: string } } | { status: 'pending' } | { status: 'identity_conflict' } | { status: 'missing_email' }`.

- [ ] **Step 1: Install the dependency**

Run: `cd backend && npm install openid-client@^6`
Expected: `openid-client` appears in `backend/package.json` dependencies.

- [ ] **Step 2: Write the failing service test**

`backend/tests/services/AuthentikOidcService.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/AuthentikOidcService.test.ts`
Expected: FAIL — module `../../src/services/AuthentikOidcService` not found.

- [ ] **Step 4: Implement the service**

`backend/src/services/AuthentikOidcService.ts`:

```typescript
/**
 * Authentik OIDC service.
 *
 * Env-gated: when AUTHENTIK_ISSUER / AUTHENTIK_CLIENT_ID /
 * AUTHENTIK_CLIENT_SECRET / OIDC_REDIRECT_URI are unset the OIDC routes stay
 * dormant and the app behaves exactly as before (this is also the rollback
 * mechanism). Env is read at call time, not module load, so tests and
 * container restarts pick up changes.
 */
import * as oidc from 'openid-client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { userRepository } from '../database/repositories';

export interface OidcEnv {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  frontendUrl: string;
}

export function readOidcEnv(): OidcEnv {
  return {
    issuer: process.env.AUTHENTIK_ISSUER,
    clientId: process.env.AUTHENTIK_CLIENT_ID,
    clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    frontendUrl: process.env.FRONTEND_URL || '',
  };
}

export function isOidcConfigured(env: OidcEnv = readOidcEnv()): boolean {
  return Boolean(env.issuer && env.clientId && env.clientSecret && env.redirectUri);
}

let cachedConfig: oidc.Configuration | null = null;

/** Discovery, cached for the process lifetime. Throws when unconfigured/unreachable. */
export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (cachedConfig) return cachedConfig;
  const env = readOidcEnv();
  if (!isOidcConfigured(env)) {
    throw new Error('OIDC not configured');
  }
  cachedConfig = await oidc.discovery(new URL(env.issuer!), env.clientId!, env.clientSecret!);
  return cachedConfig;
}

/** Test hook / config-change hook. */
export function resetOidcConfigCache(): void {
  cachedConfig = null;
}

// ---------- login transaction cookie (PKCE verifier + state + nonce) ----------

export const OIDC_TXN_COOKIE = 'oidc_txn';

export function encodeTxnCookie(txn: { v: string; s: string; n: string }): string {
  return Buffer.from(JSON.stringify(txn), 'utf8').toString('base64url');
}

export function decodeTxnCookie(raw: string | null): { v: string; s: string; n: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed.v !== 'string' || typeof parsed.s !== 'string' || typeof parsed.n !== 'string') {
      return null;
    }
    return { v: parsed.v, s: parsed.s, n: parsed.n };
  } catch {
    return null;
  }
}

// ---------- user resolution ----------

export interface SsoClaims {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
}

export type SsoResolution =
  | { status: 'ok'; user: { id: string; username: string; name: string; email: string; role: string } }
  | { status: 'pending' }
  | { status: 'identity_conflict' }
  | { status: 'missing_email' };

/**
 * Resolution order (spec §2):
 *  1. authentik_sub match → sign in (touch last_sso_login)
 *  2. case-insensitive email match on an UNLINKED account → link, sign in
 *     (a different existing sub on that account → identity_conflict)
 *  3. no match → auto-provision as 'pending'
 * Users resolving to role 'pending' never get a token.
 */
export async function resolveSsoUser(claims: SsoClaims): Promise<SsoResolution> {
  const bySub = await userRepository.findByAuthentikSub(claims.sub);
  if (bySub) {
    if (bySub.role === 'pending') return { status: 'pending' };
    await userRepository.updateLastSsoLogin(bySub.id);
    return {
      status: 'ok',
      user: { id: bySub.id, username: bySub.username, name: bySub.name, email: bySub.email, role: bySub.role },
    };
  }

  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  if (!email) return { status: 'missing_email' };

  const byEmail = await userRepository.findByEmailCiWithSso(email);
  if (byEmail) {
    if (byEmail.authentik_sub && byEmail.authentik_sub !== claims.sub) {
      console.error(
        `[OIDC] identity conflict: email ${email} already linked to a different Authentik identity (user ${byEmail.id})`
      );
      return { status: 'identity_conflict' };
    }
    await userRepository.linkAuthentikSub(byEmail.id, claims.sub);
    if (byEmail.role === 'pending') return { status: 'pending' };
    await userRepository.updateLastSsoLogin(byEmail.id);
    return {
      status: 'ok',
      user: { id: byEmail.id, username: byEmail.username, name: byEmail.name, email: byEmail.email, role: byEmail.role },
    };
  }

  // Auto-provision. Random unusable password satisfies NOT NULL; nobody is told it.
  const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const base =
    (claims.preferred_username || email.split('@')[0] || `authentik_${claims.sub.slice(0, 8)}`)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 90) || `authentik_${claims.sub.slice(0, 8)}`;
  const name = claims.name || base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? base : `${base}${attempt + 1}`;
    try {
      await userRepository.createSsoUser({ username, name, email, password: unusable, authentikSub: claims.sub });
      console.log(`[OIDC] auto-provisioned pending user "${username}" (${email})`);
      return { status: 'pending' };
    } catch (error: any) {
      if (error?.code === '23505') continue; // username taken → retry with suffix
      throw error;
    }
  }
  throw new Error(`[OIDC] could not provision a unique username for ${email}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/AuthentikOidcService.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/AuthentikOidcService.ts backend/tests/services/AuthentikOidcService.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(sso): AuthentikOidcService — env gating, txn cookie, SSO user resolution"
```

---

### Task 3: OIDC routes + server mount + env.example

**Files:**
- Create: `backend/src/routes/oidc.ts`
- Modify: `backend/src/server.ts` (import near line 7; mount right after the `app.use('/api/auth', authRoutes);` line, ~line 81)
- Modify: `backend/env.example` (append a block after the PLATFORM SSO block, line 20)
- Test: `backend/tests/routes/oidc.test.ts`

**Interfaces:**
- Consumes: Task 2's exports; `getCookieValue` from `../middleware/auth`; `createSession` from `../middleware/sessionTracker`; `logAuth` from `../utils/auditLogger`; `jsonwebtoken`.
- Produces:
  - `GET /api/auth/oidc/status` → `{ enabled: boolean }` (used by frontend Task 6).
  - `GET /api/auth/oidc/login` → 302 to Authentik (or `${FRONTEND_URL}/#sso_error=...`).
  - `GET /api/auth/oidc/callback` → 302 to `${FRONTEND_URL}/#sso_token=<jwt>` or `#sso_error=<code>`.
  - JWT payload/expiry identical to `POST /api/auth/login` (`{ id, username, role }`, `12h`, `createSession(..., 43200)`).

- [ ] **Step 1: Write the failing route test**

`backend/tests/routes/oidc.test.ts` (thin routes; the test drives the exported handlers with mocked service, matching the repo's handler-level test convention):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/AuthentikOidcService', async () => {
  const actual = await vi.importActual<any>('../../src/services/AuthentikOidcService');
  return {
    ...actual,
    isOidcConfigured: vi.fn(),
    getOidcConfig: vi.fn(),
    resolveSsoUser: vi.fn(),
  };
});
vi.mock('../../src/middleware/sessionTracker', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('../../src/utils/auditLogger', () => ({ logAuth: vi.fn().mockResolvedValue(undefined) }));

import jwt from 'jsonwebtoken';
import { isOidcConfigured, resolveSsoUser, encodeTxnCookie, OIDC_TXN_COOKIE } from '../../src/services/AuthentikOidcService';
import { createSession } from '../../src/middleware/sessionTracker';
import { handleStatus, finishCallback } from '../../src/routes/oidc';

function mockRes() {
  return {
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as Response & { redirect: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FRONTEND_URL = 'https://app.example';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
});

describe('GET /status', () => {
  it('reports enabled from isOidcConfigured', () => {
    (isOidcConfigured as any).mockReturnValue(true);
    const res = mockRes();
    handleStatus({} as any, res);
    expect(res.json).toHaveBeenCalledWith({ enabled: true });
  });
});

describe('finishCallback (post-token-exchange logic)', () => {
  const req: any = { headers: {}, ip: '1.2.3.4', socket: { remoteAddress: '1.2.3.4' } };

  it('ok resolution → mints local JWT, creates session, redirects with #sso_token', async () => {
    (resolveSsoUser as any).mockResolvedValue({
      status: 'ok',
      user: { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin' },
    });
    const res = mockRes();
    await finishCallback(req, res, { sub: 's1', email: 'j@x.com' });
    expect(createSession).toHaveBeenCalledWith('u1', expect.any(String), req, 43200);
    const target: string = res.redirect.mock.calls[0][0];
    expect(target.startsWith('https://app.example/#sso_token=')).toBe(true);
    const token = decodeURIComponent(target.split('#sso_token=')[1]);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded).toMatchObject({ id: 'u1', username: 'jane', role: 'admin' });
  });

  it('pending → redirects with #sso_error=pending and no session', async () => {
    (resolveSsoUser as any).mockResolvedValue({ status: 'pending' });
    const res = mockRes();
    await finishCallback(req, res, { sub: 's1', email: 'j@x.com' });
    expect(createSession).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example/#sso_error=pending');
  });

  it('identity_conflict and missing_email map to their error codes', async () => {
    for (const status of ['identity_conflict', 'missing_email'] as const) {
      (resolveSsoUser as any).mockResolvedValue({ status });
      const res = mockRes();
      await finishCallback(req, res, { sub: 's1' });
      expect(res.redirect).toHaveBeenCalledWith(`https://app.example/#sso_error=${status}`);
    }
  });
});

describe('txn cookie guard', () => {
  it('decode of a forged/absent cookie yields null → callback route redirects sso_error=retry (covered by service codec tests + route wiring below)', () => {
    expect(encodeTxnCookie({ v: 'a', s: 'b', n: 'c' })).toBeTypeOf('string');
    expect(OIDC_TXN_COOKIE).toBe('oidc_txn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/routes/oidc.test.ts`
Expected: FAIL — `../../src/routes/oidc` not found.

- [ ] **Step 3: Implement the routes**

`backend/src/routes/oidc.ts`:

```typescript
/**
 * Authentik OIDC routes (Authorization Code + PKCE).
 * Mounted unauthenticated at /api/auth/oidc. Env-gated via isOidcConfigured.
 * A successful callback mints the SAME local JWT as POST /api/auth/login.
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as oidc from 'openid-client';
import { AuthRequest, getCookieValue } from '../middleware/auth';
import { createSession } from '../middleware/sessionTracker';
import { logAuth } from '../utils/auditLogger';
import {
  OIDC_TXN_COOKIE,
  SsoClaims,
  decodeTxnCookie,
  encodeTxnCookie,
  getOidcConfig,
  isOidcConfigured,
  readOidcEnv,
  resolveSsoUser,
} from '../services/AuthentikOidcService';

const router = Router();

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

function redirectWithError(res: Response, code: string): void {
  res.redirect(`${frontendUrl()}/#sso_error=${code}`);
}

function txnCookieAttrs(maxAgeSeconds: number): string {
  const secure = frontendUrl().startsWith('https') ? '; Secure' : '';
  return `Path=/api/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** GET /api/auth/oidc/status — lets the login page decide whether to show the SSO button. */
export function handleStatus(_req: Request, res: Response): void {
  res.json({ enabled: isOidcConfigured() });
}
router.get('/status', handleStatus);

/** GET /api/auth/oidc/login — start the flow. */
router.get('/login', async (_req: Request, res: Response) => {
  if (!isOidcConfigured()) return redirectWithError(res, 'not_configured');
  try {
    const config = await getOidcConfig();
    const env = readOidcEnv();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const authUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: env.redirectUri!,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    res.setHeader(
      'Set-Cookie',
      `${OIDC_TXN_COOKIE}=${encodeTxnCookie({ v: codeVerifier, s: state, n: nonce })}; ${txnCookieAttrs(600)}`
    );
    res.redirect(authUrl.href);
  } catch (error) {
    console.error('[OIDC] login initiation failed (discovery unreachable?):', error);
    redirectWithError(res, 'idp_unreachable');
  }
});

/**
 * Shared post-exchange logic: resolve the user and either mint the standard
 * local JWT (identical to POST /api/auth/login) or map the resolution to an
 * sso_error code. Exported for tests.
 */
export async function finishCallback(req: AuthRequest, res: Response, claims: SsoClaims): Promise<void> {
  const resolution = await resolveSsoUser(claims);
  if (resolution.status !== 'ok') {
    return redirectWithError(res, resolution.status);
  }
  const user = resolution.user;
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production',
    { expiresIn: '12h' }
  );
  try {
    await createSession(user.id, token, req, 43200);
  } catch (sessionError) {
    console.error('[OIDC] Failed to create session record:', sessionError);
  }
  await logAuth('login_success', { id: user.id, username: user.username, email: user.email, role: user.role }, req.ip).catch(
    (err) => console.error('[OIDC] Failed to log auth success:', err)
  );
  console.log(`[OIDC] SSO login successful for user: ${user.username}`);
  res.redirect(`${frontendUrl()}/#sso_token=${encodeURIComponent(token)}`);
}

/** GET /api/auth/oidc/callback — finish the flow. */
router.get('/callback', async (req: AuthRequest, res: Response) => {
  if (!isOidcConfigured()) return redirectWithError(res, 'not_configured');
  const txn = decodeTxnCookie(getCookieValue(req, OIDC_TXN_COOKIE));
  // Clear the txn cookie regardless of outcome.
  res.setHeader('Set-Cookie', `${OIDC_TXN_COOKIE}=; ${txnCookieAttrs(0)}`);
  if (!txn) return redirectWithError(res, 'retry');
  try {
    const config = await getOidcConfig();
    const env = readOidcEnv();
    // Reconstruct the exact callback URL Authentik redirected to; the proxy
    // terminates TLS, so req.protocol/host are not trustworthy here.
    const currentUrl = new URL(env.redirectUri!);
    const queryIndex = req.originalUrl.indexOf('?');
    currentUrl.search = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: txn.v,
      expectedState: txn.s,
      expectedNonce: txn.n,
    });
    const claims = tokens.claims();
    if (!claims?.sub) return redirectWithError(res, 'retry');
    await finishCallback(req, res, {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      preferred_username: typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
    });
  } catch (error) {
    console.error('[OIDC] callback failed:', error);
    redirectWithError(res, 'retry');
  }
});

export default router;
```

- [ ] **Step 4: Mount in server.ts and update env.example**

In `backend/src/server.ts`, after `import authRoutes from './routes/auth';`:

```typescript
import oidcRoutes from './routes/oidc';
```

After the `app.use('/api/auth', authRoutes);` line:

```typescript
app.use('/api/auth/oidc', oidcRoutes);
```

(Note: Express matches `/api/auth/oidc` before falling through to `/api/auth`; mounting order here is not load-bearing, but keep them adjacent for readability.)

In `backend/env.example`, after the PLATFORM SSO block (line 20):

```
# ========== AUTHENTIK SSO (optional) ==========
# All four must be set to enable the "Sign in with Authentik" flow.
# Unset (default) = SSO routes dormant, password login only. This is also the rollback switch.
# AUTHENTIK_ISSUER=https://auth.booute.duckdns.org/application/o/trade-show/
# AUTHENTIK_CLIENT_ID=
# AUTHENTIK_CLIENT_SECRET=
# OIDC_REDIRECT_URI=https://expapp.duckdns.org/api/auth/oidc/callback
# FRONTEND_URL is also required for SSO redirects (already set in deployed envs)
# FRONTEND_URL=https://expapp.duckdns.org
```

- [ ] **Step 5: Run tests + build**

Run: `cd backend && npx vitest run tests/routes/oidc.test.ts && npx vitest run && npm run build`
Expected: new tests PASS, full suite green, TypeScript build clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/oidc.ts backend/src/server.ts backend/env.example backend/tests/routes/oidc.test.ts
git commit -m "feat(sso): OIDC login/callback/status routes mounted at /api/auth/oidc"
```

---

### Task 4: GET /api/auth/me

**Files:**
- Modify: `backend/src/routes/auth.ts` (add route after `/platform/session`, ~line 55; extend imports at line 6)
- Test: `backend/tests/routes/auth-me.test.ts`

**Interfaces:**
- Consumes: `authenticateToken` middleware, `query` from `../config/database`.
- Produces: `GET /api/auth/me` → `{ user: { id, username, name, email, role } }` (frontend Task 5 depends on this exact shape).

- [ ] **Step 1: Write the failing test**

`backend/tests/routes/auth-me.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { query } from '../../src/config/database';
import { handleMe } from '../../src/routes/auth';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the fresh user row for the authenticated id', async () => {
    (query as any).mockResolvedValue({
      rows: [{ id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin' }],
    });
    const res = mockRes();
    await handleMe({ user: { id: 'u1', username: 'jane', role: 'admin' } } as any, res);
    expect((query as any).mock.calls[0][1]).toEqual(['u1']);
    expect(res.json).toHaveBeenCalledWith({
      user: { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin' },
    });
  });

  it('404s when the user row is gone', async () => {
    (query as any).mockResolvedValue({ rows: [] });
    const res = mockRes();
    await handleMe({ user: { id: 'gone', username: 'x', role: 'admin' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/routes/auth-me.test.ts`
Expected: FAIL — `handleMe` is not exported.

- [ ] **Step 3: Implement**

In `backend/src/routes/auth.ts`, change the middleware import (line 6) to also pull in `authenticateToken`:

```typescript
import { AuthRequest, getToken, tryVerifyPlatformJwt, authenticateToken } from '../middleware/auth';
```

Add after the `/platform/session` route (after line 54):

```typescript
/**
 * GET /api/auth/me
 * Return the authenticated user's fresh profile. Lets the SPA hydrate its
 * user object from a bare JWT (used by the SSO #sso_token bootstrap).
 */
export async function handleMe(req: AuthRequest, res: import('express').Response): Promise<void> {
  try {
    const result = await query(
      'SELECT id, username, name, email, role FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('[Auth] /me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
router.get('/me', authenticateToken, handleMe);
```

- [ ] **Step 4: Run tests + build**

Run: `cd backend && npx vitest run tests/routes/auth-me.test.ts && npx vitest run && npm run build`
Expected: PASS, suite green, build clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/tests/routes/auth-me.test.ts
git commit -m "feat(auth): GET /api/auth/me for token-only profile hydration"
```

---

### Task 5: Frontend — useAuth #sso_token bootstrap

**Files:**
- Modify: `src/hooks/useAuth.ts` (inside the bootstrap `useEffect`, before the platform-session call, ~line 32)

**Interfaces:**
- Consumes: `GET /api/auth/me` (Task 4 shape `{ user }`), `TokenManager` from `../utils/api`, `apiClient`.
- Produces: after an SSO redirect (`/#sso_token=<jwt>`), the hook stores the token, hydrates `user`, persists `tradeshow_current_user`, and scrubs the hash. On `/auth/me` failure it removes the token and falls through to the normal login screen.

- [ ] **Step 1: Implement the hash bootstrap**

In `src/hooks/useAuth.ts`, at the top of the async IIFE inside the bootstrap `useEffect` (immediately after `(async () => {` on line 32), insert:

```typescript
      // SSO callback handoff: the backend redirects to /#sso_token=<jwt>.
      // Consume it before anything else and scrub the hash so it never
      // lingers in the address bar or history.
      const ssoMatch = window.location.hash.match(/[#&]sso_token=([^&]+)/);
      if (ssoMatch) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        TokenManager.setToken(decodeURIComponent(ssoMatch[1]));
        try {
          const me = await apiClient.get<{ user: User }>('/auth/me');
          if (!cancelled && me?.user) {
            setUser(me.user);
            localStorage.setItem('tradeshow_current_user', JSON.stringify(me.user));
          }
        } catch (error) {
          console.error('[useAuth] SSO token bootstrap failed:', error);
          TokenManager.removeToken();
        } finally {
          if (!cancelled) setBootstrapDone(true);
        }
        return;
      }
```

(The existing `finally` block on the platform-session path still handles `setBootstrapDone` for the non-SSO path; the early `return` above is why this branch sets it itself.)

- [ ] **Step 2: Verify with lint + build**

Run: `npm run lint && npm run build`
Expected: no new lint errors; Vite build succeeds. (No frontend test runner exists in this repo — behavior is exercised end-to-end in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAuth.ts
git commit -m "feat(sso): consume #sso_token handoff in useAuth bootstrap"
```

---

### Task 6: Frontend — LoginForm SSO button and error banners

**Files:**
- Modify: `src/components/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/oidc/status` → `{ enabled }` (Task 3); `sso_error` codes from the URL hash (Task 3's `redirectWithError`); `API_CONFIG` from `../../constants/appConstants`; `apiClient` from `../../utils/apiClient`.
- Produces: an "Sign in with Authentik" button (primary position, above the password form) shown only when SSO is enabled; error banners for each `sso_error` code.

- [ ] **Step 1: Implement**

In `src/components/auth/LoginForm.tsx`:

Add imports (top of file):

```typescript
import React, { useEffect, useState } from 'react';
import { User, Key, ArrowRight, AlertCircle, UserPlus, Shield } from 'lucide-react';
import { apiClient } from '../../utils/apiClient';
import { API_CONFIG } from '../../constants/appConstants';
```

(replacing the existing `React, { useState }` and lucide imports; `RegistrationForm` import stays.)

Add inside the component, after the `showRegistration` state (line 14):

```typescript
  const [ssoEnabled, setSsoEnabled] = useState(false);
  // Read (and scrub) an sso_error code left in the hash by the OIDC callback.
  const [ssoError] = useState(() => {
    const match = window.location.hash.match(/[#&]sso_error=([^&]+)/);
    if (!match) return '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return decodeURIComponent(match[1]);
  });

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ enabled: boolean }>('/auth/oidc/status', { skipAuth: true } as RequestInit)
      .then((data) => {
        if (!cancelled) setSsoEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        /* status probe failing just hides the button */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const SSO_ERROR_MESSAGES: Record<string, string> = {
    pending:
      'Your account was created and is awaiting administrator approval. You can sign in once a role is assigned.',
    not_configured: 'Single sign-on is not available right now. Please use your username and password.',
    idp_unreachable: 'Single sign-on is temporarily unavailable. Please use your username and password.',
    retry: 'Your sign-in attempt expired. Please try again.',
    identity_conflict:
      'This email is already linked to a different SSO identity. Please contact an administrator.',
    missing_email: 'Your SSO account has no email address. Please contact an administrator.',
  };
  const ssoErrorMessage = ssoError ? SSO_ERROR_MESSAGES[ssoError] || 'Single sign-on failed. Please try again.' : '';

  const handleSsoLogin = () => {
    window.location.href = `${API_CONFIG.BASE_URL}/auth/oidc/login`;
  };
```

Render the SSO error banner: inside the JSX, directly above the existing `{error && (...)}` block (line 114), add:

```tsx
          {ssoErrorMessage && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3.5" role="alert">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 w-5 h-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Single sign-on</p>
                  <p className="text-sm text-amber-700 mt-0.5">{ssoErrorMessage}</p>
                </div>
              </div>
            </div>
          )}
```

Render the SSO button in the primary position: directly above `<form onSubmit={handleSubmit} ...>` (line 125), add:

```tsx
          {ssoEnabled && (
            <>
              <button
                type="button"
                onClick={handleSsoLogin}
                className="btn-primary w-full py-3 text-base group mb-6"
              >
                <Shield className="w-5 h-5" />
                Sign in with Authentik
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-stone-500">or sign in with password</span>
                </div>
              </div>
            </>
          )}
```

- [ ] **Step 2: Verify with lint + build**

Run: `npm run lint && npm run build`
Expected: clean. Visual/behavioral check happens on sandbox in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/LoginForm.tsx
git commit -m "feat(sso): Authentik sign-in button and SSO error banners on login page"
```

---

### Task 7: Merge/link script

**Files:**
- Create: `backend/src/scripts/linkAuthentikUsers.ts`
- Modify: `backend/package.json` (add script `"link:authentik": "ts-node src/scripts/linkAuthentikUsers.ts"`)
- Test: `backend/tests/unit/linkAuthentikUsers.test.ts`

**Interfaces:**
- Consumes: Authentik API `GET /api/v3/core/users/?search=<term>` (fields used: `pk`, `uuid`, `username`, `email`), app DB via `query` from `../config/database`, Task 1's `authentik_sub` column.
- Produces: CLI `npm run link:authentik -- --file <pairs.csv> [--apply]` with env `AUTHENTIK_API_URL` (e.g. `https://auth.booute.duckdns.org`) and `AUTHENTIK_API_TOKEN`. Exports pure functions for tests:
  - `parsePairs(text: string): Array<{ app: string; authentik: string }>` — CSV lines `app_identifier[,authentik_identifier]`, `#` comments and blanks skipped; missing second column = same identifier.
  - `planLink(appUser: { id: string; username: string; email: string; authentik_sub: string | null } | null, akMatches: Array<{ uuid: string; username: string; email: string }>, pair: { app: string; authentik: string }): { action: 'link' | 'skip' | 'conflict' | 'not_found' | 'ambiguous'; sub?: string; reason: string }`

- [ ] **Step 1: Write the failing unit test**

`backend/tests/unit/linkAuthentikUsers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parsePairs, planLink } from '../../src/scripts/linkAuthentikUsers';

describe('parsePairs', () => {
  it('parses one- and two-column lines, skipping comments and blanks', () => {
    const text = `# merge list
jane@x.com
bob,robert@corp.com

# trailing comment`;
    expect(parsePairs(text)).toEqual([
      { app: 'jane@x.com', authentik: 'jane@x.com' },
      { app: 'bob', authentik: 'robert@corp.com' },
    ]);
  });
});

describe('planLink', () => {
  const appUser = { id: 'u1', username: 'jane', email: 'jane@x.com', authentik_sub: null };
  const ak = { uuid: 'ak-1', username: 'jane', email: 'jane@x.com' };
  const pair = { app: 'jane@x.com', authentik: 'jane@x.com' };

  it('links when both sides match exactly and app user is unlinked', () => {
    expect(planLink(appUser, [ak], pair)).toEqual({ action: 'link', sub: 'ak-1', reason: expect.any(String) });
  });

  it('not_found when app user missing', () => {
    expect(planLink(null, [ak], pair).action).toBe('not_found');
  });

  it('not_found when no exact authentik match', () => {
    expect(planLink(appUser, [{ uuid: 'x', username: 'janet', email: 'janet@x.com' }], pair).action).toBe('not_found');
  });

  it('ambiguous when multiple exact authentik matches', () => {
    expect(planLink(appUser, [ak, { uuid: 'ak-2', username: 'other', email: 'jane@x.com' }], pair).action).toBe('ambiguous');
  });

  it('skip when already linked to the same sub', () => {
    expect(planLink({ ...appUser, authentik_sub: 'ak-1' }, [ak], pair).action).toBe('skip');
  });

  it('conflict when linked to a different sub', () => {
    expect(planLink({ ...appUser, authentik_sub: 'other' }, [ak], pair).action).toBe('conflict');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/linkAuthentikUsers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the script**

`backend/src/scripts/linkAuthentikUsers.ts`:

```typescript
/**
 * Pre-link app accounts to Authentik identities (spec §4).
 *
 * Usage (on the backend container, from /opt/trade-show-app/backend or repo backend/):
 *   AUTHENTIK_API_URL=https://auth.booute.duckdns.org \
 *   AUTHENTIK_API_TOKEN=<token> \
 *   npm run link:authentik -- --file pairs.csv [--apply]
 *
 * pairs.csv: one entry per line, `app_identifier[,authentik_identifier]`
 * (username or email on either side; second column defaults to the first).
 * DRY-RUN by default — prints the plan; writes only with --apply.
 */
import fs from 'fs';
import axios from 'axios';
import { query, pool } from '../config/database';

export interface Pair {
  app: string;
  authentik: string;
}

export function parsePairs(text: string): Pair[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [app, authentik] = line.split(',').map((s) => s.trim());
      return { app, authentik: authentik || app };
    });
}

export interface AppUserRow {
  id: string;
  username: string;
  email: string;
  authentik_sub: string | null;
}

export interface AkUser {
  uuid: string;
  username: string;
  email: string;
}

export interface LinkPlan {
  action: 'link' | 'skip' | 'conflict' | 'not_found' | 'ambiguous';
  sub?: string;
  reason: string;
}

export function planLink(appUser: AppUserRow | null, akMatches: AkUser[], pair: Pair): LinkPlan {
  if (!appUser) {
    return { action: 'not_found', reason: `no app user matching "${pair.app}"` };
  }
  const needle = pair.authentik.toLowerCase();
  const exact = akMatches.filter(
    (u) => u.username.toLowerCase() === needle || (u.email || '').toLowerCase() === needle
  );
  if (exact.length === 0) {
    return { action: 'not_found', reason: `no Authentik user matching "${pair.authentik}"` };
  }
  if (exact.length > 1) {
    return { action: 'ambiguous', reason: `${exact.length} Authentik users match "${pair.authentik}"` };
  }
  const sub = exact[0].uuid;
  if (appUser.authentik_sub === sub) {
    return { action: 'skip', sub, reason: 'already linked to this identity' };
  }
  if (appUser.authentik_sub) {
    return { action: 'conflict', sub, reason: `app user already linked to different sub ${appUser.authentik_sub}` };
  }
  return { action: 'link', sub, reason: `link ${appUser.username} (${appUser.email}) -> ${sub}` };
}

async function findAppUser(identifier: string): Promise<AppUserRow | null> {
  const result = await query(
    `SELECT id, username, email, authentik_sub FROM users
     WHERE LOWER(TRIM(username)) = LOWER($1) OR LOWER(TRIM(email)) = LOWER($1)
     LIMIT 1`,
    [identifier.trim()]
  );
  return result.rows[0] || null;
}

async function searchAuthentik(baseUrl: string, token: string, term: string): Promise<AkUser[]> {
  const response = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/v3/core/users/`, {
    params: { search: term },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return (response.data?.results || []).map((u: any) => ({
    uuid: u.uuid,
    username: u.username,
    email: u.email || '',
  }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileIndex = args.indexOf('--file');
  const file = fileIndex >= 0 ? args[fileIndex + 1] : null;
  const baseUrl = process.env.AUTHENTIK_API_URL;
  const token = process.env.AUTHENTIK_API_TOKEN;
  if (!file || !baseUrl || !token) {
    console.error('Usage: AUTHENTIK_API_URL=... AUTHENTIK_API_TOKEN=... npm run link:authentik -- --file pairs.csv [--apply]');
    process.exit(2);
  }

  const pairs = parsePairs(fs.readFileSync(file, 'utf8'));
  console.log(`${pairs.length} entries; mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  let linked = 0;
  let problems = 0;
  for (const pair of pairs) {
    const [appUser, akMatches] = await Promise.all([
      findAppUser(pair.app),
      searchAuthentik(baseUrl, token, pair.authentik),
    ]);
    const plan = planLink(appUser, akMatches, pair);
    console.log(`[${plan.action.toUpperCase()}] ${pair.app} -> ${pair.authentik}: ${plan.reason}`);
    if (plan.action === 'link' && apply) {
      await query(
        `UPDATE users SET authentik_sub = $1, sso_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [plan.sub, appUser!.id]
      );
      linked++;
    }
    if (plan.action === 'conflict' || plan.action === 'ambiguous' || plan.action === 'not_found') problems++;
  }

  console.log(`\nDone. ${apply ? `${linked} linked.` : 'Dry-run only — rerun with --apply to write.'} ${problems} entries need attention.`);
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('link:authentik failed:', error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add the npm script**

In `backend/package.json` scripts, after `"migrate:expenses:midas"`:

```json
    "link:authentik": "ts-node src/scripts/linkAuthentikUsers.ts",
```

- [ ] **Step 5: Run tests**

Run: `cd backend && npx vitest run tests/unit/linkAuthentikUsers.test.ts && npx vitest run`
Expected: PASS; suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/scripts/linkAuthentikUsers.ts backend/tests/unit/linkAuthentikUsers.test.ts backend/package.json
git commit -m "feat(sso): dry-run-by-default Authentik account link script"
```

---

### Task 8: Version bump + full local verification

**Files:**
- Modify: `package.json` (version → `2.16.0`)
- Modify: `backend/package.json` (version → `2.16.0`)

- [ ] **Step 1: Bump versions**

Set `"version": "2.16.0"` in both `package.json` and `backend/package.json`.

- [ ] **Step 2: Full verification**

Run:
```bash
cd backend && npx vitest run && npm run build && cd .. && npm run lint && npm run build
```
Expected: everything green. Report actual output, not assumptions.

- [ ] **Step 3: Commit**

```bash
git add package.json backend/package.json
git commit -m "release: v2.16.0 — Authentik SSO integration"
```

---

### Task 9: Authentik provisioning script (+ run it)

**Files:**
- Create: `scripts/authentik/provision-trade-show.sh`

**Interfaces:**
- Consumes: SSH `root@192.168.1.190`; Authentik in LXC 111 (source install `/opt/authentik`, API at `http://192.168.1.164:9000`); existing "payroll" provider as the template for flows/signing key.
- Produces: OAuth2 provider + application `trade-show` in Authentik; `AUTHENTIK_*`/`OIDC_REDIRECT_URI` env lines written to CT 2600 and CT 2220 backend `.env`s; prints client_id (secret only written to the containers). Also leaves an API token identified as `trade-show-provisioning` in Authentik (reused by Task 7's script and Task 10's E2E).

- [ ] **Step 1: Write the script**

`scripts/authentik/provision-trade-show.sh`:

```bash
#!/bin/bash
# Provision the "trade-show" OAuth2 provider + application in Authentik (LXC 111)
# and write the resulting credentials into the sandbox (CT 2600) and prod
# (CT 2220) backend .env files. Idempotent: safe to re-run (finds existing
# objects by name/slug instead of duplicating them).
#
# Usage: ./scripts/authentik/provision-trade-show.sh
# Requires: ssh root@192.168.1.190

set -euo pipefail
PROXMOX="root@192.168.1.190"
AK_CT=111
AK_API="http://192.168.1.164:9000/api/v3"
PROD_REDIRECT="https://expapp.duckdns.org/api/auth/oidc/callback"
SANDBOX_REDIRECT="http://192.168.1.144/api/auth/oidc/callback"
ISSUER="https://auth.booute.duckdns.org/application/o/trade-show/"

echo "=== 1/5 Bootstrap API token (via ak shell as akadmin) ==="
TOKEN=$(ssh "$PROXMOX" "pct exec $AK_CT -- bash -lc 'cd /opt/authentik && python -m lifecycle.migrate >/dev/null 2>&1 || true; python manage.py shell -c \"
from authentik.core.models import User, Token, TokenIntents
u = User.objects.get(username=\\\"akadmin\\\")
t, created = Token.objects.get_or_create(identifier=\\\"trade-show-provisioning\\\", user=u, defaults={\\\"intent\\\": TokenIntents.INTENT_API, \\\"expiring\\\": False, \\\"description\\\": \\\"trade-show SSO provisioning\\\"})
print(t.key)
\"'" | tail -1)
[ -n "$TOKEN" ] || { echo "❌ could not bootstrap API token"; exit 1; }
echo "✓ token acquired"

AK() { # method path [json-body]
  local method=$1 path=$2 body=${3:-}
  ssh "$PROXMOX" "pct exec $AK_CT -- curl -sf -X $method '$AK_API$path' \
    -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
    ${body:+-d '$body'}"
}

echo "=== 2/5 Read template provider (payroll) for flows/signing key/scope mappings ==="
TEMPLATE=$(AK GET "/providers/oauth2/?search=payroll")
AUTH_FLOW=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r['authorization_flow'])")
INVAL_FLOW=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r.get('invalidation_flow') or '')")
SIGNING_KEY=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(r.get('signing_key') or '')")
PROP_MAPPINGS=$(echo "$TEMPLATE" | python3 -c "import json,sys; r=json.load(sys.stdin)['results'][0]; print(json.dumps(r.get('property_mappings', [])))")
echo "✓ template read (flow=$AUTH_FLOW)"

echo "=== 3/5 Create or update provider 'Trade Show App' ==="
EXISTING=$(AK GET "/providers/oauth2/?name=Trade%20Show%20App")
PROVIDER_BODY=$(python3 - "$AUTH_FLOW" "$INVAL_FLOW" "$SIGNING_KEY" "$PROP_MAPPINGS" "$PROD_REDIRECT" "$SANDBOX_REDIRECT" <<'PY'
import json, sys
auth_flow, inval_flow, signing_key, prop_mappings, prod_uri, sandbox_uri = sys.argv[1:7]
body = {
    "name": "Trade Show App",
    "authorization_flow": auth_flow,
    "client_type": "confidential",
    "sub_mode": "user_uuid",
    "redirect_uris": [
        {"matching_mode": "strict", "url": prod_uri},
        {"matching_mode": "strict", "url": sandbox_uri},
    ],
    "property_mappings": json.loads(prop_mappings),
}
if inval_flow:
    body["invalidation_flow"] = inval_flow
if signing_key:
    body["signing_key"] = signing_key
print(json.dumps(body))
PY
)
COUNT=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['pagination']['count'])")
if [ "$COUNT" = "0" ]; then
  PROVIDER=$(AK POST "/providers/oauth2/" "$PROVIDER_BODY")
else
  PK=$(echo "$EXISTING" | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['pk'])")
  PROVIDER=$(AK PATCH "/providers/oauth2/$PK/" "$PROVIDER_BODY")
fi
PROVIDER_PK=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['pk'])")
CLIENT_ID=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_id'])")
CLIENT_SECRET=$(echo "$PROVIDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['client_secret'])")
echo "✓ provider pk=$PROVIDER_PK client_id=$CLIENT_ID"

echo "=== 4/5 Create or update application 'trade-show' ==="
APP_BODY="{\"name\": \"Trade Show App\", \"slug\": \"trade-show\", \"provider\": $PROVIDER_PK, \"meta_launch_url\": \"https://expapp.duckdns.org\"}"
if AK GET "/core/applications/trade-show/" >/dev/null 2>&1; then
  AK PATCH "/core/applications/trade-show/" "$APP_BODY" >/dev/null
else
  AK POST "/core/applications/" "$APP_BODY" >/dev/null
fi
echo "✓ application slug=trade-show (issuer $ISSUER)"

echo "=== 5/5 Write env to containers and restart backends ==="
write_env() { # ct redirect_uri service_hint
  local ct=$1 redirect=$2
  ssh "$PROXMOX" "pct exec $ct -- bash -lc '
    ENV=/opt/trade-show-app/backend/.env
    touch \$ENV
    sed -i \"/^AUTHENTIK_ISSUER=/d;/^AUTHENTIK_CLIENT_ID=/d;/^AUTHENTIK_CLIENT_SECRET=/d;/^OIDC_REDIRECT_URI=/d\" \$ENV
    cat >> \$ENV <<EOF
AUTHENTIK_ISSUER=$ISSUER
AUTHENTIK_CLIENT_ID=$CLIENT_ID
AUTHENTIK_CLIENT_SECRET=$CLIENT_SECRET
OIDC_REDIRECT_URI=$redirect
EOF
    systemctl restart trade-show-app-backend 2>/dev/null || echo \"NOTE: restart trade-show backend on CT $ct manually (service name differs)\"
  '"
}
write_env 2600 "$SANDBOX_REDIRECT"
write_env 2220 "$PROD_REDIRECT"
echo "✓ done. client_id=$CLIENT_ID (secret written only to containers)"
```

- [ ] **Step 2: Commit the script**

```bash
chmod +x scripts/authentik/provision-trade-show.sh
git add scripts/authentik/provision-trade-show.sh
git commit -m "feat(sso): Authentik provider/application provisioning script"
```

- [ ] **Step 3: Run it**

Run: `./scripts/authentik/provision-trade-show.sh`
Expected: all five sections succeed; note the printed `client_id`. If the Authentik API shape differs (this is a 2026.2 install — e.g. `redirect_uris` schema or `manage.py` invocation), adapt the script, re-run, and commit the fix. Verify afterward:

```bash
ssh root@192.168.1.190 "pct exec 111 -- curl -sf http://192.168.1.164:9000/application/o/trade-show/.well-known/openid-configuration" | head -c 300
```
Expected: JSON containing `"issuer": "https://auth.booute.duckdns.org/application/o/trade-show/"`.

---

### Task 10: Sandbox deploy + scripted E2E verification

**Files:**
- Create: `scripts/authentik/verify-sso-e2e.sh`

**Interfaces:**
- Consumes: deployed sandbox app (CT 2600, `http://192.168.1.144`), Authentik flow-executor JSON API, the `trade-show-provisioning` API token from Task 9.
- Produces: pass/fail evidence for: SSO status endpoint, auto-provision→pending, linked-user login→JWT→`/api/auth/me`, password-login regression.

- [ ] **Step 1: Inspect sandbox layout and deploy**

```bash
ssh root@192.168.1.190 "pct exec 2600 -- bash -lc 'node -v; ls /opt/trade-show-app; systemctl list-units --type=service --state=running | grep -i trade; ls /var/www 2>/dev/null'"
```
Confirm Node ≥ 20 (openid-client v6 floor) and note the frontend path + service name. Then build and deploy: `npm run build:sandbox` for the frontend and `cd backend && npm run build` for the backend; tar + `scp` to the Proxmox host + `pct exec 2600` extract, `npm ci --omit=dev` in the backend dir, restart the backend service (mirroring `scripts/deploy-production-backend.sh` / `-frontend.sh` but targeting CT 2600 and its paths as discovered). Migration 036 auto-applies on startup — confirm with:

```bash
ssh root@192.168.1.190 "pct exec 2600 -- bash -lc 'psql -U postgres -d expense_app -c \"SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1\" 2>/dev/null || journalctl -u trade-show-app-backend -n 50 | grep -i migrat'"
```
Expected: `036_add_authentik_sso.sql` applied.

- [ ] **Step 2: Write the E2E script**

`scripts/authentik/verify-sso-e2e.sh`:

```bash
#!/bin/bash
# End-to-end SSO verification against a deployed environment.
# Creates an ephemeral Authentik user, drives the OIDC flow headlessly via
# Authentik's flow-executor JSON API, and asserts the app-side outcomes.
#
# Usage: ./scripts/authentik/verify-sso-e2e.sh <app_base_url> <db_ct>
#   e.g. ./scripts/authentik/verify-sso-e2e.sh http://192.168.1.144 2600   (sandbox: app+db same CT)
#        ./scripts/authentik/verify-sso-e2e.sh https://expapp.duckdns.org 2320 (prod db CT)

set -euo pipefail
APP=${1:?app base url}
DB_CT=${2:?db container id}
PROXMOX="root@192.168.1.190"
AK_CT=111
AK_API="http://192.168.1.164:9000/api/v3"
AK_PUBLIC="https://auth.booute.duckdns.org"
TEST_USER="sso-e2e-test"
TEST_EMAIL="sso-e2e-test@example.invalid"
TEST_PASS="E2e-Test-$(date +%s)!"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

TOKEN=$(ssh "$PROXMOX" "pct exec $AK_CT -- bash -lc 'cd /opt/authentik && python manage.py shell -c \"
from authentik.core.models import Token
print(Token.objects.get(identifier=\\\"trade-show-provisioning\\\").key)
\"'" | tail -1)

AK() { local m=$1 p=$2 b=${3:-}; ssh "$PROXMOX" "pct exec $AK_CT -- curl -sf -X $m '$AK_API$p' -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' ${b:+-d '$b'}"; }

echo "=== 0. SSO status endpoint ==="
curl -sf "$APP/api/auth/oidc/status" | grep -q '"enabled":true' && echo "✓ enabled" || { echo "❌ SSO not enabled"; exit 1; }

echo "=== 1. Create ephemeral Authentik user ==="
AK GET "/core/users/?username=$TEST_USER" | python3 -c "import json,sys; r=json.load(sys.stdin); sys.exit(0 if r['pagination']['count']==0 else 1)" \
  || { PK=$(AK GET "/core/users/?username=$TEST_USER" | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['pk'])"); AK DELETE "/core/users/$PK/" || true; }
CREATED=$(AK POST "/core/users/" "{\"username\": \"$TEST_USER\", \"name\": \"SSO E2E Test\", \"email\": \"$TEST_EMAIL\", \"type\": \"internal\", \"is_active\": true}")
PK=$(echo "$CREATED" | python3 -c "import json,sys; print(json.load(sys.stdin)['pk'])")
AK POST "/core/users/$PK/set_password/" "{\"password\": \"$TEST_PASS\"}" >/dev/null
echo "✓ user pk=$PK"

sso_login() { # drives /login → authentik flow → callback; echoes the final app redirect (with fragment)
  # 1. app /login → authorize URL (also sets oidc_txn cookie in the jar)
  AUTH_URL=$(curl -sf -c "$JAR" -o /dev/null -w '%{redirect_url}' "$APP/api/auth/oidc/login")
  # 2. hit authorize; authentik bounces to its flow UI
  FLOW_REDIRECT=$(curl -sk -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$AUTH_URL")
  # 3. drive the default authentication flow via the JSON executor
  FLOW_SLUG=$(echo "$FLOW_REDIRECT" | sed -n 's#.*/if/flow/\([^/]*\)/.*#\1#p')
  EXEC="$AK_PUBLIC/api/v3/flows/executor/$FLOW_SLUG/?query="
  # identification stage (may include password when the flow combines them)
  STAGE=$(curl -sk -b "$JAR" -c "$JAR" "$EXEC")
  COMPONENT=$(echo "$STAGE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('component',''))")
  if [ "$COMPONENT" = "ak-stage-identification" ]; then
    BODY=$(echo "$STAGE" | python3 -c "import json,sys; d=json.load(sys.stdin); import os; b={'uid_field': '$TEST_USER'};
b['password'] = '$TEST_PASS' if d.get('password_fields') else None
print(json.dumps({k:v for k,v in b.items() if v is not None}))")
    STAGE=$(curl -sk -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' -d "$BODY" "$EXEC")
    COMPONENT=$(echo "$STAGE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('component',''))")
  fi
  if [ "$COMPONENT" = "ak-stage-password" ]; then
    STAGE=$(curl -sk -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' -d "{\"password\": \"$TEST_PASS\"}" "$EXEC")
    COMPONENT=$(echo "$STAGE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('component',''))")
  fi
  # 4. flow completes with xak-flow-redirect back to authorize → follow to app callback
  TO=$(echo "$STAGE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('to',''))")
  [ -n "$TO" ] || { echo "❌ flow did not complete: $STAGE" >&2; return 1; }
  case "$TO" in /*) TO="$AK_PUBLIC$TO";; esac
  CALLBACK=$(curl -sk -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$TO")
  # 5. app callback → final redirect with #sso_token or #sso_error
  curl -sf -b "$JAR" -c "$JAR" -o /dev/null -w '%{redirect_url}' "$CALLBACK"
}

echo "=== 2. First SSO login → expect auto-provision as pending ==="
RESULT=$(sso_login)
echo "$RESULT" | grep -q 'sso_error=pending' && echo "✓ pending redirect" || { echo "❌ expected sso_error=pending, got: $RESULT"; exit 1; }
ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d expense_app -tc \\\"SELECT role, authentik_sub IS NOT NULL FROM users WHERE email='$TEST_EMAIL'\\\"\"" | grep -q 'pending' \
  && echo "✓ pending user provisioned with authentik_sub" || { echo "❌ provisioned row missing"; exit 1; }

echo "=== 3. Promote test user, second SSO login → expect JWT + /me ==="
ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d expense_app -c \\\"UPDATE users SET role='salesperson' WHERE email='$TEST_EMAIL'\\\"\""
rm -f "$JAR"; JAR=$(mktemp)
RESULT=$(sso_login)
echo "$RESULT" | grep -q 'sso_token=' || { echo "❌ expected sso_token, got: $RESULT"; exit 1; }
JWT=$(echo "$RESULT" | sed -n 's/.*sso_token=\([^&]*\).*/\1/p' | python3 -c "import sys,urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
ME=$(curl -sf -H "Authorization: Bearer $JWT" "$APP/api/auth/me")
echo "$ME" | grep -q "\"username\":\"$TEST_USER\"" && echo "✓ SSO JWT works against /api/auth/me" || { echo "❌ /me mismatch: $ME"; exit 1; }

echo "=== 4. Password login regression ==="
curl -sf -X POST -H 'Content-Type: application/json' -d '{"username":"__PWUSER__","password":"__PWPASS__"}' "$APP/api/auth/login" | grep -q '"token"' \
  && echo "✓ password login still works" || { echo "❌ password login broken"; exit 1; }

echo "=== 5. Cleanup ==="
AK DELETE "/core/users/$PK/" >/dev/null && echo "✓ authentik user deleted"
ssh "$PROXMOX" "pct exec $DB_CT -- su - postgres -c \"psql -d expense_app -c \\\"DELETE FROM users WHERE email='$TEST_EMAIL'\\\"\"" >/dev/null && echo "✓ app user deleted"
echo "ALL CHECKS PASSED"
```

Before running, replace `__PWUSER__`/`__PWPASS__` with a real credential for the target env (sandbox: `admin`/`sandbox123` from the login page's test-account list; prod: prompt the operator — do NOT hardcode a prod credential into the repo). The flow-executor stage handling may need iteration against the live 2026.2 flow (e.g. separate password stage, consent stage auto-skipped by the implicit-consent flow copied from payroll); adapt, re-run, commit fixes.

- [ ] **Step 3: Run it against sandbox**

```bash
chmod +x scripts/authentik/verify-sso-e2e.sh
./scripts/authentik/verify-sso-e2e.sh http://192.168.1.144 2600
```
Expected: `ALL CHECKS PASSED`. Also load `http://192.168.1.144` and confirm the login page shows the "Sign in with Authentik" button.

- [ ] **Step 4: Commit**

```bash
git add scripts/authentik/verify-sso-e2e.sh
git commit -m "test(sso): headless end-to-end SSO verification script"
```

---

### Task 11: Production deploy + verification

**Files:** none new (uses existing deploy scripts + Task 10's verifier).

- [ ] **Step 1: Back up the prod database**

```bash
ssh root@192.168.1.190 "pct exec 2320 -- su - postgres -c 'pg_dump expense_app | gzip > /tmp/expense_app_pre_2.16.0_$(date +%Y%m%d_%H%M%S).sql.gz && ls -lh /tmp/expense_app_pre_2.16.0_*.sql.gz'"
```
Expected: a non-trivially-sized dump file listed.

- [ ] **Step 2: Deploy backend and frontend**

```bash
./scripts/deploy-production-backend.sh
./scripts/deploy-production-frontend.sh
```
(The frontend script already handles the NPMplus cache clear on CT 104; verify its output says so, otherwise clear it per its instructions.) Confirm migration 036 applied and the service is healthy:

```bash
curl -sf https://expapp.duckdns.org/api/health
curl -sf https://expapp.duckdns.org/api/auth/oidc/status
```
Expected: healthy + `{"enabled":true}` (Task 9 already wrote prod env vars; if `enabled` is false, check `/opt/trade-show-app/backend/.env` on CT 2220 and restart).

- [ ] **Step 3: Run the E2E verifier against prod**

```bash
./scripts/authentik/verify-sso-e2e.sh https://expapp.duckdns.org 2320
```
Expected: `ALL CHECKS PASSED`, including password-login regression (use a prod credential supplied by the operator at run time).

- [ ] **Step 4: Report**

Summarize to the user: what was deployed, verification evidence, and that the system is ready for their merge list (`npm run link:authentik -- --file pairs.csv` dry-run first, then `--apply`).

---

## Post-plan notes for the executor

- Tasks 1–8 are pure local code work and must be done strictly TDD as written.
- Tasks 9–11 touch live infrastructure: Authentik's 2026.2 API or the flow executor may differ in details from the scripts as drafted — adapt the scripts, keep them idempotent, commit fixes, and never paste secrets into the repo or the conversation.
- The account-merge run itself (spec §4) happens AFTER Task 11, when the user supplies their list — it is intentionally not a task here.
