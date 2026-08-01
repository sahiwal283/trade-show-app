/**
 * CRM lead hooks — per-show lead counts and per-rep (owner) counts from the
 * Zoho CRM sync. Rows are keyed by the same (show_key, year) as the
 * show_summaries tiles. Any failure (CRM not connected, 401/404/503)
 * resolves to an empty list so the reports render exactly as they do
 * without CRM data.
 */

import { useEffect, useState } from 'react';
import { apiClient } from '../../../utils/apiClient';

export interface CrmLeadRow {
  show_key: string;
  year: number;
  leads: number;
  converted: number;
  opened: number;
  bounced: number;
  /** Invoice revenue from converted leads (Zoho Books match); 0 until the
   *  conversion reconciler has run. May be absent from older backends. */
  revenue: number;
  /** Most common raw CRM tag in the group — display name for leads-only shows */
  sample_tag: string | null;
}

export interface CrmOwnerRow {
  owner: string;
  show_key: string | null;
  year: number | null;
  leads: number;
  opened: number;
  converted: number;
}

/** Display name for a lead group: its raw CRM tag minus year noise,
 *  falling back to a title-cased show_key. */
export function leadGroupName(l: Pick<CrmLeadRow, 'sample_tag' | 'show_key'>): string {
  const tag = (l.sample_tag || '')
    .replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '')
    .replace(/[-\s]+$/, '')
    .trim();
  if (tag) return tag;
  return l.show_key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Shared fetch shape: GET an array, tolerate every failure as []. */
function useQuietList<T>(path: string): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<T[]>(path);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        // CRM not connected or endpoint unavailable — leads UI stays hidden.
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return rows;
}

export function useCrmLeads() {
  return { rows: useQuietList<CrmLeadRow>('/crm-leads/by-show') };
}

export function useCrmLeadOwners() {
  return { rows: useQuietList<CrmOwnerRow>('/crm-leads/owners') };
}
