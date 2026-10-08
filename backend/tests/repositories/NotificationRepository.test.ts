import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

import { query } from '../../src/config/database';
import { notificationRepository } from '../../src/database/repositories/NotificationRepository';

const base = { user_id: 'u-1', kind: 'expense.approved', title: 'T', body: 'B', link: { page: 'expense', expenseId: 'ex-1' } };

describe('NotificationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts with the event id and skips on conflict', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'n-1' }] } as any);
    const row = await notificationRepository.insert({ ...base, source_event_id: 'evt-1' });
    expect(row).toEqual({ id: 'n-1' });
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/ON CONFLICT \(source_event_id\) DO NOTHING/);
    expect(params).toEqual(['u-1', 'expense.approved', 'T', 'B', JSON.stringify(base.link), 'evt-1']);
  });

  it('returns null when the event was already stored', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    expect(await notificationRepository.insert({ ...base, source_event_id: 'evt-1' })).toBeNull();
  });

  it('stores null for a notification with no event id', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'n-2' }] } as any);
    await notificationRepository.insert(base);
    expect(vi.mocked(query).mock.calls[0][1]?.[5]).toBeNull();
  });

  it('markReadForExpense is scoped to the user, the expense and the given kinds', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rowCount: 2 } as any);
    const n = await notificationRepository.markReadForExpense('u-1', 'ex-1', ['expense.message', 'expense.mention']);
    expect(n).toBe(2);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(String(sql)).toMatch(/user_id = \$1/);
    expect(String(sql)).toMatch(/link->>'expenseId' = \$2/);
    expect(String(sql)).toMatch(/kind = ANY\(\$3::text\[\]\)/);
    expect(String(sql)).toMatch(/read_at IS NULL/);
    expect(params).toEqual(['u-1', 'ex-1', ['expense.message', 'expense.mention']]);
  });

  it('markReadForExpense does not query for an empty kind list', async () => {
    expect(await notificationRepository.markReadForExpense('u-1', 'ex-1', [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
