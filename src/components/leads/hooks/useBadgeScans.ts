/**
 * Lead list state for one event + company.
 *
 * Saves go through syncManager rather than badgeApi directly, so a scan taken
 * on dying booth wifi lands in the offline queue instead of erroring in the
 * rep's face. The optimistic row keeps the list honest in the meantime.
 */

import { useCallback, useEffect, useState } from 'react';
import { badgeApi, BadgeScanRecord, CreateScanPayload } from '../../../utils/badgeApi';
import { syncManager } from '../../../utils/syncManager';
import { networkMonitor } from '../../../utils/networkDetection';
import { generateUUID } from '../../../utils/uuid';

export function useBadgeScans(eventId: string | null, entity: string | null) {
  const [scans, setScans] = useState<BadgeScanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) { setScans([]); return; }
    setLoading(true);
    setError(null);
    try {
      setScans(await badgeApi.listScans({ eventId, entity: entity || undefined }));
    } catch (err) {
      setError((err as Error).message || 'Could not load leads');
    } finally {
      setLoading(false);
    }
  }, [eventId, entity]);

  useEffect(() => { void reload(); }, [reload]);

  const saveScan = useCallback(async (input: Omit<CreateScanPayload, 'eventId' | 'entity'>) => {
    if (!eventId || !entity) return;
    const payload: CreateScanPayload = { ...input, eventId, entity };

    if (!networkMonitor.isOnline()) {
      await syncManager.queueAction('CREATE', 'badgeScan', payload, generateUUID());
      // Show it immediately; the real row arrives on the next reload after sync.
      setScans((prev) => [
        {
          id: `pending-${generateUUID()}`,
          event_id: eventId,
          entity,
          crm_status: 'pending',
          scanned_at: payload.scannedAt ?? new Date().toISOString(),
          ...(payload.contact ?? {}),
        } as BadgeScanRecord,
        ...prev,
      ]);
      return;
    }

    try {
      const saved = await badgeApi.createScan({ ...payload, clientScanId: generateUUID() });
      setScans((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
    } catch (_err) {
      // A failed POST must never cost the lead — fall back to the queue.
      await syncManager.queueAction('CREATE', 'badgeScan', payload, generateUUID());
      setError('Saved offline — it will sync when the connection returns.');
    }
  }, [eventId, entity]);

  return { scans, loading, error, reload, saveScan };
}
