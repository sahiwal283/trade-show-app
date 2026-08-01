/**
 * NetReturnBars — the data-honest replacement for the cost-vs-revenue
 * scatter. One diverging bar per show: attributed revenue minus cost across
 * years with matched CRM leads. Positive grows right in the accent green,
 * negative grows left in amber, a hairline marks $0. Handles the real-world
 * skew (most shows at $0 revenue, a few carrying everything) without dead
 * space, and every row closes with an exact direct label — no legend hunt.
 *
 * Pure divs: horizontal bars need no SVG and stay robust at every width.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { RoiShowGroup, Trend, fmtMoneyCompact, fmtMoneyFull, fmtMult } from './roiData';

const MAX_ROWS_COLLAPSED = 12;
/** Diverging poles: accent green right (made money), amber left (cost money) */
const POSITIVE = '#10b981'; // accent-500
const NEGATIVE = '#f59e0b'; // amber-500

interface NetReturnBarsProps {
  /** Matched show groups (cost + CRM leads), any order */
  shows: RoiShowGroup[];
}

const TREND_ICON: Record<Exclude<Trend, 'insufficient'>, typeof TrendingUp> = {
  improving: TrendingUp,
  flat: Minus,
  declining: TrendingDown,
};

const TrendMark: React.FC<{ trend: Trend }> = ({ trend }) => {
  if (trend === 'insufficient') return null;
  const Icon = TREND_ICON[trend];
  return (
    <Icon
      aria-label={`Trend: ${trend}`}
      role="img"
      className="h-3.5 w-3.5 shrink-0 text-stone-400"
    />
  );
};

/** "+$86K · 3.5×" / "−$27K · 0×" — sign, compact net, lifetime multiple */
const rowLabel = (g: RoiShowGroup): string => {
  const sign = g.netReturn >= 0 ? '+' : '−';
  const roi = g.lifetimeRoi !== null ? ` · ${fmtMult(g.lifetimeRoi)}` : '';
  return `${sign}${fmtMoneyCompact(Math.abs(g.netReturn))}${roi}`;
};

export const NetReturnBars: React.FC<NetReturnBarsProps> = ({ shows }) => {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () => [...shows].sort((a, b) => b.netReturn - a.netReturn),
    [shows]
  );

  const { axisPct, span } = useMemo(() => {
    const nets = rows.map((g) => g.netReturn);
    const posSpan = Math.max(0, ...nets);
    const negSpan = Math.max(0, ...nets.map((n) => -n));
    const total = posSpan + negSpan;
    return { axisPct: total > 0 ? (negSpan / total) * 100 : 0, span: total };
  }, [rows]);

  if (rows.length === 0 || span <= 0) return null;
  const visible = showAll ? rows : rows.slice(0, MAX_ROWS_COLLAPSED);
  const hiddenCount = rows.length - visible.length;

  return (
    <div>
      {/* Legend — identity in ink text beside colored marks */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: POSITIVE }}
          />
          Returned more than it cost
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: NEGATIVE }}
          />
          Cost more than it returned
        </span>
      </div>

      <ol className="space-y-2 sm:space-y-1.5">
        {visible.map((g) => {
          const isPositive = g.netReturn >= 0;
          const widthPct = Math.max((Math.abs(g.netReturn) / span) * 100, 0.5);
          const hover =
            `${g.name} ${g.yearsLabel} — ${fmtMoneyFull(g.revenue)} attributed revenue − ` +
            `${fmtMoneyFull(g.investedMatched)} cost = ${g.netReturn >= 0 ? '+' : '−'}` +
            `${fmtMoneyFull(Math.abs(g.netReturn))} net` +
            (g.lifetimeRoi !== null ? ` (${fmtMult(g.lifetimeRoi)} lifetime ROI)` : '');
          return (
            <li key={g.showKey} title={hover} className="sm:grid sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:items-center sm:gap-3">
              {/* Name (+ trend) — above the bar on phones, its own column ≥sm */}
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-[13px] font-medium text-stone-700" title={`${g.name} ${g.yearsLabel}`}>
                    {g.name}
                  </span>
                  <TrendMark trend={g.trend} />
                </span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-stone-700 sm:hidden">
                  {rowLabel(g)}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2.5 sm:mt-0">
                {/* Track with the shared zero axis — rows align into one hairline */}
                <div className="relative h-4 min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-[-4px] w-px bg-stone-300"
                    style={{ left: `${axisPct}%` }}
                  />
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 ${isPositive ? 'rounded-r-sm' : 'rounded-l-sm'}`}
                    style={
                      isPositive
                        ? {
                            backgroundColor: POSITIVE,
                            width: `${widthPct}%`,
                            left: `${axisPct}%`,
                          }
                        : {
                            backgroundColor: NEGATIVE,
                            width: `${widthPct}%`,
                            right: `${100 - axisPct}%`,
                          }
                    }
                  />
                </div>
                <span className="hidden w-24 shrink-0 text-right text-[12px] font-semibold tabular-nums text-stone-700 sm:inline">
                  {rowLabel(g)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* $0 tick under the shared axis (bar column only, ≥sm) */}
      <div className="mt-1 hidden sm:grid sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-3">
        <span />
        <div className="flex items-center gap-2.5">
          <div className="relative h-4 min-w-0 flex-1">
            <span
              className="absolute top-0 -translate-x-1/2 text-[10px] font-medium tabular-nums text-stone-400"
              style={{ left: `${axisPct}%` }}
            >
              $0
            </span>
          </div>
          <span className="w-24 shrink-0" />
        </div>
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 flex min-h-[44px] items-center gap-1.5 rounded-lg text-xs font-semibold text-stone-500 transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-0"
        >
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          +{hiddenCount} more show{hiddenCount === 1 ? '' : 's'}
        </button>
      )}
      {showAll && rows.length > MAX_ROWS_COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-2 flex min-h-[44px] items-center gap-1.5 rounded-lg text-xs font-semibold text-stone-500 transition-colors hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-brand-500 lg:min-h-0"
        >
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 rotate-180" />
          Show fewer
        </button>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
        Net return = attributed revenue minus show cost, summed over years with matched CRM leads.
        Shows whose leads haven't produced attributed revenue yet appear as their cost. Hover a row
        for exact figures; the league table has the full record.
      </p>
    </div>
  );
};
