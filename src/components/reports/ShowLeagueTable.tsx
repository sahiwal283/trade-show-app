/**
 * ShowLeagueTable — THE decision table. Every show-year with both cost and
 * lead data, ranked by ROI multiple, each row closing with a verdict chip
 * (Double down / Hold / Reassess / Needs data). Desktop renders a dense
 * table that scrolls inside the card; phones get a stacked card list so the
 * page never scrolls horizontally.
 *
 * When no CRM leads are matched anywhere, the same surface ranks shows by
 * cost with "Needs data" verdicts — the page still works.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  RoiShowRow,
  Verdict,
  ROI_DOUBLE_DOWN,
  ROI_REASSESS,
  fmtMoneyCompact,
  fmtMoneyFull,
  fmtMult,
  fmtPct,
} from './roiData';

interface ShowLeagueTableProps {
  ranked: RoiShowRow[];
  needsData: RoiShowRow[];
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
  hold: {
    label: 'Hold',
    chip: 'bg-stone-100 text-stone-600 ring-stone-200/80',
    dot: 'bg-stone-400',
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
    <span className={`chip px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
      <span aria-hidden="true" className={`chip-dot ${meta.dot}`} />
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

export const ShowLeagueTable: React.FC<ShowLeagueTableProps> = ({
  ranked,
  needsData,
  hasLeadData,
  onOpenShow,
}) => {
  const [showUnmatched, setShowUnmatched] = useState(false);

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
            ? 'Every show-year with matched costs and CRM leads, ranked by return'
            : 'Ranked by cost — CRM leads not yet matched to these shows'}
        </p>
      </div>

      {/* Desktop: dense ranked table, scrolls inside the card */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th scope="col" className={`${HEAD_CELL} w-10 text-right`}>
                #
              </th>
              <th scope="col" className={`${HEAD_CELL} text-left`}>
                Show
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Invested
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Leads
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Conv %
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                Revenue
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                ROI
              </th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                $ / lead
              </th>
              <th scope="col" className={`${HEAD_CELL} text-left`}>
                Verdict
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r, i) => {
              const eventId = r.eventId;
              const open = eventId && onOpenShow ? () => onOpenShow(eventId) : undefined;
              return (
                <tr
                  key={r.key}
                  {...(open ? { onClick: open } : {})}
                  className={`transition-colors ${open ? 'cursor-pointer hover:bg-brand-50/50' : ''}`}
                >
                  <td
                    className={`px-3 py-2.5 text-right font-display text-sm tabular-nums ${
                      i < 3 ? 'font-bold text-stone-900' : 'font-medium text-stone-400'
                    }`}
                  >
                    {i + 1}
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
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
                        {r.name}
                      </button>
                    ) : (
                      <span
                        className="block truncate text-sm font-semibold text-stone-900"
                        title={r.name}
                      >
                        {r.name}
                      </span>
                    )}
                    <span className="text-[11px] font-medium tabular-nums text-stone-400">
                      {r.year}
                    </span>
                  </td>
                  <td className={NUM_CELL}>{fmtMoneyFull(r.invested)}</td>
                  <td className={NUM_CELL}>{r.hasLeads ? r.leads.toLocaleString() : '—'}</td>
                  <td className={NUM_CELL}>{r.convRate !== null ? fmtPct(r.convRate) : '—'}</td>
                  <td className={NUM_CELL}>{r.hasLeads ? fmtMoneyFull(r.revenue) : '—'}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-display text-sm font-bold tabular-nums ${roiTone(r.roi)}`}
                  >
                    {r.roi !== null ? fmtMult(r.roi) : '—'}
                  </td>
                  <td className={NUM_CELL}>
                    {r.costPerLead !== null ? fmtMoneyFull(r.costPerLead) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <VerdictChip verdict={r.verdict} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rank cards — no horizontal scroll at 320px */}
      <ol className="space-y-2 md:hidden">
        {rows.map((r, i) => {
          const eventId = r.eventId;
          const open = eventId && onOpenShow ? () => onOpenShow(eventId) : undefined;
          const body = (
            <>
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
                    {r.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-400">
                    {r.year}
                  </span>
                </div>
                <VerdictChip verdict={r.verdict} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: 'Invested', value: fmtMoneyCompact(r.invested) },
                  { label: 'Revenue', value: r.hasLeads ? fmtMoneyCompact(r.revenue) : '—' },
                  {
                    label: 'ROI',
                    value: r.roi !== null ? fmtMult(r.roi) : '—',
                    tone: roiTone(r.roi),
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
              {r.hasLeads && (
                <p className="mt-1.5 text-[11px] tabular-nums text-stone-500">
                  {r.leads.toLocaleString()} lead{r.leads === 1 ? '' : 's'}
                  {r.convRate !== null && ` · ${fmtPct(r.convRate)} converted`}
                  {r.costPerLead !== null && ` · ${fmtMoneyFull(r.costPerLead)}/lead`}
                </p>
              )}
            </>
          );
          return (
            <li key={r.key}>
              {open ? (
                <button
                  type="button"
                  onClick={open}
                  title="View the expense register for this show"
                  className="w-full rounded-lg border border-stone-200/80 bg-white p-3 text-left shadow-elevation-1 transition-all duration-200 hover:border-brand-300 hover:shadow-elevation-2 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {body}
                </button>
              ) : (
                <div className="rounded-lg border border-stone-200/80 bg-white p-3 shadow-elevation-1">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Quiet expandable: cost-only show-years waiting on CRM matching */}
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
            No lead data yet ({unmatched.length} show-year{unmatched.length === 1 ? '' : 's'})
          </button>
          {showUnmatched && (
            <ul className="mt-2 divide-y divide-stone-100">
              {unmatched.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-stone-700">
                      {r.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-stone-400">
                      {r.year}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-stone-700">
                      {fmtMoneyFull(r.invested)}
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
        ROI = invoice revenue from converted leads ÷ total show cost across all companies. Verdicts:
        Double down at ≥{ROI_DOUBLE_DOWN}× ROI or ≥30% conversion; Reassess below {ROI_REASSESS}×
        with 10+ leads.
      </p>
    </div>
  );
};
