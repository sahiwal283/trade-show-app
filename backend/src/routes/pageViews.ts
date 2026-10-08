/**
 * Screen-view beacon — /api/page-views
 * The handler is exported by name so tests call it with a mock req/res.
 */
import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { pageViewRepository } from '../database/repositories';

const router = express.Router();
router.use(authenticateToken);

const PAGE_PATTERN = /^[a-z0-9-]{1,64}$/;

export async function handleRecordPageView(req: AuthRequest, res: Response): Promise<void> {
  const { page, device } = req.body ?? {};
  if (typeof page !== 'string' || !PAGE_PATTERN.test(page)) {
    res.status(400).json({ error: 'page must be a screen id of lowercase letters, digits and hyphens' });
    return;
  }
  if (device !== 'mobile' && device !== 'desktop') {
    res.status(400).json({ error: 'device must be mobile or desktop' });
    return;
  }

  // Bookkeeping: a failed write must never surface to the person using the app.
  pageViewRepository.record(req.user!.id, page, device).catch((error) => {
    console.error('[PageViews] Failed to record view:', error);
  });
  res.status(204).end();
}

router.post('/', asyncHandler(handleRecordPageView));

export default router;
