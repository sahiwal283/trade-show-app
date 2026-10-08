/**
 * Automatic audit trail: one audit_logs row for every write under /api.
 *
 * Records who, what path, the outcome and where from. Never the request
 * body. The row is written after the response has gone out and its failure
 * is swallowed, so auditing can never fail or slow a request.
 *
 * Login, failed login and logout are written by logAuth (it knows why a
 * login failed), so /api/auth is skipped here to avoid double rows.
 */
import net from 'net';
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { logAudit } from '../utils/auditLogger';
import { normalizeEndpoint } from './apiRequestLogger';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIPPED_PREFIXES = ['/api/auth/', '/api/push/', '/api/midas/'];
const SKIPPED_PATHS = new Set(['/api/page-views']);

const ACTION_MAX = 100; // audit_logs.action VARCHAR(100)
const PATH_MAX = 500; // audit_logs.request_path VARCHAR(500)

export function shouldAudit(method: string, path: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  // Express routing is case-insensitive, so the skip checks must be too.
  const clean = (path.length > 1 ? path.replace(/\/+$/, '') : path).toLowerCase();
  if (!clean.startsWith('/api/')) return false;
  if (SKIPPED_PATHS.has(clean)) return false;
  return !SKIPPED_PREFIXES.some((prefix) => `${clean}/`.startsWith(prefix));
}

export function auditStatus(statusCode: number): 'success' | 'warning' | 'failure' {
  if (statusCode >= 500) return 'failure';
  if (statusCode >= 400) return 'warning';
  return 'success';
}

/**
 * audit_logs.ip_address is INET where the migrations created the table and
 * VARCHAR where the table predates them. Either way, anything that is not an
 * IP becomes null: INET would reject it, and VARCHAR should not hold it.
 *
 * The leftmost X-Forwarded-For entry is client-controlled and the app does not
 * set `trust proxy`, so it cannot be believed. Prefer X-Real-IP, then the LAST
 * forwarded entry (the one the trusted proxy appended), then the socket values.
 */
export function clientIp(req: AuthRequest): string | undefined {
  const last = (value: string | string[] | undefined): string | undefined => {
    const raw = Array.isArray(value) ? value[value.length - 1] : value;
    return raw?.split(',').pop()?.trim();
  };
  const candidates = [
    last(req.headers['x-real-ip']),
    last(req.headers['x-forwarded-for']),
    req.ip,
    req.socket?.remoteAddress,
  ];
  return candidates.find((c): c is string => !!c && net.isIP(c) !== 0);
}

export const auditTrail = (req: AuthRequest, res: Response, next: NextFunction) => {
  const path = (req.originalUrl || '').split('?')[0];
  if (!shouldAudit(req.method, path)) return next();

  let errorMessage: string | undefined;
  const originalJson = res.json.bind(res);
  res.json = function (body: any): Response {
    if (res.statusCode >= 400 && body && body.error) {
      try {
        errorMessage = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      } catch {
        errorMessage = 'Unserializable error';
      }
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    try {
      // req.user is set by the route's own authenticateToken, which has run by now.
      logAudit({
        userId: req.user?.id,
        userName: req.user?.username,
        userRole: req.user?.role,
        action: `${req.method} ${normalizeEndpoint(path)}`.slice(0, ACTION_MAX),
        status: auditStatus(res.statusCode),
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'],
        requestMethod: req.method,
        requestPath: path.slice(0, PATH_MAX),
        errorMessage,
      }).catch(() => {});
    } catch {
      // Auditing must never throw out of the emitter.
    }
  });

  next();
};
