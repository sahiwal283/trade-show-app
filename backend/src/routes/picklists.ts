/**
 * GET /api/picklists — categories, payment methods, and companies for the
 * expense entry UI. See services/picklists/PicklistService for sourcing rules.
 */

import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getPicklists, PicklistsUnavailableError } from '../services/picklists/PicklistService';

const router = Router();

router.use(authenticateToken);

router.get('/', async (_req: AuthRequest, res) => {
  try {
    res.json(await getPicklists());
  } catch (error) {
    if (error instanceof PicklistsUnavailableError) {
      // 503, not 500: the dependency is down, the request was fine, and a
      // retry may succeed. The client blocks expense submission on this.
      return res.status(503).json({
        error:
          'Expense categories and cards are temporarily unavailable. Please try again shortly.',
        code: error.code,
      });
    }
    console.error('[Picklists] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
