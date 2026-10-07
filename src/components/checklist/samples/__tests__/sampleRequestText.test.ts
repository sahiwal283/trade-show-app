import { describe, it, expect } from 'vitest';
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
});

describe('isUrgent', () => {
  it('is urgent inside 48 hours', () => {
    expect(isUrgent(close, new Date('2026-10-22T12:00:00Z'))).toBe(true);
    expect(isUrgent(close, new Date('2026-10-20T12:00:00Z'))).toBe(false);
  });
});

describe('formatCloseDate', () => {
  it('renders in Eastern time with the zone label', () => {
    expect(formatCloseDate(close)).toBe('Oct 23, 11:59 PM ET');
  });
});
