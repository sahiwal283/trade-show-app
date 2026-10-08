import { useEffect, useRef } from 'react';
import { apiClient } from '../utils/apiClient';

const MOBILE_MAX_WIDTH = 768;

/**
 * Reports each screen a signed-in user opens, for the developer dashboard's
 * Usage tab. Best effort: a failed send is dropped, never retried and never
 * queued for offline sync.
 */
export function usePageViewTracking(currentPage: string, userId: string | undefined): void {
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      lastSent.current = null;
      return;
    }
    if (lastSent.current === currentPage) return;
    lastSent.current = currentPage;

    const device = window.innerWidth < MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
    apiClient.post('/page-views', { page: currentPage, device }).catch(() => {});
  }, [currentPage, userId]);
}
