/** Which shows the My Checklist switcher lists, in what order, and how each is labelled. Dates compare as YYYY-MM-DD. */
import type { TradeShow } from '../../App';
import { formatLocalDate, getTodayLocalDateString } from '../../utils/dateUtils';

const dayOf = (s: string | null | undefined): string => (s ? String(s).slice(0, 10) : '');
export const showStart = (e: TradeShow): string => dayOf(e.showStartDate || e.startDate);
export const showEnd = (e: TradeShow): string => dayOf(e.showEndDate || e.endDate) || showStart(e);

/** Shows still to come or under way, soonest first; then finished shows, most recent first. */
export function orderShows(events: TradeShow[], today: string = getTodayLocalDateString()): TradeShow[] {
  const current = events.filter((e) => showEnd(e) >= today).sort((a, b) => showStart(a).localeCompare(showStart(b)));
  const past = events.filter((e) => showEnd(e) < today).sort((a, b) => showStart(b).localeCompare(showStart(a)));
  return [...current, ...past];
}

/**
 * The sample puller's list. They fulfil orders before a show starts, so they get every show that has not
 * started yet, soonest first, plus any show they are attending themselves that has not finished. A show that
 * is under way or over has already had its samples sent, so it is left out.
 */
export function pullerShows(events: TradeShow[], userId: string, today: string = getTodayLocalDateString()): TradeShow[] {
  const attending = (e: TradeShow) => (e.participants || []).some((p) => p.id === userId);
  return events
    .filter((e) => showStart(e) > today || (attending(e) && showEnd(e) >= today))
    .sort((a, b) => showStart(a).localeCompare(showStart(b)));
}

/** The next show that has not started: where the puller's page opens. */
export function nextUpcomingShow(events: TradeShow[], today: string = getTodayLocalDateString()): TradeShow | undefined {
  return events.filter((e) => showStart(e) > today).sort((a, b) => showStart(a).localeCompare(showStart(b)))[0];
}

export function showLabel(e: TradeShow): string {
  const start = showStart(e);
  return start ? `${e.name} · ${formatLocalDate(start, { month: 'short', day: 'numeric', year: 'numeric' })}` : e.name;
}
