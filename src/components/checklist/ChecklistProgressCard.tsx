/**
 * ChecklistProgressCard — the progress story for the checklist page.
 *
 * Mirrors the dashboard's SpendStoryCard grammar: an oversized display
 * numeral (overall completion), a brand→accent progress bar, and a quiet
 * per-section stat row separated by a hairline.
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface SectionStat {
  key: string;
  label: string;
  completed: number;
  total: number;
}

interface ChecklistProgressCardProps {
  completed: number;
  total: number;
  pct: number;
  stats: SectionStat[];
}

export const ChecklistProgressCard: React.FC<ChecklistProgressCardProps> = ({
  completed,
  total,
  pct,
  stats,
}) => {
  return (
    <section aria-label="Checklist progress" className="card p-5 md:p-6">
      <p className="micro-label mb-1">Show readiness</p>

      {/* Headline numeral */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-4xl font-bold tabular-nums tracking-tight text-stone-900 md:text-5xl">
          {pct}%
        </span>
        <span className="text-sm font-semibold text-stone-500">
          {completed} of {total} items squared away
        </span>
      </div>

      {/* Overall completion bar */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Overall completion"
        className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-section stats */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 border-t border-stone-100 pt-4">
        {stats.map(stat => {
          const isDone = stat.total > 0 && stat.completed === stat.total;
          return (
            <div key={stat.key}>
              <p className="micro-label">{stat.label}</p>
              <p className="text-sm font-bold tabular-nums text-stone-900">
                {stat.total === 0 ? (
                  <span className="font-medium text-stone-400">—</span>
                ) : (
                  <>
                    {stat.completed}
                    <span className="font-medium text-stone-400">/{stat.total}</span>
                    {isDone && (
                      <CheckCircle2
                        aria-label="complete"
                        className="mb-0.5 ml-1 inline w-3.5 h-3.5 text-accent-500"
                      />
                    )}
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
