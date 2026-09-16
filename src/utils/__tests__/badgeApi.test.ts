import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import { badgeApi } from '../badgeApi';
import { apiClient } from '../apiClient';

describe('badgeApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts a scan with the company and the raw payload', async () => {
    // apiClient.post already unwraps to the parsed JSON body (see apiClient.ts
    // request()/handleResponse() — it returns result.data, not {data: ...}),
    // so the mock resolves directly to the record, matching every other
    // feature-scoped client (boothApi etc.) in this codebase.
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'scan-1' } as any);
    await badgeApi.createScan({
      eventId: 'ev-1', entity: 'Haute Brands', rawPayload: 'RAW',
      clientScanId: 'c-1', parserVersion: 'v1', parseConfidence: 0.9,
      fields: [], contact: { first_name: 'Shamsher' },
    });
    const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/badge-scans');
    expect(body).toMatchObject({ entity: 'Haute Brands', rawPayload: 'RAW', clientScanId: 'c-1' });
  });

  it('requires eventId when listing, matching the server contract', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ scans: [] } as any);
    await badgeApi.listScans({ eventId: 'ev-1', entity: 'Haute Brands' });
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain('eventId=ev-1');
    expect(vi.mocked(apiClient.get).mock.calls[0][0]).toContain('entity=Haute+Brands');
  });

  it('unwraps the scans array rather than handing callers the envelope', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ scans: [{ id: 'a' }], count: 1 } as any);
    await expect(badgeApi.listScans({ eventId: 'ev-1' })).resolves.toEqual([{ id: 'a' }]);
  });

  it('returns an empty list when the server sends no scans key', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({} as any);
    await expect(badgeApi.listScans({ eventId: 'ev-1' })).resolves.toEqual([]);
  });
});
