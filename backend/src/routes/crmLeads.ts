/**
 * CRM Leads Routes
 *
 * Zoho CRM tradeshow leads, synced into crm_leads by ZohoCrmLeadsService:
 *   - GET  /status   — connection state + lead count + last sync time
 *   - POST /sync     — manual full sync (503 while CRM is not connected)
 *   - GET  /by-show  — lead/converted/opened counts per (show_key, year),
 *                      keyed the same way as the show_summaries tiles
 */

import { Router, Response } from 'express';
import { authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { zohoCrmLeadsService } from '../services/ZohoCrmLeadsService';

const router = Router();

router.get(
  '/status',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await zohoCrmLeadsService.status());
  })
);

router.post(
  '/sync',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    if (!zohoCrmLeadsService.isConnected()) {
      res.status(503).json({
        error: 'CRM not connected',
        message:
          'Zoho CRM is not connected yet — set ZOHO_CRM_REFRESH_TOKEN to enable lead sync.',
      });
      return;
    }
    const summary = await zohoCrmLeadsService.syncLeads();
    res.json({ success: true, ...summary });
  })
);

router.get(
  '/by-show',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(await zohoCrmLeadsService.byShow());
  })
);

export default router;
