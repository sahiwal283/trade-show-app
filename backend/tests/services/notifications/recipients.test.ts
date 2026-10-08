import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));

import { query } from '../../../src/config/database';
import { eventParticipants, usersWithRole, activeUsers } from '../../../src/services/notifications/recipients';

const rows = (r: unknown[]) => ({ rows: r } as any);

describe('recipients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('eventParticipants asks only for active users and drops the actor', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ user_id: 'u-1' }, { user_id: 'u-2' }, { user_id: 'u-1' }]));
    expect(await eventParticipants('ev-1', { except: ['u-2', null, undefined] })).toEqual(['u-1']);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/JOIN users u ON u\.id = ep\.user_id/);
    expect(String(sql)).toMatch(/u\.is_active/);
    expect(params).toEqual(['ev-1']);
  });

  it('usersWithRole filters by role and active, and drops the actor', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ id: 'a-1' }, { id: 'd-1' }]));
    expect(await usersWithRole(['admin', 'developer'], { except: ['d-1'] })).toEqual(['a-1']);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/role = ANY\(\$1::text\[\]\)/);
    expect(String(sql)).toMatch(/is_active/);
    expect(params).toEqual([['admin', 'developer']]);
  });

  it('activeUsers keeps only ids the database says are active', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([{ id: 'u-1' }]));
    expect(await activeUsers(['u-1', 'u-2', null, 'u-3'], { except: ['u-3'] })).toEqual(['u-1']);
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([['u-1', 'u-2']]);
  });

  it('activeUsers does not query when nobody is left', async () => {
    expect(await activeUsers(['u-1'], { except: ['u-1'] })).toEqual([]);
    expect(await activeUsers([null, undefined])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
