/**
 * The ONE place that knows when a show's sample request window opens and
 * closes. Opens at event creation; closes 23:59:59 America/New_York on
 * (travel_start_date ?? show_start_date) − 10 days. Never stored, so moving
 * a travel date moves the deadline and late-added participants just work.
 */
import { SampleWindow } from './types';

export const SAMPLE_WINDOW_TZ = 'America/New_York';
export const SAMPLE_CLOSE_DAYS_BEFORE = 10;

type DateLike = string | Date | null | undefined;

interface WindowEvent {
  created_at: string | Date;
  travel_start_date?: DateLike;
  show_start_date?: DateLike;
}

/** [year, month(1-12), day] of a pg DATE value, which may be a Date or 'YYYY-MM-DD…'. */
function dateParts(value: string | Date): [number, number, number] {
  if (value instanceof Date) return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** Offset (ms) of `tz` from UTC at the instant `utcMs`. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

/** 23:59:59 in America/New_York on the given calendar date, as a UTC instant. */
export function endOfDayEastern(value: string | Date): Date {
  const [y, m, d] = dateParts(value);
  const wall = Date.UTC(y, m - 1, d, 23, 59, 59);
  let utc = wall - tzOffsetMs(wall, SAMPLE_WINDOW_TZ);
  // Re-check: the first guess used the offset at the wrong instant on DST days.
  const corrected = wall - tzOffsetMs(utc, SAMPLE_WINDOW_TZ);
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

function minusDays(value: string | Date, days: number): Date {
  const [y, m, d] = dateParts(value);
  return new Date(Date.UTC(y, m - 1, d - days)); // date-only; only Y/M/D are read back
}

export function computeSampleWindow(event: WindowEvent, now: Date = new Date()): SampleWindow {
  const opensAtDate = event.created_at instanceof Date ? event.created_at : new Date(event.created_at);
  const opensAt = Number.isNaN(opensAtDate.getTime()) ? null : opensAtDate.toISOString();

  const anchor = event.travel_start_date || event.show_start_date;
  if (!anchor) return { opensAt, closesAt: null, isOpen: false };

  const closeDay = minusDays(anchor, SAMPLE_CLOSE_DAYS_BEFORE);
  const closeDayStr = `${closeDay.getUTCFullYear()}-${String(closeDay.getUTCMonth() + 1).padStart(2, '0')}-${String(closeDay.getUTCDate()).padStart(2, '0')}`;
  const closesAtDate = endOfDayEastern(closeDayStr);

  const t = now.getTime();
  const isOpen = (opensAt === null || t >= opensAtDate.getTime()) && t <= closesAtDate.getTime();
  return { opensAt, closesAt: closesAtDate.toISOString(), isOpen };
}
