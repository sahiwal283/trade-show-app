/**
 * ShowLeagueTable — THE decision table. One row per SHOW across every
 * attended year, ranked by recency-weighted ROI, each row closing with a
 * trend arrow and a time-aware verdict chip. Rows expand to the per-year
 * breakdown (invested, leads, conv %, revenue, ROI) so the roll-up is
 * always auditable. Desktop renders a dense table that scrolls inside the
 * card; phones get stacked cards so the page never scrolls horizontally.
 *
 * When no CRM leads are matched anywhere, the same surface ranks shows by
 * cost with "Needs data" verdicts — the page still works.
 */

import React, { useState } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  RoiShowGroup,
  ShowYearStat,
  Trend,
  Verdict,
  ROI_DOUBLE_DOWN,
  ROI_REASSESS,
  MIN_LEADS_FOR_REASSESS,
  MATURITY_WINDOW_MONTHS,
  fmtMoneyCompact,
  fmtMoneyFull,
  fmtMult,
  fmtPct,
} from './roiData';

interface ShowLeagueTableProps {
  ranked: RoiShowGroup[];
  needsData: RoiShowGroup[];
  hasLeadData: boolean;
  /** Open the expense register for a live show-year */
  onOpenShow?: (eventId: string) => void;
}

const VERDICT_META: Record<Verdict, { label: string; chip: string; dot: string }> = {
  'double-down': {
    label: 'Double down',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
    dot: 'bg-emerald-500',
  },
  rising: {
    label: 'Rising',
    chip: 'bg-brand-50 text-brand-700 ring-brand-200/80',
    dot: 'bg-brand-500',
  },
  hold: {
    label: 'Hold',
    chip: 'bg-stone-100 text-stone-600 ring-stone-200/80',
    dot: 'bg-stone-400',
  },
  declining: {
    label: 'Declining',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200/80',
    dot: 'bg-rose-500',
  },
  maturing: {
    label: 'Maturing',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200/80',
    dot: 'bg-violet-500',
  },
  reassess: {
    label: 'Reassess',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200/80',
    dot: 'bg-amber-500',
  },
  'needs-data': {
    label: 'Needs data',
    chip: 'bg-white text-stone-400 ring-stone-200/80',
    dot: 'bg-stone-300',
  },
};

