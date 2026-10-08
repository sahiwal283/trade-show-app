import { describe, it, expect, vi, beforeEach } from 'vitest';

const record = vi.fn();
vi.mock('../../src/database/repositories', () => ({
  pageViewRepository: { record: (...args: unknown[]) => record(...args) },
}));
vi.mock('../../src/config/database', () => ({ query: vi.fn(), pool: { query: vi.fn() } }));

import { handleRecordPageView } from '../../src/routes/pageViews';

const call = async (body: unknown) => {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), end: vi.fn() };
  await handleRecordPageView({ user: { id: 'u1', username: 'a', role: 'salesperson' }, body } as any, res);
  return res;
};

describe('POST /api/page-views', () => {
  beforeEach(() => { record.mockReset(); record.mockResolvedValue(undefined); });

  it('records a valid view and answers 204', async () => {
    const res = await call({ page: 'expenses', device: 'mobile' });
    expect(record).toHaveBeenCalledWith('u1', 'expenses', 'mobile');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it.each([
    ['uppercase', { page: 'Expenses', device: 'mobile' }],
    ['a path', { page: 'a/b', device: 'mobile' }],
    ['empty', { page: '', device: 'mobile' }],
    ['65 characters', { page: 'a'.repeat(65), device: 'mobile' }],
    ['not a string', { page: 7, device: 'mobile' }],
    ['unknown device', { page: 'expenses', device: 'tablet' }],
    ['no body', undefined],
  ])('rejects %s with 400 and records nothing', async (_name, body) => {
    const res = await call(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(record).not.toHaveBeenCalled();
  });

  it('still answers 204 when the write fails', async () => {
    record.mockRejectedValue(new Error('db down'));
    const res = await call({ page: 'expenses', device: 'desktop' });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
