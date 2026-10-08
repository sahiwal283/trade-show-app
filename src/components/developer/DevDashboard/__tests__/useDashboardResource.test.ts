import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardResource, clearDashboardCache, refreshOpenResources } from '../useDashboardResource';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

describe('useDashboardResource', () => {
  beforeEach(() => { clearDashboardCache(); setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports loading, then the data', async () => {
    const { result } = renderHook(() => useDashboardResource('k1', () => Promise.resolve('first')));
    expect(result.current).toMatchObject({ data: undefined, loading: true, error: null });
    await waitFor(() => expect(result.current.data).toBe('first'));
    expect(result.current.loading).toBe(false);
  });

  it('shows the cached value at once on a second mount and refreshes behind it', async () => {
    const first = renderHook(() => useDashboardResource('k2', () => Promise.resolve('old')));
    await waitFor(() => expect(first.result.current.data).toBe('old'));
    first.unmount();

    const next = deferred<string>();
    const second = renderHook(() => useDashboardResource('k2', () => next.promise));
    expect(second.result.current).toMatchObject({ data: 'old', loading: false, refreshing: true });
    await act(async () => { next.resolve('new'); });
    expect(second.result.current).toMatchObject({ data: 'new', refreshing: false });
  });

  it('reports a failure and recovers on refresh', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useDashboardResource('k3', fetcher));
    await waitFor(() => expect(result.current.error).toBe('db down'));
    expect(result.current.loading).toBe(false);
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
  });

  it('keeps showing the last good data when a background refresh fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('good').mockRejectedValueOnce(new Error('blip'));
    const { result } = renderHook(() => useDashboardResource('k4', fetcher));
    await waitFor(() => expect(result.current.data).toBe('good'));
    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.error).toBe('blip'));
    expect(result.current.data).toBe('good');
  });

  it('ignores a slow answer for a key that is no longer shown', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const fetchers: Record<string, () => Promise<string>> = { a: () => slow.promise, b: () => fast.promise };
    const { result, rerender } = renderHook(({ k }) => useDashboardResource(k, fetchers[k]), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => { fast.resolve('B'); });
    await act(async () => { slow.resolve('A'); });
    expect(result.current.data).toBe('B');
  });

  it('polls while the page is visible and pauses while it is hidden', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('x');
    renderHook(() => useDashboardResource('k5', fetcher, { pollMs: 30_000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not poll unless asked to', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('x');
    renderHook(() => useDashboardResource('k6', fetcher));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches every mounted resource when the header asks', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { result } = renderHook(() => useDashboardResource('k7', fetcher));
    await waitFor(() => expect(result.current.data).toBe('x'));
    await act(async () => { refreshOpenResources(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops listening after unmount', async () => {
    const fetcher = vi.fn().mockResolvedValue('x');
    const { result, unmount } = renderHook(() => useDashboardResource('k8', fetcher));
    await waitFor(() => expect(result.current.data).toBe('x'));
    unmount();
    refreshOpenResources();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
