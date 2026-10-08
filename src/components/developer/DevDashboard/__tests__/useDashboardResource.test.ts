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

  it('never shows the previous key\'s data, not even on the render where the key changes', async () => {
    const pending = deferred<string>();
    const fetchers: Record<string, () => Promise<string>> = { a: () => Promise.resolve('A'), b: () => pending.promise };
    const seen: Array<{ k: string; data: string | undefined; loading: boolean }> = [];
    const { result, rerender } = renderHook(
      ({ k }) => {
        const resource = useDashboardResource(k, fetchers[k]);
        seen.push({ k, data: resource.data, loading: resource.loading });
        return resource;
      },
      { initialProps: { k: 'a' } }
    );
    await waitFor(() => expect(result.current.data).toBe('A'));

    rerender({ k: 'b' });
    expect(seen.find((render) => render.k === 'b')).toEqual({ k: 'b', data: undefined, loading: true });
    expect(seen.filter((render) => render.k === 'b').every((render) => render.data !== 'A')).toBe(true);

    await act(async () => { pending.resolve('B'); });
    expect(result.current).toMatchObject({ data: 'B', loading: false });
  });

  it('shows the new key\'s cached value on the very render where the key changes', async () => {
    const warm = renderHook(() => useDashboardResource('b', () => Promise.resolve('cached B')));
    await waitFor(() => expect(warm.result.current.data).toBe('cached B'));
    warm.unmount();

    const pending = deferred<string>();
    const fetchers: Record<string, () => Promise<string>> = { a: () => Promise.resolve('A'), b: () => pending.promise };
    const seen: Array<{ k: string; data: string | undefined; loading: boolean }> = [];
    const { result, rerender } = renderHook(
      ({ k }) => {
        const resource = useDashboardResource(k, fetchers[k]);
        seen.push({ k, data: resource.data, loading: resource.loading });
        return resource;
      },
      { initialProps: { k: 'a' } }
    );
    await waitFor(() => expect(result.current.data).toBe('A'));

    rerender({ k: 'b' });
    expect(seen.find((render) => render.k === 'b')).toEqual({ k: 'b', data: 'cached B', loading: false });
    await act(async () => { pending.resolve('fresh B'); });
    expect(result.current.data).toBe('fresh B');
  });

  it('does not carry one key\'s error over to the next', async () => {
    const pending = deferred<string>();
    const fetchers: Record<string, () => Promise<string>> = {
      a: () => Promise.reject(new Error('a failed')),
      b: () => pending.promise,
    };
    const seen: Array<{ k: string; error: string | null }> = [];
    const { result, rerender } = renderHook(
      ({ k }) => {
        const resource = useDashboardResource(k, fetchers[k]);
        seen.push({ k, error: resource.error });
        return resource;
      },
      { initialProps: { k: 'a' } }
    );
    await waitFor(() => expect(result.current.error).toBe('a failed'));
    rerender({ k: 'b' });
    expect(seen.filter((render) => render.k === 'b').every((render) => render.error === null)).toBe(true);
    await act(async () => { pending.resolve('B'); });
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
