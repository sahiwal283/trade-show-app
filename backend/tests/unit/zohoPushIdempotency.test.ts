/**
 * Zoho push idempotency unit tests — the two layers guarding against a
 * double push of the same expense (double-click / two tabs / two instances):
 *
 *   1. InFlightGuard — in-process claim held for the duration of the
 *      external Zoho call, so the duplicate HTTP push never leaves this
 *      process while a push is in flight.
 *   2. ExpenseRepository.claimZohoPush — atomic DB claim: the
 *      `WHERE zoho_expense_id IS NULL` guard means exactly one writer wins
 *      even across instances; the loser is told so (returns false).
 *
 * No database: the pg query layer is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import { query } from '../../src/config/database';
import { InFlightGuard } from '../../src/utils/inFlightGuard';
import { ExpenseRepository } from '../../src/database/repositories/ExpenseRepository';

const mockedQuery = vi.mocked(query);

describe('InFlightGuard (in-process double-push lock)', () => {
  it('lets the first acquirer in and rejects a concurrent second acquire', () => {
    const guard = new InFlightGuard();
    expect(guard.tryAcquire('expense-1')).toBe(true);
    expect(guard.tryAcquire('expense-1')).toBe(false); // double-click / second tab
    expect(guard.isInFlight('expense-1')).toBe(true);
  });

  it('tracks keys independently', () => {
    const guard = new InFlightGuard();
    expect(guard.tryAcquire('expense-1')).toBe(true);
    expect(guard.tryAcquire('expense-2')).toBe(true);
  });

  it('allows re-acquire after release (retry after a failed push)', () => {
    const guard = new InFlightGuard();
    guard.tryAcquire('expense-1');
    guard.release('expense-1');
    expect(guard.isInFlight('expense-1')).toBe(false);
    expect(guard.tryAcquire('expense-1')).toBe(true);
  });

  it('tolerates releasing an unheld key', () => {
    const guard = new InFlightGuard();
    expect(() => guard.release('never-acquired')).not.toThrow();
  });
});

describe('ExpenseRepository.claimZohoPush (atomic DB claim)', () => {
  const repo = new ExpenseRepository();

  beforeEach(() => {
    mockedQuery.mockClear();
  });

  it('guards the write with WHERE zoho_expense_id IS NULL', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'e-1' }], rowCount: 1 } as any);

    const claimed = await repo.claimZohoPush('e-1', 'zoho-123');

    expect(claimed).toBe(true);
    const [sql, params] = mockedQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE expenses/);
    expect(sql).toMatch(/SET zoho_expense_id = \$2/);
    expect(sql).toMatch(/WHERE id = \$1 AND zoho_expense_id IS NULL/);
    expect(params).toEqual(['e-1', 'zoho-123']);
  });

  it('returns false when another request already claimed the push', async () => {
    // Row exists but zoho_expense_id is no longer NULL → 0 rows updated
    mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const claimed = await repo.claimZohoPush('e-1', 'zoho-456');

    expect(claimed).toBe(false);
  });

  it('only one of two racing claims wins', async () => {
    // Simulate the DB serializing two concurrent claims: first UPDATE matches
    // the NULL row, second sees it already set.
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ id: 'e-1' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const [first, second] = await Promise.all([
      repo.claimZohoPush('e-1', 'zoho-AAA'),
      repo.claimZohoPush('e-1', 'zoho-BBB'),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
