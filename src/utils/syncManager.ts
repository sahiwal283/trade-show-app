/**
 * Sync Manager - Core Offline-First Sync Engine
 * 
 * Handles queuing, processing, retry logic, and conflict resolution
 * for all offline actions (create, update, delete, approve)
 */

import { offlineDb, SyncQueueItem } from './offlineDb';
import { networkMonitor } from './networkDetection';
// Named import: the API methods live on the exported `api` object. The old
// `import * as api` namespace import made every `api.createExpense(...)` call
// undefined at runtime, so queued items could never replay.
import { api } from './api';
import { boothApi } from './boothApi';
import { badgeApi } from './badgeApi';
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

/**
 * Thrown when a queued item can't sync yet because something it depends on
 * (e.g. a booth movement its photo is attached to) hasn't synced. This is a
 * normal, expected wait state, not a failure: `syncItem` still resets the
 * item to 'pending' via the existing backoff so it is retried, but it does
 * not propagate as an error the way a genuine API failure does.
 */
class PendingDependencyError extends Error {}

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

    // Check for pending items on startup. A failure here (e.g. IndexedDB
    // unavailable, as happens in non-browser test environments) must not
    // become an unhandled rejection and must not block a working session.
    try {
      const stats = await offlineDb.getQueueStats();
      if (stats.pending > 0) {
        console.log(`[SyncManager] Found ${stats.pending} pending items in queue`);

        // Try to sync if online
        if (networkMonitor.isOnline()) {
          this.processQueue();
        }
      }
    } catch (error) {
      console.error('[SyncManager] Failed to check pending queue items on init:', error);
    }

    console.log('[SyncManager] Initialized successfully');
  }

  /**
   * Queue an action for sync
   */
  public async queueAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE',
    entity: 'expense' | 'user' | 'event' | 'booth_movement' | 'booth_photo' | 'badgeScan',
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
   * Sync a single queue item.
   *
   * @internal Public so it is directly testable — replay of a single queue
   * item is the crux of the offline-safety argument for booth movements and
   * deserves to be exercised in isolation, not only through processQueue().
   */
  public async syncItem(item: SyncQueueItem): Promise<void> {
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
        case 'booth_movement':
          remoteId = await this.syncBoothMovement(item);
          break;
        case 'booth_photo':
          remoteId = await this.syncBoothPhoto(item);
          break;
        case 'badgeScan':
          remoteId = await this.syncBadgeScan(item);
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

      // A synced damage/missing report yields a real movement id. Any photo
      // still parked on the placeholder for this movement's queue id can now
      // be pointed at it.
      if (item.entity === 'booth_movement' && item.data?.op === 'report' && remoteId) {
        await this.resolvePendingPhotoTarget(item.id, remoteId);
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

      // A photo waiting on its movement isn't a genuine sync failure — it's
      // an ordering dependency that resolves itself once the movement (queued
      // earlier, replayed first) lands. The queue bookkeeping above still
      // applies so it gets retried, but it must not propagate as an error the
      // way a real API failure does.
      if (error instanceof PendingDependencyError) {
        return;
      }

      throw error;
    }
  }

  /**
   * Sync an expense item
   */
  private async syncExpense(item: SyncQueueItem): Promise<string> {
    switch (item.action) {
      case 'CREATE': {
        const created = await api.createExpense(item.data, item.data.receipt);
        return created.id;
      }

      case 'UPDATE':
        await api.updateExpense(item.remoteId || item.data.id, item.data, item.data.receipt);
        return item.remoteId || item.data.id;

      case 'DELETE':
        // Note: Delete endpoint doesn't exist yet, would need to add
        throw new Error('Delete not implemented yet');

      case 'APPROVE':
        // This would be handled by accountant/admin approval endpoint
        await api.updateExpenseStatus(item.data.id, { status: item.data.status });
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
      case 'CREATE': {
        const created = await api.createEvent(item.data);
        return created.id;
      }

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
      case 'CREATE': {
        // User registration
        const created = await api.register(item.data);
        return created.id;
      }

      case 'UPDATE':
        // Update user profile
        throw new Error('User update not implemented yet');

      default:
        throw new Error(`Unknown user action: ${item.action}`);
    }
  }

  /**
   * Booth movements are append-only events, so replay is safe: the server
   * dedupes on idempotency_key and returns the original. A "0 changed"
   * response is a successful replay, NOT a failure.
   */
  private async syncBoothMovement(item: SyncQueueItem): Promise<string | undefined> {
    const { op, containerId, componentIds, componentId, eventId, kind, notes,
            toLocationId, toContainerId, toStatus } = item.data;
    const idempotency_key = item.idempotencyKey;

    switch (op) {
      case 'pack':
        await boothApi.pack(containerId, {
          component_ids: componentIds, event_id: eventId, idempotency_key,
        });
        return undefined;
      case 'unpack':
        await boothApi.unpack(containerId, {
          component_ids: componentIds, event_id: eventId, idempotency_key,
        });
        return undefined;
      case 'move':
        await boothApi.moveComponent(componentId, {
          to_location_id: toLocationId ?? null,
          to_container_id: toContainerId,
          to_status: toStatus ?? null,
          event_id: eventId ?? null,
          idempotency_key,
        });
        return undefined;
      case 'report': {
        const movement = await boothApi.reportComponent(componentId, {
          kind, notes, event_id: eventId, idempotency_key,
        });
        return movement?.id;
      }
      default:
        throw new Error(`Unknown booth movement op: ${op}`);
    }
  }

  /**
   * Replay a badge scan captured at the booth. The queue's idempotencyKey
   * doubles as client_scan_id so a retried item returns the existing lead
   * instead of creating a second one.
   */
  private async syncBadgeScan(item: SyncQueueItem): Promise<string> {
    const scan = await badgeApi.createScan({
      ...item.data,
      clientScanId: item.idempotencyKey,
    });
    return scan.id;
  }

  /**
   * A photo may have been captured before its movement synced. Its entityId is
   * then `pending_movement:<key>`; throw so the existing backoff retries after
   * the movement lands. Never drop the blob — the photo IS the evidence. The
   * only case where dropping is correct is the blob itself having vanished
   * from Dexie (cache eviction) — nothing left to retry.
   */
  private async syncBoothPhoto(item: SyncQueueItem): Promise<string | undefined> {
    const photo = await offlineDb.getPendingBoothPhoto(item.data.photoId);
    if (!photo) {
      console.warn(`[SyncManager] Pending booth photo ${item.data.photoId} not found; dropping`);
      return undefined;
    }

    if (photo.entityId.startsWith('pending_movement:')) {
      throw new PendingDependencyError('Movement for this photo has not synced yet; will retry');
    }

    const attachment = await boothApi.uploadAttachment(
      photo.entityType, photo.entityId, photo.blob, photo.caption
    );
    await offlineDb.deletePendingBoothPhoto(photo.id);
    return attachment?.id;
  }

  /**
   * Point any queued photo for this movement at the real movement id.
   *
   * `movementQueueId` is the *sync queue item's* own id — the value
   * `queueAction()` returns synchronously to its caller. It is used (rather
   * than the queue item's `idempotencyKey`) because `queueAction` generates
   * that key internally and never hands it back, so a caller like
   * `ReportIssueModal` has no way to know it in advance; the queue id is
   * already unique per queued action and available immediately.
   */
  private async resolvePendingPhotoTarget(movementQueueId: string, movementId: string): Promise<void> {
    try {
      const placeholder = `pending_movement:${movementQueueId}`;
      const pending = await offlineDb.pendingBoothPhotos
        .filter((p) => p.entityId === placeholder).toArray();
      for (const photo of pending) {
        await offlineDb.putPendingBoothPhoto({ ...photo, entityId: movementId });
      }
    } catch (error) {
      console.error('[SyncManager] Failed to resolve pending photo target:', error);
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
    // A failed queue/metadata read (e.g. IndexedDB unavailable) must not
    // reject this call — callers like the packing checklist's queued-count
    // badge poll it on every render and on every sync event.
    try {
      const stats = await offlineDb.getQueueStats();
      const lastSyncTime = await offlineDb.getLastSyncTime();

      return {
        isSync: networkMonitor.isOnline(),
        pendingCount: stats.pending,
        failedCount: stats.failed,
        lastSyncTime,
        currentlyProcessing: this.isProcessing
      };
    } catch (error) {
      console.error('[SyncManager] Failed to read sync status:', error);
      return {
        isSync: networkMonitor.isOnline(),
        pendingCount: 0,
        failedCount: 0,
        lastSyncTime: 0,
        currentlyProcessing: this.isProcessing
      };
    }
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
      } catch {
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

