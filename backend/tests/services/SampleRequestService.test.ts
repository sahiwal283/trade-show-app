import { describe, it, expect, beforeEach, vi } from 'vitest';

// travel Oct 30 − 10 days = Oct 20; 23:59:59 EDT (UTC−4) = 2026-10-21T03:59:59Z. NOW (Oct 7) is well inside.
const OPEN_EVENT = { id: 'ev-1', name: 'Expo', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-30', show_start_date: '2026-11-01' };
// travel Oct 9 − 10 days = Sep 29, already past at NOW (Oct 7) -> closed.
const CLOSED_EVENT = { id: 'ev-2', name: 'Soon', created_at: '2026-10-01T00:00:00Z', travel_start_date: '2026-10-09', show_start_date: '2026-10-10' };
const NOW = new Date('2026-10-07T15:00:00Z');

const draft = (over = {}) => ({
  id: 'req-1', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null,
  created_at: '', updated_at: '', items: [], materials: [], ...over,
});

vi.mock('../../src/database/repositories/SampleRequestRepository', () => ({
  sampleRequestRepository: {
    getCatalog: vi.fn(async () => ({
      lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
      products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }],
      materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
    })),
    findRequest: vi.fn(async () => null),
    upsertDraft: vi.fn(async (e: string, u: string) => draft({ event_id: e, user_id: u })),
    replaceContents: vi.fn(async () => undefined),
    markSubmitted: vi.fn(async () => ({ ...draft(), status: 'submitted', submitted_at: '2026-10-07T15:00:00Z' })),
    findRequestsForUser: vi.fn(async () => []),
    findEventRequests: vi.fn(async () => []),
    findEventItems: vi.fn(async () => []),
    findEventMaterials: vi.fn(async () => []),
    getPullerUserId: vi.fn(async () => 'puller-1'),
  },
}));
vi.mock('../../src/database/repositories/EventRepository', () => ({
  eventRepository: {
    findById: vi.fn(async (id: string) => (id === 'ev-1' ? OPEN_EVENT : id === 'ev-2' ? CLOSED_EVENT : null)),
    findAll: vi.fn(async () => [OPEN_EVENT, CLOSED_EVENT]),
  },
}));
vi.mock('../../src/services/EventParticipantService', () => ({
  isEventParticipant: vi.fn(async (_e: string, u: string) => u === 'u-1' || u === 'puller-1'),
  getCurrentParticipantIds: vi.fn(async () => ['u-1']),
}));
vi.mock('../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n-1' })) },
}));
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [{ id: 'ev-1', user_id: 'u-1' }] })),
}));

import { sampleRequestService } from '../../src/services/sampleRequests/SampleRequestService';
import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { notificationService } from '../../src/services/NotificationService';
import { query } from '../../src/config/database';

const rep = { id: 'u-1', role: 'salesperson' };
const stranger = { id: 'u-2', role: 'salesperson' };
const admin = { id: 'adm', role: 'admin' };
const payload = { items: [{ productId: 'p-1', singles: 3, displays: 1, emptyDisplays: 0 }], materials: [] };

