/**
 * Sample Requests — /api/sample-requests
 *
 * "mine" handlers always target req.user; on-behalf handlers take the user
 * from the path and are gated to admin/coordinator/developer by authorize()
 * AND re-checked in the service. The summary is gated in the service only,
 * because the puller may hold any role.
 */
import express, { Response } from 'express';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { sampleRequestService } from '../services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../database/repositories/SampleRequestRepository';
import { SAMPLE_BRANDS, SampleBrand } from '../services/sampleRequests/types';

const router = express.Router();
router.use(authenticateToken);

const CATALOG_ROLES = ['admin', 'developer'];
const OVERRIDE_ROLES = ['admin', 'coordinator', 'developer'];

const cleanName = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 && s.length <= 120 ? s : null;
};
const patchFrom = (body: any) => ({
  name: body?.name === undefined ? undefined : cleanName(body.name) ?? undefined,
  is_active: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
});

// ── Catalog ───────────────────────────────────────────────────────────────
export async function handleGetCatalog(req: AuthRequest, res: Response): Promise<void> {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json(await sampleRequestRepository.getCatalog(includeInactive));
}

export async function handleCreateLine(req: AuthRequest, res: Response): Promise<void> {
  const brand = req.body?.brand;
  const name = cleanName(req.body?.name);
  if (!(SAMPLE_BRANDS as readonly string[]).includes(brand) || !name) {
    res.status(400).json({ error: 'brand (haute_brands|boomin_brands) and name are required' });
    return;
  }
  res.status(201).json(await sampleRequestRepository.createLine({ brand: brand as SampleBrand, name }));
}

export async function handleUpdateLine(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateLine(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Product line not found' }); return; }
  res.json(row);
}

export async function handleCreateProduct(req: AuthRequest, res: Response): Promise<void> {
  const productLineId = typeof req.body?.productLineId === 'string' ? req.body.productLineId : '';
  const name = cleanName(req.body?.name);
  if (!productLineId || !name) { res.status(400).json({ error: 'productLineId and name are required' }); return; }
  res.status(201).json(await sampleRequestRepository.createProduct({ product_line_id: productLineId, name }));
}

export async function handleUpdateProduct(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateProduct(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Product not found' }); return; }
  res.json(row);
}

export async function handleCreateMaterial(req: AuthRequest, res: Response): Promise<void> {
  const name = cleanName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  res.status(201).json(await sampleRequestRepository.createMaterial({ name }));
}

export async function handleUpdateMaterial(req: AuthRequest, res: Response): Promise<void> {
  const row = await sampleRequestRepository.updateMaterial(req.params.id, patchFrom(req.body));
  if (!row) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(row);
}

export async function handleReorder(req: AuthRequest, res: Response): Promise<void> {
  const kind = req.body?.kind;
  const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.filter((v: unknown) => typeof v === 'string') : [];
  if (!['lines', 'products', 'materials'].includes(kind) || ids.length === 0) {
    res.status(400).json({ error: 'kind (lines|products|materials) and orderedIds are required' });
    return;
  }
  await sampleRequestRepository.reorder(kind, ids);
  res.json({ ok: true });
}

// ── Requests ──────────────────────────────────────────────────────────────
export async function handleListMine(req: AuthRequest, res: Response): Promise<void> {
  res.json({ requests: await sampleRequestService.listMyOpenRequests(req.user!.id) });
}

export async function handleAccess(req: AuthRequest, res: Response): Promise<void> {
  res.json({ canViewSummary: await sampleRequestService.canViewSummary(req.user!) });
}

export async function handleGetMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getRequest(req.params.eventId, req.user!.id, req.user!));
}

export async function handleSaveMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.saveDraft(req.params.eventId, req.user!.id, req.body, req.user!));
}

export async function handleSubmitMine(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.submit(req.params.eventId, req.user!.id, req.user!));
}

export async function handleGetForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getRequest(req.params.eventId, req.params.userId, req.user!));
}

export async function handleSaveForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.saveDraft(req.params.eventId, req.params.userId, req.body, req.user!));
}

export async function handleSubmitForUser(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.submit(req.params.eventId, req.params.userId, req.user!));
}

export async function handleGetSummary(req: AuthRequest, res: Response): Promise<void> {
  res.json(await sampleRequestService.getEventSummary(req.params.eventId, req.user!));
}

router.get('/catalog', asyncHandler(handleGetCatalog));
router.post('/catalog/lines', authorize(...CATALOG_ROLES), asyncHandler(handleCreateLine));
router.put('/catalog/lines/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateLine));
router.post('/catalog/products', authorize(...CATALOG_ROLES), asyncHandler(handleCreateProduct));
router.put('/catalog/products/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateProduct));
router.post('/catalog/materials', authorize(...CATALOG_ROLES), asyncHandler(handleCreateMaterial));
router.put('/catalog/materials/:id', authorize(...CATALOG_ROLES), asyncHandler(handleUpdateMaterial));
router.put('/catalog/reorder', authorize(...CATALOG_ROLES), asyncHandler(handleReorder));

router.get('/mine', asyncHandler(handleListMine));
router.get('/access', asyncHandler(handleAccess));
router.get('/:eventId/mine', asyncHandler(handleGetMine));
router.put('/:eventId/mine', asyncHandler(handleSaveMine));
router.post('/:eventId/mine/submit', asyncHandler(handleSubmitMine));
router.get('/:eventId/summary', asyncHandler(handleGetSummary));
router.get('/:eventId/users/:userId', authorize(...OVERRIDE_ROLES), asyncHandler(handleGetForUser));
router.put('/:eventId/users/:userId', authorize(...OVERRIDE_ROLES), asyncHandler(handleSaveForUser));
router.post('/:eventId/users/:userId/submit', authorize(...OVERRIDE_ROLES), asyncHandler(handleSubmitForUser));

export default router;
