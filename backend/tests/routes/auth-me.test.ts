import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response } from 'express';

vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { query } from '../../src/config/database';
import { handleMe } from '../../src/routes/auth';

function mockRes() {
  return { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the fresh user row for the authenticated id', async () => {
    (query as any).mockResolvedValue({
      rows: [{ id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin' }],
    });
    const res = mockRes();
    await handleMe({ user: { id: 'u1', username: 'jane', role: 'admin' } } as any, res);
    expect((query as any).mock.calls[0][1]).toEqual(['u1']);
    expect(res.json).toHaveBeenCalledWith({
      user: { id: 'u1', username: 'jane', name: 'Jane', email: 'j@x.com', role: 'admin' },
    });
  });

  it('404s when the user row is gone', async () => {
    (query as any).mockResolvedValue({ rows: [] });
    const res = mockRes();
    await handleMe({ user: { id: 'gone', username: 'x', role: 'admin' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
