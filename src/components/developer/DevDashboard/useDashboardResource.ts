import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data for one dashboard tab.
 *
 * The cache is module-level and keyed by tab + parameters, so switching back
 * to a tab shows its last result immediately and refreshes behind it. Only a
 * tab with nothing cached shows a loading state.
 */
const cache = new Map<string, unknown>();
const openResources = new Set<() => void>();

export function clearDashboardCache(): void {
  cache.clear();
}

/** Refetch whatever is on screen. Used by the header's Refresh button. */
export function refreshOpenResources(): void {
  openResources.forEach((load) => load());
}

export interface DashboardResource<T> {
  data: T | undefined;
  /** True only when there is nothing to show yet. */
  loading: boolean;
  /** True while any request for the current key is in flight. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboardResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { pollMs?: number } = {}
): DashboardResource<T> {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The newest fetcher and key, readable from a request that started earlier.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const currentKey = useRef(key);
  currentKey.current = key;

  const load = useCallback(async () => {
    const requestKey = key;
    setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      cache.set(requestKey, result);
      // A response for a range or tab the user has already left must not win.
      if (currentKey.current !== requestKey) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (currentKey.current !== requestKey) return;
      setError(caught instanceof Error ? caught.message : 'Failed to load');
    } finally {
      if (currentKey.current === requestKey) setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    setData(cache.get(key) as T | undefined);
    setError(null);
    void load();
    openResources.add(load);
    return () => {
      openResources.delete(load);
    };
  }, [key, load]);

  const { pollMs } = options;
  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { data, loading: data === undefined && error === null, refreshing, error, refresh: load };
}
