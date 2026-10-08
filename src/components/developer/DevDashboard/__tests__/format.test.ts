import { describe, it, expect } from 'vitest';
import { formatBytes, formatUptime, timeAgo } from '../format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'], [512, '512 B'], [1024, '1 KB'], [1536, '1.5 KB'],
    [187432960, '178.8 MB'], [4294967296, '4 GB'], [-5, '0 B'], [Number.NaN, '0 B'],
  ])('formats %d as %s', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected));
});

describe('formatUptime', () => {
  it.each([[42, '0m'], [3600, '1h 0m'], [93784, '1d 2h 3m'], [0, '0m']])('formats %d as %s', (seconds, expected) =>
    expect(formatUptime(seconds)).toBe(expected));
});

describe('timeAgo', () => {
  const now = new Date('2026-10-08T16:00:00.000Z');
  it.each([
    ['2026-10-08T15:59:40.000Z', 'just now'],
    ['2026-10-08T15:53:00.000Z', '7m ago'],
    ['2026-10-08T13:00:00.000Z', '3h ago'],
    ['2026-10-05T16:00:00.000Z', '3d ago'],
    ['2026-10-08T16:05:00.000Z', 'just now'],
  ])('formats %s as %s', (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));

  it('says never for no date', () => expect(timeAgo(null, now)).toBe('never'));
});
