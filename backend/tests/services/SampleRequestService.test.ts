import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const OPEN_EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-30', show_start_date: '2026-11-01' };
const CLOSED_EVENT = { id: 'ev-2', name: 'Soon', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-09', show_start_date: '2026-10-10' };
const NOW = new Date('2026-10-07T15:00:00Z');

const row = (over = {}) => ({
  id: 'req-1', event_id: 'ev-1', created_by: 'u-1', status: 'draft', submitted_at: null, submitted_by: null,
  last_edited_at: null, last_edited_by: null, created_at: '', updated_at: '', ...over,
});

vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({
      lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
      products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true },
                 { id: 'p-old', product_line_id: 'l-1', name: 'Gone', position: 2, is_active: false }],
      materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
    })),
    findByEvent: vi.fn(async () => row()),
    upsertEventDraft: vi.fn(async (e: string, u: string) => row({ event_id: e, created_by: u })),
    getContents: vi.fn(async () => ({ items: [], materials: [] })),
    applyRows: vi.fn(async () => undefined),
    markSubmitted: vi.fn(async (id: string, u: string) => row({ id, status: 'submitted', submitted_at: '2026-10-07T15:00:00Z', submitted_by: u })),
    findStatusByEvents: vi.fn(async () => []),
    listChanges: vi.fn(async () => [{ id: 'c-1', userId: 'u-1', userName: 'Ana', kind: 'item', targetId: 'p-1', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', field: 'singles', oldValue: '1', newValue: '3', changedAt: '2026-10-07T14:00:00Z' }]),
    userRefs: vi.fn(async (ids: string[]) => new Map(ids.filter(Boolean).map((id) => [id, { id, name: `User ${id}` }]))),
    getPullerUserId: vi.fn(async () => 'puller-1'),
  },
}));
vi.mock('../../src/database/repositories/EventRepository', () => ({
  eventRepository: { findById: vi.fn(async (id: string) => (id === 'ev-1' ? OPEN_EVENT : id === 'ev-2' ? CLOSED_EVENT : null)) },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  isEventParticipant: vi.fn(async (_e: string, u: string) => u === 'u-1' || u === 'u-3'),
  getCurrentParticipantIds: vi.fn(async () => ['u-1', 'u-3']),
}));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n-1' })) },
}));
vi.mock('../../src/config/database', () => ({ query: vi.fn(async () => ({ rows: [{ name: 'Ana' }] })) }));

import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

const rep = { id: 'u-1', role: 'salesperson' };
const otherRep = { id: 'u-3', role: 'salesperson' };
const stranger = { id: 'u-9', role: 'salesperson' };
const puller = { id: 'puller-1', role: 'salesperson' };
const admin = { id: 'adm', role: 'admin' };
const patch = { items: [{ productId: 'p-1', singles: 3, displays: 0, emptyDisplays: 0 }], materials: [] };

let consoleSpies: Array<{ mockRestore: () => void }> = [];

