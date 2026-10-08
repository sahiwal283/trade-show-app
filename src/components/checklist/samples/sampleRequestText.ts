/** Countdown + date copy for the sample request window, and the wording of its change history. closesAt is ISO. */
import type { SampleChangeRow } from '../../../utils/sampleRequestApi';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NON_STANDARD_SPACES = new RegExp('[' + String.fromCharCode(0x202f, 0x00a0) + ']', 'g');

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
  }).replace(NON_STANDARD_SPACES, ' ');
  return `${s} ET`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const ago = now.getTime() - new Date(iso).getTime();
  if (ago < 60_000) return 'just now';
  if (ago < HOUR) return `${Math.floor(ago / 60_000)} min ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`;
  return `on ${formatShortDate(iso)}`;
}

const FIELD_LABEL: Record<SampleChangeRow['field'], string> = {
  singles: 'singles', displays: 'displays', empty_displays: 'empty displays', qty: 'qty', notes: 'notes',
};

export function describeChange(c: SampleChangeRow): string {
  const who = c.userName ?? 'Someone';
  // The same product name exists in more than one line, so an item names its line.
  const target = c.kind === 'item' && c.lineName ? `${c.lineName} · ${c.targetName}` : c.targetName;
  if (c.field === 'notes') {
    return c.newValue ? `${who} changed ${target} notes to "${c.newValue}"` : `${who} cleared ${target} notes`;
  }
  return `${who} changed ${target} ${FIELD_LABEL[c.field]} ${c.oldValue ?? '0'} → ${c.newValue ?? '0'}`;
}
