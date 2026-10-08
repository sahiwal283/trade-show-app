// src/components/checklist/samples/__tests__/useEventSampleRequest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const view = (over: any = {}) => ({
  request: { id: 'r', eventId: 'ev-1', status: 'draft', submittedAt: null, submittedBy: null, lastEditedAt: null, lastEditedBy: null, items: [], materials: [], ...over.request },
  window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true, ...over.window },
  canEdit: over.canEdit ?? true,
});

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }, { id: 'p-2', product_line_id: 'l-1', name: 'Grape', position: 2, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      getEvent: vi.fn(async () => view()),
      patchEvent: vi.fn(async (_e: string, p: any) => view({ request: { items: p.items, materials: p.materials, lastEditedBy: { id: 'u-1', name: 'Me' }, lastEditedAt: '2026-10-07T15:00:00Z' } })),
      submitEvent: vi.fn(async () => view({ request: { status: 'submitted', submittedAt: '2026-10-07T15:00:00Z', submittedBy: { id: 'u-1', name: 'Me' } } })),
    },
  };
});

import { useEventSampleRequest } from '../useEventSampleRequest';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

const args = { eventId: 'ev-1', userId: 'u-1', role: 'salesperson' };

describe('useEventSampleRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => vi.useRealTimers());

  it('loads and autosaves only dirty rows', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(sampleRequestApi.getCatalog).toHaveBeenCalledWith(true);
    act(() => result.current.setItem('p-1', 'singles', 2));
    expect(result.current.dirtyCount).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(sampleRequestApi.patchEvent).toHaveBeenCalledWith('ev-1', { items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [] });
    expect(result.current.dirtyCount).toBe(0);
  });

  it('reconciles untouched rows from the server but keeps dirty and focused rows', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => { result.current.setItem('p-1', 'singles', 7); result.current.markFocused('p-2', true); result.current.setItem('p-2', 'displays', 1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });            // saves both
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce(view({ request: {
      items: [{ productId: 'p-1', singles: 9, displays: 0, emptyDisplays: 0 }, { productId: 'p-2', singles: 0, displays: 5, emptyDisplays: 0 }],
      lastEditedBy: { id: 'u-2', name: 'Sameer' }, lastEditedAt: '2026-10-07T15:01:00Z',
    } }));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.items.get('p-1')?.singles).toBe(9);      // untouched → server wins
    expect(result.current.items.get('p-2')?.displays).toBe(1);     // focused → local kept
    expect(result.current.updatedBy).toEqual({ name: 'Sameer', at: '2026-10-07T15:01:00Z' });
  });

  it('polls on window focus and every 30 s', async () => {
    renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(1));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(2));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(sampleRequestApi.getEvent).toHaveBeenCalledTimes(3);
  });

  it('submit waits for an in-flight save, flushes dirty rows, aborts when the flush fails', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 1));
    vi.mocked(sampleRequestApi.patchEvent).mockRejectedValueOnce(new Error('net'));
    await act(async () => { await result.current.submit(); });
    expect(sampleRequestApi.submitEvent).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/submit/i);
    await act(async () => { await result.current.submit(); });   // second try: patch succeeds
    expect(sampleRequestApi.submitEvent).toHaveBeenCalledWith('ev-1');
    expect(result.current.view?.request.status).toBe('submitted');
    expect(result.current.canSubmit).toBe(false);
  });

  it('flips closed on a 409 and forbidden on a 403', async () => {
    const { result } = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    vi.mocked(sampleRequestApi.patchEvent).mockRejectedValueOnce({ statusCode: 409, details: { error: 'closed', details: { code: 'WINDOW_CLOSED', closesAt: '2026-10-01T00:00:00Z' } } });
    act(() => result.current.setItem('p-1', 'singles', 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(result.current.closed).toBe(true);
    vi.mocked(sampleRequestApi.getEvent).mockRejectedValueOnce({ statusCode: 403 });
    const second = renderHook(() => useEventSampleRequest({ ...args, eventId: 'ev-x' }));
    await waitFor(() => expect(second.result.current.status).toBe('forbidden'));
  });

  it('respects canEdit from the server and clamps quantities', async () => {
    vi.mocked(sampleRequestApi.getEvent).mockResolvedValueOnce(view({ canEdit: false }));
    const { result } = renderHook(() => useEventSampleRequest({ ...args, userId: 'puller' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.canEdit).toBe(false);
    const r2 = renderHook(() => useEventSampleRequest(args));
    await waitFor(() => expect(r2.result.current.status).toBe('ready'));
    act(() => r2.result.current.setItem('p-1', 'singles', 99999));
    expect(r2.result.current.items.get('p-1')?.singles).toBe(10000);
  });
});
