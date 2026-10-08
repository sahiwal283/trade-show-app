import { describe, it, expect } from 'vitest';
import { dayKey, instantKey, textKey, formatDay } from '../../../src/services/notifications/values';

describe('dayKey', () => {
  it('reads a pg DATE (local-midnight Date) and an ISO string as the same day', () => {
    expect(dayKey(new Date(2026, 9, 31))).toBe('2026-10-31');
    expect(dayKey('2026-10-31')).toBe('2026-10-31');
    expect(dayKey('2026-10-31T00:00:00.000Z')).toBe('2026-10-31');
  });
  it('treats null, undefined, empty and an invalid Date as no value', () => {
    expect(dayKey(null)).toBeNull();
    expect(dayKey(undefined)).toBeNull();
    expect(dayKey('')).toBeNull();
    expect(dayKey(new Date('nope'))).toBeNull();
  });
});

describe('instantKey', () => {
  it('compares a Date and its ISO string as equal', () => {
    const d = new Date('2026-10-31T14:30:00Z');
    expect(instantKey(d)).toBe(instantKey('2026-10-31T14:30:00.000Z'));
  });
  it('returns null for empty or unparseable input', () => {
    expect(instantKey(null)).toBeNull();
    expect(instantKey('')).toBeNull();
    expect(instantKey('nope')).toBeNull();
  });
});

describe('textKey', () => {
  it('trims and treats blank as null', () => {
    expect(textKey('  Delta ')).toBe('Delta');
    expect(textKey('   ')).toBeNull();
    expect(textKey(null)).toBeNull();
  });
});

describe('formatDay', () => {
  it('formats a day for a notification body', () => {
    expect(formatDay('2026-10-31')).toBe('Oct 31, 2026');
    expect(formatDay(new Date(2026, 0, 5))).toBe('Jan 5, 2026');
  });
  it('returns null for no value', () => { expect(formatDay(null)).toBeNull(); });
});
