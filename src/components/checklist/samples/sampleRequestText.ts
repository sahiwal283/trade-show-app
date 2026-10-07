/** Countdown + date copy for the sample request window. closesAt is ISO. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function formatCountdown(closesAt: string, now: Date = new Date()): string {
  const left = new Date(closesAt).getTime() - now.getTime();
  if (left <= 0) return 'Closed';
  if (left >= DAY) {
    const days = Math.floor(left / DAY);
    const hours = Math.floor((left % DAY) / HOUR);
    return `${days}d ${hours}h`;
  }
  if (left >= HOUR) {
    const hours = Math.floor(left / HOUR);
    const mins = Math.floor((left % HOUR) / 60_000);
    return `${hours}h ${mins}m`;
  }
  return `${Math.max(1, Math.floor(left / 60_000))}m`;
}

export function isUrgent(closesAt: string, now: Date = new Date()): boolean {
  const left = new Date(closesAt).getTime() - now.getTime();
  return left > 0 && left <= 48 * HOUR;
}

export function formatCloseDate(closesAt: string): string {
  const s = new Date(closesAt).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).replace(/ /g, ' ');
  return `${s} ET`;
}
