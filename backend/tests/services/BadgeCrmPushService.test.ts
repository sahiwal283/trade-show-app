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
  vi.mocked(axios.get).mockResolvedValue({ data: { fields: [] } } as any);
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
      status: 'failed', error: expect.stringContaining('INVALID_MODULE'), terminal: false,
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

  it('never runs two passes at once — overlapping passes push the same rows twice', async () => {
    // The 5-minute setInterval had no guard, so a slow pass was joined by the
    // next one and both claimed the same scans.
    let release: () => void = () => undefined;
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([]); })
    );

    const first = badgeCrmPushService.pushOnce();
    const second = await badgeCrmPushService.pushOnce(); // must not claim

    expect(second.attempted).toBe(0);
    expect(badgeScanRepository.claimPendingByBrand).toHaveBeenCalledTimes(1);

    release();
    await first;

    // The guard clears in a finally, so the next tick works normally.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([]);
    await badgeCrmPushService.pushOnce();
    expect(badgeScanRepository.claimPendingByBrand).toHaveBeenCalledTimes(2);
  });

  it('clears the guard even when a pass throws', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockRejectedValueOnce(new Error('db down'));
    await expect(badgeCrmPushService.pushOnce()).rejects.toThrow('db down');

    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([]);
    await expect(badgeCrmPushService.pushOnce()).resolves.toMatchObject({ attempted: 0 });
  });
});

describe('BadgeCrmPushService emailless leads', () => {
  const noEmail = (over = {}) => scan({ id: 'ne-1', email: null, ...over });

  it('does not claim email dedupe for a record that carries no email', async () => {
    // duplicate_check_fields: ['Email'] over a record whose Email field is
    // absent gives Zoho nothing to match on — it inserts, and the next push
    // inserts again.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([noEmail()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce(upsertOk() as any);

    await badgeCrmPushService.pushOnce();

    const [, body] = vi.mocked(axios.post).mock.calls[1];
    expect((body as any).duplicate_check_fields).toBeUndefined();
    expect((body as any).data).toHaveLength(1);
  });

  it('splits a mixed batch so the emailed records keep their dedupe', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan(), noEmail()]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any)
      .mockResolvedValueOnce(upsertOk('crm-with') as any)
      .mockResolvedValueOnce(upsertOk('crm-without') as any);

    const result = await badgeCrmPushService.pushOnce();

    const upserts = vi.mocked(axios.post).mock.calls.filter(([url]) => String(url).includes('/upsert'));
    expect(upserts).toHaveLength(2);
    expect((upserts[0][1] as any).duplicate_check_fields).toContain('Email');
    expect((upserts[1][1] as any).duplicate_check_fields).toBeUndefined();
    expect(result.synced).toBe(2);
  });

  it('parks an emailless lead instead of auto-retrying an unconfirmed failure', async () => {
    // A timeout after Zoho committed is indistinguishable from one before it.
    // With no dedupe key, an automatic retry creates a second CRM record, so
    // the attempt budget is spent at once and a human decides.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([noEmail()]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any)
      .mockRejectedValueOnce(new Error('socket hang up'));

    await badgeCrmPushService.pushOnce();

    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('ne-1', {
      status: 'failed',
      error: expect.stringContaining('cannot be de-duplicated'),
      terminal: true,
    });
  });

  it('still auto-retries an unconfirmed failure when the record has an email', async () => {
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([scan()]);
    vi.mocked(axios.post)
      .mockResolvedValueOnce(tokenOk() as any)
      .mockRejectedValueOnce(new Error('socket hang up'));

    await badgeCrmPushService.pushOnce();

    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('scan-1', {
      status: 'failed', error: expect.stringContaining('socket hang up'), terminal: false,
    });
  });

  it('retries an emailless lead normally when Zoho definitively rejected it', async () => {
    // A per-record rejection means nothing was created, so a retry is safe.
    vi.mocked(badgeScanRepository.claimPendingByBrand).mockResolvedValueOnce([noEmail()]);
    vi.mocked(axios.post).mockResolvedValueOnce(tokenOk() as any).mockResolvedValueOnce({
      data: { data: [{ code: 'MANDATORY_NOT_FOUND', message: 'required field missing' }] },
    } as any);

    await badgeCrmPushService.pushOnce();

    expect(badgeScanRepository.markPushResult).toHaveBeenCalledWith('ne-1', {
      status: 'failed',
      error: expect.stringContaining('MANDATORY_NOT_FOUND'),
    });
  });
});
