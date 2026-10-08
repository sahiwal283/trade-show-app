// src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts
// Titles carry the behaviour number from the fix brief (task-7-fix-1-brief.md, Commit B, point 3).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { EventSampleRequestView, SampleRequestPatch } from '../../../../utils/sampleRequestApi';

type Item = { productId: string; singles: number; displays: number; emptyDisplays: number };
type Material = { materialId: string; qty: number; notes: string | null };
const ME = { id: 'u-1', name: 'Me' };
const SAMEER = { id: 'u-2', name: 'Sameer' };

/** A tiny stand-in for the server: field-level merge, a clock that only moves forward. */
const srv = {
  items: new Map<string, Item>(), materials: new Map<string, Material>(),
  status: 'draft' as 'draft' | 'submitted', submittedAt: null as string | null, submittedBy: null as typeof ME | null,
  lastEditedAt: null as string | null, lastEditedBy: null as typeof ME | null,
  isOpen: true, canEdit: true, clock: 0,
  tick() { this.clock += 1; return new Date(Date.UTC(2026, 9, 7, 15, 0, this.clock)).toISOString(); },
  view(): EventSampleRequestView {
    return {
      request: {
        id: 'r', eventId: 'ev-1', status: this.status, submittedAt: this.submittedAt, submittedBy: this.submittedBy,
        lastEditedAt: this.lastEditedAt, lastEditedBy: this.lastEditedBy,
        items: [...this.items.values()].map((i) => ({ ...i })), materials: [...this.materials.values()].map((m) => ({ ...m })),
      },
      window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: this.isOpen },
      canEdit: this.canEdit,
    };
  },
  patch(p: SampleRequestPatch, by = ME) {
    for (const { productId, ...f } of p.items) this.items.set(productId, { productId, singles: 0, displays: 0, emptyDisplays: 0, ...this.items.get(productId), ...f });
    for (const { materialId, ...f } of p.materials) {
      const next = { materialId, qty: 0, notes: null, ...this.materials.get(materialId), ...f };
      this.materials.set(materialId, { ...next, notes: next.notes?.trim() || null });
    }
    this.lastEditedAt = this.tick(); this.lastEditedBy = by;
    return this.view();
  },
  submit(by = ME) { this.status = 'submitted'; this.submittedAt = this.tick(); this.submittedBy = by; return this.view(); },
  reset() {
    this.items = new Map(); this.materials = new Map(); this.status = 'draft'; this.submittedAt = null; this.submittedBy = null;
    this.lastEditedAt = null; this.lastEditedBy = null; this.isOpen = true; this.canEdit = true; this.clock = 0;
  },
};
const item = (productId: string, singles = 0, displays = 0, emptyDisplays = 0): Item => ({ productId, singles, displays, emptyDisplays });

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: { getCatalog: vi.fn(), getEvent: vi.fn(), patchEvent: vi.fn(), submitEvent: vi.fn() },
  };
});

import { useEventSampleRequest } from '../useEventSampleRequest';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const api = vi.mocked(sampleRequestApi);
const args = { eventId: 'ev-1', userId: 'u-1', role: 'salesperson' };
const DEBOUNCE = 800;
const POLL = 30_000;

/** A promise the test resolves by hand, to hold a request in flight. */
function held<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const flushMicrotasks = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const patches = () => api.patchEvent.mock.calls.map((c) => c[1]);

