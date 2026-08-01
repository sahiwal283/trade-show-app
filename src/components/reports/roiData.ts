/**
 * roiData — the decision model behind the Reports overview.
 *
 * Joins cost rows (show_summaries) with CRM lead rows on (show_key, year),
 * then groups by SHOW across years. Each show gets a recency-weighted ROI
 * (recent dollars count more than old ones), a trend direction, and a
 * time-aware verdict — a show that made money years ago but nothing since
 * reads "Declining", not "Double down". Pure functions — no fetching, no
 * React, strictly computed from inputs.
 */

import type { ShowSummaryRow } from './hooks/useShowSummaries';
import type { CrmLeadRow } from './hooks/useCrmLeads';

/* ===== Verdict thresholds — tune here, never inline ===== */
export const ROI_DOUBLE_DOWN = 2;
export const ROI_REASSESS = 0.5;
export const MIN_LEADS_FOR_REASSESS = 10;
/** Recency decay: a year-old dollar counts half as much as this year's. */
export const RECENCY_HALF_LIFE_YEARS = 1;
/** Show-years that ended within this window are still converting leads. */
export const MATURITY_WINDOW_MONTHS = 9;
/** Latest-year conversion rate below this still reads "leads in flight". */
export const MATURITY_LOW_CONV = 0.15;
/** Recent-vs-earlier pooled ROI must move ±25% to leave "flat". */
export const TREND_TOLERANCE = 0.25;
/** Shows are assumed to run mid-year (month index, 0-based July) when only
 *  the year is known — used to estimate months since the show ended. */
const ASSUMED_SHOW_MONTH = 6;

export type Trend = 'improving' | 'declining' | 'flat' | 'insufficient';

export type Verdict =
  | 'double-down'
  | 'rising'
  | 'hold'
  | 'declining'
  | 'maturing'
  | 'reassess'
  | 'needs-data';

/** One attended year inside a show group. */
export interface ShowYearStat {
  year: number;
  invested: number;
  leads: number;
  converted: number;
  revenue: number;
  /** True when a CRM lead group with ≥1 lead matched this show-year */
  hasLeads: boolean;
  /** revenue ÷ invested for this year; null without matched leads or spend */
  roi: number | null;
  convRate: number | null;
  costPerLead: number | null;
  /** Present on live show-years — enables drill-down to the register */
  eventId?: string;
}

/** A show across every attended year — the unit the verdicts judge. */
export interface RoiShowGroup {
  /** Stable identity — the normalized show_key */
  showKey: string;
  /** Display name with year tokens stripped */
  name: string;
  /** Attended years, ascending */
  years: ShowYearStat[];
  /** "'24–'26" / "'25" — attended-year span for row labels */
  yearsLabel: string;
  /** Lifetime cost across every attended year (matched or not) */
  invested: number;
  /** Lifetime cost across years WITH matched CRM leads — the ROI denominator */
  investedMatched: number;
  revenue: number;
  leads: number;
  converted: number;
  hasLeads: boolean;
  /** revenue ÷ investedMatched — lifetime, unweighted */
  lifetimeRoi: number | null;
  /** Σ(revenue×w) ÷ Σ(invested×w), w = 0.5^(yearsAgo) over matched years */
  weightedRoi: number | null;
  /** Pooled ROI of the most recent ≤2 matched years — the "lately" number */
  recentRoi: number | null;
  trend: Trend;
  /** Latest attended year ended within the maturity window with leads still
   *  converting — such shows are never marked Reassess */
  isMaturing: boolean;
  verdict: Verdict;
  /** revenue − investedMatched — what the matched years netted */
  netReturn: number;
  convRate: number | null;
  costPerLead: number | null;
  /** Most recent year's event id — enables drill-down to the register */
  eventId?: string;
}