describe('SampleRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  describe('getRequest', () => {
    it('creates the draft for a participant and returns the window', async () => {
      const view = await sampleRequestService.getRequest('ev-1', 'u-1', rep);
      expect(view.request.status).toBe('draft');
      expect(view.window.isOpen).toBe(true);
      expect(view.window.closesAt).toBe('2026-10-21T03:59:59.000Z');
    });
    it('rejects a non-participant', async () => {
      await expect(sampleRequestService.getRequest('ev-1', 'u-2', stranger)).rejects.toThrow(/participant/i);
    });
    it('rejects a rep reading another rep', async () => {
      await expect(sampleRequestService.getRequest('ev-1', 'u-1', stranger)).rejects.toThrow(/own/i);
    });
    it('lets an admin read any participant', async () => {
      const view = await sampleRequestService.getRequest('ev-1', 'u-1', admin);
      expect(view.request.user_id).toBe('u-1');
    });
    it('404s an unknown event', async () => {
      await expect(sampleRequestService.getRequest('nope', 'u-1', rep)).rejects.toThrow(/not found/i);
    });
  });

  describe('saveDraft', () => {
    it('validates and writes contents while open', async () => {
      await sampleRequestService.saveDraft('ev-1', 'u-1', payload, rep);
      expect(sampleRequestRepository.replaceContents).toHaveBeenCalledWith('req-1', payload);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
    it('409s when the window is closed', async () => {
      await expect(sampleRequestService.saveDraft('ev-2', 'u-1', payload, rep)).rejects.toMatchObject({ statusCode: 409 });
      expect(sampleRequestRepository.replaceContents).not.toHaveBeenCalled();
    });
    it('lets an admin save after close', async () => {
      await sampleRequestService.saveDraft('ev-2', 'u-1', payload, admin);
      expect(sampleRequestRepository.replaceContents).toHaveBeenCalled();
    });
    it('400s a bad payload and writes nothing', async () => {
      await expect(sampleRequestService.saveDraft('ev-1', 'u-1', { items: [{ productId: 'zzz', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [] }, rep))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(sampleRequestRepository.replaceContents).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('marks submitted and notifies the puller with "New" wording the first time', async () => {
      await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(sampleRequestRepository.markSubmitted).toHaveBeenCalledWith('req-1');
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({
        kind: 'sample_request.submitted', title: expect.stringMatching(/^New sample request/),
        link: { page: 'samples', eventId: 'ev-1' },
      }));
    });
    it('uses "updated" wording on a re-submit', async () => {
      vi.mocked(sampleRequestRepository.upsertDraft).mockResolvedValueOnce(draft({ status: 'submitted', submitted_at: '2026-10-05T00:00:00Z' }) as any);
      await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.objectContaining({ title: expect.stringMatching(/updated/i) }));
    });
    it('still notifies when the submitter is the puller', async () => {
      await sampleRequestService.submit('ev-1', 'puller-1', { id: 'puller-1', role: 'salesperson' });
      expect(notificationService.notify).toHaveBeenCalledWith('puller-1', expect.anything());
    });
    it('succeeds without a puller configured', async () => {
      vi.mocked(sampleRequestRepository.getPullerUserId).mockResolvedValueOnce(null);
      const view = await sampleRequestService.submit('ev-1', 'u-1', rep);
      expect(view.request.status).toBe('submitted');
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
    it('409s when closed for a rep', async () => {
      await expect(sampleRequestService.submit('ev-2', 'u-1', rep)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('listMyOpenRequests', () => {
    it('lists open shows the user is on with their status, excluding closed ones', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT, CLOSED_EVENT] } as any);
      vi.mocked(sampleRequestRepository.findRequestsForUser).mockResolvedValueOnce([{ event_id: 'ev-1', status: 'draft', submitted_at: null }]);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows).toEqual([{ eventId: 'ev-1', eventName: 'Expo', closesAt: '2026-10-21T03:59:59.000Z', status: 'draft', submittedAt: null }]);
    });
    it('reports status none when no draft exists yet', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [OPEN_EVENT] } as any);
      const rows = await sampleRequestService.listMyOpenRequests('u-1');
      expect(rows[0].status).toBe('none');
    });
  });

  describe('getEventSummary', () => {
    it('sums per product across reps and flags drafts', async () => {
      vi.mocked(sampleRequestRepository.findEventRequests).mockResolvedValueOnce([
        { user_id: 'u-1', user_name: 'Ana', status: 'submitted', submitted_at: '2026-10-06T00:00:00Z' },
        { user_id: 'u-3', user_name: 'Bo', status: 'draft', submitted_at: null },
        { user_id: 'u-4', user_name: 'Cy', status: null, submitted_at: null },
      ]);
      vi.mocked(sampleRequestRepository.findEventItems).mockResolvedValueOnce([
        { user_id: 'u-1', user_name: 'Ana', status: 'submitted', product_id: 'p-1', singles: 2, displays: 1, empty_displays: 0 },
        { user_id: 'u-3', user_name: 'Bo', status: 'draft', product_id: 'p-1', singles: 1, displays: 0, empty_displays: 2 },
      ]);
      const s = await sampleRequestService.getEventSummary('ev-1', admin);
      expect(s.products).toHaveLength(1);
      expect(s.products[0]).toMatchObject({ productId: 'p-1', productName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands', singles: 3, displays: 1, emptyDisplays: 2 });
      expect(s.products[0].byUser.map((b) => b.status)).toEqual(['submitted', 'draft']);
      expect(s.participants.map((p) => p.status)).toEqual(['submitted', 'draft', 'none']);
      expect(s.pullerUserId).toBe('puller-1');
    });
    it('allows the puller even without a privileged role', async () => {
      await expect(sampleRequestService.getEventSummary('ev-1', { id: 'puller-1', role: 'salesperson' })).resolves.toBeTruthy();
    });
    it('rejects a plain participant', async () => {
      await expect(sampleRequestService.getEventSummary('ev-1', rep)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('announceIfOpen', () => {
    it('notifies each user once, keyed by the ledger', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ event_id: 'ev-1' }] } as any)   // claim u-1: inserted
        .mockResolvedValueOnce({ rows: [] } as any);                        // claim u-5: conflict
      await sampleRequestService.announceIfOpen('ev-1', ['u-1', 'u-5']);
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
      expect(notificationService.notify).toHaveBeenCalledWith('u-1', expect.objectContaining({
        kind: 'sample_request.open', link: { page: 'checklist', eventId: 'ev-1' },
      }));
    });
    it('does nothing when the window is closed', async () => {
      await sampleRequestService.announceIfOpen('ev-2', ['u-1']);
      expect(notificationService.notify).not.toHaveBeenCalled();
    });
  });
});
