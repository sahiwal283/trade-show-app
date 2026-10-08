/**
 * Developer dashboard — /api/dev-dashboard
 * One read endpoint per tab. Each fails on its own: an error goes to the
 * error handler as a 500 and the other tabs keep working.
 */
import express, { Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { parseTimeRange } from '../services/devDashboard/timeRange';
import { getOverview } from '../services/devDashboard/overview';
import { getApiAnalytics } from '../services/devDashboard/apiAnalytics';
import { getUsage } from '../services/devDashboard/usage';
import { getSessions } from '../services/devDashboard/sessions';
import { getAuditLogs, parseAuditQuery } from '../services/devDashboard/auditLog';

const router = express.Router();

export function requireDashboardRole(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'developer')) {
    res.status(403).json({ error: 'Admin or developer access required' });
    return;
  }
  next();
}

router.use(authenticateToken);
router.use(requireDashboardRole);

router.get('/overview', asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await getOverview());
}));

router.get('/api-analytics', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getApiAnalytics(parseTimeRange(req.query.timeRange)));
}));

router.get('/usage', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getUsage(parseTimeRange(req.query.timeRange)));
}));

router.get('/sessions', asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await getSessions());
}));

router.get('/audit-logs', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await getAuditLogs(parseAuditQuery(req.query as Record<string, unknown>)));
}));

// The generic error handler masks err.message outside development. This
// surface is admin/developer only and exists to show what is broken, so a
// failing tab reports the real error (e.g. "permission denied for table X").
export function dashboardErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  console.error('[DevDashboard]', err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
}

router.use(dashboardErrorHandler);

export default router;
