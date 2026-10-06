/**
 * Which events are open for lead entry.
 *
 * A show takes leads while it runs and for a short while after, so reps can
 * finish entering the cards in their pocket. Before and long after, offering
 * it in the picker is only a way to file a lead under the wrong show.
 *
 * Dates are the show dates, not the travel dates: leads are collected on the
 * floor. An event with no usable dates is treated as open rather than hidden,
 * because a hidden event cannot be scanned into at all.
 */

import { parseLocalDate } from '../../utils/dateUtils';

/** Days after the last show day that new leads are still accepted. */
export const LEAD_ENTRY_GRACE_DAYS = 14;
/** Days before the first show day that the event appears, for setup. */
export const LEAD_ENTRY_LEAD_DAYS = 14;

export interface LeadEvent {
  id: string;
  name: string;
  city?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  showStartDate?: string;
  showEndDate?: string;
}

/** upcoming and closed are outside the entry window; closed is read-only. */
export type LeadEventPhase = 'upcoming' | 'soon' | 'live' | 'wrapping' | 'closed';

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = parseLocalDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);

function showDates(event: LeadEvent): { start: Date | null; end: Date | null } {
  const start = parse(event.showStartDate) ?? parse(event.startDate);
  const end = parse(event.showEndDate) ?? parse(event.endDate) ?? start;
  return { start: start ?? end, end };
}

export function leadEventPhase(event: LeadEvent, now: Date = new Date()): LeadEventPhase {
  const { start, end } = showDates(event);
  if (!start || !end) return 'live';
  const today = startOfDay(now);
  if (today < start) return daysBetween(today, start) <= LEAD_ENTRY_LEAD_DAYS ? 'soon' : 'upcoming';
  if (today <= end) return 'live';
  return daysBetween(end, today) <= LEAD_ENTRY_GRACE_DAYS ? 'wrapping' : 'closed';
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "Live now", "Starts in 3 days", "Ended 5 days ago". Empty when dates are unknown. */
export function leadEventStatus(event: LeadEvent, now: Date = new Date()): string {
  const { start, end } = showDates(event);
  if (!start || !end) return '';
  const today = startOfDay(now);
  if (today < start) {
    const days = daysBetween(today, start);
    return days === 1 ? 'Starts tomorrow' : `Starts in ${plural(days, 'day')}`;
  }
  if (today <= end) return 'Live now';
  const days = daysBetween(end, today);
  return days === 1 ? 'Ended yesterday' : `Ended ${plural(days, 'day')} ago`;
}

/** "Oct 6 – 9, 2026 · Las Vegas, NV". */
export function leadEventSummary(event: LeadEvent): string {
  const { start, end } = showDates(event);
  const parts: string[] = [];
  if (start && end) {
    const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const sameDay = start.getTime() === end.getTime();
    const range = sameDay
      ? monthDay(start)
      : `${monthDay(start)} – ${sameMonth ? end.getDate() : monthDay(end)}`;
    parts.push(`${range}, ${end.getFullYear()}`);
  }
  const place = [event.city, event.state].filter(Boolean).join(', ');
  if (place) parts.push(place);
  return parts.join(' · ');
}

const PHASE_ORDER: Record<LeadEventPhase, number> = { live: 0, wrapping: 1, soon: 2, upcoming: 3, closed: 4 };

/**
 * Events open for lead entry first (live, then just ended, then starting
 * soon), followed by everything else: later shows soonest-first, then closed
 * shows most-recent-first.
 */
export function sortLeadEvents<T extends LeadEvent>(events: T[], now: Date = new Date()): T[] {
  const time = (e: T, which: 'start' | 'end') => showDates(e)[which]?.getTime() ?? 0;
  return [...events].sort((a, b) => {
    const pa = leadEventPhase(a, now);
    const pb = leadEventPhase(b, now);
    if (pa !== pb) return PHASE_ORDER[pa] - PHASE_ORDER[pb];
    if (pa === 'wrapping' || pa === 'closed') return time(b, 'end') - time(a, 'end');
    return time(a, 'start') - time(b, 'start') || a.name.localeCompare(b.name);
  });
}

export const isOpenForLeads = (phase: LeadEventPhase): boolean =>
  phase === 'live' || phase === 'wrapping' || phase === 'soon';
