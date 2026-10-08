import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

const getOverview = vi.fn();
const getApiAnalytics = vi.fn();
const getUsage = vi.fn();
const getSessions = vi.fn();
const getAuditLogs = vi.fn();

vi.mock('../../src/services/devDashboard/overview', () => ({ getOverview: () => getOverview() }));
vi.mock('../../src/services/devDashboard/apiAnalytics', () => ({ getApiAnalytics: (r: string) => getApiAnalytics(r) }));
vi.mock('../../src/services/devDashboard/usage', () => ({ getUsage: (r: string) => getUsage(r) }));
vi.mock('../../src/services/devDashboard/sessions', () => ({ getSessions: () => getSessions() }));
vi.mock('../../src/services/devDashboard/auditLog', async (original) => ({
  ...(await original<typeof import('../../src/services/devDashboard/auditLog')>()),
  getAuditLogs: (q: unknown) => getAuditLogs(q),
}));

import router, { requireDashboardRole } from '../../src/routes/devDashboard';
import { routeHandler } from '../helpers/routeHandler';

const mockRes = () => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res;
};

// asyncHandler returns before the handler's promise settles, so let it finish.
const call = async (path: string, req: unknown, res: unknown, next = vi.fn()) => {
  routeHandler(router, 'get', path)(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
};

describe('dev dashboard routes', () => {
  beforeEach(() => { [getOverview, getApiAnalytics, getUsage, getSessions, getAuditLogs].forEach((m) => m.mockReset()); });

  it('exposes exactly the five read endpoints', () => {
    const surface = (router as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
      .sort();
    expect(surface).toEqual([
      'GET /api-analytics', 'GET /audit-logs', 'GET /overview', 'GET /sessions', 'GET /usage',
    ]);
  });

  it.each(['admin', 'developer'])('lets %s in', (role) => {
    const next = vi.fn();
    requireDashboardRole({ user: { id: 'u', username: 'u', role } } as any, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it.each(['salesperson', 'coordinator', 'accountant', 'temporary', 'pending'])('refuses %s with 403', (role) => {
    const next = vi.fn();
    const res = mockRes();
    requireDashboardRole({ user: { id: 'u', username: 'u', role } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a request with no user', () => {
    const res = mockRes();
    requireDashboardRole({} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('passes a valid range through and replaces a bad one with 24h', async () => {
    getApiAnalytics.mockResolvedValue({ ok: true });
    getUsage.mockResolvedValue({ ok: true });
    await call('/api-analytics', { query: { timeRange: '7d' } }, mockRes());
    await call('/usage', { query: { timeRange: 'forever' } }, mockRes());
    expect(getApiAnalytics).toHaveBeenCalledWith('7d');
    expect(getUsage).toHaveBeenCalledWith('24h');
  });

  it('parses the audit filters before querying', async () => {
    getAuditLogs.mockResolvedValue({ logs: [], total: 0 });
    const res = mockRes();
    await call('/audit-logs', { query: { limit: '9999', method: 'delete' } }, res);
    expect(getAuditLogs).toHaveBeenCalledWith({ timeRange: '24h', limit: 200, offset: 0, method: 'DELETE' });
    expect(res.json).toHaveBeenCalledWith({ logs: [], total: 0 });
  });

  it('hands a service failure to the error handler rather than answering with empty data', async () => {
    getSessions.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    const next = await call('/sessions', { query: {} }, res);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    expect(res.json).not.toHaveBeenCalled();
  });
});
