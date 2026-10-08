import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(async () => ({})), put: vi.fn(async () => ({})), patch: vi.fn(async () => ({})), post: vi.fn(async () => ({})) },
}));

import { apiClient } from '../apiClient';
import { sampleRequestApi } from '../sampleRequestApi';
import { notificationsApi } from '../notificationsApi';

describe('sampleRequestApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hits the event-scoped endpoints', async () => {
    await sampleRequestApi.getEvent('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1');
    // Field-level patch: a row carries only the fields that changed.
    const patch = { items: [{ productId: 'p', singles: 1 }], materials: [{ materialId: 'm', notes: null }] };
    await sampleRequestApi.patchEvent('ev-1', patch);
    expect(apiClient.patch).toHaveBeenCalledWith('/sample-requests/ev-1', patch);
    await sampleRequestApi.submitEvent('ev-1');
    expect(apiClient.post).toHaveBeenCalledWith('/sample-requests/ev-1/submit');
    await sampleRequestApi.getHistory('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/history');
    await sampleRequestApi.getEventAccess('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/access');
    await sampleRequestApi.listMine();
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/mine');
  });

  it('has no per-user or summary methods', () => {
    for (const k of ['getMine', 'saveMine', 'submitMine', 'getForUser', 'saveForUser', 'submitForUser', 'getSummary', 'getAccess']) {
      expect((sampleRequestApi as any)[k]).toBeUndefined();
    }
  });

  it('asks for inactive catalog rows only when told', async () => {
    await sampleRequestApi.getCatalog();
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog');
    await sampleRequestApi.getCatalog(true);
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog?includeInactive=1');
  });
});

describe('notificationsApi', () => {
  it('marks ids read', async () => {
    await notificationsApi.markRead(['n-1']);
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/read', { ids: ['n-1'] });
  });
});
