import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/database/repositories/BadgeScanRepository', () => ({
  badgeScanRepository: {
    upsert: vi.fn(async (d: any) => ({ id: 'scan-1', ...d })),
    findByClientScanId: vi.fn(async () => null),
    search: vi.fn(async () => []),
    updateFields: vi.fn(async (id: string, d: any) => ({ id, ...d })),
    findById: vi.fn(async (id: string) => ({ id, event_id: 'ev-1', brand: 'haute_brands', entity: 'Haute Brands' })),
    requeue: vi.fn(async (id: string) => ({ id, crm_status: 'pending' })),
  },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  getCurrentParticipantIds: vi.fn(async () => []),
  isEventParticipant: vi.fn(async () => false),
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
import { isEventParticipant } from '../../src/services/EventParticipantService';

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

/**
 * The spec said "a salesperson sees scans for events they participate in;
 * admins and developers see all" — and nothing implemented it. Role alone let
 * any salesperson or coordinator list, read, edit and requeue ANY event's
 * leads. These cover the three cases that matter.
 */
describe('BadgeScanService event-participation authorization', () => {
  const rep = { id: 'rep-1', role: 'salesperson' };
  const admin = { id: 'admin-1', role: 'admin' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(badgeScanRepository.findById).mockResolvedValue({
      id: 'scan-1', event_id: 'ev-1', brand: 'haute_brands', entity: 'Haute Brands',
    } as any);
  });

  it('lets a participant list that event leads', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(true);
    await expect(badgeScanService.list({ eventId: 'ev-1' }, rep)).resolves.toEqual([]);
    expect(isEventParticipant).toHaveBeenCalledWith('ev-1', 'rep-1');
    expect(badgeScanRepository.search).toHaveBeenCalled();
  });

  it('refuses a non-participant with 403, never reaching the query', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(badgeScanService.list({ eventId: 'ev-9' }, rep)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(badgeScanRepository.search).not.toHaveBeenCalled();
  });

  it('lets an admin read any event without a roster lookup', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(badgeScanService.list({ eventId: 'ev-9' }, admin)).resolves.toEqual([]);
    expect(isEventParticipant).not.toHaveBeenCalled();
  });

  it('refuses a non-participant reading one lead by id', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(badgeScanService.getById('scan-1', rep)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('still reports a missing scan as not found rather than forbidden', async () => {
    // 404 stays 404: there is no event to check membership against.
    vi.mocked(badgeScanRepository.findById).mockResolvedValueOnce(null as any);
    await expect(badgeScanService.getById('gone', rep)).resolves.toBeNull();
  });

  it('refuses a non-participant editing another event leads', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(
      badgeScanService.update('scan-1', { email: 'x@y.com' } as any, rep)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(badgeScanRepository.updateFields).not.toHaveBeenCalled();
  });

  it('lets a participant edit, and an admin edit regardless', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(true);
    await expect(badgeScanService.update('scan-1', { email: 'x@y.com' } as any, rep)).resolves.toBeTruthy();
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(badgeScanService.update('scan-1', { email: 'x@y.com' } as any, admin)).resolves.toBeTruthy();
  });

  it('refuses a non-participant requeueing a lead for CRM push', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(false);
    await expect(badgeScanService.requeueForCrm('scan-1', rep)).rejects.toMatchObject({ statusCode: 403 });
    expect(badgeScanRepository.requeue).not.toHaveBeenCalled();
  });

  it('lets a participant requeue', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(true);
    await expect(badgeScanService.requeueForCrm('scan-1', rep)).resolves.toMatchObject({
      crm_status: 'pending',
    });
  });

  it('refuses an unscoped list outright rather than authorizing nothing', async () => {
    await expect(badgeScanService.list({} as any, rep)).rejects.toThrow(/eventId/i);
  });
});

/**
 * The parser is wrong often enough that clearing a field is a primary
 * workflow. Dropping empty strings meant the column never reached the upsert,
 * so ON CONFLICT left the stale wrong value behind: the rep cleared a wrong
 * email, saved, and the wrong email was still there.
 */
describe('BadgeScanService cleared fields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes NULL for a field the rep explicitly cleared', async () => {
    await badgeScanService.create(
      { ...input(), contact: { first_name: 'Shamsher', email: '' } } as any,
      'user-1'
    );
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0] as any;
    // Present-and-null, not absent: the ON CONFLICT set only touches columns
    // that made it into the statement.
    expect('email' in written).toBe(true);
    expect(written.email).toBeNull();
    expect(written.first_name).toBe('Shamsher');
  });

  it('treats a whitespace-only value as cleared, not as content', async () => {
    await badgeScanService.create({ ...input(), contact: { phone: '   ' } } as any, 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0] as any;
    expect(written.phone).toBeNull();
  });

  it('leaves a field the client never sent absent, so it cannot be nulled by omission', async () => {
    await badgeScanService.create({ ...input(), contact: { email: 'a@b.com' } } as any, 'user-1');
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0] as any;
    expect(written.email).toBe('a@b.com');
    expect('phone' in written).toBe(false);
    expect('company' in written).toBe(false);
  });

  it('still refuses non-whitelisted and non-string contact values', async () => {
    await badgeScanService.create(
      { ...input(), contact: { first_name: 'Ok', crm_status: '', id: '', parse_confidence: 5 } } as any,
      'user-1'
    );
    const written = vi.mocked(badgeScanRepository.upsert).mock.calls[0][0] as any;
    expect(written.first_name).toBe('Ok');
    expect(written.id).toBeUndefined();
    expect(written.crm_status).toBe('pending'); // not the client's cleared value
  });

  it('clears to NULL on the edit path too, not to an empty string', async () => {
    vi.mocked(isEventParticipant).mockResolvedValue(true);
    vi.mocked(badgeScanRepository.findById).mockResolvedValue({
      id: 'scan-1', event_id: 'ev-1', brand: 'haute_brands', entity: 'Haute Brands',
    } as any);

    await badgeScanService.update('scan-1', { email: '', phone: '555' } as any, {
      id: 'rep-1', role: 'salesperson',
    });

    const patch = vi.mocked(badgeScanRepository.updateFields).mock.calls[0][1] as any;
    expect(patch.email).toBeNull();
    expect(patch.phone).toBe('555');
  });
});
