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
