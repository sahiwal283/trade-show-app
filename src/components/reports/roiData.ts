/**
 * roiData — the decision model behind the Reports overview.
 *
 * Joins cost rows (show_summaries) with CRM lead rows on (show_key, year),
 * computes per-show-year ROI and a plain-English verdict, and rolls the
 * matched set up into portfolio stats for the hero band. Pure functions —
 * no fetching, no React, strictly computed from inputs.
 */

import type { ShowSummaryRow } from './hooks/useShowSummaries';
import type { CrmLeadRow } from './hooks/useCrmLeads';

/* ===== Verdict thresholds — tune here, never inline ===== */
export const ROI_DOUBLE_DOWN = 2;
export const ROI_REASSESS = 0.5;
export const CONV_DOUBLE_DOWN = 0.3;
export const MIN_LEADS_FOR_REASSESS = 10;

export type Verdict = 'double-down' | 'hold' | 'reassess' | 'needs-data';

export interface RoiShowRow {
  /** `${show_key}:${year}` — stable identity across all report views */
  key: string;
  showKey: string;
  year: number;
  /** Cost-side show name with year tokens stripped */
  name: string;
  /** Total cost across every company and category for this show-year */
  invested: number;
  leads: number;
  converted: number;
  revenue: number;
  /** Present on live show-years — enables drill-down to the register */
  eventId?: string;
  /** True when a CRM lead group with ≥1 lead matched this show-year */
  hasLeads: boolean;
  /** revenue ÷ invested; null without matched leads or spend */
  roi: number | null;
  convRate: number | null;
  costPerLead: number | null;
  verdict: Verdict;
}

export interface RoiPortfolio {
  /** Spend on matched show-years (all show-years when no leads matched) */
  invested: number;
  revenue: number;
  leads: number;
  converted: number;
  convRate: number | null;
  costPerLead: number | null;
  roi: number | null;
  matchedShowYears: number;
  totalShowYears: number;
  totalInvestedAllShows: number;
}

export interface RoiModel {
  /** Every cost show-year, joined with leads where available */
  rows: RoiShowRow[];
  /** Show-years with BOTH cost and lead data, ranked by ROI */
  ranked: RoiShowRow[];
  /** Cost-only show-years ("Needs data"), largest spend first */
  needsData: RoiShowRow[];
  /** True once any cost show-year has matched CRM leads */
  hasLeadData: boolean;
  portfolio: RoiPortfolio;
  /** Converted-lead revenue on groups with no cost match (incl. "unknown") */
  unattributedRevenue: number;
}

/** Show name minus year tokens — single source for every report surface. */
export function cleanShowName(name: string): string {
  return name
    .replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '')
    .replace(/[-\s]+$/, '')
    .trim();
}

function titleCase(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function verdictFor(
  row: Pick<RoiShowRow, 'hasLeads' | 'roi' | 'convRate' | 'leads'>
): Verdict {
  if (!row.hasLeads) return 'needs-data';
  const doubleDown =
    (row.roi !== null && row.roi >= ROI_DOUBLE_DOWN) ||
    (row.convRate !== null && row.convRate >= CONV_DOUBLE_DOWN);
  if (doubleDown) return 'double-down';
  if (row.roi !== null && row.roi < ROI_REASSESS && row.leads >= MIN_LEADS_FOR_REASSESS) {
    return 'reassess';
  }
  return 'hold';
}

export function buildRoiModel(costRows: ShowSummaryRow[], leadRows: CrmLeadRow[]): RoiModel {
  // Aggregate cost per show-year across companies and categories
  const byKey = new Map<
    string,
    { showKey: string; year: number; showName: string; invested: number; eventId?: string }
  >();
  for (const r of costRows) {
    const key = `${r.show_key}:${r.year}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.invested += r.amount;
      if (!cur.eventId && r.event_id) cur.eventId = r.event_id;
      if (!cur.showName) cur.showName = r.show_name;
    } else {
      byKey.set(key, {
        showKey: r.show_key,
        year: r.year,
        showName: r.show_name,
        invested: r.amount,
        eventId: r.event_id,
      });
    }
  }

  const leadByKey = new Map<string, CrmLeadRow>();
  for (const l of leadRows) leadByKey.set(`${l.show_key}:${l.year}`, l);

  const rows: RoiShowRow[] = Array.from(byKey.entries()).map(([key, c]) => {
    const lead = leadByKey.get(key);
    const hasLeads = Boolean(lead && lead.leads > 0);
    const leads = hasLeads && lead ? lead.leads : 0;
    const converted = hasLeads && lead ? lead.converted : 0;
    const revenue = hasLeads && lead ? lead.revenue || 0 : 0;
    const roi = hasLeads && c.invested > 0 ? revenue / c.invested : null;
    const convRate = hasLeads && leads > 0 ? converted / leads : null;
    const costPerLead = hasLeads && leads > 0 && c.invested > 0 ? c.invested / leads : null;
    const base = { hasLeads, roi, convRate, leads };
    return {
      key,
      showKey: c.showKey,
      year: c.year,
      name: cleanShowName(c.showName) || titleCase(c.showKey),
      invested: c.invested,
      leads,
      converted,
      revenue,
      eventId: c.eventId,
      hasLeads,
      roi,
      convRate,
      costPerLead,
      verdict: verdictFor(base),
    };
  });

  const ranked = rows
    .filter((r) => r.hasLeads && r.invested > 0)
    .sort(
      (a, b) =>
        (b.roi ?? 0) - (a.roi ?? 0) || (b.convRate ?? 0) - (a.convRate ?? 0) || b.leads - a.leads
    );

  const needsData = rows.filter((r) => !r.hasLeads).sort((a, b) => b.invested - a.invested);

  const unattributedRevenue = leadRows
    .filter((l) => !byKey.has(`${l.show_key}:${l.year}`))
    .reduce((sum, l) => sum + (l.revenue || 0), 0);

  const hasLeadData = ranked.length > 0;
  const totalInvestedAllShows = rows.reduce((s, r) => s + r.invested, 0);
  const invested = hasLeadData ? ranked.reduce((s, r) => s + r.invested, 0) : totalInvestedAllShows;
  const revenue = ranked.reduce((s, r) => s + r.revenue, 0);
  const leads = ranked.reduce((s, r) => s + r.leads, 0);
  const converted = ranked.reduce((s, r) => s + r.converted, 0);

  return {
    rows,
    ranked,
    needsData,
    hasLeadData,
    unattributedRevenue,
    portfolio: {
      invested,
      revenue,
      leads,
      converted,
      convRate: hasLeadData && leads > 0 ? converted / leads : null,
      costPerLead: hasLeadData && leads > 0 ? invested / leads : null,
      roi: hasLeadData && invested > 0 ? revenue / invested : null,
      matchedShowYears: ranked.length,
      totalShowYears: rows.length,
      totalInvestedAllShows,
    },
  };
}

/* ===== Shared number formatting — round smartly, never lie ===== */

const stripTrailingZero = (s: string) => s.replace(/\.0$/, '');

/** $454K / $2.4M / $87 — compact money for headlines, axes, and narrative */
export function fmtMoneyCompact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${stripTrailingZero((abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1))}M`;
  if (abs >= 1e3) return `${sign}$${stripTrailingZero((abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1))}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

/** $12,345 — exact money for table cells */
export function fmtMoneyFull(n: number): string {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** 3.2× / 12.1× / 240× — ROI multiple */
export function fmtMult(x: number): string {
  return `${x >= 100 ? Math.round(x).toLocaleString() : stripTrailingZero(x.toFixed(1))}×`;
}

/** 0.29 → 29% */
export function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
