import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    upsert: vi.fn(async (d: any) => ({ id: 'scan-1', ...d })),
    findByClientScanId: vi.fn(async () => null),
    search: vi.fn(async () => []),
    updateFields: vi.fn(async (id: string, d: any) => ({ id, ...d })),
  },
}));
vi.mock('../../src/services/picklists/PicklistService', () => ({
  getPicklists: vi.fn(async () => ({
    companies: [
      { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
      { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 2 },
    ],
  })),
}));

import { badgeScanService } from '../../src/services/badge/BadgeScanService';
import { badgeScanRepository } from '../../src/database/repositories/BadgeScanRepository';

const input = (over = {}) => ({
  eventId: 'ev-1',
  entity: 'Haute Brands',
  rawPayload: 'RAW|PAYLOAD|HERE',
  ...over,
});

describe('BadgeScanService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('recomputes payload_hash server-side and ignores any hash the client sent', async () => {
    // The hash is the dedupe key. A client that computes it wrong — or lies —
    // could create duplicates or collide two different attendees into one row.
    await badgeScanService.create({ ...input(), payloadHash: 'attacker-supplied' } as any, 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.payload_hash).toHaveLength(64);
    expect(written.payload_hash).not.toBe('attacker-supplied');
  });

  it('resolves the brand server-side from the company', async () => {
    await badgeScanService.create(input(), 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.brand).toBe('haute_brands');
    expect(written.crm_status).toBe('pending');
  });

  it('captures the lead as skipped when the company has no Zoho destination', async () => {
    // Summitt Labs is selectable but has no CRM. Refusing the scan would
    // throw away a real lead to protect a push that could never happen.
    const scan = await badgeScanService.create(input({ entity: 'Summitt Labs' }), 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.brand).toBeNull();
    expect(written.crm_status).toBe('skipped');
    expect(written.crm_error).toMatch(/no zoho crm/i);
    expect(scan).toBeTruthy();
  });

  it('rejects a company that is not in the picklist at all', async () => {
    await expect(
      badgeScanService.create(input({ entity: 'Totally Made Up Co' }), 'user-1')
    ).rejects.toThrow(/unknown company/i);
    expect(badgeScanRepository.upsert).not.toHaveBeenCalled();
  });

  it('refuses an empty payload rather than storing a contentless lead', async () => {
    await expect(badgeScanService.create(input({ rawPayload: '   ' }), 'user-1')).rejects.toThrow(/payload/i);
  });

  it('returns the existing scan for a replayed client_scan_id without writing again', async () => {
    // Offline replay: the queue may POST the same scan more than once.
    vi.mocked(badgeScanRepository.findByClientScanId).mockResolvedValueOnce({ id: 'existing' } as any);
    const scan = await badgeScanService.create(input({ clientScanId: 'c-1' }), 'user-1');
    expect(scan.id).toBe('existing');
    expect(badgeScanRepository.upsert).not.toHaveBeenCalled();
  });

  it('only persists whitelisted contact fields from the client', async () => {
    await badgeScanService.create(
      { ...input(), contact: { first_name: 'Shamsher', crm_status: 'synced', id: 'hijack' } } as any,
      'user-1'
    );
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0];
    expect(written.first_name).toBe('Shamsher');
    expect(written.id).toBeUndefined();
    expect(written.crm_status).toBe('pending'); // not the client's 'synced'
  });
});
