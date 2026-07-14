/**
 * Pending Actions Component
 * 
 * Displays all pending and failed sync queue items.
 * Allows users to retry failed items or clear them.
 */

import React, { useState, useEffect } from 'react';
import { AppError } from '../../types/types';
import {
  RefreshCw,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  FileText,
  Calendar,
  User,
  XCircle,
  Loader
} from 'lucide-react';
import { syncManager } from '../../utils/syncManager';
import { offlineDb, SyncQueueItem } from '../../utils/offlineDb';

export const PendingActions: React.FC = () => {
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'failed'>('pending');

  useEffect(() => {
    loadItems();

    // Listen for sync events
    const unsubscribe = syncManager.addEventListener((event) => {
      if (event.type === 'sync-complete' || event.type === 'queue-updated') {
        loadItems();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [pending, failed] = await Promise.all([
        syncManager.getPendingItems(),
        syncManager.getFailedItems()
      ]);
      setPendingItems(pending);
      setFailedItems(failed);
    } catch (error) {
      console.error('[PendingActions] Error loading items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryAll = async () => {
    setSyncing(true);
    try {
      await syncManager.retryFailed();
      await loadItems();
    } catch (error) {
      const appError = error as AppError;
      console.error('[PendingActions] Retry failed:', error);
      alert(`Failed to retry: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncManager.syncNow();
      await loadItems();
    } catch (error) {
      const appError = error as AppError;
      console.error('[PendingActions] Sync failed:', error);
      alert(`Failed to sync: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearItem = async (itemId: string) => {
    if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
      try {
        await syncManager.clearFailedItem(itemId);
        await loadItems();
      } catch (error) {
        console.error('[PendingActions] Error clearing item:', error);
      }
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case 'expense':
        return <FileText className="w-5 h-5" />;
      case 'event':
        return <Calendar className="w-5 h-5" />;
      case 'user':
        return <User className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'APPROVE':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-stone-100 text-stone-800';
    }
  };

  const renderQueueItem = (item: SyncQueueItem) => (
    <div
      key={item.id}
      className="bg-white border border-stone-200 rounded-lg p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        {/* Left: Item Info */}
        <div className="flex items-start space-x-3 flex-1">
          {/* Icon */}
          <div className="text-stone-600 mt-1">
            {getEntityIcon(item.entity)}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Action & Entity */}
            <div className="flex items-center space-x-2 mb-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(item.action)}`}>
                {item.action}
              </span>
              <span className="text-sm font-semibold text-stone-900 capitalize">
                {item.entity}
              </span>
            </div>

            {/* Data Preview */}
            <div className="text-sm text-stone-600 mb-2">
              {item.entity === 'expense' && (
                <div>
                  <span className="font-medium">{item.data.merchant || 'Unknown'}</span>
                  {item.data.amount && (
                    <span className="ml-2 text-stone-500">
                      ${item.data.amount.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              {item.entity === 'event' && (
                <div className="font-medium">{item.data.name || 'Unnamed Event'}</div>
              )}
              {item.entity === 'user' && (
                <div className="font-medium">{item.data.username || 'Unknown User'}</div>
              )}
            </div>

            {/* Metadata */}
            <div className="flex items-center space-x-4 text-xs text-stone-500">
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{formatTimestamp(item.timestamp)}</span>
              </div>
              {item.retryCount > 0 && (
                <div className="flex items-center space-x-1 text-amber-600">
                  <RefreshCw className="w-3 h-3" />
                  <span>{item.retryCount} retries</span>
                </div>
              )}
            </div>

            {/* Error Message (if failed) */}
            {item.error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                <div className="flex items-start space-x-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{item.error}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        {item.status === 'failed' && (
          <button
            onClick={() => handleClearItem(item.id)}
            className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const displayItems = activeTab === 'pending' ? pendingItems : failedItems;

  return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 mb-2">
            Pending Actions
          </h1>
          <p className="text-stone-600">
            View and manage items waiting to sync with the server
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 mb-6">
          <div className="border-b border-stone-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('pending')}
                className={`
                  flex-1 py-4 px-6 font-medium text-sm transition-colors
                  ${activeTab === 'pending'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-stone-500 hover:text-stone-700'
                  }
                `}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>Pending ({pendingItems.length})</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('failed')}
                className={`
                  flex-1 py-4 px-6 font-medium text-sm transition-colors
                  ${activeTab === 'failed'
                    ? 'border-b-2 border-red-500 text-red-600'
                    : 'text-stone-500 hover:text-stone-700'
                  }
                `}
              >
                <div className="flex items-center justify-center space-x-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Failed ({failedItems.length})</span>
                </div>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSyncNow}
              disabled={syncing || pendingItems.length === 0}
              className="
                flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors flex items-center justify-center space-x-2
              "
            >
              {syncing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Sync Now</span>
                </>
              )}
            </button>

            {failedItems.length > 0 && activeTab === 'failed' && (
              <button
                onClick={handleRetryAll}
                disabled={syncing}
                className="
                  flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg
                  hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors flex items-center justify-center space-x-2
                "
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry All Failed</span>
              </button>
            )}
          </div>

          {/* Items List */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : displayItems.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-stone-100 rounded-full mb-4">
                  <CheckCircle className="w-8 h-8 text-stone-400" />
                </div>
                <h3 className="text-lg font-medium text-stone-900 mb-1">
                  {activeTab === 'pending' ? 'No Pending Items' : 'No Failed Items'}
                </h3>
                <p className="text-stone-500">
                  {activeTab === 'pending' 
                    ? 'All your changes have been synced successfully'
                    : 'No items have failed to sync'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayItems.map(renderQueueItem)}
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="text-blue-600 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About Pending Actions</p>
              <p>
                When you make changes offline, they're saved locally and added to the sync queue.
                Once you're back online, they'll automatically sync to the server.
                Failed items can be retried or manually cleared.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingActions;

