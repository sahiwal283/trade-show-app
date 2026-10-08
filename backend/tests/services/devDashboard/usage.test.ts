import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const query = vi.fn();
vi.mock('../../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { getUsage } from '../../../src/services/devDashboard/usage';
import { keyShape } from '../../helpers/keyShape';
import { routeQueries } from '../../helpers/routeQueries';

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../src/utils/__fixtures__/devDashboard/usage.json'), 'utf8')
);

const ROWS: Array<[string, any[]]> = [
  ['usage-totals', [{ views: 7, unique_users: 2 }]],
  ['usage-screens', [
    { page: 'expenses', views: 5, unique_users: 2 },
    { page: 'leads', views: 2, unique_users: 1 },
  ]],
  ['usage-daily', [
    { page: 'expenses', day: '2026-10-07', views: 2 },
    { page: 'expenses', day: '2026-10-08', views: 3 },
    { page: 'leads', day: '2026-10-08', views: 2 },
  ]],
  ['usage-users', [
    { id: 'u1', name: 'Seri Vira', role: 'salesperson', last_seen: new Date('2026-10-08T15:20:00.000Z'), views: 6, mobile_views: 5, desktop_views: 1 },
    { id: 'u2', name: 'Rita Example', role: 'coordinator', last_seen: null, views: 0, mobile_views: 0, desktop_views: 0 },
  ]],
  ['usage-user-pages', [
    { user_id: 'u1', page: 'expenses', views: 3 },
    { user_id: 'u1', page: 'leads', views: 2 },
    { user_id: 'u1', page: 'dashboard', views: 1 },
    { user_id: 'u1', page: 'events', views: 1 },
  ]],
];

describe('getUsage', () => {
  beforeEach(() => { query.mockReset(); routeQueries(query, ROWS); });

  it('returns exactly the contract shape', async () => {
    expect(keyShape(await getUsage('7d'))).toEqual(keyShape(fixture));
  });

  it('attaches each screen\'s daily counts', async () => {
    const { screens } = await getUsage('7d');
    expect(screens[0]).toEqual({
      page: 'expenses', views: 5, uniqueUsers: 2,
      daily: [{ day: '2026-10-07', views: 2 }, { day: '2026-10-08', views: 3 }],
    });
    expect(screens[1].daily).toEqual([{ day: '2026-10-08', views: 2 }]);
  });

  it('keeps each person\'s three most-used screens', async () => {
    const { users } = await getUsage('7d');
    expect(users[0].topPages).toEqual([
      { page: 'expenses', views: 3 },
      { page: 'leads', views: 2 },
      { page: 'dashboard', views: 1 },
    ]);
  });

  it('lists someone with no views, with an empty row', async () => {
    const { users } = await getUsage('7d');
    expect(users[1]).toEqual({
      userId: 'u2', name: 'Rita Example', role: 'coordinator', lastSeen: null,
      views: 0, mobileViews: 0, desktopViews: 0, topPages: [],
    });
  });

  it('returns empty lists, not an error, when nothing was viewed', async () => {
    routeQueries(query, [
      ['usage-totals', [{ views: 0, unique_users: 0 }]],
      ['usage-screens', []], ['usage-daily', []], ['usage-users', []], ['usage-user-pages', []],
    ]);
    expect(await getUsage('1h')).toEqual({ totals: { views: 0, uniqueUsers: 0 }, screens: [], users: [] });
  });
});
