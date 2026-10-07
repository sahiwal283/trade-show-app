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

import {
  handleGetCatalog, handleCreateLine, handleUpdateProduct, handleReorder,
  handleGetMine, handleSaveMine, handleSubmitMine, handleSaveForUser, handleGetSummary, handleAccess,
} from '../../src/routes/sampleRequests';
import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>;
  };
}
const rep = { id: 'u-1', role: 'salesperson' };

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

  it('404s an update to a missing product', async () => {
    const res = mockRes();
    await handleUpdateProduct({ user: rep, params: { id: 'nope' }, body: { isActive: false } } as any, res);
    expect(sampleRequestRepository.updateProduct).toHaveBeenCalledWith('nope', { name: undefined, is_active: false });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('validates reorder input', async () => {
    const res = mockRes();
    await handleReorder({ user: rep, body: { kind: 'things', orderedIds: ['a'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    await handleReorder({ user: rep, body: { kind: 'products', orderedIds: ['a', 'b'] } } as any, res);
    expect(sampleRequestRepository.reorder).toHaveBeenCalledWith('products', ['a', 'b']);
  });

  it('mine endpoints always target the caller', async () => {
    await handleGetMine({ user: rep, params: { eventId: 'ev-1' } } as any, mockRes());
    expect(sampleRequestService.getRequest).toHaveBeenCalledWith('ev-1', 'u-1', rep);
    await handleSaveMine({ user: rep, params: { eventId: 'ev-1' }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith('ev-1', 'u-1', { items: [], materials: [] }, rep);
    await handleSubmitMine({ user: rep, params: { eventId: 'ev-1' } } as any, mockRes());
    expect(sampleRequestService.submit).toHaveBeenCalledWith('ev-1', 'u-1', rep);
  });

  it('on-behalf save targets the path user and passes the actor', async () => {
    const admin = { id: 'adm', role: 'admin' };
    await handleSaveForUser({ user: admin, params: { eventId: 'ev-1', userId: 'u-9' }, body: { items: [], materials: [] } } as any, mockRes());
    expect(sampleRequestService.saveDraft).toHaveBeenCalledWith('ev-1', 'u-9', { items: [], materials: [] }, admin);
  });

  it('summary and access pass the actor through', async () => {
    const res = mockRes();
    await handleGetSummary({ user: rep, params: { eventId: 'ev-1' } } as any, res);
    expect(sampleRequestService.getEventSummary).toHaveBeenCalledWith('ev-1', rep);
    await handleAccess({ user: rep } as any, res);
    expect(res.json).toHaveBeenCalledWith({ canViewSummary: true });
  });
});
