/**
 * Sync Manager - Core Offline-First Sync Engine
 * 
 * Handles queuing, processing, retry logic, and conflict resolution
 * for all offline actions (create, update, delete, approve)
 */

import { offlineDb, SyncQueueItem } from './offlineDb';
import { networkMonitor } from './networkDetection';
import * as api from './api';
import { generateUUID } from './uuid';

// ========== TYPE DEFINITIONS ==========

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ item: SyncQueueItem; error: string }>;
}

export interface SyncStatus {
  isSync: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: number;
  currentlyProcessing: boolean;
}

type SyncEventType = 'sync-start' | 'sync-complete' | 'sync-error' | 'queue-updated';
type SyncEventCallback = (event: { type: SyncEventType; data?: any }) => void;

// ========== SYNC MANAGER CLASS ==========

export class SyncManager {
  private isProcessing: boolean = false;
  private autoSyncEnabled: boolean = true;
  private listeners: Set<SyncEventCallback> = new Set();
  private readonly MAX_RETRIES = 5;
  private readonly MAX_BATCH_SIZE = 20;

  constructor() {
    this.init();
  }

  /**
   * Initialize sync manager
   */
  private async init(): Promise<void> {
    console.log('[SyncManager] Initializing...');

    // Listen for network status changes
    networkMonitor.addListener((state) => {
      if (state.isOnline && this.autoSyncEnabled && !this.isProcessing) {
        console.log('[SyncManager] Network came online, starting auto-sync...');
        this.processQueue();
      }
    });

    // Check for pending items on startup
    const stats = await offlineDb.getQueueStats();
    if (stats.pending > 0) {
      console.log(`[SyncManager] Found ${stats.pending} pending items in queue`);
      
      // Try to sync if online
      if (networkMonitor.isOnline()) {
        this.processQueue();
      }
    }

    console.log('[SyncManager] Initialized successfully');
  }

