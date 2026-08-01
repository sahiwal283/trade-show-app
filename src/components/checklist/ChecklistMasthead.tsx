/**
 * ChecklistMasthead — the show IS the headline.
 *
 * Same masthead grammar as the dashboard's ShowHero: deep brand-gradient
 * canvas, soft glows, faint grid. The selected show's name is set huge so
 * there is never any doubt which show is being prepped, the switcher rides
 * the masthead in glass style, and show readiness lives right here instead
 * of a separate card.
 */

import React from 'react';
import { TradeShow } from '../../App';
import { parseLocalDate } from '../../utils/dateUtils';

interface ChecklistMastheadProps {
  events: TradeShow[];
  selectedEvent: TradeShow | null;
  onSelectEvent: (id: string) => void;
  /** Show the event switcher (admin tab only). */
  showSelector: boolean;
  /** Readiness numbers; omit while loading or on the personal tab. */
  progress?: { completed: number; total: number; pct: number } | null;
}

function formatShowDates(event: TradeShow): string {
  const start = event.showStartDate || event.startDate;
  const end = event.showEndDate || event.endDate;
  if (!start) return '';
  const fmt = (d: string) =>
    parseLocalDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function splitByTime(events: TradeShow[]) {
  const now = new Date();
  const startOf = (e: TradeShow) => parseLocalDate(e.showStartDate || e.startDate);
  const endOf = (e: TradeShow) => parseLocalDate(e.showEndDate || e.endDate || e.startDate);
  const upcoming = events
    .filter(e => endOf(e) >= now)
    .sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const past = events
    .filter(e => endOf(e) < now)
    .sort((a, b) => endOf(b).getTime() - endOf(a).getTime());
  return { upcoming, past };
}

export const ChecklistMasthead: React.FC<ChecklistMastheadProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  showSelector,
  progress,
}) => {
  const place = selectedEvent
    ? [selectedEvent.venue, selectedEvent.city, selectedEvent.state].filter(Boolean).join(' · ')
    : '';
  const dates = selectedEvent ? formatShowDates(selectedEvent) : '';

  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 p-4 shadow-brand-lg sm:p-5 md:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-accent-300/20 blur-3xl" />
        <div className="bg-grid-white absolute inset-0" />
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Checklist{dates ? ` · ${dates}` : ''}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:truncate sm:text-3xl md:text-4xl">
              {selectedEvent ? selectedEvent.name : 'Checklist'}
            </h1>
            {place && <p className="mt-1 truncate text-sm text-white/70">{place}</p>}
          </div>

          {showSelector && events.length > 0 && (
            <label className="inline-flex min-h-[44px] w-full items-center sm:w-auto lg:min-h-0">
              <span className="sr-only">Switch show</span>
              <select
                value={selectedEvent?.id || ''}
                onChange={e => onSelectEvent(e.target.value)}
                className="w-full min-h-[44px] cursor-pointer rounded-full border border-white/25 bg-white/15 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 sm:w-auto lg:min-h-0 [color-scheme:dark]"
              >
                {events.length === 0 && <option value="">No events available</option>}
                {(() => {
                  const { upcoming, past } = splitByTime(events);
                  const opt = (event: TradeShow) => (
                    <option key={event.id} value={event.id} className="text-stone-900">
                      {event.name} — {new Date(event.startDate).toLocaleDateString()}
                    </option>
                  );
                  return (
                    <>
                      {upcoming.length > 0 && (
                        <optgroup label="Upcoming" className="text-stone-900">
                          {upcoming.map(opt)}
                        </optgroup>
                      )}
                      {past.length > 0 && (
                        <optgroup label="Past shows" className="text-stone-900">
                          {past.map(opt)}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </label>
          )}
        </div>

        {progress && progress.total > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium text-white/80">
              <span>
                <span className="font-display text-lg font-bold tabular-nums text-white">
                  {progress.pct}%
                </span>{' '}
                ready
              </span>
              <span className="tabular-nums">
                {progress.completed} of {progress.total} items squared away
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Show readiness"
              className="h-2 overflow-hidden rounded-full bg-white/20"
            >
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
