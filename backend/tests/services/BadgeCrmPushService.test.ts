import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: { claimPendingByBrand: vi.fn(async () => []), markPushResult: vi.fn(async () => {}) },
}));

import { badgeCrmPushService } from '../../src/services/badge/BadgeCrmPushService';
import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';

const scan = (over = {}) => ({
  id: 'scan-1', brand: 'haute_brands', entity: 'Haute Brands',
  first_name: 'Shamsher', last_name: 'Jessani', email: 'sjessani@aol.com',
  company: 'Virginia Trade Association', crm_attempts: 0, ...over,
}) as any;

const tokenOk = () => ({ data: { access_token: 'at', expires_in: 3600 } });
const upsertOk = (id = 'crm-1') => ({ data: { data: [{ code: 'SUCCESS', details: { id } }] } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZOHO_CLIENT_ID = 'cid';
  process.env.ZOHO_CLIENT_SECRET = 'csec';
  process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN = 'haute-rt';
  delete process.env.BOOMIN_BRANDS_ZOHO_CRM_REFRESH_TOKEN;
  delete process.env.ZOHO_CRM_REFRESH_TOKEN;
  // Test 4 below sets this directly on process.env; without cleaning it here
  // it leaks forward and pollutes every test that runs after it (notably the
  // "no brand has a CRM at all" test).
  delete process.env.NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN;
});

describe('BadgeCrmPushService.pushOnce', () => {
  it('pushes a claimed scan and records the CRM record id', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk('crm-99') as any);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.synced).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'synced', crmRecordId: 'crm-99',
    });
  });

  it('upserts on email so a re-push never creates a CRM twin', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any);

    await badgeCrmPushService.pushOnce();

    const [url, body] = vi.mocked(axios.post).mock.calls[1];
    expect(url).toContain('/upsert');
    expect((body as any).duplicate_check_fields).toContain('Email');
  });

  it('leaves an unconfigured brand pending without consuming a retry attempt', async () => {
    // Boomin has no token. Burning 5 attempts against a CRM that does not
    // exist would strand those leads as permanently 'failed'.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([
      scan({ id: 'b-1', brand: 'boomin_brands', entity: 'Boomin Brands' }),
    ]);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.skippedBrands).toContain('boomin_brands');
    expect(badgeScanRepository.markPushResult).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('uses each brand its own credentials when two brands have work', async () => {
    process.env.NIRVANA_KULTURE_ZOHO_CRM_REFRESH_TOKEN = 'nirvana-rt';
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([
      scan({ id: 'h-1', brand: 'haute_brands' }),
      scan({ id: 'n-1', brand: 'nirvana_kulture', entity: 'Nirvana Kulture' }),
    ]);
    vi.mocked(axios.post).mockResolvedValue(tokenOk() as any);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any)
      .mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any);

    await badgeCrmPushService.pushOnce();

    const tokenBodies = vi.mocked(axios.post).mock.calls
      .filter(([url]) => String(url).includes('oauth'))
      .map(([, body]) => String(body));
    expect(tokenBodies.some((b) => b.includes('haute-rt'))).toBe(true);
    expect(tokenBodies.some((b) => b.includes('nirvana-rt'))).toBe(true);
  });

  it('records a failure with its reason instead of throwing', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any)
      .mockRejectedValueOnce(new Error('INVALID_MODULE'));

    const result = await badgeCrmPushService.pushOnce();

    expect(result.failed).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: expect.stringContaining('INVALID_MODULE'),
    });
  });

  it('marks a per-record CRM rejection as failed even when the HTTP call succeeded', async () => {
    // Zoho returns 200 with per-record error codes. Treating the 200 as
    // success would mark a rejected lead 'synced' and it would never retry.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce({
      data: { data: [{ code: 'MANDATORY_NOT_FOUND', message: 'required field missing' }] },
    } as any);

    const result = await badgeCrmPushService.pushOnce();

    expect(result.failed).toBe(1);
    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: expect.stringContaining('MANDATORY_NOT_FOUND'),
    });
  });

  it('does nothing and claims nothing when no brand has a CRM at all', async () => {
    delete process.env.HAUTE_BRANDS_ZOHO_CRM_REFRESH_TOKEN;
    const result = await badgeCrmPushService.pushOnce();
    expect(result.attempted).toBe(0);
    expect(badgeScanRepository.claimPendingByBrand).not.toHaveBeenCalled();
  });

  it('leaves the batch pending without consuming a retry attempt when the token request itself fails', async () => {
    // A transient Zoho auth outage is not a per-record rejection. Consuming a
    // retry attempt here would strand the whole batch as 'failed' after
    // roughly 5 outage-length push intervals, indistinguishable from a
    // genuine rejection — mirror the unconfigured-brand path instead.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Zoho accounts service unavailable'));

    const result = await badgeCrmPushService.pushOnce();

    expect(badgeScanRepository.markPushResult).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.attempted).toBe(0);
    expect(result.skippedBrands).toContain('haute_brands');
  });
});
