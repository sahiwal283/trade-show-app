import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/services/sampleRequests/SampleRequestService', () => ({
  sampleRequestService: {
    getRequest: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true } })),
    saveDraft: vi.fn(async () => ({ request: { id: 'r' }, window: { isOpen: true } })),
    submit: vi.fn(async () => ({ request: { id: 'r', status: 'submitted' }, window: { isOpen: true } })),
    listMyOpenRequests: vi.fn(async () => [{ eventId: 'ev-1' }]),
    getEventSummary: vi.fn(async () => ({ eventId: 'ev-1' })),
    canViewSummary: vi.fn(async () => true),
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
  handleListMine, handleGetMine, handleSaveMine, handleSubmitMine, handleGetForUser, handleSaveForUser,
  handleSubmitForUser, handleGetSummary, handleAccess,
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
const U9 = '7a2d3c2f-4b5e-4d6f-9a01-2b3c4d5e6f70';

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

  it('mine endpoints always target the caller', async () => {
    await handleGetMine({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.getRequest).toHaveBeenCalledWith(EV, 'u-1', rep);
    await handleSaveMine({ user: rep, params: { eventId: EV }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith(EV, 'u-1', { items: [], materials: [] }, rep);
    await handleSubmitMine({ user: rep, params: { eventId: EV } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith(EV, 'u-1', rep);
  });

  it('handleListMine returns { requests }', async () => {
    const res = mockRes();
    await handleListMine({ user: rep } as any, res);
    expect(res.json).toHaveBeenCalledWith({ requests: [{ eventId: 'ev-1' }] });
  });

  it('on-behalf handlers target path user and pass actor', async () => {
    const admin = { id: 'adm', role: 'admin' };

    await handleGetForUser({ user: admin, params: { eventId: EV, userId: U9 } } as any, mockRes());
    expect(sampleRequestService.getRequest).toHaveBeenCalledWith(EV, U9, admin);

    await handleSaveForUser({ user: admin, params: { eventId: EV, userId: U9 }, body: { items: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith(EV, U9, { items: [] }, admin);

    await handleSubmitForUser({ user: admin, params: { eventId: EV, userId: U9 } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith(EV, U9, admin);
  });

  it('summary and access pass the actor through', async () => {
    const res = mockRes();
    await handleGetSummary({ user: rep, params: { eventId: EV } } as any, res);
    expect(sampleRequestService.getEventSummary).toHaveBeenCalledWith(EV, rep);
    await handleAccess({ user: rep } as any, res);
    expect(res.json).toHaveBeenCalledWith({ canViewSummary: true });
  });

  it('400s a non-UUID eventId before calling the service', async () => {
    const res = mockRes();
    await handleGetMine({ user: rep, params: { eventId: 'not-a-uuid' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid id' });
    expect(sampleRequestService.getRequest).not.toHaveBeenCalled();
  });

  it('400s a non-UUID userId on an on-behalf route', async () => {
    const res = mockRes();
    await handleSaveForUser({ user: { id: 'adm', role: 'admin' }, params: { eventId: EV, userId: 'u-9' }, body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid id' });
    expect(sampleRequestService.saveDraft).not.toHaveBeenCalled();
  });

  it('router /mine and /access appear before /:eventId paths', () => {
    const paths: string[] = [];
    router.stack.forEach((layer: any) => {
      if (layer.route?.path) {
        paths.push(layer.route.path);
      }
    });

    const mineIndex = paths.indexOf('/mine');
    const accessIndex = paths.indexOf('/access');
    const eventIdIndex = paths.findIndex((p: string) => p.includes(':eventId'));

    expect(mineIndex).toBeGreaterThan(-1);
    expect(accessIndex).toBeGreaterThan(-1);
    expect(eventIdIndex).toBeGreaterThan(-1);
    expect(mineIndex).toBeLessThan(eventIdIndex);
    expect(accessIndex).toBeLessThan(eventIdIndex);
  });
});
