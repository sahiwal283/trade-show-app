import React from 'react';
import type { Usage } from './types';
import { TrendBars } from './TrendBars';
import { timeAgo } from './format';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';
const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500';
const TD = 'px-3 py-2 text-sm';

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const UsageTab: React.FC<{ data: Usage }> = ({ data }) => (
  <div className="space-y-4">
    <section className={SECTION} aria-labelledby="devdash-usage-totals">
      <h3 id="devdash-usage-totals" className="sr-only">Totals</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Screen views</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{data.totals.views.toLocaleString('en-US')}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">People</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900 tabular-nums">{data.totals.uniqueUsers}</p>
        </div>
      </div>
    </section>

    <section className={SECTION} aria-labelledby="devdash-usage-screens">
      <h3 id="devdash-usage-screens" className={HEADING}>Screens</h3>
      {data.screens.length === 0 ? (
        <p className="text-sm text-stone-500">No screen views in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Screens">
            <thead>
              <tr className="border-b border-stone-200">
                <th className={TH}>Screen</th>
                <th className={`${TH} text-right`}>Views</th>
                <th className={`${TH} text-right`}>People</th>
                <th className={TH}>By day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.screens.map((screen) => (
                <tr key={screen.page}>
                  <td className={`${TD} font-mono text-xs text-stone-800`}>{screen.page}</td>
                  <td className={`${TD} text-right tabular-nums text-stone-900`}>{screen.views.toLocaleString('en-US')}</td>
                  <td className={`${TD} text-right tabular-nums text-stone-700`}>{screen.uniqueUsers}</td>
                  <td className={`${TD} w-48`}>
                    <TrendBars
                      values={screen.daily.map((d) => d.views)}
                      labels={screen.daily.map((d) => dayLabel(d.day))}
                      ariaLabel={`Daily views of ${screen.page}`}
                      height={24}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section className={SECTION} aria-labelledby="devdash-usage-people">
      <h3 id="devdash-usage-people" className={HEADING}>People</h3>
      <div className="overflow-x-auto">
        <table className="w-full" aria-label="People">
          <thead>
            <tr className="border-b border-stone-200">
              <th className={TH}>Person</th>
              <th className={TH}>Last seen</th>
              <th className={`${TH} text-right`}>Views</th>
              <th className={TH}>Device</th>
              <th className={TH}>Most used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.users.map((user) => (
              <tr key={user.userId} aria-label={user.name} className={user.views === 0 ? 'text-stone-400' : 'text-stone-800'}>
                <td className={TD}>
                  <span className={`font-medium ${user.views === 0 ? 'text-stone-500' : 'text-stone-900'}`}>{user.name}</span>
                  <span className="ml-2 text-xs text-stone-500">{user.role}</span>
                </td>
                <td className={TD}>{timeAgo(user.lastSeen)}</td>
                <td className={`${TD} text-right tabular-nums`}>{user.views}</td>
                {user.views === 0 ? (
                  <td className={TD} colSpan={2}>No activity</td>
                ) : (
                  <>
                    <td className={TD}>{`${user.mobileViews} mobile, ${user.desktopViews} desktop`}</td>
                    <td className={`${TD} font-mono text-xs`}>
                      {user.topPages.map((p) => `${p.page} (${p.views})`).join(', ')}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
);
