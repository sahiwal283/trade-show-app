import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import { badgeApi } from '../badgeApi';
import { apiClient } from '../apiClient';
import { API_CONFIG, STORAGE_KEYS } from '../../constants/appConstants';

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

/**
 * Export is the fallback the whole feature leans on for any company with no
 * CRM configured — which on day one is every company — so these assertions
 * are deliberately at the api-client level. The LeadsPage test mocks this
 * module away, so a component-level test would prove nothing about whether
 * the request is addressed or authenticated correctly.
 */
describe('badgeApi export download', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'jwt-123');
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  const okResponse = () => ({ ok: true, status: 200, blob: async () => new Blob(['a,b']) });

  it('targets the API base path, not the SPA origin', () => {
    // A bare '/badge-scans/export' is served the SPA index document; every
    // other API call in this codebase goes through API_CONFIG.BASE_URL.
    const url = badgeApi.exportUrl('ev-1', 'xlsx');
    expect(url.startsWith(`${API_CONFIG.BASE_URL}/badge-scans/export`)).toBe(true);
    expect(url).toContain('eventId=ev-1');
    expect(url).toContain('format=xlsx');
  });

  it('sends the bearer token — a plain <a href> navigation would 401', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await badgeApi.downloadExport('ev-1', 'csv');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_CONFIG.BASE_URL}/badge-scans/export?eventId=ev-1&format=csv`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');

    vi.unstubAllGlobals();
  });

  it('downloads the blob and revokes the object URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    await badgeApi.downloadExport('ev-1', 'xlsx');

    expect(click).toHaveBeenCalled();
    expect(anchor.href).toBe('blob:fake');
    expect(anchor.download).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');

    createElement.mockRestore();
    vi.unstubAllGlobals();
  });

  it('surfaces a failed export instead of silently saving an error page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, blob: async () => new Blob() })));
    await expect(badgeApi.downloadExport('ev-1', 'csv')).rejects.toThrow(/401/);
    vi.unstubAllGlobals();
  });
});
