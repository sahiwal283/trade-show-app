import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(async () => ({})), put: vi.fn(async () => ({})), post: vi.fn(async () => ({})) },
}));

import { apiClient } from '../apiClient';
import { sampleRequestApi } from '../sampleRequestApi';
import { notificationsApi } from '../notificationsApi';

describe('sampleRequestApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hits the mine endpoints', async () => {
    await sampleRequestApi.getMine('ev-1');
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/ev-1/mine');
    await sampleRequestApi.saveMine('ev-1', { items: [], materials: [] });
    expect(apiClient.put).toHaveBeenCalledWith('/sample-requests/ev-1/mine', { items: [], materials: [] });
    await sampleRequestApi.submitMine('ev-1');
    expect(apiClient.post).toHaveBeenCalledWith('/sample-requests/ev-1/mine/submit');
  });

  it('asks for inactive catalog rows only when told', async () => {
    await sampleRequestApi.getCatalog();
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog');
    await sampleRequestApi.getCatalog(true);
    expect(apiClient.get).toHaveBeenCalledWith('/sample-requests/catalog?includeInactive=1');
  });

  it('on-behalf calls include the user id', async () => {
    await sampleRequestApi.saveForUser('ev-1', 'u-9', { items: [], materials: [] });
    expect(apiClient.put).toHaveBeenCalledWith('/sample-requests/ev-1/users/u-9', { items: [], materials: [] });
  });
});

describe('notificationsApi', () => {
  it('marks ids read', async () => {
    await notificationsApi.markRead(['n-1']);
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/read', { ids: ['n-1'] });
  });
});
