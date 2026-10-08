import { describe, it, expect } from 'vitest';
import { parseTimeRange, intervalFor, rangeSeconds, bucketSeconds } from '../../../src/services/devDashboard/timeRange';

describe('timeRange', () => {
  it.each(['1h', '24h', '7d', '30d'])('accepts %s', (value) => {
    expect(parseTimeRange(value)).toBe(value);
  });

  it.each([undefined, null, '', '90d', "1h'; DROP TABLE users;--", 24, ['1h']])('treats %j as 24h', (value) => {
    expect(parseTimeRange(value)).toBe('24h');
  });

  it('maps each range to a Postgres interval', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => intervalFor(r as any))).toEqual(['1 hour', '24 hours', '7 days', '30 days']);
  });

  it('buckets by 5 minutes, an hour, then a day', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => bucketSeconds(r as any))).toEqual([300, 3600, 86400, 86400]);
  });

  it('knows each range in seconds', () => {
    expect(['1h', '24h', '7d', '30d'].map((r) => rangeSeconds(r as any))).toEqual([3600, 86400, 604800, 2592000]);
  });
});