const VerdictChip: React.FC<{ verdict: Verdict }> = ({ verdict }) => {
  const meta = VERDICT_META[verdict];
  return (
    <span className={`chip whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
      <span aria-hidden="true" className={`chip-dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

/** Direction always carried by arrow + word, never color alone. */
const TREND_META: Record<Trend, { label: string; icon: typeof TrendingUp | null; title: string }> =
  {
    improving: { label: 'Improving', icon: TrendingUp, title: 'Recent 2-year ROI beats earlier years' },
    flat: { label: 'Flat', icon: Minus, title: 'Recent 2-year ROI matches earlier years' },
    declining: { label: 'Declining', icon: TrendingDown, title: 'Recent 2-year ROI trails earlier years' },
    insufficient: { label: '—', icon: null, title: 'Needs 2+ attended years with lead data' },
  };

const TrendTag: React.FC<{ trend: Trend }> = ({ trend }) => {
  const meta = TREND_META[trend];
  const Icon = meta.icon;
  if (!Icon) {
    return (
      <span className="text-[11px] text-stone-300" title={meta.title}>
        {meta.label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-stone-500"
      title={meta.title}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
};

/** ROI ink steps with the verdict chip carrying the meaning (never color alone). */
const roiTone = (roi: number | null): string => {
  if (roi === null) return 'text-stone-400';
  if (roi >= ROI_DOUBLE_DOWN) return 'text-emerald-600';
  if (roi < ROI_REASSESS) return 'text-amber-600';
  return 'text-stone-900';
};

const HEAD_CELL = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400';
const NUM_CELL = 'px-3 py-2.5 text-right text-sm tabular-nums text-stone-700';
const YEAR_NUM = 'px-3 py-1.5 text-right text-[13px] tabular-nums text-stone-600';

/** One expanded per-year line, shared shape for the desktop sub-table. */
const YearCells: React.FC<{ y: ShowYearStat; onOpenShow?: (eventId: string) => void }> = ({
  y,
  onOpenShow,
}) => (
  <>
    <td className="px-3 py-1.5 text-left">
      {y.eventId && onOpenShow ? (
        <button
          type="button"
          onClick={() => onOpenShow(y.eventId as string)}
          title="View the expense register for this show-year"
          className="rounded text-[13px] font-semibold tabular-nums text-stone-700 underline-offset-2 hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {y.year}
        </button>
      ) : (
        <span className="text-[13px] font-semibold tabular-nums text-stone-700">{y.year}</span>
      )}
    </td>
    <td className={YEAR_NUM}>{fmtMoneyFull(y.invested)}</td>
    <td className={YEAR_NUM}>{y.hasLeads ? y.leads.toLocaleString() : '—'}</td>
    <td className={YEAR_NUM}>{y.convRate !== null ? fmtPct(y.convRate) : '—'}</td>
    <td className={YEAR_NUM}>{y.hasLeads ? fmtMoneyFull(y.revenue) : '—'}</td>
    <td className={`${YEAR_NUM} font-semibold`}>
      {y.roi !== null ? fmtMult(y.roi) : <span title="No CRM leads matched">no lead match</span>}
    </td>
  </>
);

export const ShowLeagueTable: React.FC<ShowLeagueTableProps> = ({
  ranked,
  needsData,
  hasLeadData,
  onOpenShow,
}) => {
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  // Without any matched leads, the cost-only shows ARE the ranking
  const rows = hasLeadData ? ranked : needsData;
  const unmatched = hasLeadData ? needsData : [];
  if (rows.length === 0) return null;

  return (
    <div className="card p-3 sm:p-5 md:p-6">
      <div className="mb-3">
        <h3 className="micro-label">Show league table</h3>
        <p className="mt-0.5 text-xs text-stone-500">
          {hasLeadData
            ? 'One row per show, ranked by recent-weighted ROI — expand a row for the year-by-year record'
            : 'Ranked by cost — CRM leads not yet matched to these shows'}
        </p>
      </div>

      {/* Desktop: dense ranked table, scrolls inside the card */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th scope="col" className={`${HEAD_CELL} w-8 text-right`}>
                #
              </th>
              <th scope="col" className={`${HEAD_CELL} text-left`}>
                Show
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Invested
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Revenue
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                <span className="block">ROI</span>
                <span className="block">(recent-weighted)</span>
              </th>
              <th scope="col" className={`${HEAD_CELL} text-left`}>
                Verdict
              </th>
              <th scope="col" className={`${HEAD_CELL} w-9`}>
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((g, i) => {
              const isOpen = Boolean(expanded[g.showKey]);
              const open = g.eventId && onOpenShow ? () => onOpenShow(g.eventId as string) : undefined;
              return (
                <React.Fragment key={g.showKey}>
                  <tr
                    onClick={() => toggle(g.showKey)}
                    className="cursor-pointer transition-colors hover:bg-brand-50/50"
                  >
                    <td
                      className={`px-3 py-2.5 text-right font-display text-sm tabular-nums ${
                        i < 3 ? 'font-bold text-stone-900' : 'font-medium text-stone-400'
                      }`}
                    >
                      {i + 1}
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      {open ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open();
                          }}
                          title="View the expense register for this show"
                          className="block max-w-full truncate rounded text-left text-sm font-semibold text-stone-900 underline-offset-2 hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          {g.name}
                        </button>
                      ) : (
                        <span
                          className="block truncate text-sm font-semibold text-stone-900"
                          title={g.name}
                        >
                          {g.name}
                        </span>
                      )}
                      <span className="flex items-center gap-2 text-[11px] font-medium tabular-nums text-stone-400">
                        <span>
                          {g.yearsLabel}
                          {g.years.length > 1 && ` · ${g.years.length} years`}
                        </span>
                        <TrendTag trend={g.trend} />
                      </span>
                    </td>
                    <td className={NUM_CELL}>{fmtMoneyFull(g.invested)}</td>
                    <td className={NUM_CELL}>{g.hasLeads ? fmtMoneyFull(g.revenue) : '—'}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-display text-sm font-bold tabular-nums ${roiTone(g.weightedRoi)}`}
                    >
                      {g.weightedRoi !== null ? fmtMult(g.weightedRoi) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <VerdictChip verdict={g.verdict} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        data-testid="league-expand"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(g.showKey);
                        }}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} year-by-year record for ${g.name}`}
                        className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-stone-50/60">
                      <td />
                      <td colSpan={6} className="px-0 py-1.5">
                        <table className="w-full">
                          <thead>
                            <tr>
                              {['Year', 'Invested', 'Leads', 'Conv %', 'Revenue', 'ROI'].map(
                                (h, hi) => (
                                  <th
                                    key={h}
                                    scope="col"
                                    className={`px-3 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-stone-400 ${hi === 0 ? 'text-left' : 'text-right'}`}
                                  >
                                    {h}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {[...g.years].reverse().map((y) => (
                              <tr key={y.year}>
                                <YearCells y={y} onOpenShow={onOpenShow} />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rank cards — no horizontal scroll at 320px */}
      <ol className="space-y-2 md:hidden">
        {rows.map((g, i) => {
          const isOpen = Boolean(expanded[g.showKey]);
          return (
            <li key={g.showKey} className="rounded-lg border border-stone-200/80 bg-white p-3 shadow-elevation-1">
              <button
                type="button"
                data-testid="league-expand"
                onClick={() => toggle(g.showKey)}
                aria-expanded={isOpen}
                className="w-full rounded text-left focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={`font-display text-sm tabular-nums ${
                        i < 3 ? 'font-bold text-stone-900' : 'font-medium text-stone-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-stone-900">
                      {g.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-400">
                      {g.yearsLabel}
                    </span>
                  </div>
                  <VerdictChip verdict={g.verdict} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Invested', value: fmtMoneyCompact(g.invested) },
                    { label: 'Revenue', value: g.hasLeads ? fmtMoneyCompact(g.revenue) : '—' },
                    {
                      label: 'ROI (wt)',
                      value: g.weightedRoi !== null ? fmtMult(g.weightedRoi) : '—',
                      tone: roiTone(g.weightedRoi),
                    },
                  ].map(({ label, value, tone }) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
                        {label}
                      </p>
                      <p
                        className={`font-display text-base font-bold tracking-tight tabular-nums ${tone || 'text-stone-900'}`}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {g.hasLeads && (
                    <span className="text-[11px] tabular-nums text-stone-500">
                      {g.leads.toLocaleString()} lead{g.leads === 1 ? '' : 's'}
                      {g.convRate !== null && ` · ${fmtPct(g.convRate)} converted`}
                    </span>
                  )}
                  <TrendTag trend={g.trend} />
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-stone-400">
                    {isOpen ? 'Hide years' : 'Years'}
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </div>
              </button>
              {isOpen && (
                <ul className="mt-2 divide-y divide-stone-100 border-t border-stone-100">
                  {[...g.years].reverse().map((y) => (
                    <li key={y.year} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        {y.eventId && onOpenShow ? (
                          <button
                            type="button"
                            onClick={() => onOpenShow(y.eventId as string)}
                            className="rounded text-[13px] font-semibold tabular-nums text-stone-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {y.year}
                          </button>
                        ) : (
                          <span className="text-[13px] font-semibold tabular-nums text-stone-700">
                            {y.year}
                          </span>
                        )}
                        <p className="text-[11px] tabular-nums text-stone-500">
                          {y.hasLeads
                            ? `${y.leads} lead${y.leads === 1 ? '' : 's'}${y.convRate !== null ? ` · ${fmtPct(y.convRate)} conv` : ''}`
                            : 'no lead match'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-semibold tabular-nums text-stone-900">
                          {y.hasLeads ? fmtMoneyFull(y.revenue) : '—'}
                          <span className="font-normal text-stone-400"> / {fmtMoneyFull(y.invested)}</span>
                        </p>
                        <p className="text-[11px] font-semibold tabular-nums text-stone-500">
                          {y.roi !== null ? `${fmtMult(y.roi)} ROI` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {/* Quiet expandable: cost-only shows waiting on CRM matching */}
      {unmatched.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => setShowUnmatched((v) => !v)}
            aria-expanded={showUnmatched}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg text-xs font-semibold text-stone-500 transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-0"
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showUnmatched ? 'rotate-180' : ''}`}
            />
            No lead data yet ({unmatched.length} show{unmatched.length === 1 ? '' : 's'})
          </button>
          {showUnmatched && (
            <ul className="mt-2 divide-y divide-stone-100">
              {unmatched.map((g) => (
                <li key={g.showKey} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-stone-700">
                      {g.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-400">
                      {g.yearsLabel}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-stone-700">
                      {fmtMoneyFull(g.invested)}
                    </span>
                    <VerdictChip verdict="needs-data" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
        ROI (recent-weighted) = attributed revenue ÷ show cost over years with matched CRM leads,
        with each year's dollars discounted by half per year of age — so last year counts twice as
        much as the year before, and a windfall from years ago can't carry a show today. Double
        down: ≥{ROI_DOUBLE_DOWN}× recent-weighted, unless the last two years slipped below{' '}
        {ROI_DOUBLE_DOWN}×. Declining: earned ≥1×
        lifetime but under {ROI_REASSESS}× across the last two years. Reassess: under{' '}
        {ROI_REASSESS}× with {MIN_LEADS_FOR_REASSESS}+ leads. Shows from the last ~
        {MATURITY_WINDOW_MONTHS} months read Maturing while their leads are still becoming
        invoices.
      </p>
    </div>
  );
};
