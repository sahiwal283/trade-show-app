import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(async () => client) },
}));

import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { query } from '../../src/config/database';

const sqlOf = () => client.query.mock.calls.map((c: any[]) => String(c[0]));

describe('SampleRequestRepository.applyRows', () => {
  beforeEach(() => { vi.clearAllMocks(); client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 })); });

  it('upserts a changed item, logs only changed fields, stamps last_edited, in one transaction', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT singles, displays, empty_displays FROM sample_request_items/.test(sql)) {
        return { rows: [{ singles: 1, displays: 0, empty_displays: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 3, displays: 0, emptyDisplays: 2 }],
      materials: [],
    });
    const sql = sqlOf();
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((s) => /FOR UPDATE/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_items/.test(s))).toHaveLength(1);
    const changes = client.query.mock.calls.filter((c: any[]) => /INSERT INTO sample_request_changes/.test(String(c[0])));
    expect(changes).toHaveLength(2); // singles 1→3, empty_displays 0→2 ; displays unchanged
    expect(changes.map((c: any[]) => c[1][4])).toEqual(expect.arrayContaining(['singles', 'empty_displays']));
    expect(sql.some((s) => /UPDATE sample_requests SET last_edited_by/.test(s))).toBe(true);
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('deletes a row that went to all zeros and logs the zeroed fields', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT singles, displays, empty_displays/.test(sql)) return { rows: [{ singles: 2, displays: 1, empty_displays: 0 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 0, displays: 0, emptyDisplays: 0 }], materials: [],
    });
    const sql = sqlOf();
    expect(sql.some((s) => /DELETE FROM sample_request_items WHERE request_id = \$1 AND product_id = \$2/.test(s))).toBe(true);
    expect(sql.filter((s) => /INSERT INTO sample_request_changes/.test(s))).toHaveLength(2);
  });

  it('writes no change rows when nothing changed', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/SELECT qty, notes FROM sample_request_materials/.test(sql)) return { rows: [{ qty: 2, notes: 'big' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 2, notes: 'big' }] });
    expect(sqlOf().filter((s) => /INSERT INTO sample_request_changes/.test(s))).toHaveLength(0);
  });

  it('rolls back when a statement throws', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO sample_request_items/.test(sql)) throw new Error('fk');
      if (/SELECT singles/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await expect(sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'bad', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow('fk');
    expect(sqlOf()).toContain('ROLLBACK');
  });
});

describe('SampleRequestRepository reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsertEventDraft conflicts on event_id only', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'req-1', event_id: 'ev-1' }] } as any);
    await sampleRequestRepository.upsertEventDraft('ev-1', 'u-1');
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(event_id\) DO UPDATE/);
    expect(params).toEqual(['ev-1', 'u-1']);
  });

  it('findStatusByEvents takes an id array', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await sampleRequestRepository.findStatusByEvents(['ev-1', 'ev-2']);
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([['ev-1', 'ev-2']]);
  });

  it('listChanges joins names and caps the limit', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as any);
    await sampleRequestRepository.listChanges('req-1', 200);
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN users/);
    expect(sql).toMatch(/LEFT JOIN sample_products/);
    expect(sql).toMatch(/ORDER BY c.changed_at DESC/);
    expect(params).toEqual(['req-1', 200]);
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
