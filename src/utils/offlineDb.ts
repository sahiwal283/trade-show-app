/**
 * Offline Database Layer using Dexie.js (IndexedDB wrapper)
 * 
 * This module provides persistent client-side storage for:
 * - Sync queue (actions pending sync to backend)
 * - Cached data (expenses, events, users)
 * - Encryption keys and metadata
 */

import Dexie, { Table } from 'dexie';
import { generateUUID } from './uuid';

// ========== TYPE DEFINITIONS ==========

export interface SyncQueueItem {
  id: string;                 // UUID
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE';
  entity: 'expense' | 'user' | 'event' | 'booth_movement' | 'booth_photo' | 'badgeScan';
  data: any;                  // The actual payload
  localId?: string;           // Temporary UUID for new items
  remoteId?: string;          // Backend ID after successful sync
  timestamp: number;          // When action was queued (Date.now())
  retryCount: number;         // Number of sync attempts
  lastAttempt?: number;       // Timestamp of last sync attempt
  error?: string;             // Last error message if failed
  status: 'pending' | 'syncing' | 'failed' | 'success';
  deviceId: string;           // Device identifier for conflict resolution
  userId: string;             // User who made the change
  idempotencyKey: string;     // For backend deduplication
}

export interface CachedExpense {
  id: string;
  localId?: string;           // Temporary ID before backend sync
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: number;       // Client timestamp
  version: number;            // For conflict resolution
  data: any;                  // The actual expense data
}

export interface CachedEvent {
  id: string;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: number;
  version: number;
  data: any;
}

export interface CachedUser {
  id: string;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: number;
  version: number;
  data: any;
}

export interface SyncMetadata {
  key: string;                // Metadata key (e.g., 'lastSyncTime', 'deviceId')
  value: string;              // Metadata value
  updatedAt: number;          // When this was last updated
}

/**
 * Last known good option lists (categories, cards, companies) from
 * GET /api/picklists. Single row, keyed 'current'.
 *
 * Expense entry cannot proceed without these, so they are cached to survive
 * going offline. There is deliberately no hardcoded fallback: if this row is
 * missing and the network is down, submission blocks rather than writing an
 * expense against a guessed category or card.
 */
export interface CachedPicklists {
  key: string;                // always 'current'
  data: any;                  // the picklists payload as served
  cachedAt: number;
}

/** Read-only mirror of a Midas thread, so a user on a show floor can still read it. */
export interface CachedExpenseMessages {
  expenseId: string;
  messages: any[];
  cachedAt: number;
}

/** A photo captured offline, held until its target exists server-side. */
export interface PendingBoothPhoto {
  id: string;
  entityType: string;
  /**
   * A real entity id, OR `pending_movement:<idempotencyKey>` when the movement
   * this photo belongs to has not synced yet.
   */
  entityId: string;
  blob: Blob;
  caption?: string;
  createdAt: number;
}

export interface PendingBadgeScan {
  /** Client-generated id; also the server-side idempotency key on replay. */
  id: string;
  eventId: string;
  entity: string;
  rawPayload: string;
  parserVersion: string;
  parseConfidence: number;
  fields: unknown;
  contact: Record<string, string>;
  notes?: string;
  scannedAt: string;
  createdAt: number;
}

// ========== DATABASE CLASS ==========

export class OfflineDatabase extends Dexie {
  // Tables
  syncQueue!: Table<SyncQueueItem, string>;
  cachedExpenses!: Table<CachedExpense, string>;
  cachedEvents!: Table<CachedEvent, string>;
  cachedUsers!: Table<CachedUser, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  cachedPicklists!: Table<CachedPicklists, string>;
  cachedExpenseMessages!: Table<CachedExpenseMessages, string>;
  cachedBoothInventory!: Table<{ key: string; data: any; cachedAt: number }, string>;
  pendingBoothPhotos!: Table<PendingBoothPhoto, string>;
  pendingBadgeScans!: Table<PendingBadgeScan, string>;

  constructor() {
    super('ExpenseAppOfflineDB');

    // Define schema
    this.version(1).stores({
      syncQueue: 'id, status, entity, timestamp, userId',
      cachedExpenses: 'id, syncStatus, lastModified',
      cachedEvents: 'id, syncStatus, lastModified',
      cachedUsers: 'id, syncStatus, lastModified',
      syncMetadata: 'key'
    });

    // v2 adds the picklist cache. Dexie carries v1 tables forward, so only the
    // new store is declared here.
    this.version(2).stores({
      cachedPicklists: 'key'
    });

    // v3 adds the expense message thread cache. Dexie carries v1/v2 tables
    // forward, so only the new store is declared here.
    this.version(3).stores({
      cachedExpenseMessages: 'expenseId'
    });

    // v4 adds booth inventory: cached catalog data for offline packing and a
    // blob store for photos captured with no signal.
    this.version(4).stores({
      cachedBoothInventory: 'key',
      pendingBoothPhotos: 'id, createdAt'
    });

    // v5 adds badge scans captured at the booth. Dexie carries v1-v4 tables
    // forward, so only the new store is declared here.
    this.version(5).stores({
      pendingBadgeScans: 'id, eventId, entity, createdAt'
    });
  }

