import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { userRepository } from '../database/repositories';

/** Platform-issued JWT payload (Core Platform contract) */
export interface PlatformJwtPayload {
  user_id: string;
  username: string;
  global_role: string;
  assigned_apps: string[];
  iat: number;
  exp: number;
}

/** Local app JWT payload (existing) */
export interface LocalJwtPayload {
  id: string;
  username: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
  /** Set when authenticated via platform JWT; undefined for local JWT */
  authSource?: 'local' | 'platform';
}

const APP_SLUG = process.env.APP_SLUG || 'trade-show';
const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production';
const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'token';

/**
 * Parse Cookie header and return value for given name, or null.
 */
export function getCookieValue(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1].trim()) : null;
}

/**
 * Get bearer token from Authorization header first, then from cookie.
 */
export function getToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (bearer) return bearer;
  return getCookieValue(req, JWT_COOKIE_NAME);
}

/**
 * Verify platform JWT and return decoded payload or null.
 * Validates signature (HS256), exp, iat, and required claims.
 */
export function tryVerifyPlatformJwt(token: string): PlatformJwtPayload | null {
  if (!PLATFORM_JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, PLATFORM_JWT_SECRET, {
      algorithms: ['HS256'],
      complete: false,
    }) as PlatformJwtPayload;
    if (
      typeof decoded.user_id !== 'string' ||
      typeof decoded.username !== 'string' ||
      typeof decoded.global_role !== 'string' ||
      !Array.isArray(decoded.assigned_apps) ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Authenticate request using either platform JWT (if configured and valid) or local JWT.
 * Platform path: valid token + assigned_apps includes APP_SLUG → resolve local user by username; if no local user → 403 no_local_user.
 * Local path: existing JWT verification unchanged.
 * Normalized errors for platform: 401 { detail: "unauthenticated" }, 403 { detail: "not_assigned_to_app" } or { detail: "no_local_user" }.
 */
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getToken(req);

  console.log(`[Auth:Middleware] Authentication check`, {
    hasToken: !!token,
    path: req.path,
    method: req.method,
    origin: req.get('origin'),
    ip: req.ip || req.socket.remoteAddress,
  });

  if (!token) {
    console.log(`[Auth:Middleware] No token provided for ${req.method} ${req.path}`);
    return res.status(401).json({ detail: 'unauthenticated', error: 'Access token required' });
  }

  void (async () => {
    try {
      // 1) Try platform JWT first when secret is configured
      if (PLATFORM_JWT_SECRET) {
        const platform = tryVerifyPlatformJwt(token);
        if (platform) {
          if (!platform.assigned_apps.includes(APP_SLUG)) {
            console.log(`[Auth:Middleware] Platform token valid but app "${APP_SLUG}" not in assigned_apps`);
            res.status(403).json({ detail: 'not_assigned_to_app' });
            return;
          }
          const localUser = await userRepository.findByUsernameSafe(platform.username);
          if (!localUser) {
            console.log(`[Auth:Middleware] Platform user "${platform.username}" has no local account`);
            res.status(403).json({
              detail: 'no_local_user',
              message: 'No local account linked. Please sign in with your app credentials to link your account.',
            });
            return;
          }
          req.user = {
            id: localUser.id,
            username: localUser.username,
            role: localUser.role,
          };
          req.authSource = 'platform';
          console.log(`[Auth:Middleware] Platform SSO verified`, {
            username: localUser.username,
            userId: localUser.id,
            path: req.path,
          });
          next();
          return;
        }
      }

      // 2) Local JWT (existing behavior)
      const decoded = jwt.verify(token, JWT_SECRET) as LocalJwtPayload;
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
      };
      req.authSource = 'local';
      console.log(`[Auth:Middleware] Token verified successfully`, {
        userId: decoded.id,
        username: decoded.username,
        role: decoded.role,
        path: req.path,
      });
      next();
    } catch (error: unknown) {
      if (res.headersSent) return;
      const err = error as { message?: string; name?: string };
      const isJwtError = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError';
      if (isJwtError) {
        console.error(`[Auth:Middleware] Token verification failed:`, { error: err.message, name: err.name, path: req.path, method: req.method });
        res.status(401).json({ detail: 'unauthenticated', error: 'Invalid or expired token' });
      } else {
        next(error);
      }
    }
  })();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log(`[Auth] Authorization check:`, {
      user: req.user,
      requiredRoles: roles,
      hasUser: !!req.user,
      userRole: req.user?.role,
      isAuthorized: req.user && roles.includes(req.user.role),
    });

    if (!req.user) {
      console.log(`[Auth] FAILED: No user in request`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      console.log(`[Auth] FAILED: User role "${req.user.role}" not in allowed roles:`, roles);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    console.log(`[Auth] SUCCESS: User authorized`);
    next();
  };
};

// Alias for convenience
export const authenticate = authenticateToken;
