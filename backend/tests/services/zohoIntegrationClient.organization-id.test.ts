/**
 * Regression test: organization_id injected for brands with multi-org Zoho access.
 *
 * Covers the bug where pushing a Nirvana Kulture expense failed with:
 * "This user belongs to multiple organizations, hence the parameter
 *  CompanyID/CompanyName is required for associating this user to a specific organization."
 *
 * The fix: BRAND_ORGANIZATION_IDS in zohoIntegrationClient reads per-brand env vars
 * and includes organization_id in the create_books payload when set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// We test the behavior indirectly by observing what payload the HTTP client sends.
// The module is imported after env vars are set so the module-level constants pick them up.

describe('ZohoIntegrationClient – organization_id for multi-org brands', () => {
  let capturedPayload: Record<string, any> | undefined;

  beforeEach(() => {
    capturedPayload = undefined;

    // Stub the shared service HTTP call so no real network request is made.
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockImplementation((_url: string, payload: Record<string, any>) => {
        capturedPayload = payload;
        return Promise.resolve({
          data: { data: { expense: { expense_id: 'ZOHO-TEST-123' } } },
        });
      }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset module registry so env-var-derived constants are re-evaluated on next import.
    vi.resetModules();
  });

  it('includes organization_id in payload when NIRVANA_KULTURE_ZOHO_COMPANY_ID is set', async () => {
    process.env.NIRVANA_KULTURE_ZOHO_COMPANY_ID = '123456789';

    const { zohoIntegrationClient } = await import(
      '../../src/services/zohoIntegrationClient'
    );

    // Mock the DB call that loadSettings() makes so no real Postgres connection is needed.
    vi.spyOn(require('../../src/config/database'), 'query').mockResolvedValue({ rows: [] });

    await zohoIntegrationClient.createExpense('nirvana kulture', {
      expenseId: 'exp-1',
      date: '2026-01-01',
      amount: 99.99,
      category: 'Travel',
      merchant: 'Test Vendor',
      userName: 'Test User',
      reimbursementRequired: false,
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.organization_id).toBe('123456789');

    delete process.env.NIRVANA_KULTURE_ZOHO_COMPANY_ID;
  });

  it('does NOT include organization_id when NIRVANA_KULTURE_ZOHO_COMPANY_ID is unset', async () => {
    delete process.env.NIRVANA_KULTURE_ZOHO_COMPANY_ID;

    const { zohoIntegrationClient } = await import(
      '../../src/services/zohoIntegrationClient'
    );

    vi.spyOn(require('../../src/config/database'), 'query').mockResolvedValue({ rows: [] });

    await zohoIntegrationClient.createExpense('nirvana kulture', {
      expenseId: 'exp-2',
      date: '2026-01-01',
      amount: 50.00,
      category: 'Food',
      merchant: 'Test Vendor',
      userName: 'Test User',
      reimbursementRequired: false,
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.organization_id).toBeUndefined();
  });

  it('does NOT include organization_id for haute_brands when env var is unset', async () => {
    delete process.env.HAUTE_BRANDS_ZOHO_COMPANY_ID;

    const { zohoIntegrationClient } = await import(
      '../../src/services/zohoIntegrationClient'
    );

    vi.spyOn(require('../../src/config/database'), 'query').mockResolvedValue({ rows: [] });

    await zohoIntegrationClient.createExpense('haute brands', {
      expenseId: 'exp-3',
      date: '2026-01-01',
      amount: 200.00,
      category: 'Hotel',
      merchant: 'Marriott',
      userName: 'Test User',
      reimbursementRequired: true,
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.organization_id).toBeUndefined();
  });
});
