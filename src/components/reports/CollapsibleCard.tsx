/**
 * CollapsibleCard — a report section that collapses to its header. Secondary
 * analytics start collapsed on phones (the Reports page was a 7,000px+ wall)
 * and open on desktop, where vertical space is cheap.
 */

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CollapsibleCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  children: React.ReactNode;
}

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconClassName = 'bg-stone-50 text-stone-500 ring-stone-200/70',
  children,
}) => {
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 p-3 text-left sm:p-5 md:p-6"
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${iconClassName}`}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-3 pb-3 sm:px-5 sm:pb-5 md:px-6 md:pb-6">{children}</div>}
    </div>
  );
};
