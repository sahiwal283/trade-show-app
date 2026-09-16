/**
 * Badge Scan Routes — /api/badge-scans
 *
 * PDF417 attendee badges captured at the booth. eventId is required on list:
 * scans are event-scoped, and an unscoped list would hand any rep every lead
 * the company has ever collected.
 *
 * Handlers are exported by name so tests can call them with a mock req/res,
 * matching routes/auth.ts.
 */

import express, { Response } from 'express';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { badgeScanService } from '../services/badge/BadgeScanService';
import { badgeExportService } from '../services/badge/BadgeExportService';
import { SCAN_ROLES } from '../config/badgeScanRoles';

const router = express.Router();

router.use(authenticateToken);

/** Only strings survive: Express gives arrays for repeated query params. */
const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export async function handleCreateScan(req: AuthRequest, res: Response): Promise<void> {
  // scanned_by comes from the token, never from the body.
  const scan = await badgeScanService.create(req.body, req.user!.id);
  res.status(201).json(scan);
}

export async function handleListScans(req: AuthRequest, res: Response): Promise<void> {
  const eventId = asString(req.query.eventId);
  if (!eventId) {
    res.status(400).json({
      error: 'eventId is required',
      details: 'Badge scans are event-scoped; pass ?eventId=<uuid>',
    });
    return;
  }
  const scans = await badgeScanService.list({
    eventId,
    entity: asString(req.query.entity),
    crmStatus: asString(req.query.crmStatus),
    q: asString(req.query.q),
  });
  res.json({ scans, count: scans.length });
}

export async function handlePatchScan(req: AuthRequest, res: Response): Promise<void> {
  const scan = await badgeScanService.update(req.params.id, req.body);
  res.json(scan);
}

export async function handleExportScans(req: AuthRequest, res: Response): Promise<void> {
  const eventId = asString(req.query.eventId);
  if (!eventId) {
    res.status(400).json({ error: 'eventId is required' });
    return;
  }
  const scans = await badgeScanService.list({ eventId, entity: asString(req.query.entity) });
  const stamp = new Date().toISOString().slice(0, 10);

  if (asString(req.query.format) === 'xlsx') {
    const buffer = await badgeExportService.toXlsx(scans);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${stamp}.xlsx"`);
    res.send(buffer);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${stamp}.csv"`);
  res.send(badgeExportService.toCsv(scans));
}

export async function handleGetScan(req: AuthRequest, res: Response): Promise<void> {
  const scan = await badgeScanService.getById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Badge scan not found' });
    return;
  }
  res.json(scan);
}

export async function handleRetryPush(req: AuthRequest, res: Response): Promise<void> {
  res.json(await badgeScanService.requeueForCrm(req.params.id));
}

router.post('/', authorize(...SCAN_ROLES), asyncHandler(handleCreateScan as any));
router.get('/', authorize(...SCAN_ROLES), asyncHandler(handleListScans as any));
router.get('/export', authorize(...SCAN_ROLES), asyncHandler(handleExportScans as any));
router.get('/:id', authorize(...SCAN_ROLES), asyncHandler(handleGetScan as any));
router.post('/:id/push', authorize(...SCAN_ROLES), asyncHandler(handleRetryPush as any));
router.patch('/:id', authorize(...SCAN_ROLES), asyncHandler(handlePatchScan as any));

export default router;
