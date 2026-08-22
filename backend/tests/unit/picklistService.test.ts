/**
 * PicklistService unit tests.
 *
 * The behaviour that matters here is the failure policy: this service must
 * never invent a category or card list. Serving a stale-but-real list is safe;
 * serving a guessed one silently mis-maps accounting data. So the contract is
 * fresh → cached-stale → throw, with no hardcoded fallback anywhere.
 *
 * No database and no network: both the pg layer and the Midas client are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

const listCategories = vi.fn();
const listPaymentMethods = vi.fn();
const listCompanies = vi.fn();

vi.mock('../../src/services/midas', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/midas')>(
    '../../src/services/midas'
  );
  return {
    ...actual,
    getExpenseBackend: () => (process.env.EXPENSE_BACKEND || 'local').toLowerCase(),
    getPicklistSource: () => {
      const v = (process.env.PICKLIST_SOURCE || 'auto').toLowerCase();
      return v === 'midas' || v === 'settings' ? v : 'auto';
    },
    getMidasClient: () => ({ listCategories, listPaymentMethods, listCompanies }),
  };
});

import { query } from '../../src/config/database';
import {
  getPicklists,
  clearPicklistCache,
  PicklistsUnavailableError,
} from '../../src/services/picklists/PicklistService';

const mockedQuery = vi.mocked(query);

const MIDAS_CATEGORIES = [
  { id: 'cat-1', name: 'Meal and Entertainment', description: 'Meals', isActive: true },
  { id: 'cat-2', name: 'Stationaries', description: null, isActive: true },
];

const MIDAS_PAYMENT_METHODS = [
  {
    id: 'pm-1',
    label: 'Haute Amex',
    lastFour: '1002',
    defaultCompany: 'Haute Brands',
    defaultZohoEntity: 'Haute Brands',
    requiresReimbursement: false,
    zohoAccountName: '5254962000007040062',
  },
  {
    id: 'pm-2',
    label: 'Personal (Need reimbursement)',
    lastFour: '0000',
    defaultCompany: null,
    defaultZohoEntity: null,
    requiresReimbursement: true,
    zohoAccountName: null,
  },
];

// Deliberately out of sortOrder to prove the service sorts.
const MIDAS_COMPANIES = [
  { name: 'Summitt Labs', zohoEnabled: false, sortOrder: 4 },
  { name: 'Haute Brands', zohoEnabled: true, sortOrder: 1 },
];

function midasResolves() {
  listCategories.mockResolvedValue(MIDAS_CATEGORIES);
  listPaymentMethods.mockResolvedValue(MIDAS_PAYMENT_METHODS);
  listCompanies.mockResolvedValue(MIDAS_COMPANIES);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPicklistCache();
  process.env.EXPENSE_BACKEND = 'midas';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.EXPENSE_BACKEND;
  delete process.env.PICKLIST_SOURCE;
});

describe('getPicklists — Midas backend', () => {
  it('returns categories, cards, and companies from Midas', async () => {
    midasResolves();
    const result = await getPicklists();

    expect(result.source).toBe('midas');
    expect(result.stale).toBe(false);
    expect(result.categories.map((c) => c.name)).toEqual([
      'Meal and Entertainment',
      'Stationaries',
    ]);
    expect(result.paymentMethods).toHaveLength(2);
  });

  it('sorts companies by sortOrder and preserves zohoEnabled', async () => {
    midasResolves();
    const { companies } = await getPicklists();

    expect(companies.map((c) => c.name)).toEqual(['Haute Brands', 'Summitt Labs']);
    // Summitt Labs is chargeable but does not sync to Zoho — the flag must survive.
    expect(companies.find((c) => c.name === 'Summitt Labs')?.zohoEnabled).toBe(false);
  });

  it('prefers defaultCompany over the deprecated defaultZohoEntity alias', async () => {
    listCategories.mockResolvedValue([]);
    listCompanies.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([
      {
        id: 'pm-x',
        label: 'Renamed Card',
        lastFour: '9999',
        defaultCompany: 'New Company Name',
        defaultZohoEntity: 'Stale Entity Name',
        requiresReimbursement: false,
      },
    ]);

    const { paymentMethods } = await getPicklists();
    expect(paymentMethods[0].company).toBe('New Company Name');
  });

  it('falls back to defaultZohoEntity when defaultCompany is absent', async () => {
    listCategories.mockResolvedValue([]);
    listCompanies.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([
      {
        id: 'pm-y',
        label: 'Legacy Card',
        lastFour: '1111',
        defaultZohoEntity: 'Boomin Brands',
        requiresReimbursement: false,
      },
    ]);

    const { paymentMethods } = await getPicklists();
    expect(paymentMethods[0].company).toBe('Boomin Brands');
  });

  it('maps zohoAccountName onto zohoPaymentAccountId', async () => {
    midasResolves();
    const { paymentMethods } = await getPicklists();

    const amex = paymentMethods.find((p) => p.label === 'Haute Amex');
    expect(amex?.zohoPaymentAccountId).toBe('5254962000007040062');
  });
});

describe('getPicklists — caching', () => {
  it('serves from cache inside the TTL without re-calling Midas', async () => {
    midasResolves();
    await getPicklists();
    await getPicklists();

    expect(listCategories).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has elapsed', async () => {
    vi.useFakeTimers();
    midasResolves();

    await getPicklists();
    vi.advanceTimersByTime(61_000);
    await getPicklists();

    expect(listCategories).toHaveBeenCalledTimes(2);
  });
});

describe('getPicklists — failure policy', () => {
  it('serves the cached copy marked stale when Midas goes down', async () => {
    vi.useFakeTimers();
    midasResolves();
    await getPicklists();

    listCategories.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.advanceTimersByTime(61_000);
    const result = await getPicklists();

    expect(result.stale).toBe(true);
    expect(result.categories).toHaveLength(2);
  });

  it('throws PicklistsUnavailableError when Midas is down with a cold cache', async () => {
    listCategories.mockRejectedValue(new Error('ECONNREFUSED'));
    listPaymentMethods.mockRejectedValue(new Error('ECONNREFUSED'));
    listCompanies.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(getPicklists()).rejects.toBeInstanceOf(PicklistsUnavailableError);
  });

  it('never substitutes a hardcoded list when Midas is unreachable', async () => {
    listCategories.mockRejectedValue(new Error('ECONNREFUSED'));
    listPaymentMethods.mockRejectedValue(new Error('ECONNREFUSED'));
    listCompanies.mockRejectedValue(new Error('ECONNREFUSED'));

    // A silent fallback to TRADE_SHOW_CATEGORY_NAMES is the exact bug this
    // service removes, so the cold-cache path must produce nothing at all.
    await expect(getPicklists()).rejects.toThrow(/unavailable/i);
  });
});

describe('getPicklists — settings backend (production, pre-cutover)', () => {
  beforeEach(() => {
    process.env.EXPENSE_BACKEND = 'local';
  });

  it('reads app_settings and never calls Midas', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        { key: 'categoryOptions', value: [{ name: 'Booth / Marketing / Tools' }] },
        {
          key: 'cardOptions',
          value: [{ name: 'Haute PNC', lastFour: '3490', entity: 'Haute Brands' }],
        },
        { key: 'entityOptions', value: ['Haute Brands', 'Boomin Brands'] },
      ],
      rowCount: 3,
    } as never);

    const result = await getPicklists();

    expect(result.source).toBe('settings');
    expect(listCategories).not.toHaveBeenCalled();
    expect(result.categories[0].name).toBe('Booth / Marketing / Tools');
    expect(result.paymentMethods[0].company).toBe('Haute Brands');
    expect(result.companies.map((c) => c.name)).toEqual(['Haute Brands', 'Boomin Brands']);
  });

  it('accepts the legacy bare-string category shape', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ key: 'categoryOptions', value: ['Parking Fees', 'Gas / Fuel'] }],
      rowCount: 1,
    } as never);

    const { categories } = await getPicklists();
    expect(categories.map((c) => c.name)).toEqual(['Parking Fees', 'Gas / Fuel']);
  });

  it('returns empty lists rather than throwing when app_settings is empty', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await getPicklists();
    expect(result.categories).toEqual([]);
    expect(result.companies).toEqual([]);
  });
});

describe('getPicklists — PICKLIST_SOURCE overrides the expense backend', () => {
  it('reads Midas on a local expense backend when PICKLIST_SOURCE=midas', async () => {
    // The production case: expenses still stored locally, picklists from Midas.
    process.env.EXPENSE_BACKEND = 'local';
    process.env.PICKLIST_SOURCE = 'midas';
    midasResolves();

    const result = await getPicklists();

    expect(result.source).toBe('midas');
    expect(result.categories.map((c) => c.name)).toContain('Stationaries');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('reads app_settings on a Midas expense backend when PICKLIST_SOURCE=settings', async () => {
    process.env.EXPENSE_BACKEND = 'midas';
    process.env.PICKLIST_SOURCE = 'settings';
    mockedQuery.mockResolvedValue({
      rows: [{ key: 'categoryOptions', value: [{ name: 'Parking Fees' }] }],
      rowCount: 1,
    } as never);

    const result = await getPicklists();

    expect(result.source).toBe('settings');
    expect(listCategories).not.toHaveBeenCalled();
  });

  it('auto still means Midas when the expense backend is Midas', async () => {
    process.env.EXPENSE_BACKEND = 'midas';
    process.env.PICKLIST_SOURCE = 'auto';
    midasResolves();

    expect((await getPicklists()).source).toBe('midas');
  });

  it('auto still means settings when the expense backend is local', async () => {
    process.env.EXPENSE_BACKEND = 'local';
    process.env.PICKLIST_SOURCE = 'auto';
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect((await getPicklists()).source).toBe('settings');
    expect(listCategories).not.toHaveBeenCalled();
  });

  it('caches and serves stale on the PICKLIST_SOURCE=midas path too', async () => {
    // The cache lives on the Midas branch, so reaching it via the override
    // must get the same stale-rather-than-fail protection.
    vi.useFakeTimers();
    process.env.EXPENSE_BACKEND = 'local';
    process.env.PICKLIST_SOURCE = 'midas';
    midasResolves();
    await getPicklists();

    listCategories.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.advanceTimersByTime(61_000);
    const result = await getPicklists();

    expect(result.stale).toBe(true);
    expect(result.categories).toHaveLength(2);
  });
});

describe('getPicklists — who posts to Zoho', () => {
  it('reports trade-show when expenses are stored and posted locally', async () => {
    process.env.EXPENSE_BACKEND = 'local';
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    expect((await getPicklists()).zohoPostingOwner).toBe('trade-show');
  });

  it('reports midas when the expense backend is Midas', async () => {
    // Midas owns Zoho posting entirely on this path, so Trade Show's
    // app_settings category→account table is no longer consulted and must not
    // be reported as a gap.
    process.env.EXPENSE_BACKEND = 'midas';
    midasResolves();

    expect((await getPicklists()).zohoPostingOwner).toBe('midas');
  });

  it('reports trade-show when only the picklists are sourced from Midas', async () => {
    process.env.EXPENSE_BACKEND = 'local';
    process.env.PICKLIST_SOURCE = 'midas';
    midasResolves();

    const result = await getPicklists();

    expect(result.source).toBe('midas');
    expect(result.zohoPostingOwner).toBe('trade-show');
  });
});
