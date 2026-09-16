/**
 * useBadgeScans - sync-complete reload coverage.
 *
 * A lead saved while offline shows an optimistic 'pending' row. If nothing
 * reloads the list once the queued item actually syncs, that row sits there
 * forever (until eventId/entity changes or the component remounts) even
 * though the lead is safely in the CRM — exactly the anxiety this feature
 * exists to remove for a rep watching the list on bad booth wifi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

let syncListener: ((event: { type: string; data?: any }) => void) | null = null;
const unsubscribe = vi.fn();

vi.mock('../../../../utils/badgeApi', () => ({
  badgeApi: {
    listScans: vi.fn(async () => []),
    createScan: vi.fn(async () => ({ id: 'scan-1' })),
    updateScan: vi.fn(async () => ({ id: 'scan-1' })),
  },
}));

vi.mock('../../../../utils/syncManager', () => ({
  syncManager: {
    queueAction: vi.fn(async () => 'queue-1'),
    addEventListener: vi.fn((cb: (event: { type: string; data?: any }) => void) => {
      syncListener = cb;
      return unsubscribe;
    }),
  },
}));

vi.mock('../../../../utils/networkDetection', () => ({
  networkMonitor: { isOnline: () => true },
}));

import { badgeApi } from '../../../../utils/badgeApi';
import { useBadgeScans } from '../useBadgeScans';

describe('useBadgeScans - sync-complete subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncListener = null;
  });

  it('reloads the list when a sync-complete event fires', async () => {
    renderHook(() => useBadgeScans('ev-1', 'Haute Brands'));

    // Initial mount reload.
    await waitFor(() => expect(badgeApi.listScans).toHaveBeenCalledTimes(1));

    expect(syncListener).not.toBeNull();

    act(() => {
      syncListener?.({ type: 'sync-complete', data: { success: true, synced: 1, failed: 0, errors: [] } });
    });

    await waitFor(() => expect(badgeApi.listScans).toHaveBeenCalledTimes(2));
  });

  it('does not reload on unrelated sync events', async () => {
    renderHook(() => useBadgeScans('ev-1', 'Haute Brands'));
    await waitFor(() => expect(badgeApi.listScans).toHaveBeenCalledTimes(1));

    act(() => {
      syncListener?.({ type: 'sync-start' });
    });

    // Give any accidental async reload a chance to land before asserting it didn't.
    await new Promise((r) => setTimeout(r, 0));
    expect(badgeApi.listScans).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount so a remount does not stack listeners', async () => {
    const { unmount } = renderHook(() => useBadgeScans('ev-1', 'Haute Brands'));
    await waitFor(() => expect(badgeApi.listScans).toHaveBeenCalledTimes(1));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
