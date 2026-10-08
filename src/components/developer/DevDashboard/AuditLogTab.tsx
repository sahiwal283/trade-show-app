import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../../utils/api';
import type { AuditFilters, AuditLogPage, TimeRange } from './types';
import { useDashboardResource } from './useDashboardResource';
import { TabState } from './TabState';
import { formatDateTime } from './format';

const PAGE_SIZE = 50;

type Choices = Pick<AuditFilters, 'user' | 'method' | 'status' | 'search'>;
const NO_FILTERS: Choices = { user: '', method: '', status: '', search: '' };

const OUTCOME: Record<string, { label: string; tone: string }> = {
  success: { label: 'Success', tone: 'bg-emerald-50 text-emerald-700' },
  warning: { label: 'Rejected', tone: 'bg-amber-50 text-amber-800' },
  failure: { label: 'Failed', tone: 'bg-red-50 text-red-700' },
};

const INPUT = 'rounded-lg border border-stone-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500';
const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm align-top';

export const AuditLogTab: React.FC<{ timeRange: TimeRange }> = ({ timeRange }) => {
  // Text boxes are applied on submit; dropdowns apply immediately.
  const [draft, setDraft] = useState({ user: '', search: '' });
  const [applied, setApplied] = useState<Choices>(NO_FILTERS);
  // The page belongs to one range: a different range starts again at the top.
  const [page, setPage] = useState<{ range: TimeRange; offset: number }>({ range: timeRange, offset: 0 });
  const offset = page.range === timeRange ? page.offset : 0;

  const filters: AuditFilters = { ...applied, timeRange, limit: PAGE_SIZE, offset };
  const resource = useDashboardResource<AuditLogPage>(
    `audit:${JSON.stringify(filters)}`,
    () => api.devDashboard.getAuditLogs(filters)
  );

  const apply = (changes: Partial<Choices>) => {
    setApplied((current) => ({ ...current, ...changes }));
    setPage({ range: timeRange, offset: 0 });
  };
  const goTo = (nextOffset: number) => setPage({ range: timeRange, offset: Math.max(0, nextOffset) });

  return (
    <div className="space-y-4">
      <form
        role="search"
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ search: draft.search.trim(), user: draft.user.trim() });
        }}
      >
        <label className="flex-1 text-xs font-medium text-stone-600">
          Search
          <span className="relative mt-1 block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              type="search"
              value={draft.search}
              onChange={(event) => setDraft((d) => ({ ...d, search: event.target.value }))}
              placeholder="Path, action or error"
              className={`${INPUT} w-full pl-9`}
            />
          </span>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Person
          <input
            type="text"
            value={draft.user}
            onChange={(event) => setDraft((d) => ({ ...d, user: event.target.value }))}
            placeholder="Username"
            className={`${INPUT} mt-1 block w-full md:w-40`}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Action type
          <select
            value={applied.method}
            onChange={(event) => apply({ method: event.target.value as Choices['method'] })}
            className={`${INPUT} mt-1 block w-full md:w-36`}
          >
            <option value="">All</option>
            <option value="auth">Sign-in</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </label>
        <label className="text-xs font-medium text-stone-600">
          Outcome
          <select
            value={applied.status}
            onChange={(event) => apply({ status: event.target.value as Choices['status'] })}
            className={`${INPUT} mt-1 block w-full md:w-32`}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="warning">Rejected</option>
            <option value="failure">Failed</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      <TabState resource={resource} skeletonRows={6}>
        {(data) => {
          const empty = data.logs.length === 0;
          const nothingMatches = <p className="py-8 text-center text-sm text-stone-500">No audit entries match.</p>;
          // An empty first page has nothing to page through. An empty later page
          // (rows pruned or filtered away since) still needs the way back.
          if (empty && offset === 0) return nothingMatches;
          return (
            <>
              {empty ? nothingMatches : (
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full" aria-label="Audit log">
                    <thead className="bg-stone-50">
                      <tr>
                        <th className={TH}>When</th>
                        <th className={TH}>Person</th>
                        <th className={TH}>Action</th>
                        <th className={TH}>Outcome</th>
                        <th className={TH}>Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {data.logs.map((log) => {
                        const outcome = OUTCOME[log.status] ?? { label: log.status, tone: 'bg-stone-100 text-stone-700' };
                        return (
                          <tr key={log.id}>
                            <td className={`${TD} whitespace-nowrap text-stone-600`}>{formatDateTime(log.createdAt)}</td>
                            <td className={TD}>
                              <span className="font-medium text-stone-900">{log.userName ?? 'Not signed in'}</span>
                              {log.userRole && <span className="ml-2 text-xs text-stone-500">{log.userRole}</span>}
                            </td>
                            <td className={TD}>
                              <span className="mr-2 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-700">
                                {log.method ?? 'Sign-in'}
                              </span>
                              <span className="font-mono text-xs text-stone-800 break-all">{log.path ?? log.action}</span>
                              {log.errorMessage && <p className="mt-0.5 text-xs text-red-700">{log.errorMessage}</p>}
                            </td>
                            <td className={TD}>
                              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${outcome.tone}`}>
                                {outcome.label}
                              </span>
                            </td>
                            <td className={`${TD} font-mono text-xs text-stone-600`}>{log.ipAddress ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone-600 tabular-nums">
                  {`${empty ? '0' : `${offset + 1}–${offset + data.logs.length}`} of ${data.total.toLocaleString('en-US')}`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label="Previous page"
                    disabled={offset === 0}
                    onClick={() => goTo(offset - PAGE_SIZE)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label="Next page"
                    disabled={empty || offset + PAGE_SIZE >= data.total}
                    onClick={() => goTo(offset + PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          );
        }}
      </TabState>
    </div>
  );
};
