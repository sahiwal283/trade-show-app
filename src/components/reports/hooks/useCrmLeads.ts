/**
 * useCrmLeads — per-show lead counts from the Zoho CRM sync.
 * Rows are keyed by the same (show_key, year) as the show_summaries tiles.
 * Any failure (CRM not connected, 401/404/503) resolves to an empty list so
 * the investment view renders exactly as it does without CRM data.
 */

import { useEffect, useState } from 'react';
import { apiClient } from '../../../utils/apiClient';

export interface CrmLeadRow {
  show_key: string;
  year: number;
  leads: number;
  converted: number;
  opened: number;
}

export function useCrmLeads() {
  const [rows, setRows] = useState<CrmLeadRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<CrmLeadRow[]>('/crm-leads/by-show');
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        // CRM not connected or endpoint unavailable — leads UI stays hidden.
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows };
}
