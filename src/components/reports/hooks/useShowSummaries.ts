/**
 * useShowSummaries — aggregate show totals for the investment views.
 * Imported history (accountant's workbook) + live app data, same shape.
 */

import { useEffect, useState } from 'react';
import { apiClient } from '../../../utils/apiClient';

export interface ShowSummaryRow {
  show_name: string;
  show_key: string;
  year: number;
  company: string;
  category: string;
  amount: number;
  source: 'imported' | 'live';
  /** Present on live rows — enables drill-down to the expense register */
  event_id?: string;
}

export function useShowSummaries() {
  const [rows, setRows] = useState<ShowSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<ShowSummaryRow[]>('/show-summaries');
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('[ShowSummaries] Failed to load:', error);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading };
}
