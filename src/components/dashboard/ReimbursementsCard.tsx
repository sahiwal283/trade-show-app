/**
 * ReimbursementsCard Component
 *
 * Outstanding reimbursements for the hero show: total owed with a
 * proportional stacked bar per person. For non-managers the data is
 * already scoped to their own receipts, so it reads as "owed to you".
 */

import { ReimbursementShare } from './hooks/useShowDashboard';
import { money } from './format';

interface ReimbursementsCardProps {
  total: number;
  shares: ReimbursementShare[];
  canManage: boolean;
}

const BAR_COLORS = ['bg-brand-600', 'bg-brand-400', 'bg-brand-200', 'bg-stone-300'];

export function ReimbursementsCard({ total, shares, canManage }: ReimbursementsCardProps) {
  return (
    <section aria-label="Reimbursements" className="card p-4 md:p-5">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
        Reimbursements
      </h2>
      {total === 0 ? (
        <p className="text-xs font-medium text-stone-500">
          {canManage ? 'Nothing owed right now.' : 'Nothing owed to you right now.'}
        </p>
      ) : (
        <>
          <p className="font-display text-2xl font-bold tracking-tight text-stone-900">
            {money(total)}
          </p>
          <p className="text-xs text-stone-400">
            {canManage
              ? `owed across ${shares.length} ${shares.length === 1 ? 'person' : 'people'}`
              : 'owed to you'}
          </p>
          {canManage && shares.length > 1 && (
            <>
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                {shares.slice(0, BAR_COLORS.length).map((share, i) => (
                  <div
                    key={share.name}
                    className={BAR_COLORS[i]}
                    style={{ width: `${(share.amount / total) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="mt-2 space-y-0.5">
                {shares.slice(0, BAR_COLORS.length).map((share, i) => (
                  <li key={share.name} className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${BAR_COLORS[i]}`} />
                    <span className="truncate">{share.name}</span>
                    <span className="ml-auto font-semibold tabular-nums text-stone-700">
                      {money(share.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