  /**
   * Queue an action for sync
   */
  public async queueAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE',
    entity: 'expense' | 'user' | 'event',
    data: any,
    localId?: string
  ): Promise<string> {
    const userId = this.getCurrentUserId();
    const deviceId = await offlineDb.getDeviceId();
    const idempotencyKey = generateUUID();

    const queueId = await offlineDb.addToQueue({
      action,
      entity,
      data,
      localId,
      userId,
      deviceId,
      idempotencyKey
    });

    console.log(`[SyncManager] Queued ${action} ${entity}:`, queueId);
    
    // Notify listeners
    this.notifyListeners('queue-updated', { queueId, action, entity });

    // Try to sync immediately if online
    if (networkMonitor.isOnline() && this.autoSyncEnabled) {
      this.processQueue();
    }

    return queueId;
  }

  /**
   * Process the sync queue
   */
  public async processQueue(): Promise<SyncResult> {
    if (this.isProcessing) {
      console.log('[SyncManager] Sync already in progress, skipping...');
      return { success: false, synced: 0, failed: 0, errors: [] };
    }

    if (!networkMonitor.isOnline()) {
      console.log('[SyncManager] Offline, cannot sync');
      return { success: false, synced: 0, failed: 0, errors: [] };
    }

    this.isProcessing = true;

    console.log('[SyncManager] Processing sync queue...');

    try {
      const pendingItems = await offlineDb.getPendingQueueItems();

      if (pendingItems.length === 0) {
        // No sync-start emitted for an empty queue: emitting it without a
        // matching sync-complete left a permanent "Syncing..." banner.
        console.log('[SyncManager] No pending items to sync');
        this.isProcessing = false;
        return { success: true, synced: 0, failed: 0, errors: [] };
      }

      this.notifyListeners('sync-start');

      console.log(`[SyncManager] Found ${pendingItems.length} pending items`);

      // Process in batches
      const result: SyncResult = {
        success: true,
        synced: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < pendingItems.length; i += this.MAX_BATCH_SIZE) {
        const batch = pendingItems.slice(i, i + this.MAX_BATCH_SIZE);
        console.log(`[SyncManager] Processing batch ${i / this.MAX_BATCH_SIZE + 1}/${Math.ceil(pendingItems.length / this.MAX_BATCH_SIZE)}`);

        for (const item of batch) {
          try {
            await this.syncItem(item);
            result.synced++;
          } catch (error: any) {
            console.error(`[SyncManager] Failed to sync item ${item.id}:`, error);
            result.failed++;
            result.errors.push({ item, error: error.message });
          }
        }
      }

      // Clean up successful items
      await offlineDb.clearSuccessfulQueueItems();

      // Update last sync time
      await offlineDb.setLastSyncTime(Date.now());

      console.log(`[SyncManager] Sync complete: ${result.synced} synced, ${result.failed} failed`);

      this.notifyListeners('sync-complete', result);
      return result;

    } catch (error: any) {
      console.error('[SyncManager] Sync queue processing error:', error);
      this.notifyListeners('sync-error', { error: error.message });
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: [{ item: {} as SyncQueueItem, error: error.message }]
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Sync a single queue item
   */
  private async syncItem(item: SyncQueueItem): Promise<void> {
    // Check retry limit
    if (item.retryCount >= this.MAX_RETRIES) {
      console.warn(`[SyncManager] Item ${item.id} exceeded max retries, marking as failed`);
      await offlineDb.markQueueItemFailed(
        item.id,
        `Max retries (${this.MAX_RETRIES}) exceeded`,
        item.retryCount
      );
      return;
    }

    // Mark as syncing
    await offlineDb.updateQueueItem(item.id, {
      status: 'syncing',
      lastAttempt: Date.now()
    });

    try {
      let remoteId: string | undefined;

      // Route to appropriate API call based on entity and action
      switch (item.entity) {
        case 'expense':
          remoteId = await this.syncExpense(item);
          break;
        case 'event':
          remoteId = await this.syncEvent(item);
          break;
        case 'user':
          remoteId = await this.syncUser(item);
          break;
        default:
          throw new Error(`Unknown entity type: ${item.entity}`);
      }

      // Mark as synced
      await offlineDb.markQueueItemSynced(item.id, remoteId);

      // Update cached data if applicable
      if (item.entity === 'expense' && remoteId) {
        await this.updateLocalIdMapping(item.localId, remoteId);
      }

      console.log(`[SyncManager] Successfully synced ${item.entity} ${item.action}`);

    } catch (error: any) {
      console.error(`[SyncManager] Error syncing item ${item.id}:`, error);

      // Increment retry count
      const newRetryCount = item.retryCount + 1;

      // Calculate backoff delay
      const backoffMs = Math.pow(2, newRetryCount) * 1000; // 2s, 4s, 8s, 16s, 32s
      console.log(`[SyncManager] Will retry in ${backoffMs}ms (attempt ${newRetryCount}/${this.MAX_RETRIES})`);

      // Mark as failed (pending retry)
      await offlineDb.markQueueItemFailed(item.id, error.message, newRetryCount);

      // If not exceeded retries, mark back as pending for next sync
      if (newRetryCount < this.MAX_RETRIES) {
        setTimeout(async () => {
          await offlineDb.updateQueueItem(item.id, { status: 'pending' });
        }, backoffMs);
      }

      throw error;
    }
  }

  /**
   * Sync an expense item
   */
  private async syncExpense(item: SyncQueueItem): Promise<string> {
    switch (item.action) {
      case 'CREATE':
        const created = await api.createExpense(item.data, item.data.receipt);
        return created.id;

      case 'UPDATE':
        await api.updateExpense(item.remoteId || item.data.id, item.data, item.data.receipt);
        return item.remoteId || item.data.id;

      case 'DELETE':
        // Note: Delete endpoint doesn't exist yet, would need to add
        throw new Error('Delete not implemented yet');

      case 'APPROVE':
        // This would be handled by accountant/admin approval endpoint
        await api.updateExpenseStatus(item.data.id, item.data.status, item.data.comments);
        return item.data.id;

      default:
        throw new Error(`Unknown expense action: ${item.action}`);
    }
  }

  /**
   * Sync an event item
   */
  private async syncEvent(item: SyncQueueItem): Promise<string> {
    switch (item.action) {
      case 'CREATE':
        const created = await api.createEvent(item.data);
        return created.id;

      case 'UPDATE':
        await api.updateEvent(item.remoteId || item.data.id, item.data);
        return item.remoteId || item.data.id;

      default:
        throw new Error(`Unknown event action: ${item.action}`);
    }
  }

  /**
   * Sync a user item
   */
  private async syncUser(item: SyncQueueItem): Promise<string> {
    switch (item.action) {
      case 'CREATE':
        // User registration
        const created = await api.register(item.data);
        return created.id;

      case 'UPDATE':
        // Update user profile
        throw new Error('User update not implemented yet');

      default:
        throw new Error(`Unknown user action: ${item.action}`);
    }
  }

  /**
   * Update local ID to remote ID mapping
   */
  private async updateLocalIdMapping(localId: string | undefined, remoteId: string): Promise<void> {
    if (!localId) return;

    console.log(`[SyncManager] Mapping local ID ${localId} → remote ID ${remoteId}`);

    // Update cached expense
    const cached = await offlineDb.getCachedExpense(localId);
    if (cached) {
      cached.id = remoteId;
      cached.syncStatus = 'synced';
      await offlineDb.cacheExpense(cached.data);
      await offlineDb.deleteCachedExpense(localId);
    }
  }

  /**
   * Get current sync status
   */
  public async getStatus(): Promise<SyncStatus> {
    const stats = await offlineDb.getQueueStats();
    const lastSyncTime = await offlineDb.getLastSyncTime();

    return {
      isSync: networkMonitor.isOnline(),
      pendingCount: stats.pending,
      failedCount: stats.failed,
      lastSyncTime,
      currentlyProcessing: this.isProcessing
    };
  }

  /**
   * Retry failed items
   */
  public async retryFailed(): Promise<SyncResult> {
    const failedItems = await offlineDb.getFailedQueueItems();
    
    console.log(`[SyncManager] Retrying ${failedItems.length} failed items`);

    // Reset failed items to pending
    for (const item of failedItems) {
      await offlineDb.updateQueueItem(item.id, {
        status: 'pending',
        retryCount: 0,
        error: undefined
      });
    }

    // Process queue
    return await this.processQueue();
  }

  /**
   * Clear a specific failed item
   */
  public async clearFailedItem(queueId: string): Promise<void> {
    console.log(`[SyncManager] Clearing failed item: ${queueId}`);
    await offlineDb.deleteQueueItem(queueId);
    this.notifyListeners('queue-updated');
  }

  /**
   * Enable/disable auto-sync
   */
  public setAutoSync(enabled: boolean): void {
    console.log(`[SyncManager] Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
    this.autoSyncEnabled = enabled;
  }

  /**
   * Add event listener
   */
  public addEventListener(callback: SyncEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(type: SyncEventType, data?: any): void {
    this.listeners.forEach(callback => {
      try {
        callback({ type, data });
      } catch (error) {
        console.error('[SyncManager] Listener error:', error);
      }
    });
  }

  /**
   * Get current user ID from auth
   */
  private getCurrentUserId(): string {
    // Must match useAuth's storage key — 'currentUser' never existed, so
    // every queued action was attributed to user "unknown".
    const userStr = localStorage.getItem('tradeshow_current_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.id;
      } catch (e) {
        return 'unknown';
      }
    }
    return 'unknown';
  }

  /**
   * Force sync now
   */
  public async syncNow(): Promise<SyncResult> {
    console.log('[SyncManager] Manual sync triggered');
    
    if (!networkMonitor.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    return await this.processQueue();
  }

  /**
   * Get pending items for UI display
   */
  public async getPendingItems(): Promise<SyncQueueItem[]> {
    return await offlineDb.getPendingQueueItems();
  }

  /**
   * Get failed items for UI display
   */
  public async getFailedItems(): Promise<SyncQueueItem[]> {
    return await offlineDb.getFailedQueueItems();
  }
}

// ========== SINGLETON INSTANCE ==========

export const syncManager = new SyncManager();

// Export for use in components
export default syncManager;

