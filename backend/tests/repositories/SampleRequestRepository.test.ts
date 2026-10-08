import { describe, it, expect, beforeEach, vi } from 'vitest';

const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() };
vi.mock('../../src/config/database', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(async () => client) },
}));

import { sampleRequestRepository } from '../../src/database/repositories/SampleRequestRepository';
import { query } from '../../src/config/database';

const sqlOf = () => client.query.mock.calls.map((c: any[]) => String(c[0]));
const callsOf = (re: RegExp) => client.query.mock.calls.filter((c: any[]) => re.test(String(c[0])));

/** Default client: parent lock finds the request; per-row selects can be overridden. */
const setClient = (rowFor: (sql: string) => any[] = () => []) =>
  client.query.mockImplementation(async (sql: string) => {
    if (/FROM sample_requests WHERE id = \$1 FOR NO KEY UPDATE/.test(sql)) return { rows: [{ id: 'req-1' }], rowCount: 1 };
    const rows = rowFor(sql);
    return { rows, rowCount: rows.length };
  });

describe('SampleRequestRepository.applyRows', () => {
  beforeEach(() => { vi.clearAllMocks(); setClient(); });

  it('locks the parent first, upserts a changed item, logs only changed fields, stamps last_edited', async () => {
    setClient((sql) => /SELECT singles, displays, empty_displays FROM sample_request_items/.test(sql)
      ? [{ singles: 1, displays: 0, empty_displays: 0 }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 3, displays: 0, emptyDisplays: 2 }],
      materials: [],
    });
    const sql = sqlOf();
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toMatch(/FROM sample_requests WHERE id = \$1 FOR NO KEY UPDATE/);
    expect(client.query.mock.calls[1][1]).toEqual(['req-1']);
    expect(sql.some((s) => /FOR UPDATE/.test(s))).toBe(true);
    const ins = callsOf(/INSERT INTO sample_request_items/);
    expect(ins).toHaveLength(1);
    expect(ins[0][1]).toEqual(['req-1', 'p-1', 3, 0, 2]);
    const changes = callsOf(/INSERT INTO sample_request_changes/);
    expect(changes.map((c: any[]) => c[1])).toEqual([
      ['req-1', 'u-1', 'item', 'p-1', 'singles', '1', '3'],
      ['req-1', 'u-1', 'item', 'p-1', 'empty_displays', '0', '2'],
    ]);
    expect(String(changes[0][0])).toMatch(/clock_timestamp\(\)/);
    const upd = callsOf(/UPDATE sample_requests SET last_edited_by/);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual(['req-1', 'u-1']);
    expect(String(upd[0][0])).toMatch(/clock_timestamp\(\)/);
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects with not found and writes nothing when the request is missing', async () => {
    client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await expect(sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow(/not found/);
    const sql = sqlOf();
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(sql.some((s) => /^\s*(INSERT|DELETE|UPDATE)/.test(s))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('deletes a row that went to all zeros and logs the zeroed fields', async () => {
    setClient((sql) => /SELECT singles, displays, empty_displays/.test(sql) ? [{ singles: 2, displays: 1, empty_displays: 0 }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-1', singles: 0, displays: 0, emptyDisplays: 0 }], materials: [],
    });
    const sql = sqlOf();
    expect(sql.some((s) => /DELETE FROM sample_request_items WHERE request_id = \$1 AND product_id = \$2/.test(s))).toBe(true);
    expect(sql.some((s) => /INSERT INTO sample_request_items/.test(s))).toBe(false);
    expect(callsOf(/INSERT INTO sample_request_changes/).map((c: any[]) => c[1])).toEqual([
      ['req-1', 'u-1', 'item', 'p-1', 'singles', '2', '0'],
      ['req-1', 'u-1', 'item', 'p-1', 'displays', '1', '0'],
    ]);
  });

  it('does nothing and does not stamp last_edited when nothing changed', async () => {
    setClient((sql) => /SELECT qty, notes FROM sample_request_materials/.test(sql) ? [{ qty: 2, notes: 'big' }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 2, notes: 'big' }] });
    const sql = sqlOf();
    expect(sql.some((s) => /INSERT|DELETE FROM|UPDATE sample_requests/.test(s))).toBe(false);
    expect(sql[sql.length - 1]).toBe('COMMIT');
  });

  it('logs old 0 for a brand-new item row', async () => {
    await sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'p-9', singles: 4, displays: 0, emptyDisplays: 0 }], materials: [],
    });
    expect(callsOf(/INSERT INTO sample_request_changes/).map((c: any[]) => c[1]))
      .toEqual([['req-1', 'u-1', 'item', 'p-9', 'singles', '0', '4']]);
  });

  it('trims notes and treats blank as null', async () => {
    setClient((sql) => /SELECT qty, notes FROM sample_request_materials/.test(sql) ? [{ qty: 1, notes: 'x' }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 1, notes: '  big  ' }] });
    expect(callsOf(/INSERT INTO sample_request_materials/)[0][1]).toEqual(['req-1', 'm-1', 1, 'big']);
    expect(callsOf(/INSERT INTO sample_request_changes/).map((c: any[]) => c[1]))
      .toEqual([['req-1', 'u-1', 'material', 'm-1', 'notes', 'x', 'big']]);
  });

  it('treats null -> empty notes as a no-op', async () => {
    setClient((sql) => /SELECT qty, notes FROM sample_request_materials/.test(sql) ? [{ qty: 1, notes: null }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 1, notes: '' }] });
    expect(sqlOf().some((s) => /INSERT|DELETE FROM|UPDATE sample_requests/.test(s))).toBe(false);
  });

  it('deletes a material that went to qty 0 with blank notes', async () => {
    setClient((sql) => /SELECT qty, notes FROM sample_request_materials/.test(sql) ? [{ qty: 3, notes: null }] : []);
    await sampleRequestRepository.applyRows('req-1', 'u-1', { items: [], materials: [{ materialId: 'm-1', qty: 0, notes: '  ' }] });
    expect(callsOf(/DELETE FROM sample_request_materials/)[0][1]).toEqual(['req-1', 'm-1']);
    expect(sqlOf().some((s) => /INSERT INTO sample_request_materials/.test(s))).toBe(false);
    expect(callsOf(/INSERT INTO sample_request_changes/).map((c: any[]) => c[1]))
      .toEqual([['req-1', 'u-1', 'material', 'm-1', 'qty', '3', '0']]);
  });

  it('rolls back when a statement throws', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO sample_request_items/.test(sql)) throw new Error('fk');
      if (/FOR NO KEY UPDATE/.test(sql)) return { rows: [{ id: 'req-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(sampleRequestRepository.applyRows('req-1', 'u-1', {
      items: [{ productId: 'bad', singles: 1, displays: 0, emptyDisplays: 0 }], materials: [],
    })).rejects.toThrow('fk');
    expect(sqlOf()).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
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
    expect(vi.mocked(query).mock.calls[0][0]).toMatch(/SELECT event_id, status, submitted_at, last_edited_at FROM sample_requests/);
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([['ev-1', 'ev-2']]);
  });

  it('markSubmitted passes request and user', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'req-1' }] } as any);
    await sampleRequestRepository.markSubmitted('req-1', 'u-1');
    expect(vi.mocked(query).mock.calls[0][1]).toEqual(['req-1', 'u-1']);
  });

  it('getContents maps snake_case rows', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ product_id: 'p-1', singles: 1, displays: 2, empty_displays: 3 }] } as any)
      .mockResolvedValueOnce({ rows: [{ material_id: 'm-1', qty: 4, notes: 'n' }] } as any);
    expect(await sampleRequestRepository.getContents('req-1')).toEqual({
      items: [{ productId: 'p-1', singles: 1, displays: 2, emptyDisplays: 3 }],
      materials: [{ materialId: 'm-1', qty: 4, notes: 'n' }],
    });
  });

  it('userRefs returns an empty Map without querying for no real ids', async () => {
    expect((await sampleRequestRepository.userRefs([])).size).toBe(0);
    expect((await sampleRequestRepository.userRefs([null])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('findStatusByEvents returns [] without querying for an empty list', async () => {
    expect(await sampleRequestRepository.findStatusByEvents([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
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
