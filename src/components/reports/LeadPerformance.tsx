/**
 * LeadPerformance — "what did the shows produce" companion to the cost view.
 *
 * Three quiet blocks fed by the Zoho CRM lead sync:
 *   - leads-per-show bar list (single brand hue, direct labels, $/lead when
 *     the show-year has cost data)
 *   - rep leaderboard ("Who's capturing leads")
 *   - email engagement stat trio (leads / open rate / bounce rate)
 *
 * Renders nothing on its own — Reports.tsx only mounts it when leads exist,
 * so the disconnected state stays visually identical to before.
 */

import React, { useMemo, useState } from 'react';
import { CrmLeadRow, CrmOwnerRow, leadGroupName } from './hooks/useCrmLeads';
import { ShowSummaryRow } from './hooks/useShowSummaries';

interface LeadPerformanceProps {
  leadRows: CrmLeadRow[];
  ownerRows: CrmOwnerRow[];
  /** Cost rows — pairs $/lead with each show-year that has expense data */
  costRows: ShowSummaryRow[];
}

type YearScope = number | 'all';

const TOP_SHOWS = 10;
const TOP_OWNERS = 8;
/** Below this many leads an open-rate % is noise, not signal. */
const MIN_LEADS_FOR_RATE = 5;

const fmtMoney = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

/** Show name minus year tokens (same cleaning as the cost tiles). */
const stripYears = (name: string) =>
  name
    .replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '')
    .replace(/[-\s]+$/, '')
    .trim();

interface ShowBarDatum {
  key: string;
  name: string;
  leads: number;
  converted: number;
  /** Invoice revenue from converted leads (Zoho Books) — 0 until reconciled */
  revenue: number;
  costPerLead: number | null;
}

