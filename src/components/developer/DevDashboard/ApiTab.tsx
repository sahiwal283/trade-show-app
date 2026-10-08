import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ApiAnalytics, TimeRange } from './types';
import { TrendBars } from './TrendBars';
import { formatDateTime } from './format';
import { describeUserAgent } from './userAgent';

type Endpoint = ApiAnalytics['endpoints'][number];
type SortKey = 'calls' | 'avgMs' | 'p95Ms' | 'maxMs' | 'errors';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';
const TH = 'px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm tabular-nums';

const COLUMNS: Array<{ key: SortKey; label: string; unit: string }> = [
  { key: 'calls', label: 'Calls', unit: '' },
  { key: 'avgMs', label: 'Avg', unit: 'ms' },
  { key: 'p95Ms', label: 'p95', unit: 'ms' },
  { key: 'maxMs', label: 'Max', unit: 'ms' },
  { key: 'errors', label: 'Errors', unit: '' },
];

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-700',
  POST: 'bg-emerald-50 text-emerald-700',
  PUT: 'bg-amber-50 text-amber-800',
  PATCH: 'bg-amber-50 text-amber-800',
  DELETE: 'bg-red-50 text-red-700',
};

const Method: React.FC<{ value: string }> = ({ value }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${METHOD_TONE[value] ?? 'bg-stone-100 text-stone-700'}`}>
    {value}
  </span>
);

/** Daily buckets start at UTC midnight, so they are labelled by UTC date. */
export function bucketLabel(start: string, range: TimeRange): string {
  const date = new Date(start);
  if (range === '7d' || range === '30d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const RAW_AGENT_MAX = 60;

/**
 * Who made a failing call: "Chrome · macOS" when the agent is a browser we can
 * name, otherwise the agent itself (a script or poller says more raw than as
 * "Other"), cut short. Null when the client sent none.
 */
function clientLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const { label } = describeUserAgent(userAgent);
  if (label !== 'Other' && label !== 'Unknown') return label;
  return userAgent.length > RAW_AGENT_MAX ? `${userAgent.slice(0, RAW_AGENT_MAX)}…` : userAgent;
}

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{value}</p>
    {note && <p className="text-xs text-stone-500">{note}</p>}
  </div>
);

export const ApiTab: React.FC<{ data: ApiAnalytics; timeRange: TimeRange }> = ({ data, timeRange }) => {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'calls', descending: true });

  const endpoints = useMemo(() => {
    const direction = sort.descending ? -1 : 1;
    return [...data.endpoints].sort((a: Endpoint, b: Endpoint) => (a[sort.key] - b[sort.key]) * direction);
  }, [data.endpoints, sort]);

  const pressSort = (key: SortKey) =>
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : true }));

  const { totals } = data;

  return (
    <div className="space-y-4">
      <section className={SECTION} aria-labelledby="devdash-api-totals">
        <h3 id="devdash-api-totals" className="sr-only">Totals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Requests" value={totals.requests.toLocaleString('en-US')} />
          <Stat
            label="Error rate"
            value={`${totals.errorRate}%`}
            note={`${totals.errors.toLocaleString('en-US')} ${totals.errors === 1 ? 'error' : 'errors'}`}
          />
          <Stat label="Median response" value={`${totals.p50Ms}ms`} />
          <Stat label="95th percentile" value={`${totals.p95Ms}ms`} />
        </div>
        <div className="mt-4">
          <TrendBars
            values={data.buckets.map((b) => b.requests)}
            highlights={data.buckets.map((b) => b.errors)}
            labels={data.buckets.map((b) => bucketLabel(b.start, timeRange))}
            ariaLabel="Requests over time, errors in red"
            height={56}
          />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="devdash-api-endpoints">
        <h3 id="devdash-api-endpoints" className={HEADING}>Endpoints</h3>
        {endpoints.length === 0 ? (
          <p className="text-sm text-stone-500">No requests in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Endpoints">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className={`${TH} text-left`}>Endpoint</th>
                  <th className={`${TH} text-left`}>Method</th>
                  {COLUMNS.map((column) => {
                    const active = sort.key === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`${TH} text-right`}
                        aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                      >
                        <button
                          type="button"
                          onClick={() => pressSort(column.key)}
                          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-stone-900"
                        >
                          {column.label}
                          {active && (sort.descending ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {endpoints.map((endpoint) => (
                  <tr key={`${endpoint.method} ${endpoint.endpoint}`}>
                    <td className="px-3 py-2 font-mono text-xs text-stone-800">{endpoint.endpoint}</td>
                    <td className="px-3 py-2 text-sm"><Method value={endpoint.method} /></td>
                    <td className={`${TD} text-right text-stone-900`}>{endpoint.calls.toLocaleString('en-US')}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.avgMs}ms`}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.p95Ms}ms`}</td>
                    <td className={`${TD} text-right text-stone-700`}>{`${endpoint.maxMs}ms`}</td>
                    <td className={`${TD} text-right ${endpoint.errors > 0 ? 'font-medium text-red-600' : 'text-stone-500'}`}>
                      {endpoint.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={SECTION} aria-labelledby="devdash-api-slowest">
          <h3 id="devdash-api-slowest" className={HEADING}>Slowest endpoints</h3>
          {data.slowest.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing with 5 or more calls in this range.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.slowest.map((endpoint) => (
                <li key={`${endpoint.method} ${endpoint.endpoint}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="mr-2"><Method value={endpoint.method} /></span>
                    <span className="font-mono text-xs text-stone-800 break-all">{endpoint.endpoint}</span>
                  </span>
                  <span className="flex-shrink-0 text-right text-sm tabular-nums">
                    <span className="font-medium text-stone-900">{`${endpoint.avgMs}ms`}</span>
                    <span className="ml-2 text-xs text-stone-500">max <span>{`${endpoint.maxMs}ms`}</span></span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={SECTION} aria-labelledby="devdash-api-errors">
          <h3 id="devdash-api-errors" className={HEADING}>Recent errors</h3>
          {data.recentErrors.length === 0 ? (
            <p className="text-sm text-stone-500">No errors in this range.</p>
          ) : (
            <ul className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
              {data.recentErrors.map((error) => {
                const client = clientLabel(error.userAgent);
                return (
                  <li key={error.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`font-medium tabular-nums ${error.statusCode >= 500 ? 'text-red-600' : 'text-amber-700'}`}>
                        {error.statusCode}
                      </span>
                      <Method value={error.method} />
                      <span className="font-mono text-xs text-stone-800 break-all">{error.endpoint}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {`${formatDateTime(error.createdAt)} · ${error.userName ?? 'Not signed in'}`}
                      {client && ` · ${client}`}
                      {error.errorMessage && <span className="text-stone-700">{` · ${error.errorMessage}`}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