export interface RoiPortfolio {
  /** Matched-year spend on shows with leads (all spend when none matched) */
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
  /** Every show group, joined with leads where available */
  shows: RoiShowGroup[];
  /** Shows with BOTH cost and lead data, ranked by recency-weighted ROI */
  ranked: RoiShowGroup[];
  /** Cost-only shows ("Needs data"), largest spend first */
  needsData: RoiShowGroup[];
  /** True once any show has matched CRM leads */
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

const shortYear = (y: number) => `'${String(y).slice(2)}`;

/** "'24–'26" for a multi-year span, "'25" for a single year. */
export function yearsLabelFor(years: number[]): string {
  if (years.length === 0) return '';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? shortYear(min) : `${shortYear(min)}–${shortYear(max)}`;
}

const pooledRoi = (list: ShowYearStat[]): number | null => {
  const inv = list.reduce((s, y) => s + y.invested, 0);
  if (inv <= 0) return null;
  return list.reduce((s, y) => s + y.revenue, 0) / inv;
};

/** Recent-two-years pooled ROI vs everything earlier (matched years only). */
export function trendFor(matched: ShowYearStat[]): Trend {
  if (matched.length < 2) return 'insufficient';
  const split = Math.max(1, matched.length - 2);
  const earlier = matched.slice(0, split);
  const recent = matched.slice(split);
  const earlierRoi = pooledRoi(earlier);
  const recentRoi = pooledRoi(recent);
  if (earlierRoi === null || recentRoi === null) return 'insufficient';
  if (earlierRoi === 0) return recentRoi > 0 ? 'improving' : 'flat';
  if (recentRoi > earlierRoi * (1 + TREND_TOLERANCE)) return 'improving';
  if (recentRoi < earlierRoi * (1 - TREND_TOLERANCE)) return 'declining';
  return 'flat';
}

/** Months since the latest attended year's assumed mid-year show date. */
function monthsSinceShow(latestYear: number, now: Date): number {
  return (now.getFullYear() - latestYear) * 12 + (now.getMonth() - ASSUMED_SHOW_MONTH);
}

interface VerdictInput {
  hasLeads: boolean;
  lifetimeRoi: number | null;
  weightedRoi: number | null;
  recentRoi: number | null;
  trend: Trend;
  isMaturing: boolean;
  leads: number;
}

export function verdictFor(g: VerdictInput): Verdict {
  if (!g.hasLeads) return 'needs-data';
  // The complaint case: earned ≥1× lifetime, but the last two years < 0.5×.
  if (
    g.lifetimeRoi !== null &&
    g.lifetimeRoi >= 1 &&
    g.recentRoi !== null &&
    g.recentRoi < ROI_REASSESS
  ) {
    return 'declining';
  }
  // A declining trend only blocks Double down once recent years actually
  // fall below the bar — sliding from 3.5× to 2.3× still doubles money.
  const inDecline = g.trend === 'declining' && (g.recentRoi ?? 0) < ROI_DOUBLE_DOWN;
  if (g.weightedRoi !== null && g.weightedRoi >= ROI_DOUBLE_DOWN && !inDecline) {
    return 'double-down';
  }
  if (g.weightedRoi !== null && g.weightedRoi >= 1 && g.trend === 'improving') return 'rising';
  // Recent shows whose leads are still becoming invoices — never Reassess.
  if (g.isMaturing) return 'maturing';
  if (
    g.weightedRoi !== null &&
    g.weightedRoi < ROI_REASSESS &&
    g.leads >= MIN_LEADS_FOR_REASSESS
  ) {
    return 'reassess';
  }
  return 'hold';
}

export function buildRoiModel(
  costRows: ShowSummaryRow[],
  leadRows: CrmLeadRow[],
  now: Date = new Date()
): RoiModel {
  // Aggregate cost per show-year across companies and categories
  const byYearKey = new Map<
    string,
    { showKey: string; year: number; showName: string; invested: number; eventId?: string }
  >();
  for (const r of costRows) {
    const key = `${r.show_key}:${r.year}`;
    const cur = byYearKey.get(key);
    if (cur) {
      cur.invested += r.amount;
      if (!cur.eventId && r.event_id) cur.eventId = r.event_id;
      if (!cur.showName) cur.showName = r.show_name;
    } else {
      byYearKey.set(key, {
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

  // Group show-years by show_key
  const groups = new Map<string, { years: ShowYearStat[]; names: Map<number, string> }>();
  for (const [key, c] of byYearKey.entries()) {
    const lead = leadByKey.get(key);
    const hasLeads = Boolean(lead && lead.leads > 0);
    const leads = hasLeads && lead ? lead.leads : 0;
    const converted = hasLeads && lead ? lead.converted : 0;
    const revenue = hasLeads && lead ? lead.revenue || 0 : 0;
    const stat: ShowYearStat = {
      year: c.year,
      invested: c.invested,
      leads,
      converted,
      revenue,
      hasLeads,
      roi: hasLeads && c.invested > 0 ? revenue / c.invested : null,
      convRate: hasLeads && leads > 0 ? converted / leads : null,
      costPerLead: hasLeads && leads > 0 && c.invested > 0 ? c.invested / leads : null,
      eventId: c.eventId,
    };
    const g = groups.get(c.showKey) ?? { years: [], names: new Map<number, string>() };
    g.years.push(stat);
    g.names.set(c.year, c.showName);
    groups.set(c.showKey, g);
  }

  const shows: RoiShowGroup[] = Array.from(groups.entries()).map(([showKey, g]) => {
    const years = [...g.years].sort((a, b) => a.year - b.year);
    const latest = years[years.length - 1];
    const latestName = g.names.get(latest.year) || '';
    const matched = years.filter((y) => y.hasLeads);

    const invested = years.reduce((s, y) => s + y.invested, 0);
    const investedMatched = matched.reduce((s, y) => s + y.invested, 0);
    const revenue = matched.reduce((s, y) => s + y.revenue, 0);
    const leads = matched.reduce((s, y) => s + y.leads, 0);
    const converted = matched.reduce((s, y) => s + y.converted, 0);
    const hasLeads = matched.length > 0;

    // Recency weighting: this year's dollars count 1, last year's 0.5, …
    let wInv = 0;
    let wRev = 0;
    for (const y of matched) {
      const w = Math.pow(0.5, (now.getFullYear() - y.year) / RECENCY_HALF_LIFE_YEARS);
      wInv += y.invested * w;
      wRev += y.revenue * w;
    }
    const weightedRoi = hasLeads && wInv > 0 ? wRev / wInv : null;
    const lifetimeRoi = hasLeads && investedMatched > 0 ? revenue / investedMatched : null;
    const recentRoi = pooledRoi(matched.slice(-2));
    const trend = trendFor(matched);

    const latestMatched = matched[matched.length - 1];
    const isMaturing =
      latestMatched !== undefined &&
      latestMatched.year === latest.year &&
      monthsSinceShow(latest.year, now) <= MATURITY_WINDOW_MONTHS &&
      (latestMatched.revenue === 0 ||
        latestMatched.convRate === null ||
        latestMatched.convRate < MATURITY_LOW_CONV);

    const verdict = verdictFor({
      hasLeads,
      lifetimeRoi,
      weightedRoi,
      recentRoi,
      trend,
      isMaturing,
      leads,
    });

    return {
      showKey,
      name: cleanShowName(latestName) || titleCase(showKey),
      years,
      yearsLabel: yearsLabelFor(years.map((y) => y.year)),
      invested,
      investedMatched,
      revenue,
      leads,
      converted,
      hasLeads,
      lifetimeRoi,
      weightedRoi,
      recentRoi,
      trend,
      isMaturing,
      verdict,
      netReturn: revenue - investedMatched,
      convRate: hasLeads && leads > 0 ? converted / leads : null,
      costPerLead: hasLeads && leads > 0 && investedMatched > 0 ? investedMatched / leads : null,
      eventId: latest.eventId ?? years.find((y) => y.eventId)?.eventId,
    };
  });

  const ranked = shows
    .filter((s) => s.hasLeads && s.investedMatched > 0)
    .sort(
      (a, b) =>
        (b.weightedRoi ?? 0) - (a.weightedRoi ?? 0) ||
        (b.convRate ?? 0) - (a.convRate ?? 0) ||
        b.leads - a.leads
    );

  const needsData = shows.filter((s) => !s.hasLeads).sort((a, b) => b.invested - a.invested);

  const unattributedRevenue = leadRows
    .filter((l) => !byYearKey.has(`${l.show_key}:${l.year}`))
    .reduce((sum, l) => sum + (l.revenue || 0), 0);

  const hasLeadData = ranked.length > 0;
  const totalShowYears = byYearKey.size;
  const totalInvestedAllShows = shows.reduce((s, r) => s + r.invested, 0);
  const invested = hasLeadData
    ? ranked.reduce((s, r) => s + r.investedMatched, 0)
    : totalInvestedAllShows;
  const revenue = ranked.reduce((s, r) => s + r.revenue, 0);
  const leads = ranked.reduce((s, r) => s + r.leads, 0);
  const converted = ranked.reduce((s, r) => s + r.converted, 0);
  const matchedShowYears = shows.reduce(
    (s, g) => s + g.years.filter((y) => y.hasLeads).length,
    0
  );

  return {
    shows,
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
      matchedShowYears,
      totalShowYears,
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

/** $12,345.67 — money with cents, for KPI values and per-category lines */
export function fmtMoneyExact(n: number): string {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 3.2× / 12.1× / 240× — ROI multiple */
export function fmtMult(x: number): string {
  return `${x >= 100 ? Math.round(x).toLocaleString() : stripTrailingZero(x.toFixed(1))}×`;
}

/** 0.29 → 29% */
export function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
