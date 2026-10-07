import { describe, it, expect, vi } from 'vitest';
import { formatCountdown, isUrgent, formatCloseDate } from '../sampleRequestText';

const close = '2026-10-24T03:59:59.000Z';

describe('formatCountdown', () => {
  it('shows days and hours when more than a day remains', () => {
    expect(formatCountdown(close, new Date('2026-10-20T23:59:59Z'))).toBe('3d 4h');
  });
  it('shows hours and minutes under a day', () => {
    expect(formatCountdown(close, new Date('2026-10-23T22:30:00Z'))).toBe('5h 29m');
  });
  it('shows minutes under an hour', () => {
    expect(formatCountdown(close, new Date('2026-10-24T03:45:00Z'))).toBe('14m');
  });
  it('says closed once past', () => {
    expect(formatCountdown(close, new Date('2026-10-24T04:00:00Z'))).toBe('Closed');
  });
  it('exactly 24 hours left shows 1d 0h', () => {
    const now = new Date(new Date(close).getTime() - 24 * 60 * 60 * 1000);
    expect(formatCountdown(close, now)).toBe('1d 0h');
  });
  it('24 hours - 1ms shows 23h 59m', () => {
    const now = new Date(new Date(close).getTime() - 24 * 60 * 60 * 1000 + 1);
    expect(formatCountdown(close, now)).toBe('23h 59m');
  });
  it('exactly 1 hour left shows 1h 0m', () => {
    const now = new Date(new Date(close).getTime() - 60 * 60 * 1000);
    expect(formatCountdown(close, now)).toBe('1h 0m');
  });
  it('1 hour - 1ms shows 59m', () => {
    const now = new Date(new Date(close).getTime() - 60 * 60 * 1000 + 1);
    expect(formatCountdown(close, now)).toBe('59m');
  });
  it('exactly 0 shows Closed', () => {
    const now = new Date(close);
    expect(formatCountdown(close, now)).toBe('Closed');
  });
  it('30 seconds left shows 1m', () => {
    const now = new Date(new Date(close).getTime() - 30 * 1000);
    expect(formatCountdown(close, now)).toBe('1m');
  });
});

describe('isUrgent', () => {
  it('is urgent inside 48 hours', () => {
    expect(isUrgent(close, new Date('2026-10-22T12:00:00Z'))).toBe(true);
    expect(isUrgent(close, new Date('2026-10-20T12:00:00Z'))).toBe(false);
  });
  it('exactly 48 hours left is urgent', () => {
    const now = new Date(new Date(close).getTime() - 48 * 60 * 60 * 1000);
    expect(isUrgent(close, now)).toBe(true);
  });
  it('48 hours + 1ms is not urgent', () => {
    const now = new Date(new Date(close).getTime() - 48 * 60 * 60 * 1000 - 1);
    expect(isUrgent(close, now)).toBe(false);
  });
  it('at closure (0ms left) is not urgent', () => {
    const now = new Date(close);
    expect(isUrgent(close, now)).toBe(false);
  });
});

describe('formatCloseDate', () => {
  it('renders in Eastern time with the zone label', () => {
    expect(formatCloseDate(close)).toBe('Oct 23, 11:59 PM ET');
  });
  it('normalizes narrow no-break spaces to regular spaces', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('Oct 23, 11:59 PM');
    const result = formatCloseDate(close);
    expect(result).toBe('Oct 23, 11:59 PM ET');
    expect(result).not.toContain(' ');
    spy.mockRestore();
  });
});
