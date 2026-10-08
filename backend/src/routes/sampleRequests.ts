/**
 * Sample Requests — /api/sample-requests
 *
 * One shared request per event. Every handler passes req.user as the actor and
 * the service decides who may view or edit; an unknown event is a 404 from the
 * service. `/catalog` and `/mine` are registered before `/:eventId`.
 */
import express, { Response } from 'express';
import { authenticateToken, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/errors';
import { sampleRequestService } from '../services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../database/repositories/SampleRequestRepository';
import { SAMPLE_BRANDS, SampleBrand } from '../services/sampleRequests/types';
import { isValidUuid } from '../utils/uuid';

const router = express.Router();
router.use(authenticateToken);

const CATALOG_ROLES = ['admin', 'developer'];

const cleanName = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 && s.length <= 120 ? s : null;
};

/**
 * Validate and extract patch fields from body.
 * Returns { name, is_active } or null if patch is invalid.
 * Invalid patch: missing both fields, name is present but invalid, isActive is present but not boolean.
 */
const validatePatch = (body: any): { name?: string; is_active?: boolean } | null => {
  const hasName = 'name' in body;
  const hasIsActive = 'isActive' in body;

  // Empty patch: neither field provided
  if (!hasName && !hasIsActive) {
    return null;
  }

  const patch: { name?: string; is_active?: boolean } = {};

  // Validate name if present
  if (hasName) {
    const cleanedName = cleanName(body.name);
    if (cleanedName === null) {
      return null; // Invalid name
    }
    patch.name = cleanedName;
  }

  // Validate isActive if present
  if (hasIsActive) {
    if (typeof body.isActive !== 'boolean') {
      return null; // Invalid isActive
    }
    patch.is_active = body.isActive;
  }

  return patch;
};

// ── Catalog ───────────────────────────────────────────────────────────────
const DUPLICATE = Symbol('duplicate');
/** Runs a catalog create/rename; a unique-name violation (pg 23505) answers 409 instead of 500. */
async function catalogWrite<T>(res: Response, fn: () => Promise<T>): Promise<T | typeof DUPLICATE> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== '23505') throw e;
    res.status(409).json({ error: 'A row with that name already exists' });
    return DUPLICATE;
  }
}

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
  const row = await catalogWrite(res, () => sampleRequestRepository.createLine({ brand: brand as SampleBrand, name }));
  if (row === DUPLICATE) return;
  res.status(201).json(row);
}

export async function handleUpdateLine(req: AuthRequest, res: Response): Promise<void> {
  if (!isValidUuid(req.params.id)) { res.status(400).json({ error: 'id must be a valid UUID' }); return; }
  const patch = validatePatch(req.body);
  if (patch === null) { res.status(400).json({ error: 'patch must contain name and/or isActive with valid values' }); return; }
  const row = await catalogWrite(res, () => sampleRequestRepository.updateLine(req.params.id, patch));
  if (row === DUPLICATE) return;
  if (!row) { res.status(404).json({ error: 'Product line not found' }); return; }
  res.json(row);
}

export async function handleCreateProduct(req: AuthRequest, res: Response): Promise<void> {
  const productLineId = req.body?.productLineId;
  const name = cleanName(req.body?.name);
  if (!isValidUuid(productLineId) || !name) { res.status(400).json({ error: 'productLineId (UUID) and name are required' }); return; }
  const row = await catalogWrite(res, () => sampleRequestRepository.createProduct({ product_line_id: productLineId, name }));
  if (row === DUPLICATE) return;
  res.status(201).json(row);
}

export async function handleUpdateProduct(req: AuthRequest, res: Response): Promise<void> {
  if (!isValidUuid(req.params.id)) { res.status(400).json({ error: 'id must be a valid UUID' }); return; }
  const patch = validatePatch(req.body);
  if (patch === null) { res.status(400).json({ error: 'patch must contain name and/or isActive with valid values' }); return; }
  const row = await catalogWrite(res, () => sampleRequestRepository.updateProduct(req.params.id, patch));
  if (row === DUPLICATE) return;
  if (!row) { res.status(404).json({ error: 'Product not found' }); return; }
  res.json(row);
}

export async function handleCreateMaterial(req: AuthRequest, res: Response): Promise<void> {
  const name = cleanName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const row = await catalogWrite(res, () => sampleRequestRepository.createMaterial({ name }));
  if (row === DUPLICATE) return;
  res.status(201).json(row);
}

export async function handleUpdateMaterial(req: AuthRequest, res: Response): Promise<void> {
  if (!isValidUuid(req.params.id)) { res.status(400).json({ error: 'id must be a valid UUID' }); return; }
  const patch = validatePatch(req.body);
  if (patch === null) { res.status(400).json({ error: 'patch must contain name and/or isActive with valid values' }); return; }
  const row = await catalogWrite(res, () => sampleRequestRepository.updateMaterial(req.params.id, patch));
  if (row === DUPLICATE) return;
  if (!row) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(row);
}

export async function handleReorder(req: AuthRequest, res: Response): Promise<void> {
  const kind = req.body?.kind;
  const orderedIds = req.body?.orderedIds;

  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'orderedIds must be an array' });
    return;
  }

  // Validate all IDs are valid UUIDs
  if (!orderedIds.every(isValidUuid)) {
    res.status(400).json({ error: 'all orderedIds must be valid UUIDs' });
    return;
  }

  if (!['lines', 'products', 'materials'].includes(kind) || orderedIds.length === 0) {
    res.status(400).json({ error: 'kind (lines|products|materials) and orderedIds are required' });
    return;
  }

  await sampleRequestRepository.reorder(kind, orderedIds);
  res.json({ ok: true });
}

// ── Requests ──────────────────────────────────────────────────────────────
/** 400s (and returns false) unless the eventId path param is a UUID, so a bad id never reaches pg. */
const hasValidIds = (req: AuthRequest, res: Response): boolean => {
  if (isValidUuid(req.params.eventId)) return true;
  res.status(400).json({ error: 'Invalid id' });
  return false;
};

export async function handleListMine(req: AuthRequest, res: Response): Promise<void> {
  res.json({ requests: await sampleRequestService.listMyOpenRequests(req.user!.id) });
}

export async function handleEventAccess(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  // canViewSamples 404s an unknown event; let that propagate rather than answering false.
  const canView = await sampleRequestService.canViewSamples(req.params.eventId, req.user!);
  const canEdit = canView ? await sampleRequestService.canEditSamples(req.params.eventId, req.user!) : false;
  res.json({ canView, canEdit });
}

export async function handleGetEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.getForEvent(req.params.eventId, req.user!));
}

export async function handlePatchEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.patchRows(req.params.eventId, req.body, req.user!));
}

export async function handleSubmitEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json(await sampleRequestService.submit(req.params.eventId, req.user!));
}

export async function handleGetHistory(req: AuthRequest, res: Response): Promise<void> {
  if (!hasValidIds(req, res)) return;
  res.json({ changes: await sampleRequestService.getHistory(req.params.eventId, req.user!) });
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
router.get('/:eventId/access', asyncHandler(handleEventAccess));
router.get('/:eventId', asyncHandler(handleGetEvent));
router.patch('/:eventId', asyncHandler(handlePatchEvent));
router.post('/:eventId/submit', asyncHandler(handleSubmitEvent));
router.get('/:eventId/history', asyncHandler(handleGetHistory));

export default router;
