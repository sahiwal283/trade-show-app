import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: {
    getForEvent: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true }, canEdit: true })),
    patchRows: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true }, canEdit: true })),
    submit: vi.fn(async () => ({ request: { id: 'r', status: 'submitted' }, window: { isOpen: true }, canEdit: true })),
    getHistory: vi.fn(async () => [{ id: 'c-1' }]),
    listMyOpenRequests: vi.fn(async () => [{ eventId: 'ev-1' }]),
    canViewSamples: vi.fn(async () => true),
    canEditSamples: vi.fn(async () => false),
  },
}));
vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({ lines: [], products: [], materials: [] })),
    createLine: vi.fn(async (d: any) => ({ id: 'l-1', ...d })),
    updateLine: vi.fn(async (id: string, p: any) => ({ id, ...p })),
    createProduct: vi.fn(async (d: any) => ({ id: 'p-1', ...d })),
    updateProduct: vi.fn(async () => null),
    createMaterial: vi.fn(async (d: any) => ({ id: 'm-1', ...d })),
    updateMaterial: vi.fn(async (id: string, p: any) => ({ id, ...p })),
    reorder: vi.fn(async () => undefined),
  },
}));

import router, {
  handleGetCatalog, handleCreateLine, handleUpdateLine, handleCreateProduct, handleUpdateProduct,
  handleCreateMaterial, handleUpdateMaterial, handleReorder,
  handleListMine, handleGetEvent, handlePatchEvent, handleSubmitEvent, handleGetHistory, handleEventAccess,
} from '../../src/routes/sampleRequests';
import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
  };
}
const rep = { id: 'u-1', role: 'salesperson' };
const validUuid = '550e8400-e29b-41d4-a716-446655440000';
const EV = '6f1c2b1e-3a4d-4c5e-8f90-1a2b3c4d5e6f';

