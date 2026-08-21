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
      // Only retry on the username uniqueness constraint; some drivers omit
      // `constraint` on the error, in which case keep retrying as before to
      // avoid regressing. Any other named constraint (e.g. email) rethrows.
      if (error?.code === '23505' && (error?.constraint === undefined || error?.constraint === 'users_username_key')) {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[OIDC] could not provision a unique username for ${email}`);
}