  // ========== PICKLIST CACHE ==========

  /** Last known good picklists, or null if nothing has ever been cached. */
  async getCachedPicklists(): Promise<CachedPicklists | null> {
    try {
      return (await this.cachedPicklists.get('current')) ?? null;
    } catch (error) {
      console.error('[offlineDb] Failed to read cached picklists:', error);
      return null;
    }
  }

  async setCachedPicklists(data: any): Promise<void> {
    try {
      await this.cachedPicklists.put({ key: 'current', data, cachedAt: Date.now() });
    } catch (error) {
      // A failed cache write must not break a working online session.
      console.error('[offlineDb] Failed to cache picklists:', error);
    }
  }

  // ========== EXPENSE MESSAGE CACHE ==========

  async getCachedExpenseMessages(expenseId: string): Promise<CachedExpenseMessages | null> {
    try {
      return (await this.cachedExpenseMessages.get(expenseId)) ?? null;
    } catch (error) {
      console.error('[offlineDb] Failed to read cached messages:', error);
      return null;
    }
  }

  async setCachedExpenseMessages(expenseId: string, messages: any[]): Promise<void> {
    try {
      await this.cachedExpenseMessages.put({ expenseId, messages, cachedAt: Date.now() });
    } catch (error) {
      // A failed cache write must not break a working online session.
      console.error('[offlineDb] Failed to cache messages:', error);
    }
  }

  // ========== BOOTH INVENTORY (PACKING) CACHE ==========

  async putPendingBoothPhoto(photo: PendingBoothPhoto): Promise<void> {
    await this.pendingBoothPhotos.put(photo);
  }

  async getPendingBoothPhoto(id: string): Promise<PendingBoothPhoto | null> {
    try {
      return (await this.pendingBoothPhotos.get(id)) ?? null;
    } catch (error) {
      console.error('[offlineDb] Failed to read pending booth photo:', error);
      return null;
    }
  }

  async deletePendingBoothPhoto(id: string): Promise<void> {
    try {
      await this.pendingBoothPhotos.delete(id);
    } catch (error) {
      console.error('[offlineDb] Failed to delete pending booth photo:', error);
    }
  }

  async setCachedBoothInventory(key: string, data: any): Promise<void> {
    try {
      await this.cachedBoothInventory.put({ key, data, cachedAt: Date.now() });
    } catch (error) {
      console.error('[offlineDb] Failed to cache booth inventory:', error);
    }
  }

  async getCachedBoothInventory(key: string): Promise<any | null> {
    try {
      return (await this.cachedBoothInventory.get(key))?.data ?? null;
    } catch (error) {
      console.error('[offlineDb] Failed to read cached booth inventory:', error);
      return null;
    }
  }

  // ========== SYNC QUEUE OPERATIONS ==========

  /**
   * Add an item to the sync queue
   */
  async addToQueue(item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'timestamp' | 'status'>): Promise<string> {
    const queueItem: SyncQueueItem = {
      id: generateUUID(),
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
      ...item
    };

    await this.syncQueue.add(queueItem);
    console.log(`[OfflineDB] Added to queue: ${item.action} ${item.entity}`, queueItem.id);
    return queueItem.id;
  }

  /**
   * Get all pending items in queue
   */
  async getPendingQueueItems(): Promise<SyncQueueItem[]> {
    return await this.syncQueue
      .where('status')
      .equals('pending')
      .sortBy('timestamp');
  }

  /**
   * Get all failed items in queue
   */
  async getFailedQueueItems(): Promise<SyncQueueItem[]> {
    return await this.syncQueue
      .where('status')
      .equals('failed')
      .sortBy('timestamp');
  }

  /**
   * Get queue item count by status
   */
  async getQueueStats(): Promise<{ pending: number; syncing: number; failed: number; success: number }> {
    const [pending, syncing, failed, success] = await Promise.all([
      this.syncQueue.where('status').equals('pending').count(),
      this.syncQueue.where('status').equals('syncing').count(),
      this.syncQueue.where('status').equals('failed').count(),
      this.syncQueue.where('status').equals('success').count()
    ]);

    return { pending, syncing, failed, success };
  }

