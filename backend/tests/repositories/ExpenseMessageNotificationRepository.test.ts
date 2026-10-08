import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ query: vi.fn() }));

import { query } from '../../src/config/database';
import {
  getCursor,
  setCursor,
} from '../../src/database/repositories/ExpenseMessageNotificationRepository';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;

describe('ExpenseMessageNotificationRepository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns null when no cursor row exists yet', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await getCursor('trade_show')).toBeNull();
  });

  it('upserts the cursor', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await setCursor('trade_show', 'abc');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (source_app)');
    expect(params).toEqual(['trade_show', 'abc']);
  });
});
