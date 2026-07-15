/**
 * bookingText — tiny text/date formatters for the booking board and the
 * itinerary cards, plus the board tab/panel id helpers. No JSX here so
 * component files stay fast-refresh friendly.
 */

import type { BoardTabKey } from './BookingBoardTabs';

/* ===== Board tab/panel ids ===== */

export const boardTabId = (key: BoardTabKey) => `booking-board-tab-${key}`;
export const boardPanelId = (key: BoardTabKey) => `booking-board-panel-${key}`;

/* ===== Summary text ===== */

/** Join summary fragments with a middot, skipping blanks: "Delta · Conf DL4X9K". */
export function joinSummary(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map(part => part?.trim())
    .filter((part): part is string => !!part);
  return cleaned.length > 0 ? cleaned.join(' · ') : null;
}

/* ===== Dates ===== */

/** Parse a YYYY-MM-DD(-ish) string as a local date; avoids UTC day-shift. */
function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** "Mar 3", or null when the value is missing/unparseable. */
export function formatShortDate(value?: string | null): string | null {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString('en-US', SHORT_DATE) : null;
}

/** "Mar 3–7", "Mar 30–Apr 2", a single date, or null when both ends are blank. */
export function formatDateRange(start?: string | null, end?: string | null): string | null {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);

  if (from && to) {
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    const fromText = from.toLocaleDateString('en-US', SHORT_DATE);
    const toText = sameMonth ? String(to.getDate()) : to.toLocaleDateString('en-US', SHORT_DATE);
    return `${fromText}–${toText}`;
  }

  const only = from || to;
  return only ? only.toLocaleDateString('en-US', SHORT_DATE) : null;
}
