/**
 * Idempotency-key claim protocol unit tests (utils/idempotency.ts) — the
 * offline-sync guard against duplicate expense creation. The key row is
 * claimed atomically BEFORE the entity is created; exactly one concurrent
 * request wins. No database: the pg query layer is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import { query } from '../../src/config/database';
import {
  claimIdempotencyKey,
  finalizeIdempotencyKey,
  releaseIdempotencyKey,
  lookupIdempotencyKey,
  CLAIM_IDEMPOTENCY_KEY_SQL,
  IDEMPOTENCY_PENDING,
} from '../../src/utils/idempotency';

const mockedQuery = vi.mocked(query);

beforeEach(() => {
  mockedQuery.mockClear();
  mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
});

describe('claimIdempotencyKey (atomic claim-before-create)', () => {
  it('claims via a single INSERT ... ON CONFLICT statement (no check-then-insert race)', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ key: 'k-1' }], rowCount: 1 } as any);

    const claimed = await claimIdempotencyKey('k-1', 'expense');

    expect(claimed).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toBe(CLAIM_IDEMPOTENCY_KEY_SQL);
    expect(sql).toMatch(/INSERT INTO idempotency_keys/);
    expect(sql).toMatch(/ON CONFLICT \(key\) DO UPDATE/);
    expect(sql).toMatch(/RETURNING key/);
    expect(params).toEqual(['k-1', 'expense', IDEMPOTENCY_PENDING]);
  });

  it('returns false when the key is already held (conflict, no row returned)', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    expect(await claimIdempotencyKey('k-1', 'expense')).toBe(false);
  });

  it('reclaims only EXPIRED existing keys (WHERE expires_at <= NOW() guard)', () => {
    // A live duplicate must lose the claim; an expired row is safe to reuse.
    expect(CLAIM_IDEMPOTENCY_KEY_SQL).toMatch(/WHERE idempotency_keys\.expires_at <= NOW\(\)/);
    // ...and reclaiming refreshes the expiry window
    expect(CLAIM_IDEMPOTENCY_KEY_SQL).toMatch(/expires_at = CURRENT_TIMESTAMP \+ INTERVAL '7 days'/);
  });

  it('exactly one of two racing claims wins', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ key: 'k-1' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const [a, b] = await Promise.all([
      claimIdempotencyKey('k-1', 'expense'),
      claimIdempotencyKey('k-1', 'expense'),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});

describe('finalizeIdempotencyKey', () => {
  it('records the created entity id on the claimed key', async () => {
    await finalizeIdempotencyKey('k-1', 'expense-42');
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE idempotency_keys SET entity_id = \$2 WHERE key = \$1/);
    expect(params).toEqual(['k-1', 'expense-42']);
  });
});

describe('releaseIdempotencyKey (rollback after failed create)', () => {
  it('deletes ONLY a still-pending claim, never a completed one', async () => {
    await releaseIdempotencyKey('k-1');
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM idempotency_keys WHERE key = \$1 AND entity_id = \$2/);
    expect(params).toEqual(['k-1', IDEMPOTENCY_PENDING]);
  });
});

describe('lookupIdempotencyKey', () => {
  it('returns the entity id for a live key', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ entity_id: 'expense-42' }], rowCount: 1 } as any);
    expect(await lookupIdempotencyKey('k-1')).toBe('expense-42');
    const [sql] = mockedQuery.mock.calls[0];
    expect(sql).toMatch(/expires_at > NOW\(\)/); // expired keys are invisible
  });

  it('returns null for unknown/expired keys', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    expect(await lookupIdempotencyKey('k-unknown')).toBeNull();
  });

  it('returns the pending placeholder while the claiming request is in flight', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ entity_id: IDEMPOTENCY_PENDING }],
      rowCount: 1,
    } as any);
    expect(await lookupIdempotencyKey('k-1')).toBe(IDEMPOTENCY_PENDING);
  });
});
