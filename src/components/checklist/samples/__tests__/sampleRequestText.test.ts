import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatCountdown, isUrgent, formatCloseDate, formatRelative, formatShortDate, describeChange } from '../sampleRequestText';

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
  afterEach(() => vi.restoreAllMocks());

  it('renders in Eastern time with the zone label', () => {
    expect(formatCloseDate(close)).toBe('Oct 23, 11:59 PM ET');
  });
  it('normalizes narrow no-break spaces to regular spaces', () => {
    const narrowNBSP = String.fromCharCode(0x202f);
    const stubbed = 'Oct 23, 11:59' + narrowNBSP + 'PM';
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue(stubbed);
    const result = formatCloseDate(close);
    expect(result).toBe('Oct 23, 11:59 PM ET');
    expect(result).not.toContain(narrowNBSP);
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('says just now under a minute', () => { expect(formatRelative('2026-10-15T11:59:30Z', now)).toBe('just now'); });
  it('uses minutes under an hour', () => { expect(formatRelative('2026-10-15T11:55:00Z', now)).toBe('5 min ago'); });
  it('uses hours under a day', () => { expect(formatRelative('2026-10-15T09:00:00Z', now)).toBe('3 h ago'); });
  it('falls back to a short date', () => { expect(formatRelative('2026-10-12T09:00:00Z', now)).toBe('on Oct 12'); });
});

describe('formatShortDate', () => {
  it('renders month and day in Eastern time', () => { expect(formatShortDate('2026-10-14T16:00:00Z')).toBe('Oct 14'); });
});

describe('describeChange', () => {
  const base = { id: 'c', userId: 'u', userName: 'Sameer', kind: 'item' as const, targetId: 'p', targetName: 'Mango', lineName: 'Peelz', brand: 'boomin_brands' as const, changedAt: '' };
  it('describes a quantity change', () => {
    expect(describeChange({ ...base, field: 'singles', oldValue: '2', newValue: '4' })).toBe('Sameer changed Peelz · Mango singles 2 → 4');
    expect(describeChange({ ...base, field: 'empty_displays', oldValue: '0', newValue: '1' })).toBe('Sameer changed Peelz · Mango empty displays 0 → 1');
  });
  it('tells apart the same product name in two lines', () => {
    const q = { ...base, targetName: 'Mango Peach', field: 'singles' as const, oldValue: '2', newValue: '4' };
    expect(describeChange({ ...q, lineName: 'Oh! Mit' })).toBe('Sameer changed Oh! Mit · Mango Peach singles 2 → 4');
    expect(describeChange({ ...q, lineName: 'HyMIT' })).toBe('Sameer changed HyMIT · Mango Peach singles 2 → 4');
  });
  it('a product with no line name renders as before', () => {
    expect(describeChange({ ...base, lineName: null, field: 'singles', oldValue: null, newValue: '4' })).toBe('Sameer changed Mango singles 0 → 4');
  });
  it('a material never shows a line', () => {
    expect(describeChange({ ...base, kind: 'material', targetName: 'Banner', field: 'qty', oldValue: '1', newValue: '2' })).toBe('Sameer changed Banner qty 1 → 2');
  });
  it('describes notes and a missing user', () => {
    expect(describeChange({ ...base, userName: null, kind: 'material', targetName: 'Banner', lineName: null, brand: null, field: 'notes', oldValue: null, newValue: 'big one' }))
      .toBe('Someone changed Banner notes to "big one"');
    expect(describeChange({ ...base, kind: 'material', targetName: 'Banner', field: 'notes', oldValue: 'x', newValue: null })).toBe('Sameer cleared Banner notes');
  });
});
