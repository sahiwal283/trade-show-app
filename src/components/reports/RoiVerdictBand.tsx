/**
 * RoiVerdictBand — the Reports hero. One number the CEO reads first: what a
 * dollar put into trade shows comes back as. Set on the 2.0 masthead canvas
 * (brand gradient + grid + soft glows, same grammar as the dashboard
 * ShowHero), with a quiet stat row and one line of computed narrative.
 *
 * Falls back to invested-only stats when no CRM leads are matched, so the
 * page leads with a strong number either way.
 */

import React from 'react';
import { RoiModel, fmtMoneyCompact, fmtMult, fmtPct } from './roiData';

interface RoiVerdictBandProps {
  model: RoiModel;
  /** Highest-priority computed insight — rendered under the stat row */
  topInsight: string | null;
}

interface Stat {
  label: string;
  value: string;
}

export const RoiVerdictBand: React.FC<RoiVerdictBandProps> = ({ model, topInsight }) => {
  const { portfolio, hasLeadData } = model;
  if (portfolio.totalShowYears === 0) return null;

  const stats: Stat[] = hasLeadData
    ? [
        { label: 'Total invested', value: fmtMoneyCompact(portfolio.invested) },
        { label: 'Revenue attributed', value: fmtMoneyCompact(portfolio.revenue) },
        { label: 'Leads captured', value: portfolio.leads.toLocaleString() },
        {
          label: 'Conversion rate',
          value: portfolio.convRate !== null ? fmtPct(portfolio.convRate) : '—',
        },
        {
          label: 'Cost per lead',
          value: portfolio.costPerLead !== null ? fmtMoneyCompact(portfolio.costPerLead) : '—',
        },
      ]
    : [
        { label: 'Total invested', value: fmtMoneyCompact(portfolio.totalInvestedAllShows) },
        { label: 'Show-years', value: portfolio.totalShowYears.toLocaleString() },
        {
          label: 'Average per show',
          value: fmtMoneyCompact(portfolio.totalInvestedAllShows / portfolio.totalShowYears),
        },
      ];

  return (
    <section
      aria-labelledby="roi-verdict-heading"
      className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 p-4 shadow-brand-lg sm:p-6"
    >
      {/* Atmosphere: soft glows + faint grid so the canvas isn't flat */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-accent-300/20 blur-3xl" />
        <div className="bg-grid-white absolute inset-0" />
      </div>

      <div className="relative">
        <p
          id="roi-verdict-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"
        >
          Return on trade shows
        </p>

        {hasLeadData && portfolio.roi !== null ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-5xl font-bold leading-none tracking-tight tabular-nums text-white sm:text-6xl">
              {fmtMult(portfolio.roi)}
            </span>
            <span className="max-w-sm text-sm leading-snug text-white/75">
              attributed revenue per dollar invested, across {portfolio.matchedShowYears} show-year
              {portfolio.matchedShowYears === 1 ? '' : 's'} with matched CRM leads
            </span>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-5xl font-bold leading-none tracking-tight tabular-nums text-white sm:text-6xl">
              {fmtMoneyCompact(portfolio.totalInvestedAllShows)}
            </span>
            <span className="max-w-sm text-sm leading-snug text-white/75">
              invested across {portfolio.totalShowYears} show-year
              {portfolio.totalShowYears === 1 ? '' : 's'} — connect CRM leads to see the return
            </span>
          </div>
        )}

        {/* Quiet stat row under a hairline */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/15 pt-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-10">
          {stats.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">
                {label}
              </dt>
              <dd className="mt-0.5 font-display text-lg font-bold tracking-tight tabular-nums text-white sm:text-xl">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {topInsight && (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/85">{topInsight}</p>
        )}
      </div>
    </section>
  );
};
