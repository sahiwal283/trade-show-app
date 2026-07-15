/**
 * BookingRow — one compact ledger row on the coordinator booking board.
 *
 * Collapsed it reads: leading toggle · bold name · quiet booking summary ·
 * status chip · Edit. Expanding reveals the section's existing form inline.
 * Pure presentation shell — the owning section keeps all state and handlers.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface BookingRowProps {
  /** Leading control slot (e.g. the booked CheckToggle). */
  toggle?: React.ReactNode;
  title: string;
  /** Chip(s) rendered next to the title (e.g. group/individual tag). */
  titleMeta?: React.ReactNode;
  /** Quiet second line when there is no booking summary (e.g. email). */
  subtitle?: string | null;
  /** Booking summary, e.g. "Delta · Conf DL4X9K". Takes over the subtitle slot. */
  summary?: string | null;
  /** Status slot — StatusChip, or the Save button when the row has edits. */
  status: React.ReactNode;
  /** Extra trailing control (e.g. delete). */
  trailing?: React.ReactNode;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Accessible name for the Edit control, e.g. "Edit flight for Jane". */
  expandLabel: string;
  contentId: string;
  children: React.ReactNode;
}

export const BookingRow: React.FC<BookingRowProps> = ({
  toggle,
  title,
  titleMeta,
  subtitle,
  summary,
  status,
  trailing,
  expanded,
  onToggleExpand,
  expandLabel,
  contentId,
  children,
}) => (
  <div
    className={`rounded-xl border transition-colors ${
      expanded ? 'border-stone-300 shadow-elevation-1' : 'border-stone-200 hover:border-stone-300'
    }`}
  >
    <div className="flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3.5">
      {toggle}

      {/* Name + summary — tapping the line expands the row */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="min-h-[44px] min-w-0 flex-1 rounded-lg py-1 text-left lg:min-h-0"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-bold text-stone-900">{title}</span>
          {titleMeta}
        </span>
        {summary ? (
          <span className="mt-0.5 block truncate text-xs text-stone-500">{summary}</span>
        ) : subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-stone-400">{subtitle}</span>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {status}
        {trailing}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={expandLabel}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 lg:min-h-0 lg:min-w-0"
        >
          <span className="hidden sm:inline">{expanded ? 'Close' : 'Edit'}</span>
          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>

    {expanded && (
      <div id={contentId} className="border-t border-stone-100 p-3 sm:p-4">
        {children}
      </div>
    )}
  </div>
);
