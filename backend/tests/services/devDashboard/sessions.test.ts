import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getSessions, groupSessions } from '../../../src/services/devDashboard/sessions';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/sessions.json'), 'utf8')
);

const NOW = new Date('2026-10-08T16:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const row = (over: Record<string, unknown>) => ({
  id: 's1', user_id: 'u1', name: 'Digi', role: 'salesperson', ip_address: '203.0.113.9', user_agent: 'UA',
  created_at: minutesAgo(600), last_activity: minutesAgo(2), expires_at: new Date(NOW.getTime() + 3_600_000),
  ...over,
});

describe('groupSessions', () => {
  it('collapses a person\'s sessions into one row, newest first', () => {
    const users = groupSessions(
      [
        row({ id: 's1', last_activity: minutesAgo(2) }),
        row({ id: 's2', last_activity: minutesAgo(4000) }),
        row({ id: 's3', user_id: 'u2', name: 'Sasha', last_activity: minutesAgo(90) }),
      ],
      NOW
    );
    expect(users.map((u) => [u.name, u.sessionCount])).toEqual([['Digi', 2], ['Sasha', 1]]);
    expect(users[0].sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(users[0].lastActivity).toBe(minutesAgo(2).toISOString());
  });

  it.each([[2, 'active'], [5, 'idle'], [29, 'idle'], [30, 'away'], [5000, 'away']])(
    'calls someone last seen %i minutes ago %s',
    (minutes, status) => {
      expect(groupSessions([row({ last_activity: minutesAgo(minutes) })], NOW)[0].status).toBe(status);
    }
  );

  it('uses nulls for a session with no recorded address or browser', () => {
    const [user] = groupSessions([row({ ip_address: null, user_agent: null })], NOW);
    expect(user.sessions[0]).toMatchObject({ ipAddress: null, userAgent: null });
  });

  it('treats the placeholder address "unknown" as no address', () => {
    expect(groupSessions([row({ ip_address: 'unknown', user_agent: 'Unknown' })], NOW)[0].sessions[0])
      .toMatchObject({ ipAddress: null, userAgent: null });
  });

  it('returns an empty list for no sessions', () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });
});

describe('getSessions', () => {
  beforeEach(() => { query.mockReset(); });

  it('returns exactly the contract shape', async () => {
    routeQueries(query, [['sessions', [row({}), row({ id: 's2', last_activity: minutesAgo(50) })]]]);
    expect(keyShape(await getSessions(NOW))).toEqual(keyShape(fixture));
  });

  it('asks only for sessions that have not expired', async () => {
    routeQueries(query, [['sessions', []]]);
    await getSessions(NOW);
    expect(query.mock.calls[0][0]).toContain('expires_at > NOW()');
  });
});
