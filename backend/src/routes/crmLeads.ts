/**
 * CRM Leads Routes
 *
 * Zoho CRM tradeshow leads, synced into crm_leads by ZohoCrmLeadsService:
 *   - GET  /status    — connection state + lead/converted counts + last sync
 *   - POST /sync      — manual full sync (503 while CRM is not connected)
 *   - POST /reconcile — match leads against Zoho Books customers/invoices
 *                       (LeadConversionService; 503 when the shared Zoho
 *                       integration service is unreachable)
 *   - GET  /by-show   — lead/converted/opened/bounced counts + converted
 *                       revenue per (show_key, year), keyed the same way as
 *                       the show_summaries tiles
 *   - GET  /owners    — per-rep lead counts split by show/year (frontend
 *                       aggregates to its current scope)
 */

import { Router, Response } from 'express';
import { authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { zohoCrmLeadsService } from '../services/ZohoCrmLeadsService';
import {
  leadConversionService,
  ZohoServiceUnreachableError,
} from '../services/LeadConversionService';

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

router.post(
  '/reconcile',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    try {
      const summary = await leadConversionService.reconcile();
      res.json({ success: true, ...summary });
    } catch (error) {
      if (error instanceof ZohoServiceUnreachableError) {
        res.status(503).json({
          error: 'Zoho service unreachable',
          message:
            'The Zoho integration service could not be reached — lead conversion matching ' +
            'will retry automatically on the nightly pass.',
        });
        return;
      }
      throw error;
    }
  })
);

router.get(
  '/owners',
  authorize('admin', 'accountant', 'developer'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(await zohoCrmLeadsService.byOwner());
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
