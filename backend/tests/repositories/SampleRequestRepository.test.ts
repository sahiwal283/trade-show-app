import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(async () => client) },
}));

import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { query } from '../../src/config/database';

describe('SampleRequestRepository.replaceContents', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes then inserts inside one transaction and skips all-zero rows', async () => {
    await sampleRequestRepository.replaceContents('req-1', {
      items: [
        { productId: 'p-1', singles: 2, displays: 0, emptyDisplays: 0 },
        { productId: 'p-2', singles: 0, displays: 0, emptyDisplays: 0 }, // dropped
      ],
      materials: [
        { materialId: 'm-1', qty: 0, notes: 'two banners please' }, // kept: has notes
        { materialId: 'm-2', qty: 0, notes: '' },                  // dropped
      ],
    });
    const calls = client.query.mock.calls;
    const sql = calls.map((c: any[]) => String(c[0]));
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((s) => /DELETE FROM sample_request_items/.test(s))).toBe(true);
    expect(sql.some((s) => /DELETE FROM sample_request_materials/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_items/.test(s))).toHaveLength(1);
    expect(sql.filter((s) => /INSERT INTO sample_request_materials/.test(s))).toHaveLength(1);
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();

    // Assert parameter arrays
    const itemsInsertCall = calls.find((c: any[]) => /INSERT INTO sample_request_items/.test(String(c[0])));
    expect(itemsInsertCall?.[1]).toEqual(['req-1', ['p-1'], [2], [0], [0]]);
    const materialsInsertCall = calls.find((c: any[]) => /INSERT INTO sample_request_materials/.test(String(c[0])));
    expect(materialsInsertCall?.[1]).toEqual(['req-1', ['m-1'], [0], ['two banners please']]);
  });

  it('rolls back when an insert throws', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO sample_request_items/.test(sql)) throw new Error('fk');
      return { rows: [], rowCount: 0 };
    });
    await expect(sampleRequestRepository.replaceContents('req-1', {
      items: [{ productId: 'bad', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow('fk');
    expect(client.query.mock.calls.map((c: any[]) => c[0])).toContain('ROLLBACK');
    client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
  });
});

describe('SampleRequestRepository.getPullerUserId', () => {
  it('returns the puller id only for an existing active user', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'u-9' }] } as any);
    expect(await sampleRequestRepository.getPullerUserId()).toBe('u-9');
    const sql = String(vi.mocked(query).mock.calls.at(-1)![0]);
    expect(sql).toMatch(/JOIN users u/);
    expect(sql).toMatch(/u\.is_active = TRUE/);
  });
  it('returns null when unset', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    expect(await sampleRequestRepository.getPullerUserId()).toBeNull();
  });
});