describe('sample request routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('catalog hides inactive rows unless asked', async () => {
    await handleGetCatalog({ user: rep, query: {} } as any, mockRes());
    expect(sampleRequestRepository.getCatalog).toHaveBeenCalledWith(false);
    await handleGetCatalog({ user: rep, query: { includeInactive: '1' } } as any, mockRes());
    expect(sampleRequestRepository.getCatalog).toHaveBeenCalledWith(true);
  });

  it('rejects a line with an unknown brand or blank name', async () => {
    const res = mockRes();
    await handleCreateLine({ user: rep, body: { brand: 'acme', name: 'X' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await handleCreateLine({ user: rep, body: { brand: 'haute_brands', name: '  ' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.createLine).not.toHaveBeenCalled();
  });

  it('creates a line with a trimmed name', async () => {
    const res = mockRes();
    await handleCreateLine({ user: rep, body: { brand: 'haute_brands', name: ' Oh! Mit ' } } as any, res);
    expect(sampleRequestRepository.createLine).toHaveBeenCalledWith({ brand: 'haute_brands', name: 'Oh! Mit' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('update line 400 on non-UUID id', async () => {
    const res = mockRes();
    await handleUpdateLine({ user: rep, params: { id: 'not-a-uuid' }, body: { name: 'X' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateLine).not.toHaveBeenCalled();
  });

  it('update line 400 on blank name', async () => {
    const res = mockRes();
    await handleUpdateLine({ user: rep, params: { id: validUuid }, body: { name: '  ' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateLine).not.toHaveBeenCalled();
  });

  it('update line 400 on non-boolean isActive', async () => {
    const res = mockRes();
    await handleUpdateLine({ user: rep, params: { id: validUuid }, body: { isActive: 'true' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateLine).not.toHaveBeenCalled();
  });

  it('update line 400 on empty patch', async () => {
    const res = mockRes();
    await handleUpdateLine({ user: rep, params: { id: validUuid }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateLine).not.toHaveBeenCalled();
  });

  it('409s a duplicate catalog name instead of a 500', async () => {
    vi.mocked(sampleRequestRepository.createLine).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = mockRes();
    await handleCreateLine({ user: rep, body: { brand: 'haute_brands', name: 'Peelz' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'A row with that name already exists' });
  });

  it('409s a rename onto an existing name, and rethrows other errors', async () => {
    vi.mocked(sampleRequestRepository.updateMaterial).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = mockRes();
    await handleUpdateMaterial({ user: rep, params: { id: validUuid }, body: { name: 'Banner' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(409);
    vi.mocked(sampleRequestRepository.updateMaterial).mockRejectedValueOnce(new Error('boom'));
    await expect(handleUpdateMaterial({ user: rep, params: { id: validUuid }, body: { name: 'Banner' } } as any, mockRes())).rejects.toThrow('boom');
  });

  it('creates a product with valid UUID productLineId', async () => {
    const res = mockRes();
    await handleCreateProduct({ user: rep, body: { productLineId: validUuid, name: 'Product' } } as any, res);
    expect(sampleRequestRepository.createProduct).toHaveBeenCalledWith({ product_line_id: validUuid, name: 'Product' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('create product 400 on non-UUID productLineId', async () => {
    const res = mockRes();
    await handleCreateProduct({ user: rep, body: { productLineId: 'not-uuid', name: 'Product' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.createProduct).not.toHaveBeenCalled();
  });

  it('update product 400 on non-UUID id', async () => {
    const res = mockRes();
    await handleUpdateProduct({ user: rep, params: { id: 'nope' }, body: { isActive: false } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateProduct).not.toHaveBeenCalled();
  });

  it('update product 400 on empty patch', async () => {
    const res = mockRes();
    await handleUpdateProduct({ user: rep, params: { id: validUuid }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateProduct).not.toHaveBeenCalled();
  });

  it('creates a material with valid name', async () => {
    const res = mockRes();
    await handleCreateMaterial({ user: rep, body: { name: 'Material' } } as any, res);
    expect(sampleRequestRepository.createMaterial).toHaveBeenCalledWith({ name: 'Material' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('update material 400 on non-UUID id', async () => {
    const res = mockRes();
    await handleUpdateMaterial({ user: rep, params: { id: 'invalid' }, body: { name: 'X' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateMaterial).not.toHaveBeenCalled();
  });

  it('update material 400 on empty patch', async () => {
    const res = mockRes();
    await handleUpdateMaterial({ user: rep, params: { id: validUuid }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.updateMaterial).not.toHaveBeenCalled();
  });

  it('reorder 400 on non-UUID entry', async () => {
    const res = mockRes();
    await handleReorder({ user: rep, body: { kind: 'products', orderedIds: [validUuid, 'not-a-uuid'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sampleRequestRepository.reorder).not.toHaveBeenCalled();
  });

  it('reorder succeeds with valid UUIDs', async () => {
    const res = mockRes();
    const id1 = '550e8400-e29b-41d4-a716-446655440001';
    const id2 = '550e8400-e29b-41d4-a716-446655440002';
    await handleReorder({ user: rep, body: { kind: 'products', orderedIds: [id1, id2] } } as any, res);
    expect(sampleRequestRepository.reorder).toHaveBeenCalledWith('products', [id1, id2]);
  });

  it('handleListMine returns { requests }', async () => {
    const res = mockRes();
    await handleListMine({ user: rep } as any, res);
    expect(res.json).toHaveBeenCalledWith({ requests: [{ eventId: 'ev-1' }] });
  });

  it('get/patch/submit/history pass the event and the actor', async () => {
    await handleGetEvent({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.getForEvent).toHaveBeenCalledWith(EV, rep);
    await handlePatchEvent({ user: rep, params: { eventId: EV }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.patchRows).toHaveBeenCalledWith(EV, { items: [], materials: [] }, rep);
    await handleSubmitEvent({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith(EV, rep);
    const res = mockRes();
    await handleGetHistory({ user: rep, params: { eventId: EV } } as any, res);
    expect(sampleRequestService.getHistory).toHaveBeenCalledWith(EV, rep);
    expect(res.json).toHaveBeenCalledWith({ changes: [{ id: 'c-1' }] });
  });

  it('access returns both flags', async () => {
    const res = mockRes();
    await handleEventAccess({ user: rep, params: { eventId: EV } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ canView: true, canEdit: false });
  });

  it('access skips the edit check when the caller cannot view', async () => {
    vi.mocked(sampleRequestService.canViewSamples).mockResolvedValueOnce(false);
    const res = mockRes();
    await handleEventAccess({ user: rep, params: { eventId: EV } } as any, res);
    expect(sampleRequestService.canEditSamples).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ canView: false, canEdit: false });
  });

  it('access lets an unknown-event error propagate instead of answering false', async () => {
    vi.mocked(sampleRequestService.canViewSamples).mockRejectedValueOnce(new Error('Event not found'));
    const res = mockRes();
    await expect(handleEventAccess({ user: rep, params: { eventId: EV } } as any, res)).rejects.toThrow('Event not found');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('400s a non-UUID eventId before calling the service', async () => {
    for (const h of [handleGetEvent, handlePatchEvent, handleSubmitEvent, handleGetHistory, handleEventAccess]) {
      const res = mockRes();
      await h({ user: rep, params: { eventId: 'not-a-uuid' }, body: {} } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid id' });
    }
    expect(sampleRequestService.getForEvent).not.toHaveBeenCalled();
    expect(sampleRequestService.patchRows).not.toHaveBeenCalled();
    expect(sampleRequestService.submit).not.toHaveBeenCalled();
    expect(sampleRequestService.getHistory).not.toHaveBeenCalled();
    expect(sampleRequestService.canViewSamples).not.toHaveBeenCalled();
  });

  it('registers /catalog and /mine before /:eventId, and no per-user or summary routes', () => {
    const paths: string[] = router.stack.filter((l: any) => l.route).map((l: any) => l.route.path);
    const firstEvent = paths.findIndex((p) => p.startsWith('/:eventId'));
    expect(firstEvent).toBeGreaterThan(-1);
    expect(paths.indexOf('/catalog')).toBeGreaterThan(-1);
    expect(paths.indexOf('/catalog')).toBeLessThan(firstEvent);
    expect(paths.indexOf('/mine')).toBeGreaterThan(-1);
    expect(paths.indexOf('/mine')).toBeLessThan(firstEvent);
    expect(paths.some((p) => /mine$|users|summary/.test(p) && p !== '/mine')).toBe(false);
    expect(paths).not.toContain('/access');
    expect(paths).toEqual(expect.arrayContaining(['/:eventId', '/:eventId/access', '/:eventId/submit', '/:eventId/history']));
  });
});
