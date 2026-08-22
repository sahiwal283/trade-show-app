/**
 * Category → Zoho expense account resolution.
 *
 * With picklists sourced from Midas but expenses still posted by Trade Show,
 * a category can exist in the dropdown and be absent from the app_settings
 * mapping table. That case previously fell through to the brand default
 * account with an indistinguishable log line, so an expense booked to the
 * wrong account looked exactly like one booked correctly. The resolution must
 * report whether it actually mapped, and say so loudly when it did not.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveExpenseAccountId } from '../../src/services/zoho/expenseAccountMapping';

const OPTIONS = [
  {
    name: 'Meal and Entertainment',
    zohoExpenseAccountIds: { haute_brands: '111', boomin_brands: '222' },
  },
  { name: 'Parking Fees', zohoExpenseAccountIds: null },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveExpenseAccountId', () => {
  it('returns the brand-specific account for a mapped category', () => {
    const result = resolveExpenseAccountId('Meal and Entertainment', OPTIONS, 'haute_brands', 'DEF');

    expect(result.accountId).toBe('111');
    expect(result.mapped).toBe(true);
  });

  it('matches the category name case-insensitively', () => {
    const result = resolveExpenseAccountId('meal AND entertainment', OPTIONS, 'boomin_brands', 'DEF');

    expect(result.accountId).toBe('222');
    expect(result.mapped).toBe(true);
  });

  it('reports unmapped when the category is absent from the mapping table', () => {
    const result = resolveExpenseAccountId('Stationaries', OPTIONS, 'haute_brands', 'DEF');

    expect(result.accountId).toBe('DEF');
    expect(result.mapped).toBe(false);
  });

  it('reports unmapped when the category exists but has no id for this brand', () => {
    const result = resolveExpenseAccountId('Parking Fees', OPTIONS, 'haute_brands', 'DEF');

    expect(result.accountId).toBe('DEF');
    expect(result.mapped).toBe(false);
  });

  it('warns naming the category and brand when falling back to the default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The frontend vitest setup installs a shared console.warn mock that is
    // never cleared, so start from a known count rather than from zero.
    warn.mockClear();

    resolveExpenseAccountId('Stationaries', OPTIONS, 'haute_brands', 'DEF');

    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0].join(' ');
    expect(message).toMatch(/UNMAPPED/);
    expect(message).toContain('Stationaries');
    expect(message).toContain('haute_brands');
  });

  it('does not warn when the category maps cleanly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();

    resolveExpenseAccountId('Meal and Entertainment', OPTIONS, 'haute_brands', 'DEF');

    expect(warn).not.toHaveBeenCalled();
  });

  it('reports unmapped when the mapping table is empty', () => {
    const result = resolveExpenseAccountId('Meal and Entertainment', [], 'haute_brands', 'DEF');

    expect(result.mapped).toBe(false);
    expect(result.accountId).toBe('DEF');
  });
});
