import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../src/config/database', () => ({ query: (...args: unknown[]) => query(...args) }));

import { apiRequestLogger } from '../../src/middleware/apiRequestLogger';

const hit = async (originalUrl: string) => {
  const req: any = { originalUrl, path: originalUrl.split('?')[0], method: 'GET', get: () => null, connection: {} };
  const res: any = { statusCode: 200, end: vi.fn(), json: vi.fn(), getHeader: () => undefined };
  apiRequestLogger(req, res, vi.fn());
  res.end();
  await new Promise((resolve) => setImmediate(resolve));
};

describe('apiRequestLogger probes', () => {
  beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); });

  it.each(['/health', '/api/health', '/api/meta/version', '/api/health?probe=1'])('does not log %s', async (url) => {
    await hit(url);
    expect(query).not.toHaveBeenCalled();
  });

  it('still logs ordinary requests', async () => {
    await hit('/api/events');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
