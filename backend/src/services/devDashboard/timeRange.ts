/**
 * The dashboard's time ranges. A range from the query string is only ever
 * used as a key into these tables; the SQL receives the looked-up value as a
 * parameter, so nothing a client sends reaches a statement as text.
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d';

const RANGES: Record<TimeRange, { interval: string; seconds: number; bucketSeconds: number }> = {
  '1h': { interval: '1 hour', seconds: 3600, bucketSeconds: 300 },
  '24h': { interval: '24 hours', seconds: 86400, bucketSeconds: 3600 },
  '7d': { interval: '7 days', seconds: 604800, bucketSeconds: 86400 },
  '30d': { interval: '30 days', seconds: 2592000, bucketSeconds: 86400 },
};

export function parseTimeRange(raw: unknown): TimeRange {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(RANGES, raw) ? (raw as TimeRange) : '24h';
}

export const intervalFor = (range: TimeRange): string => RANGES[range].interval;
export const rangeSeconds = (range: TimeRange): number => RANGES[range].seconds;
export const bucketSeconds = (range: TimeRange): number => RANGES[range].bucketSeconds;
