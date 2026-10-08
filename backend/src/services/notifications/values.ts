/**
 * Normalisers for comparing "before" and "after" values that reach us in
 * different shapes: pg returns DATE columns as local-midnight Date objects,
 * request bodies carry strings, and blank means the same as null.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Calendar day as 'YYYY-MM-DD', or null when there is no usable value. */
export function dayKey(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  if (text === '') return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return iso ? iso[1] : text;
}

/** A moment in time as epoch milliseconds, or null. */
export function instantKey(value: unknown): number | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return isNaN(ms) ? null : ms;
}

/** Trimmed text; blank and null are the same thing. */
export function textKey(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** 'Oct 31, 2026' for a notification body, or null. */
export function formatDay(value: unknown): string | null {
  const key = dayKey(value);
  if (!key) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
