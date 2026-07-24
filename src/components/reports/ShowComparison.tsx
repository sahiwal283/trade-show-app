/**
 * ShowComparison — "trade shows are an investment" view.
 *
 * KPI band + per-show cost bars with year-over-year comparison, fed by
 * show_summaries (imported 2025 history + live app data). Companies keep
 * their fixed colors; YoY increases read red, decreases green.
 */

import React, { useMemo, useState } from 'react';
import { Download, TrendingUp, TrendingDown, Minus, FileText, FileSpreadsheet } from 'lucide-react';
import { ShowSummaryRow } from './hooks/useShowSummaries';
import { getTodayLocalDateString } from '../../utils/dateUtils';
import { API_CONFIG, STORAGE_KEYS } from '../../constants/appConstants';

/** Authenticated binary download (PDF / xlsx) from the summaries API. */
async function downloadReport(file: string, saveAs: string): Promise<void> {
  try {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const res = await fetch(`${API_CONFIG.BASE_URL}/show-summaries/${file}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveAs;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[ShowComparison] Export failed:', error);
    alert('Export failed — please try again.');
  }
}

interface ShowComparisonProps {
  rows: ShowSummaryRow[];
  entityColorMap: Record<string, string>;
  entityOrder: string[];
  /** Open a live show's full expense breakdown (transaction register) */
  onOpenShow?: (eventId: string) => void;
}

type Scope = number | 'compare';

const fmt = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt2 = (n: number) =>
  '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Human display name for a show key: latest year's name minus year tokens. */
function displayName(rowsForKey: ShowSummaryRow[]): string {
  const latest = rowsForKey.reduce((a, b) => (b.year > a.year ? b : a));
  return latest.show_name
    .replace(/[-\s]*20\d\d([-\s]*20\d\d)?/g, '')
    .replace(/[-\s]+$/, '')
    .trim();
}

const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const ShowComparison: React.FC<ShowComparisonProps> = ({
  rows,
  entityColorMap,
  entityOrder,
  onOpenShow,
}) => {
  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.year))).sort(),
    [rows]
  );
  const [scope, setScope] = useState<Scope>('compare');
  const [company, setCompany] = useState<string>('all');
  const [showTable, setShowTable] = useState(false);

  const companies = useMemo(
    () =>
      entityOrder.filter((c) => rows.some((r) => r.company === c)).concat(
        Array.from(new Set(rows.map((r) => r.company))).filter(
          (c) => !entityOrder.includes(c)
        )
      ),
    [rows, entityOrder]
  );

  const filtered = useMemo(
    () => (company === 'all' ? rows : rows.filter((r) => r.company === company)),
    [rows, company]
  );

  // Per show-key aggregation
  const shows = useMemo(() => {
    const byKey: Record<
      string,
      { name: string; perYear: Record<number, number>; perYearCompany: Record<number, Record<string, number>>; perYearEvent: Record<number, string> }
    > = {};
    for (const r of filtered) {
      if (!byKey[r.show_key]) {
        byKey[r.show_key] = { name: '', perYear: {}, perYearCompany: {}, perYearEvent: {} };
      }
      const s = byKey[r.show_key];
      s.perYear[r.year] = (s.perYear[r.year] || 0) + r.amount;
      s.perYearCompany[r.year] = s.perYearCompany[r.year] || {};
      s.perYearCompany[r.year][r.company] =
        (s.perYearCompany[r.year][r.company] || 0) + r.amount;
      if (r.event_id) s.perYearEvent[r.year] = r.event_id;
    }
    for (const key of Object.keys(byKey)) {
      byKey[key].name = displayName(filtered.filter((r) => r.show_key === key));
    }
    return byKey;
  }, [filtered]);

  const compareYears: [number, number] | null =
    years.length >= 2 ? [years[years.length - 2], years[years.length - 1]] : null;

  // KPI band values for the current scope
  const kpi = useMemo(() => {
    const scopeRows =
      scope === 'compare' ? filtered : filtered.filter((r) => r.year === scope);
    const total = scopeRows.reduce((s, r) => s + r.amount, 0);
    const showCount = new Set(scopeRows.map((r) => `${r.show_key}:${r.year}`)).size;
    const byCategory: Record<string, number> = {};
    for (const r of scopeRows) byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      showCount,
      avg: showCount ? total / showCount : 0,
      topCategory: top ? top[0] : '—',
      topAmount: top ? top[1] : 0,
    };
  }, [filtered, scope]);

  const sortedKeys = useMemo(() => {
    return Object.keys(shows).sort((a, b) => {
      const max = (k: string) => Math.max(...Object.values(shows[k].perYear), 0);
      return max(b) - max(a);
    });
  }, [shows]);

  const maxAmount = useMemo(
    () =>
      Math.max(
        1,
        ...Object.values(shows).flatMap((s) =>
          Object.entries(s.perYear)
            .filter(([y]) => scope === 'compare' || Number(y) === scope)
            .map(([, v]) => v)
        )
      ),
    [shows, scope]
  );

  const handleExport = () => {
    if (!compareYears) return;
    const [y1, y2] = compareYears;
    const header = ['Show', String(y1), String(y2), 'Change $', 'Change %'];
    const body = sortedKeys.map((k) => {
      const a = shows[k].perYear[y1] || 0;
      const b = shows[k].perYear[y2] || 0;
      const pct = a > 0 && b > 0 ? (((b - a) / a) * 100).toFixed(1) + '%' : '';
      return [shows[k].name, a.toFixed(2), b.toFixed(2), (b - a).toFixed(2), pct];
    });
    const t1 = sortedKeys.reduce((s, k) => s + (shows[k].perYear[y1] || 0), 0);
    const t2 = sortedKeys.reduce((s, k) => s + (shows[k].perYear[y2] || 0), 0);
    const csv = [header, ...body, ['Total', t1.toFixed(2), t2.toFixed(2), (t2 - t1).toFixed(2), '']]
      .map((r) => r.map(csvField).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `show-comparison-${getTodayLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) return null;

  return (
    <div className="card p-3 sm:p-5 md:p-6">
      {/* Header + scope controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
            Trade Show Investment
          </h3>
          <p className="mt-0.5 text-xs text-stone-500">
            What each show costs the business — imported 2025 history vs live data
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-1">
          {[...years, 'compare' as const].map((s) => (
            <button
              key={String(s)}
              onClick={() => setScope(s as Scope)}
              className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-semibold transition-colors lg:min-h-0 ${
                scope === s
                  ? 'bg-white text-stone-900 shadow-elevation-1 ring-1 ring-stone-200'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {s === 'compare' ? 'Compare' : s}
            </button>
          ))}
        </div>
      </div>

      {/* KPI band */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: scope === 'compare' ? 'Total invested (all years)' : `Invested in ${scope}`, value: fmt(kpi.total) },
          { label: 'Show appearances', value: String(kpi.showCount) },
          { label: 'Average per show', value: fmt(kpi.avg) },
          { label: `Top cost: ${kpi.topCategory.split(' - ')[0].split(' / ')[0]}`, value: fmt(kpi.topAmount) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-stone-200/80 bg-stone-50/60 p-3">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              {label}
            </p>
            <p className="mt-1 font-display text-xl font-bold tracking-tight tabular-nums text-stone-900 sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Company filter */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setCompany('all')}
          className={`chip min-h-[36px] px-2.5 py-1 text-xs transition-colors lg:min-h-0 ${
            company === 'all'
              ? 'bg-stone-900 text-white ring-stone-900'
              : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
          }`}
        >
          All companies
        </button>
        {companies.map((c) => (
          <button
            key={c}
            onClick={() => setCompany(company === c ? 'all' : c)}
            className={`chip min-h-[36px] items-center gap-1.5 px-2.5 py-1 text-xs transition-colors lg:min-h-0 ${
              company === c
                ? 'bg-stone-900 text-white ring-stone-900'
                : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
            }`}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: entityColorMap[c] || '#898781' }}
            />
            {c}
          </button>
        ))}
      </div>

      {/* Per-show tiles — bento grid, sized so a dozen shows fit in a few
          rows instead of a wall of full-width cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sortedKeys.map((key) => {
          const s = shows[key];
          const yearsToShow = scope === 'compare' ? years : [scope as number];
          const [prevY, currY] = compareYears || [0, 0];
          const a = s.perYear[prevY] || 0;
          const b = s.perYear[currY] || 0;
          const delta = a > 0 && b > 0 ? ((b - a) / a) * 100 : null;
          const headline = scope === 'compare' ? Math.max(a, b) : s.perYear[scope as number] || 0;

          return (
            <div
              key={key}
              className="rounded-xl border border-stone-200/80 bg-white p-3 shadow-elevation-1 transition-shadow hover:shadow-elevation-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-stone-900" title={s.name}>
                  {s.name}
                </p>
                {scope === 'compare' && delta !== null ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      delta > 2
                        ? 'bg-red-50 text-red-700'
                        : delta < -2
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {delta > 2 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : delta < -2 ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                    {delta > 0 ? '+' : ''}
                    {delta.toFixed(0)}%
                  </span>
                ) : (
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums text-stone-900">
                    {headline ? fmt(headline) : ''}
                  </span>
                )}
              </div>

              <div className="mt-2 space-y-1">
                {yearsToShow.map((y) => {
                  const total = s.perYear[y] || 0;
                  const perCompany = s.perYearCompany[y] || {};
                  const segs = companies.filter((c) => perCompany[c]);
                  const eventId = s.perYearEvent[y];
                  const RowTag = eventId && onOpenShow ? 'button' : 'div';
                  return (
                    <RowTag
                      key={y}
                      {...(eventId && onOpenShow
                        ? {
                            onClick: () => onOpenShow(eventId),
                            title: 'View expenses for this show',
                            className:
                              'flex w-full items-center gap-1.5 rounded px-0.5 text-left transition-colors hover:bg-brand-50/60 focus-visible:ring-2 focus-visible:ring-brand-500',
                          }
                        : { className: 'flex items-center gap-1.5' })}
                    >
                      <span className="w-8 shrink-0 text-[10px] font-semibold tabular-nums text-stone-400">
                        {String(y).slice(2) ? `'${String(y).slice(2)}` : y}
                      </span>
                      {total > 0 ? (
                        <>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                            <div
                              className="flex h-full overflow-hidden rounded-full"
                              style={{ width: `${Math.max((total / maxAmount) * 100, 3)}%` }}
                            >
                              {segs.map((c, i) => (
                                <div
                                  key={c}
                                  className="h-full"
                                  title={`${c}: ${fmt2(perCompany[c])}`}
                                  style={{
                                    width: `${(perCompany[c] / total) * 100}%`,
                                    backgroundColor: entityColorMap[c] || '#898781',
                                    marginLeft: i > 0 ? '1px' : undefined,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <span className="w-14 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-700">
                            {fmt(total)}
                          </span>
                        </>
                      ) : (
                        <span className="flex-1 text-[11px] italic text-stone-300">not attended</span>
                      )}
                    </RowTag>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Business exports + exact numbers */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => downloadReport('report.pdf', 'trade-show-investment-report.pdf')}
          className="btn-secondary min-h-[44px] px-3 py-1.5 text-xs lg:min-h-[32px]"
        >
          <FileText className="h-3.5 w-3.5" />
          PDF Report
        </button>
        <button
          onClick={() => downloadReport('report.xlsx', 'trade-show-investment.xlsx')}
          className="btn-secondary min-h-[44px] px-3 py-1.5 text-xs lg:min-h-[32px]"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel Workbook
        </button>
        {scope === 'compare' && compareYears && (
          <button
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            className="btn-ghost min-h-[44px] px-3 py-1.5 text-xs font-semibold text-stone-600 lg:min-h-[32px]"
          >
            {showTable ? 'Hide exact numbers' : 'Show exact numbers'}
          </button>
        )}
      </div>
      {scope === 'compare' && compareYears && showTable && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200/80">
          <table className="w-full">
            <thead className="bg-stone-50/80">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Show</th>
                {compareYears.map((y) => (
                  <th key={y} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">{y}</th>
                ))}
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Δ $</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">Δ %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sortedKeys.map((k) => {
                const a = shows[k].perYear[compareYears[0]] || 0;
                const b = shows[k].perYear[compareYears[1]] || 0;
                const d = b - a;
                const pct = a > 0 && b > 0 ? (d / a) * 100 : null;
                return (
                  <tr key={k} className="transition-colors hover:bg-brand-50/40">
                    <td className="px-3 py-2 text-sm font-medium text-stone-900">{shows[k].name}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-700">{a ? fmt2(a) : '—'}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-700">{b ? fmt2(b) : '—'}</td>
                    <td className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${d > 0 && a > 0 && b > 0 ? 'text-red-700' : d < 0 ? 'text-emerald-700' : 'text-stone-500'}`}>
                      {a > 0 && b > 0 ? fmt2(d) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">
                      {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-stone-200 bg-stone-50/60 px-3 py-2">
            <button onClick={handleExport} className="btn-secondary min-h-[44px] px-3 py-1.5 text-xs lg:min-h-[36px]">
              <Download className="h-3.5 w-3.5" />
              Export Comparison CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
