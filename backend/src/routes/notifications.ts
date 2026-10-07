/**
 * General in-app notifications — /api/notifications
 * Handlers are exported by name so tests call them with a mock req/res.
 */
import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { notificationService } from '../services/NotificationService';
import { isValidUuid } from '../utils/uuid';

const router = express.Router();
router.use(authenticateToken);

export async function handleListUnread(req: AuthRequest, res: Response): Promise<void> {
  const notifications = await notificationService.listUnread(req.user!.id);
  res.json({ notifications });
}

export async function handleMarkRead(req: AuthRequest, res: Response): Promise<void> {
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'ids must be an array of notification ids' });
    return;
  }
  const ids = raw.filter(isValidUuid);
  const updated = await notificationService.markRead(req.user!.id, ids);
  res.json({ updated });
}

export async function handleMarkAllRead(req: AuthRequest, res: Response): Promise<void> {
  const updated = await notificationService.markAllRead(req.user!.id);
  res.json({ updated });
}

router.get('/unread', asyncHandler(handleListUnread));
router.post('/read', asyncHandler(handleMarkRead));
router.post('/read-all', asyncHandler(handleMarkAllRead));

export default router;
