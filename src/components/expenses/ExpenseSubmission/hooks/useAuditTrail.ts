/**
 * useAuditTrail Hook
 * 
 * Manages audit trail fetching and display logic for expense details.
 * Automatically expands the audit trail if there are changes beyond creation.
 */

import { useState } from 'react';
import { AuditTrailEntry } from '../../../../types/types';
import { apiClient } from '../../../../utils/apiClient';

export function useAuditTrail() {
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  const fetchAuditTrail = async (expenseId: string, hasPermission: boolean) => {
    if (!hasPermission) return;

    setLoadingAudit(true);
    try {
      const data = await apiClient.get<{ auditTrail: AuditTrailEntry[] }>(
        `/expenses/${expenseId}/audit`
      );
      const trail = data.auditTrail || [];
      setAuditTrail(trail);

      const hasChanges = trail.filter((entry: AuditTrailEntry) => entry.action !== 'created').length > 0;
      setShowAuditTrail(hasChanges);
    } catch (error) {
      console.error('[Audit] Error fetching audit trail:', error);
      setAuditTrail([]);
      setShowAuditTrail(false);
    } finally {
      setLoadingAudit(false);
    }
  };

  const clearAuditTrail = () => {
    setAuditTrail([]);
    setShowAuditTrail(false);
    setLoadingAudit(false);
  };

  const toggleAuditTrail = () => {
    setShowAuditTrail((prev) => !prev);
  };

  return {
    auditTrail,
    loadingAudit,
    showAuditTrail,
    fetchAuditTrail,
    clearAuditTrail,
    toggleAuditTrail,
    setShowAuditTrail,
  };
}