async function ready(over: Partial<typeof args> = {}) {
  const hook = renderHook(() => useEventSampleRequest({ ...args, ...over }));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

describe('useEventSampleRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks(); srv.reset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getCatalog.mockImplementation(async () => ({
      lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
      products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }, { id: 'p-2', product_line_id: 'l-1', name: 'Grape', position: 2, is_active: true }],
      materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
    }));
    api.getEvent.mockImplementation(async () => srv.view());
    api.patchEvent.mockImplementation(async (_e, p) => srv.patch(p));
    api.submitEvent.mockImplementation(async () => srv.submit());
  });
  afterEach(() => vi.useRealTimers());

  describe('1: field-level dirty tracking', () => {
    it('1: setItem marks only that field dirty and the PATCH carries only dirty fields', async () => {
      srv.items.set('p-1', item('p-1', 1, 4));
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 3));
      expect(result.current.dirtyCount).toBe(1);
      expect(result.current.items.get('p-1')).toEqual(item('p-1', 3, 4));
      await advance(DEBOUNCE);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(api.patchEvent).toHaveBeenCalledWith('ev-1', { items: [{ productId: 'p-1', singles: 3 }], materials: [] });
      expect(result.current.dirtyCount).toBe(0);
      expect(result.current.items.get('p-1')).toEqual(item('p-1', 3, 4));
    });

    it('1: setMaterial marks only the keys present in its patch object', async () => {
      srv.materials.set('m-1', { materialId: 'm-1', qty: 2, notes: 'old' });
      const { result } = await ready();
      act(() => result.current.setMaterial('m-1', { notes: 'new' }));
      await advance(DEBOUNCE);
      expect(patches()).toEqual([{ items: [], materials: [{ materialId: 'm-1', notes: 'new' }] }]);
      act(() => result.current.setMaterial('m-1', { qty: 5 }));
      await advance(DEBOUNCE);
      expect(patches()[1]).toEqual({ items: [], materials: [{ materialId: 'm-1', qty: 5 }] });
      expect(result.current.materials.get('m-1')).toEqual({ materialId: 'm-1', qty: 5, notes: 'new' });
    });

    it('1: dirtyCount counts rows, not fields, and one PATCH carries every dirty field', async () => {
      const { result } = await ready();
      act(() => {
        result.current.setItem('p-1', 'singles', 1); result.current.setItem('p-1', 'emptyDisplays', 2);
        result.current.setItem('p-2', 'displays', 3); result.current.setMaterial('m-1', { qty: 1, notes: '' });
      });
      expect(result.current.dirtyCount).toBe(3);
      await advance(DEBOUNCE);
      expect(patches()).toEqual([{
        items: [{ productId: 'p-1', singles: 1, emptyDisplays: 2 }, { productId: 'p-2', displays: 3 }],
        materials: [{ materialId: 'm-1', qty: 1, notes: '' }],
      }]);
      expect(result.current.dirtyCount).toBe(0);
    });
  });

  describe('2: field-level reconciliation', () => {
    it('2: a refresh overwrites clean fields and keeps dirty ones, within the same row', async () => {
      srv.items.set('p-1', item('p-1', 1, 4));
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 7));
      srv.patch({ items: [{ productId: 'p-1', singles: 9, displays: 5 }], materials: [] }, SAMEER);
      await act(async () => { await result.current.refresh(); });
      expect(result.current.items.get('p-1')).toEqual(item('p-1', 7, 5));
      expect(result.current.dirtyCount).toBe(1);
    });

    it('2: a row absent from the view reads as zeros / null notes, except for its dirty fields', async () => {
      srv.items.set('p-1', item('p-1', 1, 4)); srv.items.set('p-2', item('p-2', 6));
      srv.materials.set('m-1', { materialId: 'm-1', qty: 2, notes: 'big' });
      const { result } = await ready();
      act(() => { result.current.setItem('p-1', 'singles', 7); result.current.setMaterial('m-1', { notes: 'mine' }); });
      srv.items.clear(); srv.materials.clear(); srv.lastEditedAt = srv.tick(); srv.lastEditedBy = SAMEER;
      await act(async () => { await result.current.refresh(); });
      expect(result.current.items.get('p-1')).toEqual(item('p-1', 7, 0));
      expect(result.current.items.get('p-2')).toBeUndefined();
      expect(result.current.materials.get('m-1')).toEqual({ materialId: 'm-1', qty: 0, notes: 'mine' });
    });
  });

  it('3: a field edited again during its in-flight save stays dirty and goes out next; the others become clean', async () => {
    const { result } = await ready();
    const gate = held<void>();
    api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
    act(() => { result.current.setItem('p-1', 'singles', 3); result.current.setItem('p-2', 'displays', 1); });
    await advance(DEBOUNCE);
    expect(api.patchEvent).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(true);
    act(() => result.current.setItem('p-1', 'singles', 4));
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.items.get('p-1')?.singles).toBe(4);       // the newer local value, not the response's 3
    expect(result.current.items.get('p-2')?.displays).toBe(1);
    expect(result.current.dirtyCount).toBe(1);                      // p-2 is clean, p-1.singles is still dirty
    await advance(DEBOUNCE);
    expect(patches()[1]).toEqual({ items: [{ productId: 'p-1', singles: 4 }], materials: [] });
    expect(result.current.dirtyCount).toBe(0);
    expect(srv.items.get('p-1')?.singles).toBe(4);
  });

  it('3: re-typing the same value during the save still counts as a newer edit', async () => {
    const { result } = await ready();
    const gate = held<void>();
    api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
    act(() => result.current.setItem('p-1', 'singles', 3));
    await advance(DEBOUNCE);
    act(() => result.current.setItem('p-1', 'singles', 4));
    act(() => result.current.setItem('p-1', 'singles', 3));
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.dirtyCount).toBe(1);
  });

  it('4: at most one PATCH is in flight; saves that come due meanwhile collapse into one follow-up', async () => {
    const { result } = await ready();
    const gate = held<void>();
    api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
    act(() => result.current.setItem('p-1', 'singles', 1));
    await advance(DEBOUNCE);                                         // first PATCH goes out and is held
    act(() => result.current.setItem('p-1', 'displays', 2));
    await advance(DEBOUNCE);                                         // second debounce comes due during the save
    act(() => result.current.setItem('p-2', 'singles', 5));
    await advance(DEBOUNCE);                                         // and a third
    expect(api.patchEvent).toHaveBeenCalledTimes(1);
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => expect(api.patchEvent).toHaveBeenCalledTimes(2));
    expect(patches()[1]).toEqual({ items: [{ productId: 'p-1', displays: 2 }, { productId: 'p-2', singles: 5 }], materials: [] });
    await advance(DEBOUNCE * 3);
    expect(api.patchEvent).toHaveBeenCalledTimes(2);                 // exactly one follow-up
    expect(result.current.dirtyCount).toBe(0);
  });

  it('4: saves that come due during a save share ONE follow-up, so a failing follow-up is not retried at once', async () => {
    const { result } = await ready();
    const gate = held<void>();
    api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
    api.patchEvent.mockRejectedValueOnce(new Error('net'));
    act(() => result.current.setItem('p-1', 'singles', 1));
    await advance(DEBOUNCE);
    act(() => result.current.setItem('p-1', 'displays', 2));
    await advance(DEBOUNCE);
    act(() => result.current.setItem('p-2', 'singles', 5));
    await advance(DEBOUNCE);
    await act(async () => { gate.resolve(); await gate.promise; });
    await waitFor(() => expect(result.current.error).toMatch(/save/i));
    await advance(DEBOUNCE * 3);
    expect(api.patchEvent).toHaveBeenCalledTimes(2);
    expect(result.current.dirtyCount).toBe(2);
  });

  describe('5: response-ordering guard', () => {
    it('5: a GET issued before a save started is not applied when it resolves after the save', async () => {
      srv.items.set('p-1', item('p-1', 1));
      const { result } = await ready();
      const stale = held<EventSampleRequestView>();
      const oldView = srv.view();
      api.getEvent.mockImplementationOnce(() => stale.promise);
      let pending!: Promise<void>;
      act(() => { pending = result.current.refresh(); });
      act(() => result.current.setItem('p-1', 'singles', 8));
      await advance(DEBOUNCE);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(result.current.dirtyCount).toBe(0);
      await act(async () => { stale.resolve(oldView); await pending; });
      expect(result.current.items.get('p-1')?.singles).toBe(8);
      expect(result.current.view?.request.lastEditedAt).toBe(srv.lastEditedAt);
    });

    it('5: a GET issued while a save is in flight is not applied, even with a newer lastEditedAt', async () => {
      srv.items.set('p-1', item('p-1', 1));
      const { result } = await ready();
      const gate = held<void>();
      api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
      act(() => result.current.setItem('p-1', 'singles', 8));
      await advance(DEBOUNCE);                                       // PATCH in flight
      // The GET reads the row before our patch landed, yet carries a later stamp (someone else's edit elsewhere).
      const racing = held<EventSampleRequestView>();
      const racedView = srv.view();
      racedView.request.items = [item('p-1', 1)];
      racedView.request.lastEditedAt = '2026-10-07T16:00:00.000Z'; racedView.request.lastEditedBy = SAMEER;
      api.getEvent.mockImplementationOnce(() => racing.promise);
      let pending!: Promise<void>;
      act(() => { pending = result.current.refresh(); });
      await act(async () => { gate.resolve(); await gate.promise; });
      await waitFor(() => expect(result.current.dirtyCount).toBe(0));
      await act(async () => { racing.resolve(racedView); await pending; });
      expect(result.current.items.get('p-1')?.singles).toBe(8);
      expect(result.current.updatedBy).toBeNull();
    });

    it('5: a GET that resolves while a save is in flight is not applied either', async () => {
      srv.items.set('p-2', item('p-2', 1));
      const { result } = await ready();
      const gate = held<void>();
      api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
      act(() => result.current.setItem('p-1', 'singles', 8));
      await advance(DEBOUNCE);
      const early = srv.view(); early.request.items = [item('p-2', 99)];
      api.getEvent.mockImplementationOnce(async () => early);
      await act(async () => { await result.current.refresh(); });
      expect(result.current.items.get('p-2')?.singles).toBe(1);
      await act(async () => { gate.resolve(); await gate.promise; });
      await waitFor(() => expect(result.current.saving).toBe(false));
    });

    it('5: a view older than the newest one already applied is ignored; of two GETs the later-issued wins', async () => {
      const { result } = await ready();
      const first = held<EventSampleRequestView>();
      api.getEvent.mockImplementationOnce(() => first.promise);
      let slow!: Promise<void>;
      act(() => { slow = result.current.refresh(); });
      const oldView = srv.patch({ items: [{ productId: 'p-1', singles: 2 }], materials: [] }, SAMEER);
      srv.patch({ items: [{ productId: 'p-1', singles: 6 }], materials: [] }, SAMEER);
      await act(async () => { await result.current.refresh(); });     // issued second, resolves first
      expect(result.current.items.get('p-1')?.singles).toBe(6);
      await act(async () => { first.resolve(oldView); await slow; });
      expect(result.current.items.get('p-1')?.singles).toBe(6);

      api.getEvent.mockImplementationOnce(async () => oldView);  // a fresh GET that somehow returns older data
      await act(async () => { await result.current.refresh(); });
      expect(result.current.items.get('p-1')?.singles).toBe(6);
      expect(result.current.view?.request.lastEditedAt).toBe(srv.lastEditedAt);
    });
    it('5: of two GETs with the same lastEditedAt, the earlier-issued one cannot overwrite the later-issued one', async () => {
      const { result } = await ready();
      const first = held<EventSampleRequestView>();
      const beforeSubmit = srv.view();
      api.getEvent.mockImplementationOnce(() => first.promise);
      let slow!: Promise<void>;
      act(() => { slow = result.current.refresh(); });
      srv.submit(SAMEER);                                             // submitting does not move lastEditedAt
      await act(async () => { await result.current.refresh(); });
      expect(result.current.view?.request.status).toBe('submitted');
      await act(async () => { first.resolve(beforeSubmit); await slow; });
      expect(result.current.view?.request.status).toBe('submitted');
    });
  });

  describe('6: updated-by note', () => {
    it('6: a never-edited request then a refresh edited by someone else sets the note', async () => {
      const { result } = await ready();
      expect(result.current.view?.request.lastEditedAt).toBeNull();
      expect(result.current.updatedBy).toBeNull();
      srv.patch({ items: [{ productId: 'p-1', singles: 2 }], materials: [] }, SAMEER);
      await act(async () => { await result.current.refresh(); });
      expect(result.current.updatedBy).toEqual({ name: 'Sameer', at: srv.lastEditedAt });
    });

    it('6: an initial load already edited by someone else sets no note', async () => {
      srv.patch({ items: [{ productId: 'p-1', singles: 2 }], materials: [] }, SAMEER);
      const { result } = await ready();
      expect(result.current.view?.request.lastEditedBy).toEqual(SAMEER);
      expect(result.current.updatedBy).toBeNull();
      await act(async () => { await result.current.refresh(); });     // same lastEditedAt again: still nothing new
      expect(result.current.updatedBy).toBeNull();
    });

    it('6: my own save sets no note', async () => {
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 2));
      await advance(DEBOUNCE);
      expect(result.current.view?.request.lastEditedBy).toEqual(ME);
      expect(result.current.updatedBy).toBeNull();
    });
  });

  describe('7: resubmit state follows the server', () => {
    it('7: a never-submitted draft can be submitted', async () => {
      const { result } = await ready();
      expect(result.current.canSubmit).toBe(true);
    });

    it('7: a submitted form with lastEditedAt <= submittedAt cannot be resubmitted', async () => {
      srv.patch({ items: [{ productId: 'p-1', singles: 2 }], materials: [] }, SAMEER); srv.submit(SAMEER);
      const { result } = await ready();
      expect(result.current.canSubmit).toBe(false);
    });

    it('7: a refresh showing someone edited after submission enables resubmit', async () => {
      srv.submit(SAMEER);
      const { result } = await ready();
      expect(result.current.canSubmit).toBe(false);
      srv.patch({ items: [{ productId: 'p-1', singles: 2 }], materials: [] }, SAMEER);
      await act(async () => { await result.current.refresh(); });
      expect(result.current.canSubmit).toBe(true);
    });

    it('7: false after this client submits, true again after an edit, and still true once that edit is saved', async () => {
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 2));
      await act(async () => { await result.current.submit(); });
      expect(result.current.view?.request.status).toBe('submitted');
      expect(result.current.canSubmit).toBe(false);
      act(() => result.current.setItem('p-1', 'singles', 3));
      expect(result.current.canSubmit).toBe(true);                    // dirty
      await advance(DEBOUNCE);
      expect(result.current.dirtyCount).toBe(0);
      expect(result.current.canSubmit).toBe(true);                    // lastEditedAt > submittedAt
      await act(async () => { await result.current.submit(); });
      expect(result.current.canSubmit).toBe(false);
    });

    it('7: not submittable when the form is not editable', async () => {
      srv.canEdit = false;
      const { result } = await ready();
      expect(result.current.canSubmit).toBe(false);
    });
  });

  describe('8: submit ordering', () => {
    it('8a: submit waits for the in-flight PATCH, then flushes what is dirty, then submits', async () => {
      const { result } = await ready();
      const order: string[] = [];
      const gate = held<void>();
      api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; order.push('patch-1 resolved'); return v; });
      api.patchEvent.mockImplementationOnce(async (_e, p) => { order.push('flush sent'); return srv.patch(p); });
      api.submitEvent.mockImplementationOnce(async () => { order.push('submit sent'); return srv.submit(); });
      act(() => result.current.setItem('p-1', 'singles', 1));
      await advance(DEBOUNCE);                                       // PATCH 1 genuinely in flight
      expect(result.current.saving).toBe(true);
      act(() => result.current.setItem('p-2', 'displays', 2));       // dirty, not yet sent
      let done!: Promise<void>;
      act(() => { done = result.current.submit(); });
      await flushMicrotasks();
      expect(result.current.submitting).toBe(true);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(api.submitEvent).not.toHaveBeenCalled();
      await act(async () => { gate.resolve(); await done; });
      expect(order).toEqual(['patch-1 resolved', 'flush sent', 'submit sent']);
      expect(patches()[1]).toEqual({ items: [{ productId: 'p-2', displays: 2 }], materials: [] });
      expect(result.current.view?.request.status).toBe('submitted');
      expect(result.current.submitting).toBe(false);
      expect(result.current.dirtyCount).toBe(0);
      expect(result.current.canSubmit).toBe(false);
      await advance(DEBOUNCE * 2);
      expect(api.patchEvent).toHaveBeenCalledTimes(2);                // the debounce that came due finds nothing left
    });

    it('8a: with nothing dirty, submit sends no PATCH', async () => {
      const { result } = await ready();
      await act(async () => { await result.current.submit(); });
      expect(api.patchEvent).not.toHaveBeenCalled();
      expect(api.submitEvent).toHaveBeenCalledWith('ev-1');
    });

    it('8b: when the flush fails, submitEvent is not called and an error is set', async () => {
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 1));
      api.patchEvent.mockRejectedValueOnce(new Error('net'));
      await act(async () => { await result.current.submit(); });
      expect(api.submitEvent).not.toHaveBeenCalled();
      expect(result.current.error).toMatch(/submit/i);
      expect(result.current.submitting).toBe(false);
      expect(result.current.dirtyCount).toBe(1);
      await act(async () => { await result.current.submit(); });      // second try: the flush succeeds
      expect(api.submitEvent).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBeNull();
      expect(result.current.view?.request.status).toBe('submitted');
    });

    it('8b: a failing submitEvent sets an error and leaves the form a draft', async () => {
      const { result } = await ready();
      api.submitEvent.mockRejectedValueOnce(new Error('net'));
      await act(async () => { await result.current.submit(); });
      expect(result.current.error).toMatch(/submit/i);
      expect(result.current.view?.request.status).toBe('draft');
      expect(result.current.canSubmit).toBe(true);
    });
  });

  describe('9: retry', () => {
    it('9: a failed save keeps its fields dirty and is retried on the next poll tick, not in a loop', async () => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce(new Error('net'));
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(result.current.dirtyCount).toBe(1);
      expect(result.current.error).toMatch(/save/i);
      expect(result.current.items.get('p-1')?.singles).toBe(3);
      await advance(POLL - DEBOUNCE - 1000);                         // nothing retries on its own before the poll
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      await advance(1000);
      expect(api.patchEvent).toHaveBeenCalledTimes(2);
      expect(patches()[1]).toEqual({ items: [{ productId: 'p-1', singles: 3 }], materials: [] });
      expect(result.current.dirtyCount).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it('9: the next edit retries, carrying the failed fields along', async () => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce(new Error('net'));
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      act(() => result.current.setItem('p-2', 'displays', 1));
      await advance(DEBOUNCE);
      expect(patches()[1]).toEqual({ items: [{ productId: 'p-1', singles: 3 }, { productId: 'p-2', displays: 1 }], materials: [] });
    });

    it('9: reconnecting retries', async () => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce(new Error('net'));
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      act(() => { window.dispatchEvent(new Event('offline')); });
      act(() => { window.dispatchEvent(new Event('online')); });
      await advance(DEBOUNCE);
      expect(api.patchEvent).toHaveBeenCalledTimes(2);
      expect(result.current.dirtyCount).toBe(0);
    });
  });

  describe('10: carried over', () => {
    it('10: a 409 WINDOW_CLOSED (nested details.details.code) flips closed and stops editing', async () => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce({ statusCode: 409, details: { error: 'closed', details: { code: 'WINDOW_CLOSED', closesAt: '2026-10-01T00:00:00Z' } } });
      act(() => result.current.setItem('p-1', 'singles', 1));
      await advance(DEBOUNCE);
      expect(result.current.closed).toBe(true);
      expect(result.current.canEdit).toBe(false);
      expect(result.current.canSubmit).toBe(false);
      expect(result.current.error).toBeNull();
      await advance(POLL);                                           // a closed form is not retried
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
    });

    it('10: a 409 WINDOW_CLOSED on submit flips closed', async () => {
      const { result } = await ready();
      api.submitEvent.mockRejectedValueOnce({ statusCode: 409, details: { error: 'closed', details: { code: 'WINDOW_CLOSED', closesAt: null } } });
      await act(async () => { await result.current.submit(); });
      expect(result.current.closed).toBe(true);
    });

    it('10: a closed window keeps an override role read-only until override is switched on', async () => {
      srv.isOpen = false;
      const { result } = await ready({ role: 'admin' });
      expect(result.current.closed).toBe(true);
      expect(result.current.canEdit).toBe(false);
      act(() => result.current.setOverride(true));
      expect(result.current.canEdit).toBe(true);
    });

    it('10: a 403 on load reports forbidden and never polls', async () => {
      api.getEvent.mockRejectedValueOnce({ statusCode: 403 });
      const { result } = renderHook(() => useEventSampleRequest(args));
      await waitFor(() => expect(result.current.status).toBe('forbidden'));
      act(() => { window.dispatchEvent(new Event('focus')); });
      await advance(POLL);
      expect(api.getEvent).toHaveBeenCalledTimes(1);
    });

    it('10: offline makes the form read-only; back online the dirty fields are flushed', async () => {
      const { result } = await ready();
      act(() => { window.dispatchEvent(new Event('offline')); });
      expect(result.current.isOffline).toBe(true);
      expect(result.current.canEdit).toBe(false);
      act(() => result.current.setItem('p-1', 'singles', 4));
      await advance(DEBOUNCE * 3);
      expect(api.patchEvent).not.toHaveBeenCalled();
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(result.current.canEdit).toBe(true);
      await advance(DEBOUNCE);
      expect(patches()).toEqual([{ items: [{ productId: 'p-1', singles: 4 }], materials: [] }]);
    });

    it('10: unmounting with dirty fields sends one best-effort PATCH', async () => {
      const { result, unmount } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 4));
      unmount();
      await flushMicrotasks();
      expect(patches()).toEqual([{ items: [{ productId: 'p-1', singles: 4 }], materials: [] }]);
      await advance(POLL);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
    });

    it('10: unmounting during a save sends only what that save did not carry, after it', async () => {
      const { result, unmount } = await ready();
      const gate = held<void>();
      api.patchEvent.mockImplementationOnce(async (_e, p) => { const v = srv.patch(p); await gate.promise; return v; });
      act(() => result.current.setItem('p-1', 'singles', 4));
      await advance(DEBOUNCE);
      act(() => result.current.setItem('p-2', 'displays', 1));
      unmount();
      await flushMicrotasks();
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      await act(async () => { gate.resolve(); await gate.promise; });
      await flushMicrotasks();
      expect(patches()).toEqual([
        { items: [{ productId: 'p-1', singles: 4 }], materials: [] },
        { items: [{ productId: 'p-2', displays: 1 }], materials: [] },
      ]);
    });

    it('10: unmounting with nothing dirty sends nothing', async () => {
      const { unmount } = await ready();
      unmount();
      await flushMicrotasks();
      expect(api.patchEvent).not.toHaveBeenCalled();
    });

    it('10: quantities clamp to 0..10000', async () => {
      const { result } = await ready();
      act(() => { result.current.setItem('p-1', 'singles', 99999); result.current.setItem('p-1', 'displays', -4); result.current.setMaterial('m-1', { qty: 10001 }); });
      expect(result.current.items.get('p-1')).toEqual(item('p-1', 10000, 0));
      expect(result.current.materials.get('m-1')?.qty).toBe(10000);
    });

    it('10: canEdit is false when the server view says canEdit false', async () => {
      srv.canEdit = false;
      const { result } = await ready({ userId: 'puller' });
      expect(result.current.canEdit).toBe(false);
    });

    it('10: loads the catalog including inactive rows', async () => {
      const { result } = await ready();
      expect(api.getCatalog).toHaveBeenCalledWith(true);
      expect(result.current.catalog?.products).toHaveLength(2);
    });

    it('10: polls every 30 s and on window focus, only once ready', async () => {
      const load = held<EventSampleRequestView>();
      api.getEvent.mockImplementationOnce(() => load.promise);
      const { result } = renderHook(() => useEventSampleRequest(args));
      act(() => { window.dispatchEvent(new Event('focus')); });
      await advance(POLL);
      expect(api.getEvent).toHaveBeenCalledTimes(1);                  // still loading: no focus refresh, no poll
      await act(async () => { load.resolve(srv.view()); await load.promise; });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      act(() => { window.dispatchEvent(new Event('focus')); });
      await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
      await advance(POLL);
      expect(api.getEvent).toHaveBeenCalledTimes(3);
    });

    it('10: unmount removes every listener and timer', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const { unmount } = await ready();
      const added = add.mock.calls.filter(([type]) => ['focus', 'online', 'offline'].includes(type));
      expect(added.map(([type]) => type).sort()).toEqual(['focus', 'offline', 'online']);
      unmount();
      for (const [type, fn] of added) expect(remove).toHaveBeenCalledWith(type, fn);
      act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
      await advance(POLL * 2);
      expect(api.getEvent).toHaveBeenCalledTimes(1);
      expect(api.patchEvent).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      add.mockRestore(); remove.mockRestore();
    });
  });

  describe('11: a rejected save is terminal', () => {
    const REJECTED = 'Your changes were not accepted. Refresh to see the current list.';

    it.each([403, 400])('11: a %i on PATCH sets the error, drops those fields, issues one GET and is not retried', async (statusCode) => {
      srv.items.set('p-1', item('p-1', 1, 4));
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce({ statusCode });
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));   // the load, then exactly one refresh
      expect(result.current.error).toBe(REJECTED);
      expect(result.current.dirtyCount).toBe(0);
      await waitFor(() => expect(result.current.items.get('p-1')).toEqual(item('p-1', 1, 4)));   // server truth again
      expect(api.getEvent).toHaveBeenCalledTimes(2);
      await advance(POLL);                                           // the tick polls; it does not re-send the rejected field
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(REJECTED);
      expect(result.current.status).toBe('ready');
    });

    it('11: a 403 on the refresh that follows a rejected save reports forbidden', async () => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce({ statusCode: 403 });
      api.getEvent.mockRejectedValueOnce({ statusCode: 403 });
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      await waitFor(() => expect(result.current.status).toBe('forbidden'));
      expect(result.current.canEdit).toBe(false);
      await advance(POLL);
      expect(api.patchEvent).toHaveBeenCalledTimes(1);
      expect(api.getEvent).toHaveBeenCalledTimes(2);
    });

    it('11: only the fields of the rejected request are dropped; an edit made during it stays dirty and goes out next', async () => {
      const { result } = await ready();
      const gate = held<void>();
      api.patchEvent.mockImplementationOnce(async () => { await gate.promise; throw { statusCode: 400 }; });
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      act(() => result.current.setItem('p-2', 'displays', 1));
      await act(async () => { gate.resolve(); await gate.promise; });
      await waitFor(() => expect(result.current.saving).toBe(false));
      expect(result.current.dirtyCount).toBe(1);
      await advance(DEBOUNCE);
      expect(patches()[1]).toEqual({ items: [{ productId: 'p-2', displays: 1 }], materials: [] });
      await waitFor(() => expect(result.current.items.get('p-1')).toBeUndefined());   // the rejected 3 is gone
      expect(result.current.items.get('p-2')?.displays).toBe(1);
    });

    it('11: a rejected flush stops submit and keeps the rejection message', async () => {
      const { result } = await ready();
      act(() => result.current.setItem('p-1', 'singles', 1));
      api.patchEvent.mockRejectedValueOnce({ statusCode: 400 });
      await act(async () => { await result.current.submit(); });
      expect(api.submitEvent).not.toHaveBeenCalled();
      expect(result.current.error).toBe(REJECTED);
      expect(result.current.dirtyCount).toBe(0);
      await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2));
    });

    it.each([408, 429, 500, 503])('11: a %i is not a rejection: the fields stay dirty and the next poll tick retries', async (statusCode) => {
      const { result } = await ready();
      api.patchEvent.mockRejectedValueOnce({ statusCode });
      act(() => result.current.setItem('p-1', 'singles', 3));
      await advance(DEBOUNCE);
      expect(result.current.error).toMatch(/Could not save/);
      expect(result.current.dirtyCount).toBe(1);
      expect(api.getEvent).toHaveBeenCalledTimes(1);
      await advance(POLL);
      expect(api.patchEvent).toHaveBeenCalledTimes(2);
      expect(result.current.dirtyCount).toBe(0);
    });
  });

  describe('12: recovering from a failed load', () => {
    const online = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
    afterEach(() => vi.restoreAllMocks());

    it('12: a load that failed offline is retried on the online event', async () => {
      const spy = online(false);
      api.getEvent.mockRejectedValueOnce(new Error('net'));
      const { result } = renderHook(() => useEventSampleRequest(args));
      await waitFor(() => expect(result.current.status).toBe('offline'));
      spy.mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.isOffline).toBe(false);
      expect(result.current.catalog?.products).toHaveLength(2);
      expect(result.current.canEdit).toBe(true);
      expect(api.getCatalog).toHaveBeenCalledTimes(2);
      expect(api.getEvent).toHaveBeenCalledTimes(2);
    });

    it('12: a load that failed with an error is retried on the online event too', async () => {
      api.getCatalog.mockRejectedValueOnce({ statusCode: 500 });
      const { result } = renderHook(() => useEventSampleRequest(args));
      await waitFor(() => expect(result.current.status).toBe('error'));
      act(() => { window.dispatchEvent(new Event('online')); });
      await waitFor(() => expect(result.current.status).toBe('ready'));
    });

    it('12: retry() re-runs the load, shows loading meanwhile, and can fail again', async () => {
      api.getEvent.mockRejectedValueOnce({ statusCode: 500 });
      const { result } = renderHook(() => useEventSampleRequest(args));
      await waitFor(() => expect(result.current.status).toBe('error'));
      const load = held<EventSampleRequestView>();
      api.getEvent.mockImplementationOnce(() => load.promise);
      act(() => result.current.retry());
      expect(result.current.status).toBe('loading');
      await act(async () => { load.reject({ statusCode: 500 }); await load.promise.catch(() => undefined); });
      await waitFor(() => expect(result.current.status).toBe('error'));
      act(() => result.current.retry());
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(api.getEvent).toHaveBeenCalledTimes(3);
    });

    it('12: retry() and the online event do nothing once ready or forbidden', async () => {
      const { result } = await ready();
      act(() => result.current.retry());
      act(() => { window.dispatchEvent(new Event('online')); });
      await flushMicrotasks();
      expect(result.current.status).toBe('ready');
      expect(api.getCatalog).toHaveBeenCalledTimes(1);
      expect(api.getEvent).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      api.getEvent.mockRejectedValueOnce({ statusCode: 403 });
      const denied = renderHook(() => useEventSampleRequest(args));
      await waitFor(() => expect(denied.result.current.status).toBe('forbidden'));
      act(() => denied.result.current.retry());
      act(() => { window.dispatchEvent(new Event('online')); });
      await flushMicrotasks();
      expect(denied.result.current.status).toBe('forbidden');
      expect(api.getEvent).toHaveBeenCalledTimes(1);
    });
  });
});