describe('SampleRequestService (shared request)', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); });
  // Only console spies are restored; restoreAllMocks would also wipe the module mocks' implementations.
  afterEach(() => { consoleSpies.forEach((x) => x.mockRestore()); consoleSpies = []; vi.useRealTimers(); });

  describe('access', () => {
    it('participant, override role and puller can view; stranger cannot', async () => {
      expect(await sampleRequestService.canViewSamples('ev-1', rep)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', admin)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', puller)).toBe(true);
      expect(await sampleRequestService.canViewSamples('ev-1', stranger)).toBe(false);
    });
    it('puller off the roster can view but not edit; participant edits while open; admin edits after close', async () => {
      expect((await sampleRequestService.getForEvent('ev-1', puller)).canEdit).toBe(false);
      expect((await sampleRequestService.getForEvent('ev-1', rep)).canEdit).toBe(true);
      expect((await sampleRequestService.getForEvent('ev-2', rep)).canEdit).toBe(false);
      expect((await sampleRequestService.getForEvent('ev-2', admin)).canEdit).toBe(true);
    });
    it('canViewSamples and canEditSamples 404 an unknown event', async () => {
      await expect(sampleRequestService.canViewSamples('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
      await expect(sampleRequestService.canEditSamples('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
    });
    it('canEditSamples matrix', async () => {
      expect(await sampleRequestService.canEditSamples('ev-1', rep)).toBe(true);
      expect(await sampleRequestService.canEditSamples('ev-2', rep)).toBe(false);
      expect(await sampleRequestService.canEditSamples('ev-2', admin)).toBe(true);
      expect(await sampleRequestService.canEditSamples('ev-1', puller)).toBe(false);
      expect(await sampleRequestService.canEditSamples('ev-1', stranger)).toBe(false);
    });
    it('getForEvent 403s a stranger without touching the request row', async () => {
      await expect(sampleRequestService.getForEvent('ev-1', stranger)).rejects.toMatchObject({ statusCode: 403 });
      expect(sampleRequestRepository.findByEvent).not.toHaveBeenCalled();
      expect(sampleRequestRepository.upsertEventDraft).not.toHaveBeenCalled();
    });
    it('getForEvent 404s an unknown event', async () => {
      await expect(sampleRequestService.getForEvent('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getForEvent', () => {
    it('creates the event draft on first read and resolves user names', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      vi.mocked(sampleRequestRepository.upsertEventDraft).mockResolvedValueOnce(row({ last_edited_by: 'u-3', last_edited_at: '2026-10-07T14:00:00Z' }) as any);
      const v = await sampleRequestService.getForEvent('ev-1', rep);
      expect(sampleRequestRepository.upsertEventDraft).toHaveBeenCalledWith('ev-1', 'u-1');
      expect(v.request.lastEditedBy).toEqual({ id: 'u-3', name: 'User u-3' });
      expect(v.request.submittedBy).toBeNull();
      expect(v.window.closesAt).toBe('2026-10-21T03:59:59.000Z');
    });
  });

  describe('patchRows', () => {
    it('validates then applies only the sent rows as the actor', async () => {
      await sampleRequestService.patchRows('ev-1', patch, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledWith('req-1', 'u-1', patch);
    });
    it('passes a partial row through to applyRows unchanged', async () => {
      const partial = { items: [{ productId: 'p-1', singles: 3 }], materials: [{ materialId: 'm-1', notes: 'x' }] };
      await sampleRequestService.patchRows('ev-1', partial, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledWith('req-1', 'u-1', partial);
      const sent = vi.mocked(sampleRequestRepository.applyRows).mock.calls[0][2];
      expect(Object.keys(sent.items[0])).toEqual(['productId', 'singles']);
      expect(Object.keys(sent.materials[0])).toEqual(['materialId', 'notes']);
    });
    it('400s a row with no fields and writes nothing', async () => {
      await expect(sampleRequestService.patchRows('ev-1', { items: [{ productId: 'p-1' }], materials: [] }, rep))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no fields to change/) });
      expect(sampleRequestRepository.applyRows).not.toHaveBeenCalled();
    });
    it('accepts an inactive catalog product', async () => {
      await sampleRequestService.patchRows('ev-1', { items: [{ productId: 'p-old', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalled();
    });
    it('400s a bad row and writes nothing', async () => {
      await expect(sampleRequestService.patchRows('ev-1', { items: [{ productId: 'zzz', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(sampleRequestRepository.applyRows).not.toHaveBeenCalled();
    });
    it('409s a participant after close, lets an admin through', async () => {
      await expect(sampleRequestService.patchRows('ev-2', patch, rep)).rejects.toMatchObject({ statusCode: 409 });
      await sampleRequestService.patchRows('ev-2', patch, admin);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledTimes(1);
    });
    it('403s the off-roster puller and a stranger', async () => {
      await expect(sampleRequestService.patchRows('ev-1', patch, puller)).rejects.toMatchObject({ statusCode: 403 });
      await expect(sampleRequestService.patchRows('ev-1', patch, stranger)).rejects.toMatchObject({ statusCode: 403 });
    });
    it('each patch is applied as its own actor', async () => {
      await sampleRequestService.patchRows('ev-1', patch, rep);
      await sampleRequestService.patchRows('ev-1', { items: [{ productId: 'p-1', singles: 5, displays: 0, emptyDisplays: 0 }], materials: [] }, otherRep);
      expect(vi.mocked(sampleRequestRepository.applyRows).mock.calls.map((c) => c[1])).toEqual(['u-1', 'u-3']);
    });
  });

  describe('submit', () => {
    it('creates the row if needed, marks submitted by the actor, notifies the puller with "New" wording', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      const v = await sampleRequestService.submit('ev-1', rep);
      expect(sampleRequestRepository.markSubmitted).toHaveBeenCalledWith('req-1', 'u-1');
      expect(v.request.status).toBe('submitted');
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({
        kind: 'sample_request.submitted', title: expect.stringMatching(/^New sample request/), body: expect.stringContaining('Ana'),
        link: { page: 'samples', eventId: 'ev-1' },
      }));
    });
    it('uses "updated" wording after a prior submission', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(row({ status: 'submitted', submitted_at: '2026-10-05T00:00:00Z', submitted_by: 'u-3' }) as any);
      await sampleRequestService.submit('ev-1', rep);
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({ title: expect.stringMatching(/updated/i) }));
    });
    it('survives a failing notification and a missing puller', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleSpies.push(errSpy, warnSpy);
      vi.mocked(notificationService.notify).mockRejectedValueOnce(new Error('boom'));
      await expect(sampleRequestService.submit('ev-1', rep)).resolves.toMatchObject({ request: { status: 'submitted' } });
      expect(errSpy).toHaveBeenCalled();
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce(null);
      await expect(sampleRequestService.submit('ev-1', rep)).resolves.toBeTruthy();
      expect(warnSpy).toHaveBeenCalled();
    });
    it('409s a participant after close', async () => {
      await expect(sampleRequestService.submit('ev-2', rep)).rejects.toMatchObject({ statusCode: 409 });
      expect(sampleRequestRepository.markSubmitted).not.toHaveBeenCalled();
    });
  });

  describe('write guards', () => {
    const closed = { statusCode: 409, context: { code: 'WINDOW_CLOSED', closesAt: expect.any(String) } };
    const noWrites = () => {
      expect(sampleRequestRepository.upsertEventDraft).not.toHaveBeenCalled();
      expect(sampleRequestRepository.applyRows).not.toHaveBeenCalled();
      expect(sampleRequestRepository.markSubmitted).not.toHaveBeenCalled();
    };
    const badPatch = { items: [{ productId: 'zzz', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] };

    it('409 carries WINDOW_CLOSED context for patchRows and submit', async () => {
      await expect(sampleRequestService.patchRows('ev-2', patch, rep)).rejects.toMatchObject(closed);
      await expect(sampleRequestService.submit('ev-2', rep)).rejects.toMatchObject(closed);
    });
    it('patchRows with no request row writes nothing on 400, 409 and 403', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValue(null);
      try {
        await expect(sampleRequestService.patchRows('ev-1', badPatch, rep)).rejects.toMatchObject({ statusCode: 400 });
        await expect(sampleRequestService.patchRows('ev-2', patch, rep)).rejects.toMatchObject({ statusCode: 409 });
        await expect(sampleRequestService.patchRows('ev-1', patch, stranger)).rejects.toMatchObject({ statusCode: 403 });
        await expect(sampleRequestService.patchRows('ev-1', patch, puller)).rejects.toMatchObject({ statusCode: 403 });
        noWrites();
      } finally {
        vi.mocked(sampleRequestRepository.findByEvent).mockImplementation(async () => row() as any);
      }
    });
    it('submit with no request row writes nothing on 409 and 403', async () => {
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValue(null);
      try {
        await expect(sampleRequestService.submit('ev-2', rep)).rejects.toMatchObject({ statusCode: 409 });
        await expect(sampleRequestService.submit('ev-1', stranger)).rejects.toMatchObject({ statusCode: 403 });
        await expect(sampleRequestService.submit('ev-1', puller)).rejects.toMatchObject({ statusCode: 403 });
        noWrites();
      } finally {
        vi.mocked(sampleRequestRepository.findByEvent).mockImplementation(async () => row() as any);
      }
    });
    it('off-roster puller gets 403 (not 409) after close', async () => {
      await expect(sampleRequestService.patchRows('ev-2', patch, puller)).rejects.toMatchObject({ statusCode: 403 });
      await expect(sampleRequestService.submit('ev-2', puller)).rejects.toMatchObject({ statusCode: 403 });
    });
    it('puller on the roster patches while open and gets 409 after close', async () => {
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce('u-1');
      await sampleRequestService.patchRows('ev-1', patch, rep);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledTimes(1);
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce('u-1');
      await expect(sampleRequestService.patchRows('ev-2', patch, rep)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('puller who is also an admin patches after close', async () => {
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce('adm');
      await sampleRequestService.patchRows('ev-2', patch, admin);
      expect(sampleRequestRepository.applyRows).toHaveBeenCalledTimes(1);
    });
    it('404s an unknown event on patchRows, submit and getHistory', async () => {
      await expect(sampleRequestService.patchRows('nope', patch, rep)).rejects.toMatchObject({ statusCode: 404 });
      await expect(sampleRequestService.submit('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
      await expect(sampleRequestService.getHistory('nope', rep)).rejects.toMatchObject({ statusCode: 404 });
    });
    it('still notifies when the submitter is the puller', async () => {
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce('u-1');
      await sampleRequestService.submit('ev-1', rep);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({ kind: 'sample_request.submitted' }));
    });
  });

  describe('getHistory', () => {
    it('returns resolved change rows for viewers, 403 for strangers, empty when no request yet', async () => {
      const h = await sampleRequestService.getHistory('ev-1', puller);
      expect(h[0]).toMatchObject({ userName: 'Ana', targetName: 'Mango', field: 'singles', oldValue: '1', newValue: '3' });
      expect(sampleRequestRepository.listChanges).toHaveBeenCalledWith('req-1', 200);
      await expect(sampleRequestService.getHistory('ev-1', stranger)).rejects.toMatchObject({ statusCode: 403 });
      vi.mocked(sampleRequestRepository.findByEvent).mockResolvedValueOnce(null);
      expect(await sampleRequestService.getHistory('ev-1', rep)).toEqual([]);
    });
  });

  describe('listMyOpenRequests', () => {
    it('returns open shows with the event status, including submitted ones', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT, CLOSED_EVENT] } as any);
      vi.mocked(sampleRequestRepository.findStatusByEvents).mockResolvedValueOnce([{ event_id: 'ev-1', status: 'submitted', submitted_at: '2026-10-06T00:00:00Z', last_edited_at: null }]);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows).toEqual([{ eventId: 'ev-1', eventName: 'Expo', closesAt: '2026-10-21T03:59:59.000Z', status: 'submitted', submittedAt: '2026-10-06T00:00:00Z' }]);
    });
    it('maps untouched draft to none, edited draft to draft, submitted to submitted', async () => {
      const mk = (id: string) => ({ ...OPEN_EVENT, id, name: id });
      vi.mocked(query).mockResolvedValueOnce({ rows: [mk('a'), mk('b'), mk('c')] } as any);
      vi.mocked(sampleRequestRepository.findStatusByEvents).mockResolvedValueOnce([
        { event_id: 'a', status: 'draft', submitted_at: null, last_edited_at: null },
        { event_id: 'b', status: 'draft', submitted_at: null, last_edited_at: '2026-10-07T14:00:00Z' },
        { event_id: 'c', status: 'submitted', submitted_at: '2026-10-06T00:00:00Z', last_edited_at: null },
      ]);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(Object.fromEntries(rows.map((r) => [r.eventId, r.status]))).toEqual({ a: 'none', b: 'draft', c: 'submitted' });
    });
    it('reports none when no request row exists', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT] } as any);
      expect((await sampleRequestService.listMyOpenRequests('u-1'))[0].status).toBe('none');
    });
  });

  describe('announceIfOpen', () => {
    it('notifies each user once, keyed by the ledger', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any).mockResolvedValueOnce({ rows: [] } as any);
      await sampleRequestService.announceIfOpen('ev-1', ['u-1', 'u-3']);
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.anything());
    });
    it('does nothing when the window is closed', async () => {
      await sampleRequestService.announceIfOpen('ev-2', ['u-1']);
      expect(query).not.toHaveBeenCalled();
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
    it('links to the samples view', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any);
      await sampleRequestService.announceIfOpen('ev-1', ['u-1']);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({ kind: 'sample_request.open', link: { page: 'samples', eventId: 'ev-1' } }));
    });
  });
});
