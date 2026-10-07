import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../../utils/sampleRequestApi', async (orig) => {
  const actual = await orig<typeof import('../../../../utils/sampleRequestApi')>();
  return {
    ...actual,
    sampleRequestApi: {
      getCatalog: vi.fn(async () => ({
        lines: [{ id: 'l-1', brand: 'boomin_brands', name: 'Peelz', position: 1, is_active: true }],
        products: [{ id: 'p-1', product_line_id: 'l-1', name: 'Mango', position: 1, is_active: true }],
        materials: [{ id: 'm-1', name: 'Banner', position: 1, is_active: true }],
      })),
      getMine: vi.fn(async () => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, items: [], materials: [] },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      saveMine: vi.fn(async (_e: string, p: any) => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'draft', submitted_at: null, ...p },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      submitMine: vi.fn(async () => ({
        request: { id: 'r', event_id: 'ev-1', user_id: 'u-1', status: 'submitted', submitted_at: '2026-10-07T00:00:00Z', items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [] },
        window: { opensAt: '2026-10-01T00:00:00Z', closesAt: '2099-01-01T00:00:00Z', isOpen: true },
      })),
      getForUser: vi.fn(), saveForUser: vi.fn(), submitForUser: vi.fn(),
    },
  };
});

import { useSampleRequest } from '../useSampleRequest';
import { sampleRequestApi } from '../../../../utils/sampleRequestApi';

describe('useSampleRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); });

  it('loads catalog and request, then autosaves a changed quantity after the debounce', async () => {
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 2));
    expect(result.current.dirty).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(sampleRequestApi.saveMine).toHaveBeenCalledWith('ev-1', {
      items: [{ productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 }], materials: [],
    });
  });

  it('submit enables only when the draft differs from the last submission', async () => {
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.canSubmit).toBe(true); // never submitted → can submit
    act(() => result.current.setItem('p-1', 'singles', 2));
    await act(async () => { await result.current.submit(); });
    expect(sampleRequestApi.saveMine).toHaveBeenCalled(); // flushes pending draft first
    expect(sampleRequestApi.submitMine).toHaveBeenCalledWith('ev-1');
    expect(result.current.view?.request.status).toBe('submitted');
    expect(result.current.canSubmit).toBe(false); // nothing changed since submit
    act(() => result.current.setItem('p-1', 'singles', 3));
    expect(result.current.canSubmit).toBe(true);
  });

  it('flips to closed on a 409 WINDOW_CLOSED', async () => {
    vi.mocked(sampleRequestApi.saveMine).mockRejectedValueOnce({
      statusCode: 409,
      details: { error: 'closed', details: { code: 'WINDOW_CLOSED', closesAt: '2026-10-01T00:00:00Z' } },
    });
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setItem('p-1', 'singles', 1));
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(result.current.closed).toBe(true);
  });

  it('reports offline instead of error when the browser is offline', async () => {
    vi.mocked(sampleRequestApi.getMine).mockRejectedValueOnce(new Error('net'));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-1', role: 'salesperson' }));
    await waitFor(() => expect(result.current.status).toBe('offline'));
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('uses on-behalf endpoints when an override role edits another user', async () => {
    vi.mocked(sampleRequestApi.getForUser).mockResolvedValueOnce(await (sampleRequestApi.getMine as any)());
    const { result } = renderHook(() => useSampleRequest({ eventId: 'ev-1', userId: 'u-9', role: 'admin', actorId: 'adm' }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(sampleRequestApi.getForUser).toHaveBeenCalledWith('ev-1', 'u-9');
  });
});
