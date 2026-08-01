/**
 * useDetailedLeads — CRM lead stats for the single show a DetailedReport is
 * scoped to. Derives the show identity from the expenses' tradeShowId, maps
 * it to (show_key, year) via the show-summaries rows (live rows carry
 * event_id), then matches the CRM per-show lead rollup. Any failure or a
 * multi-show scope resolves to null so the panel simply doesn't render.
 */

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../utils/apiClient';
import { Expense, TradeShow } from '../../../App';
import { useShowSummaries } from './useShowSummaries';

/** Same row shape as GET /crm-leads/by-show (see useCrmLeads). */
interface CrmLeadShowRow {
  show_key: string;
  year: number;
  leads: number;
  converted: number;
  opened: number;
  bounced: number;
  sample_tag: string | null;
}

export interface DetailedLeadStats {
  /** Total leads captured at the show */
  leads: number;
  converted: number;
  /** 0–1 fraction of leads that opened an email, or null when unknowable */
  openRate: number | null;
  /** Show total spend ÷ leads, or null when spend is unknown */
  costPerLead: number | null;
}

export function useDetailedLeads(
  expenses: Expense[],
  events: TradeShow[]
): DetailedLeadStats | null {
  const [leadRows, setLeadRows] = useState<CrmLeadShowRow[]>([]);
  const { rows: summaryRows } = useShowSummaries();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<CrmLeadShowRow[]>('/crm-leads/by-show');
        if (!cancelled) setLeadRows(Array.isArray(data) ? data : []);
      } catch {
        // CRM not connected or endpoint unavailable — panel stays hidden.
        if (!cancelled) setLeadRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    // The report must be scoped to exactly one trade show.
    const eventIds = new Set(expenses.map((e) => e.tradeShowId));
    if (eventIds.size !== 1) return null;
    const eventId = [...eventIds][0];
    const event = events.find((e) => e.id === eventId);
    if (!event) return null;

    // Live summary rows carry event_id — that gives us (show_key, year).
    const summary = summaryRows.find((r) => r.event_id === eventId);
    if (!summary) return null;

    const lead = leadRows.find((l) => l.show_key === summary.show_key && l.year === summary.year);
    if (!lead || lead.leads <= 0) return null;

    // Full show cost across companies + imported history for this show-year.
    const showTotal = summaryRows
      .filter((r) => r.show_key === summary.show_key && r.year === summary.year)
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      leads: lead.leads,
      converted: lead.converted,
      openRate: lead.leads > 0 ? lead.opened / lead.leads : null,
      costPerLead: showTotal > 0 ? showTotal / lead.leads : null,
    };
  }, [expenses, events, summaryRows, leadRows]);
}
