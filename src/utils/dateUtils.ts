/**
 * Date Utilities for Trade Show App
 * 
 * IMPORTANT: These utilities prevent timezone conversion bugs that occur when
 * using `new Date()` with YYYY-MM-DD strings. JavaScript treats such strings
 * as UTC midnight, which causes date shifts in local timezones.
 * 
 * Always use these utilities instead of `new Date()` for date-only strings!
 */

/**
 * Parse a date string (YYYY-MM-DD) as a local date without timezone conversion
 * 
 * @param dateString - Date string in YYYY-MM-DD format (e.g., "2026-02-07")
 * @returns Date object set to local midnight
 * 
 * @example
 * // ❌ BAD: This treats the date as UTC and may shift by a day
 * const date = new Date("2026-02-07");
 * 
 * // ✅ GOOD: This treats the date as local time
 * const date = parseLocalDate("2026-02-07");
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Format a date string (YYYY-MM-DD) for display without timezone conversion
 * 
 * @param dateString - Date string in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options (optional)
 * @returns Formatted date string
 * 
 * @example
 * formatLocalDate("2026-02-07") // "2/7/2026" (US locale)
 * formatLocalDate("2026-02-07", { month: 'long', day: 'numeric', year: 'numeric' }) // "February 7, 2026"
 */
export function formatLocalDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString(undefined, options);
}

/**
 * Calculate the number of days between today and a target date
 * 
 * @param dateString - Target date in YYYY-MM-DD format
 * @returns Number of days (positive = future, negative = past, 0 = today)
 * 
 * @example
 * getDaysUntil("2026-02-07") // 122 (if today is 2025-10-08)
 */
export function getDaysUntil(dateString: string): number {
  const targetDate = parseLocalDate(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date string represents today
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is today
 */
export function isToday(dateString: string): boolean {
  return getDaysUntil(dateString) === 0;
}

/**
 * Check if a date has passed (is before today)
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is in the past
 */
export function isPast(dateString: string): boolean {
  return getDaysUntil(dateString) < 0;
}

/**
 * Check if a date is in the future (is after today)
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @returns true if the date is in the future
 */
export function isFuture(dateString: string): boolean {
  return getDaysUntil(dateString) > 0;
}

/**
 * Format a date string for HTML date input (YYYY-MM-DD)
 * Handles both ISO strings and already-formatted dates
 * 
 * @param dateString - Date in any format
 * @returns YYYY-MM-DD formatted string
 * 
 * @example
 * formatForDateInput("2026-02-07T10:30:00Z") // "2026-02-07"
 * formatForDateInput("2026-02-07") // "2026-02-07"
 */
export function formatForDateInput(dateString: string): string {
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  // Otherwise parse and format
  const date = parseLocalDate(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date range for display
 * 
 * @param startDateString - Start date in YYYY-MM-DD format
 * @param endDateString - End date in YYYY-MM-DD format
 * @param separator - Separator between dates (default: " - ")
 * @returns Formatted date range string
 * 
 * @example
 * formatDateRange("2026-02-07", "2026-02-14") // "2/7/2026 - 2/14/2026"
 */
export function formatDateRange(startDateString: string, endDateString: string, separator: string = ' - '): string {
  return `${formatLocalDate(startDateString)}${separator}${formatLocalDate(endDateString)}`;
}

/**
 * Get a human-readable label for days until a date
 * 
 * @param days - Number of days (from getDaysUntil)
 * @returns Human-readable label
 * 
 * @example
 * getDaysUntilLabel(0) // "Today"
 * getDaysUntilLabel(1) // "Tomorrow"
 * getDaysUntilLabel(-1) // "Yesterday"
 * getDaysUntilLabel(5) // "In 5 days"
 * getDaysUntilLabel(-5) // "5 days ago"
 */
export function getDaysUntilLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/**
 * Get today's date in YYYY-MM-DD format using LOCAL timezone (not UTC)
 * 
 * This prevents the timezone bug where using `new Date().toISOString()`
 * returns the date in UTC, which can be a different day than the user's local date.
 * 
 * @returns Today's date in YYYY-MM-DD format
 * 
 * @example
 * // If it's 9:35 PM on Oct 15 in CST (UTC-5):
 * new Date().toISOString().split('T')[0] // ❌ "2025-10-16" (wrong - UTC time)
 * getTodayLocalDateString() // ✅ "2025-10-15" (correct - local time)
 */
export function getTodayLocalDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

