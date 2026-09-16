/**
 * Schema-shape guards for the offline database.
 *
 * Dexie exposes the declared schema before open(), so these run without an
 * IndexedDB implementation in the test environment.
 */

import { describe, it, expect } from 'vitest';
import { OfflineDatabase } from '../offlineDb';

describe('OfflineDatabase schema', () => {
  const tableNames = () => new OfflineDatabase().tables.map((t) => t.name);

  it('declares no pendingBadgeScans store — the badge offline path uses syncQueue', () => {
    // The store and its PendingBadgeScan interface were declared but never
    // read or written: syncManager.queueAction puts badge scans in syncQueue
    // like every other offline mutation.
    expect(tableNames()).not.toContain('pendingBadgeScans');
    expect(tableNames()).toContain('syncQueue');
  });

  it('keeps the version at 5 so Dexie history stays monotonic', () => {
    // Removing the store must not renumber history. Anyone whose IndexedDB
    // already reached v5 would otherwise have an installed verno running ahead
    // of the declared schema.
    expect(new OfflineDatabase().verno).toBe(5);
  });

  it('still declares every store versions 1-4 introduced', () => {
    expect(tableNames()).toEqual(
      expect.arrayContaining([
        'syncQueue', 'cachedExpenses', 'cachedEvents', 'cachedUsers', 'syncMetadata',
        'cachedPicklists', 'cachedExpenseMessages', 'cachedBoothInventory', 'pendingBoothPhotos',
      ])
    );
  });
});
