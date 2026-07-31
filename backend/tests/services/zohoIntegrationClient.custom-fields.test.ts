/**
 * Zoho Books "Trade Show" custom field on expense pushes.
 *
 * When an expense is pushed to Zoho Books, the linked event (trade show) name
 * must populate the org's "Trade Show" custom field via:
 *   custom_fields: [{ api_name: ZOHO_EXPENSE_TRADESHOW_FIELD || 'cf_trade_show', value: <event name> }]
 *
 * Resilience: entities whose Books org does not have the field yet must not be
 * blocked — a custom-field rejection is retried ONCE without custom_fields.
 *
 * All network (axios) and database access is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { ExpenseData } from '../../src/services/zohoIntegrationClient';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

const CREATE_URL = '/zoho/expenses/create_books';

function baseExpense(overrides: Partial<ExpenseData> = {}): ExpenseData {
  return {
    expenseId: 'exp-1',
    date: '2026-07-01',
    amount: 123.45,
    category: 'Travel',
    merchant: 'Test Vendor',
    userName: 'Test User',
    reimbursementRequired: false,
    ...overrides,
  };
}

describe('ZohoIntegrationClient – Trade Show custom field', () => {
  let capturedPayloads: Record<string, any>[];
  let postMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedPayloads = [];
    delete process.env.ZOHO_EXPENSE_TRADESHOW_FIELD;

    // Default: shared service accepts the expense.
    postMock = vi.fn().mockImplementation((url: string, payload: Record<string, any>) => {
      if (url === CREATE_URL) {
        capturedPayloads.push(payload);
      }
      return Promise.resolve({
        data: { data: { expense: { expense_id: 'ZOHO-CF-123' } } },
      });
    });

    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: postMock,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.ZOHO_EXPENSE_TRADESHOW_FIELD;
  });

  async function importClient() {
    const { zohoIntegrationClient } = await import(
      '../../src/services/zohoIntegrationClient'
    );
    return zohoIntegrationClient;
  }

  it('includes the Trade Show custom field when the expense has an event name', async () => {
    const client = await importClient();

    const result = await client.createExpense(
      'haute brands',
      baseExpense({ eventName: 'CES 2026' })
    );

    expect(result.success).toBe(true);
    expect(capturedPayloads).toHaveLength(1);
    expect(capturedPayloads[0].custom_fields).toEqual([
      { api_name: 'cf_trade_show', value: 'CES 2026' },
    ]);
  });

  it('uses ZOHO_EXPENSE_TRADESHOW_FIELD as the api_name when set', async () => {
    process.env.ZOHO_EXPENSE_TRADESHOW_FIELD = 'cf_show_name';
    const client = await importClient();

    await client.createExpense('haute brands', baseExpense({ eventName: 'MAGIC Las Vegas' }));

    expect(capturedPayloads[0].custom_fields).toEqual([
      { api_name: 'cf_show_name', value: 'MAGIC Las Vegas' },
    ]);
  });

  it('omits custom_fields entirely when the expense has no event name', async () => {
    const client = await importClient();

    const result = await client.createExpense('haute brands', baseExpense());

    expect(result.success).toBe(true);
    expect(capturedPayloads).toHaveLength(1);
    expect(capturedPayloads[0].custom_fields).toBeUndefined();
  });

  it('retries ONCE without custom_fields when Zoho rejects the custom field', async () => {
    // First call: Zoho-style rejection mentioning the custom field.
    postMock.mockImplementationOnce((url: string, payload: Record<string, any>) => {
      if (url === CREATE_URL) {
        capturedPayloads.push(payload);
      }
      return Promise.reject({
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            detail: {
              error: {
                code: 'ZOHO_ERROR',
                message: 'Custom field with api_name cf_trade_show is not present in this organization',
              },
            },
          },
        },
      });
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = await importClient();

    const result = await client.createExpense(
      'boomin brands',
      baseExpense({ eventName: 'CES 2026' })
    );

    // Push still succeeds via the retry.
    expect(result.success).toBe(true);
    expect(result.zohoExpenseId).toBe('ZOHO-CF-123');

    // First attempt carried custom_fields, retry did not.
    expect(capturedPayloads).toHaveLength(2);
    expect(capturedPayloads[0].custom_fields).toEqual([
      { api_name: 'cf_trade_show', value: 'CES 2026' },
    ]);
    expect(capturedPayloads[1].custom_fields).toBeUndefined();

    // Warning names the entity.
    const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warnings.some((w) => w.includes('boomin brands'))).toBe(true);
  });

  it('does NOT retry for errors unrelated to the custom field', async () => {
    postMock.mockImplementation((url: string, payload: Record<string, any>) => {
      if (url === CREATE_URL) {
        capturedPayloads.push(payload);
      }
      return Promise.reject({
        message: 'Request failed with status code 401',
        response: {
          status: 401,
          data: {
            detail: {
              error: { code: 'AUTH', message: 'Invalid internal token' },
            },
          },
        },
      });
    });

    const client = await importClient();

    const result = await client.createExpense(
      'haute brands',
      baseExpense({ eventName: 'CES 2026' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid internal token');
    expect(capturedPayloads).toHaveLength(1);
  });
});