export const LeadPerformance: React.FC<LeadPerformanceProps> = ({
  leadRows,
  ownerRows,
  costRows,
}) => {
  const years = useMemo(
    () => Array.from(new Set(leadRows.map((l) => l.year))).sort(),
    [leadRows]
  );
  const [yearScope, setYearScope] = useState<YearScope>('all');
  const [showAllShows, setShowAllShows] = useState(false);

  const scopedLeads = useMemo(
    () => leadRows.filter((l) => yearScope === 'all' || l.year === yearScope),
    [leadRows, yearScope]
  );

  // Cost per (show_key:year) — $/lead divides each show-year's leads by that
  // same show-year's spend, never by another year's.
  const costByKeyYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of costRows) {
      const k = `${r.show_key}:${r.year}`;
      map.set(k, (map.get(k) || 0) + r.amount);
    }
    return map;
  }, [costRows]);

  // Prettiest available display name per show_key (cost rows carry the
  // workbook names; lead-only shows fall back to their CRM tag).
  const costNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of costRows) {
      const clean = stripYears(r.show_name);
      if (clean) map.set(r.show_key, clean);
    }
    return map;
  }, [costRows]);

  const showBars: ShowBarDatum[] = useMemo(() => {
    const byKey = new Map<
      string,
      { leads: number; converted: number; revenue: number; cost: number; sample: CrmLeadRow }
    >();
    for (const l of scopedLeads) {
      if (l.show_key === 'unknown' || l.leads === 0) continue;
      const entry =
        byKey.get(l.show_key) || { leads: 0, converted: 0, revenue: 0, cost: 0, sample: l };
      byKey.set(l.show_key, {
        leads: entry.leads + l.leads,
        converted: entry.converted + l.converted,
        revenue: entry.revenue + (l.revenue || 0),
        cost: entry.cost + (costByKeyYear.get(`${l.show_key}:${l.year}`) || 0),
        sample: entry.sample,
      });
    }
    return Array.from(byKey.entries())
      .map(([key, v]) => ({
        key,
        name: costNameByKey.get(key) || leadGroupName(v.sample),
        leads: v.leads,
        converted: v.converted,
        revenue: v.revenue,
        costPerLead: v.cost > 0 ? v.cost / v.leads : null,
      }))
      .sort((a, b) => b.leads - a.leads);
  }, [scopedLeads, costByKeyYear, costNameByKey]);

  const visibleBars = showAllShows ? showBars : showBars.slice(0, TOP_SHOWS);
  const hiddenCount = showBars.length - TOP_SHOWS;
  const maxLeads = Math.max(1, ...showBars.map((s) => s.leads));

  const owners = useMemo(() => {
    const byOwner = new Map<string, { leads: number; opened: number }>();
    for (const o of ownerRows) {
      if (yearScope !== 'all' && o.year !== yearScope) continue;
      const entry = byOwner.get(o.owner) || { leads: 0, opened: 0 };
      byOwner.set(o.owner, { leads: entry.leads + o.leads, opened: entry.opened + o.opened });
    }
    return Array.from(byOwner.entries())
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, TOP_OWNERS);
  }, [ownerRows, yearScope]);

  // Email engagement across every lead in scope (leads-only shows included)
  const engagement = useMemo(() => {
    let leads = 0;
    let opened = 0;
    let bounced = 0;
    for (const l of scopedLeads) {
      leads += l.leads;
      opened += l.opened;
      bounced += l.bounced;
    }
    return { leads, opened, bounced };
  }, [scopedLeads]);

  if (leadRows.length === 0) return null;

  return (
    <div>
      {/* Year scope — only when leads span multiple years */}
      {years.length > 1 && (
        <div className="mb-4 overflow-x-auto">
          <div className="seg-track">
            {(['all', ...years] as YearScope[]).map((y) => (
              <button
                key={String(y)}
                onClick={() => setYearScope(y)}
                className={`seg-tab ${yearScope === y ? 'seg-tab-active' : 'seg-tab-idle'}`}
              >
                {y === 'all' ? 'All years' : y}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Email engagement stat trio — same tile grammar as the KPI band */}
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Leads captured', value: engagement.leads.toLocaleString() },
          {
            label: 'Open rate',
            value: engagement.leads > 0 ? fmtPct(engagement.opened / engagement.leads) : '—',
          },
          {
            label: 'Bounce rate',
            value: engagement.leads > 0 ? fmtPct(engagement.bounced / engagement.leads) : '—',
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-stone-200/80 bg-stone-50/60 p-3">
            <p className="micro-label truncate">{label}</p>
            <p className="mt-1 font-display text-xl font-bold tracking-tight tabular-nums text-stone-900 sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Leads per show — single-hue horizontal bars, direct labels */}
        <div className="lg:col-span-2">
          <p className="micro-label mb-2">Leads per show</p>
          <div className="space-y-1.5">
            {visibleBars.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2"
                title={`${s.name}: ${s.leads.toLocaleString()} leads${s.converted > 0 ? `, ${s.converted.toLocaleString()} converted` : ''}${s.revenue > 0 ? `, ${fmtMoney(s.revenue)} revenue` : ''}${s.costPerLead !== null ? `, ${fmtMoney(s.costPerLead)}/lead` : ''}`}
              >
                <span className="w-28 shrink-0 truncate text-[11px] font-medium text-stone-600 sm:w-40 sm:text-xs">
                  {s.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max((s.leads / maxLeads) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-700">
                  {s.leads.toLocaleString()}
                </span>
                <span className="hidden w-16 shrink-0 text-right text-[10px] tabular-nums text-stone-400 sm:inline">
                  {s.costPerLead !== null ? `${fmtMoney(s.costPerLead)}/lead` : ''}
                </span>
                {/* Proven sales — only when the Books reconciler found revenue */}
                {s.revenue > 0 && (
                  <span className="hidden shrink-0 whitespace-nowrap text-right text-[10px] font-semibold tabular-nums text-emerald-700 sm:inline">
                    · {fmtMoney(s.revenue)} revenue
                  </span>
                )}
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllShows((v) => !v)}
              aria-expanded={showAllShows}
              className="mt-2 text-[11px] font-semibold text-stone-500 transition-colors hover:text-stone-700"
            >
              {showAllShows ? 'Show fewer' : `+${hiddenCount} more`}
            </button>
          )}
        </div>

        {/* Rep leaderboard */}
        {owners.length > 0 && (
          <div>
            <p className="micro-label mb-2">Who&apos;s capturing leads</p>
            <div className="divide-y divide-stone-100">
              {owners.map((o) => (
                <div key={o.owner} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-xs font-medium text-stone-700">
                    {o.owner}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    {o.leads >= MIN_LEADS_FOR_RATE && (
                      <span className="text-[10px] tabular-nums text-stone-400">
                        {fmtPct(o.opened / o.leads)} open
                      </span>
                    )}
                    <span className="text-xs font-semibold tabular-nums text-stone-900">
                      {o.leads.toLocaleString()}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