  /**
   * Update queue item status
   */
  async updateQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    await this.syncQueue.update(id, updates);
    console.log(`[OfflineDB] Updated queue item: ${id}`, updates);
  }

  /**
   * Mark queue item as synced and optionally update with remote ID
   */
  async markQueueItemSynced(id: string, remoteId?: string): Promise<void> {
    await this.syncQueue.update(id, {
      status: 'success',
      remoteId,
      lastAttempt: Date.now()
    });
    console.log(`[OfflineDB] Marked as synced: ${id} → ${remoteId}`);
  }

  /**
   * Mark queue item as failed with error
   */
  async markQueueItemFailed(id: string, error: string, retryCount: number): Promise<void> {
    await this.syncQueue.update(id, {
      status: 'failed',
      error,
      retryCount,
      lastAttempt: Date.now()
    });
    console.log(`[OfflineDB] Marked as failed: ${id}`, error);
  }

  /**
   * Delete a queue item
   */
  async deleteQueueItem(id: string): Promise<void> {
    await this.syncQueue.delete(id);
    console.log(`[OfflineDB] Deleted queue item: ${id}`);
  }

  /**
   * Clear all successful queue items (cleanup)
   */
  async clearSuccessfulQueueItems(): Promise<void> {
    const successItems = await this.syncQueue.where('status').equals('success').toArray();
    await this.syncQueue.bulkDelete(successItems.map(item => item.id));
    console.log(`[OfflineDB] Cleared ${successItems.length} successful queue items`);
  }

  // ========== CACHED DATA OPERATIONS ==========

  /**
   * Cache an expense
   */
  async cacheExpense(expense: any, syncStatus: 'synced' | 'pending' | 'failed' = 'synced'): Promise<void> {
    const cached: CachedExpense = {
      id: expense.id,
      localId: expense.localId,
      syncStatus,
      lastModified: Date.now(),
      version: expense.version || 1,
      data: expense
    };

    await this.cachedExpenses.put(cached);
  }

  /**
   * Get cached expense by ID
   */
  async getCachedExpense(id: string): Promise<CachedExpense | undefined> {
    return await this.cachedExpenses.get(id);
  }

  /**
   * Get all cached expenses
   */
  async getAllCachedExpenses(): Promise<CachedExpense[]> {
    return await this.cachedExpenses.toArray();
  }

  /**
   * Get pending (unsynced) expenses
   */
  async getPendingExpenses(): Promise<CachedExpense[]> {
    return await this.cachedExpenses
      .where('syncStatus')
      .equals('pending')
      .toArray();
  }

  /**
   * Update expense sync status
   */
  async updateExpenseSyncStatus(id: string, syncStatus: 'synced' | 'pending' | 'failed'): Promise<void> {
    await this.cachedExpenses.update(id, { syncStatus, lastModified: Date.now() });
  }

  /**
   * Delete cached expense
   */
  async deleteCachedExpense(id: string): Promise<void> {
    await this.cachedExpenses.delete(id);
  }

  // ========== METADATA OPERATIONS ==========

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: string): Promise<void> {
    await this.syncMetadata.put({
      key,
      value,
      updatedAt: Date.now()
    });
  }

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<string | undefined> {
    const metadata = await this.syncMetadata.get(key);
    return metadata?.value;
  }

  /**
   * Get or initialize device ID
   */
  async getDeviceId(): Promise<string> {
    let deviceId = await this.getMetadata('deviceId');
    
    if (!deviceId) {
      // Generate a new device ID
      deviceId = `device-${generateUUID()}`;
      await this.setMetadata('deviceId', deviceId);
      console.log('[OfflineDB] Generated new device ID:', deviceId);
    }
    
    return deviceId;
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTime(): Promise<number> {
    const lastSyncStr = await this.getMetadata('lastSyncTime');
    return lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
  }

  /**
   * Update last sync timestamp
   */
  async setLastSyncTime(timestamp: number): Promise<void> {
    await this.setMetadata('lastSyncTime', timestamp.toString());
  }

  // ========== DATABASE MANAGEMENT ==========

  /**
   * Clear all data (logout, security wipe)
   */
  async clearAllData(): Promise<void> {
    console.log('[OfflineDB] Clearing all data...');
    
    await Promise.all([
      this.syncQueue.clear(),
      this.cachedExpenses.clear(),
      this.cachedEvents.clear(),
      this.cachedUsers.clear(),
      this.syncMetadata.clear()
    ]);
    
    console.log('[OfflineDB] All data cleared');
  }

  /**
   * Get database size estimate
   */
  async getDatabaseSize(): Promise<{ usage: number; quota: number; percentage: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0
      };
    }
    return null;
  }

  /**
   * Check if database is healthy
   */
  async checkHealth(): Promise<{ healthy: boolean; stats: any }> {
    try {
      const stats = await this.getQueueStats();
      const size = await this.getDatabaseSize();
      const lastSync = await this.getLastSyncTime();
      
      return {
        healthy: true,
        stats: {
          queue: stats,
          size,
          lastSync: new Date(lastSync).toISOString(),
          deviceId: await this.getDeviceId()
        }
      };
    } catch (error) {
      console.error('[OfflineDB] Health check failed:', error);
      return {
        healthy: false,
        stats: { error: (error as Error).message }
      };
    }
  }
}

// ========== SINGLETON INSTANCE ==========

export const offlineDb = new OfflineDatabase();

// Log initialization
offlineDb.open().then(() => {
  console.log('[OfflineDB] Database initialized successfully');
  offlineDb.checkHealth().then(health => {
    console.log('[OfflineDB] Health check:', health);
  });
}).catch(err => {
  console.error('[OfflineDB] Failed to initialize database:', err);
});

