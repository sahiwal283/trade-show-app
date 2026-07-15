/**
 * CollapsibleSection — Editorial section card for the checklist page.
 *
 * Header reads like a ledger line: icon tile, display title, quiet count,
 * a slim completion strip, and a status chip. Expand/collapse semantics
 * (local state seeded by `defaultCollapsed`) are unchanged.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isComplete: boolean;
  itemCount?: number;
  completedCount?: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isComplete,
  itemCount,
  completedCount,
  children,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const contentId = `checklist-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const pct =
    itemCount && itemCount > 0 ? Math.round(((completedCount || 0) / itemCount) * 100) : 0;

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={toggleCollapse}
        aria-expanded={!isCollapsed}
        aria-controls={contentId}
        className="group flex min-h-[44px] w-full items-center gap-3 p-4 text-left transition-colors hover:bg-stone-50 sm:px-5"
      >
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isComplete ? 'bg-accent-50 text-accent-600' : 'bg-stone-100 text-stone-500'
          }`}
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-display text-base font-bold tracking-tight text-stone-900 sm:text-lg">
              {title}
            </h3>
            {itemCount !== undefined && (
              <span className="text-xs tabular-nums text-stone-400">
                {completedCount ?? 0} of {itemCount} done
              </span>
            )}
          </span>
          {itemCount !== undefined && itemCount > 0 && (
            <span className="mt-1.5 block h-1 max-w-[180px] overflow-hidden rounded-full bg-stone-100">
              <span
                className={`block h-full rounded-full transition-all duration-300 ${
                  isComplete
                    ? 'bg-accent-500'
                    : 'bg-gradient-to-r from-brand-500 to-accent-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </span>

        {isComplete && (
          <span className="chip hidden bg-accent-50 px-2 py-0.5 text-[11px] text-accent-800 ring-accent-200/70 sm:inline-flex">
            <span aria-hidden="true" className="chip-dot bg-accent-500" />
            Complete
          </span>
        )}

        <ChevronDown
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 text-stone-400 transition-transform duration-200 group-hover:text-stone-600 ${
            isCollapsed ? '' : 'rotate-180'
          }`}
        />
      </button>

      {!isCollapsed && (
        <div id={contentId} className="border-t border-stone-100">
          {children}
        </div>
      )}
    </section>
  );
};
