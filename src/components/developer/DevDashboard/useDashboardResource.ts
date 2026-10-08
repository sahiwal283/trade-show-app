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

interface Held<T> {
  key: string;
  data: T | undefined;
  error: string | null;
}

export function useDashboardResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { pollMs?: number } = {}
): DashboardResource<T> {
  // What is held belongs to one key. On the render where the key changes the
  // effect below has not run yet, so the state is still the previous key's;
  // it is only handed out when its key is the one being asked for.
  const [held, setHeld] = useState<Held<T>>(() => ({ key, data: cache.get(key) as T | undefined, error: null }));
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
      setHeld({ key: requestKey, data: result, error: null });
    } catch (caught) {
      if (currentKey.current !== requestKey) return;
      const message = caught instanceof Error ? caught.message : 'Failed to load';
      // The last good result for this key stays on screen beside the error.
      setHeld((current) => ({
        key: requestKey,
        data: current.key === requestKey ? current.data : (cache.get(requestKey) as T | undefined),
        error: message,
      }));
    } finally {
      if (currentKey.current === requestKey) setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    setHeld((current) =>
      current.key === key ? current : { key, data: cache.get(key) as T | undefined, error: null }
    );
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

  const isCurrent = held.key === key;
  const data = isCurrent ? held.data : (cache.get(key) as T | undefined);
  const error = isCurrent ? held.error : null;

  return { data, loading: data === undefined && error === null, refreshing, error, refresh: load };
}
