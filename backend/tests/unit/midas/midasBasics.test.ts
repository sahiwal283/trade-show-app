import { describe, it, expect, beforeEach } from 'vitest';
import {
  mapTsStatusToMidas,
  mapMidasStatusToTs,
  mapTsReimbursementToMidas,
  mapMidasReimbursementToTs,
} from '../../../src/services/midas/statusMaps';
import { MockMidasClient } from '../../../src/services/midas/MockMidasClient';
import {
  clearPaymentMethodCache,
  matchPaymentMethod,
  parseCardUsed,
  resolvePaymentMethod,
  TRADE_SHOW_PAYMENT_METHOD_SEED,
} from '../../../src/services/midas/paymentMethodMap';
import { MidasExpenseStore } from '../../../src/services/expenseStore/MidasExpenseStore';
import { getMidasClient, resetMidasClientSingleton } from '../../../src/services/midas';

describe('statusMaps', () => {
  it('maps needs further review to awaiting_info and back', () => {
    expect(mapTsStatusToMidas('needs further review')).toBe('awaiting_info');
    expect(mapMidasStatusToTs('awaiting_info')).toBe('needs further review');
  });

  it('maps core statuses', () => {
    expect(mapTsStatusToMidas('pending')).toBe('pending');
    expect(mapTsStatusToMidas('approved')).toBe('approved');
    expect(mapTsStatusToMidas('rejected')).toBe('rejected');
    expect(mapMidasStatusToTs('zoho_sync_failed')).toBe('approved');
  });

  it('maps reimbursement including rejected', () => {
    expect(mapTsReimbursementToMidas(false, null)).toBe('not_requested');
    expect(mapTsReimbursementToMidas(true, 'pending review')).toBe('pending');
    expect(mapTsReimbursementToMidas(true, 'rejected')).toBe('rejected');
    expect(mapMidasReimbursementToTs('rejected')).toEqual({
      reimbursementRequired: true,
      reimbursementStatus: 'rejected',
    });
  });
});

describe('mock category catalog', () => {
  it('serves the categories Midas exposes to trade_show, including the ones the old local list lacked', async () => {
    const names = (await new MockMidasClient().listCategories()).map((c) => c.name);
    // These two exist in Midas but were absent from the deleted
    // TRADE_SHOW_CATEGORY_NAMES, which is what silently rewrote them to 'Other'.
    expect(names).toContain('Stationaries');
    expect(names).toContain('Storage charges');
  });
});

describe('paymentMethodMap', () => {
  const catalog = TRADE_SHOW_PAYMENT_METHOD_SEED.map((m) => ({
    id: m.id,
    label: m.label,
    lastFour: m.lastFour,
    brand: 'other',
    defaultZohoEntity: m.defaultZohoEntity,
    zohoPaymentAccountId: m.zohoPaymentAccountId,
    zohoAccountName: m.zohoPaymentAccountId,
  }));

  it('parses UI cardUsed form with lastFour', () => {
    expect(parseCardUsed('Haute PNC (...3490)')).toEqual({
      label: 'Haute PNC',
      lastFour: '3490',
      raw: 'Haute PNC (...3490)',
    });
  });

  it('matches uniquely by lastFour', () => {
    const hit = matchPaymentMethod(catalog, 'Haute PNC (...3490)');
    expect(hit?.match).toBe('lastFour');
    expect(hit?.id).toBe('11111111-0000-4000-8000-000000000002');
    expect(hit?.defaultZohoEntity).toBe('Haute Brands');
  });

  it('disambiguates duplicate labels via lastFour', () => {
    const hit = matchPaymentMethod(catalog, 'Nirvana PNC (...4171)');
    expect(hit?.lastFour).toBe('4171');
    expect(hit?.id).toBe('11111111-0000-4000-8000-000000000007');
  });

  it('does not match ambiguous label-only when duplicates exist', () => {
    expect(matchPaymentMethod(catalog, 'Nirvana PNC')).toBeNull();
  });

  it('resolvePaymentMethod uses mock lister and caches', async () => {
    clearPaymentMethodCache();
    const client = new MockMidasClient();
    let calls = 0;
    const lister = async () => {
      calls += 1;
      return client.listPaymentMethods();
    };
    const a = await resolvePaymentMethod({
      cardUsed: 'Boomin PNC (...7458)',
      lister,
    });
    const b = await resolvePaymentMethod({
      cardUsed: 'Boomin Capital One (...9330)',
      lister,
    });
    expect(a?.id).toBe('11111111-0000-4000-8000-000000000003');
    expect(b?.defaultZohoEntity).toBe('Boomin Brands');
    expect(calls).toBe(1);
  });
});

describe('MockMidasClient', () => {
  it('creates idempotently on sourceApp+sourceRefId', async () => {
    const client = new MockMidasClient();
    const actor = { email: 'a@example.com', externalUserId: 'user-1', name: 'A' };
    const body = {
      sourceApp: 'trade_show' as const,
      sourceRefId: 'exp-1',
      submitterEmail: 'a@example.com',
      externalUserId: 'user-1',
      eventId: 'event-1',
      sourceLabel: 'Expo',
      sourceType: 'trade_show_event',
      merchant: 'Cafe',
      amount: 10,
      date: '2026-08-01',
      categoryName: 'Meal and Entertainment',
    };
    const first = await client.createExpense(body, actor);
    expect(first.created).toBe(true);
    const second = await client.createExpense(body, actor);
    expect(second.created).toBe(false);
    expect(second.expense.id).toBe(first.expense.id);
  });

  it('returns sync OCR without creating expenses', async () => {
    const client = new MockMidasClient();
    const ocr = await client.processOcr(Buffer.from('x'), 'r.jpg', 'image/jpeg');
    expect(ocr.ocrMode).toBe('sync');
    expect(ocr.fields.merchant.value).toBeTruthy();
    const list = await client.listExpenses({ sourceApp: 'trade_show' });
    expect(list.expenses).toHaveLength(0);
  });

  it('lists the seeded payment method catalog', async () => {
    const client = new MockMidasClient();
    const methods = await client.listPaymentMethods();
    expect(methods).toHaveLength(11);
    expect(methods.find((m) => m.lastFour === '3490')?.label).toBe('Haute PNC');
  });

  it('omits cards Midas has deactivated', async () => {
    const client = new MockMidasClient();
    const methods = await client.listPaymentMethods();
    // "Sameer Summitt Card OLD" (...3019) was deactivated in Midas. The mock
    // catalog tracks the live one, so a stale card must not reappear here.
    expect(methods.find((m) => m.lastFour === '3019')).toBeUndefined();
  });

  it('lists the seeded company catalog in sort order', async () => {
    const client = new MockMidasClient();
    const companies = await client.listCompanies();
    expect(companies.map((c) => c.name)).toEqual([
      'Haute Brands',
      'Nirvana Kulture',
      'Boomin Brands',
      'Summitt Labs',
    ]);
    expect(companies.find((c) => c.name === 'Summitt Labs')?.zohoEnabled).toBe(false);
  });
});

describe('MidasExpenseStore paymentMethodId', () => {
  beforeEach(() => {
    process.env.MIDAS_MODE = 'mock';
    resetMidasClientSingleton();
    clearPaymentMethodCache();
  });

  it('sends paymentMethodId and fills defaultZohoEntity on create', async () => {
    const store = new MidasExpenseStore();
    const actor = {
      id: 'user-1',
      email: 'a@example.com',
      name: 'A',
      role: 'admin',
      username: 'admin',
    };
    const created = await store.create(
      {
        eventId: 'event-1',
        eventName: 'Expo',
        merchant: 'Cafe',
        amount: 22.5,
        date: '2026-08-01',
        category: 'Meal and Entertainment',
        cardUsed: 'Haute PNC (...3490)',
      },
      actor
    );
    expect(created.midasExpenseId).toBeTruthy();
    expect(created.zohoEntity).toBe('Haute Brands');
    expect(created.cardUsed).toBe('Haute PNC (...3490)');

    const dto = await getMidasClient().getExpense(created.midasExpenseId!);
    expect(dto.paymentMethod?.id).toBe('11111111-0000-4000-8000-000000000002');
    expect(dto.zohoEntity).toBe('Haute Brands');
    expect(dto.sourceContext.cardUsed).toBe('Haute PNC (...3490)');
  });

  it('sends the category through untouched instead of coercing it locally', async () => {
    const store = new MidasExpenseStore();
    const actor = {
      id: 'user-1',
      email: 'a@example.com',
      name: 'A',
      role: 'admin',
      username: 'admin',
    };
    const created = await store.create(
      {
        eventId: 'event-1',
        eventName: 'Expo',
        merchant: 'Office Depot',
        amount: 12,
        date: '2026-08-01',
        // Real Midas category that the deleted local list did not contain.
        // It used to be rewritten to 'Other' before Midas ever saw it.
        category: 'Stationaries',
        cardUsed: 'Haute PNC (...3490)',
      },
      actor
    );

    const dto = await getMidasClient().getExpense(created.midasExpenseId!);
    expect(dto.category?.name).toBe('Stationaries');
  });

  it('leaves resolution of an unrecognised category to Midas', async () => {
    const store = new MidasExpenseStore();
    const actor = {
      id: 'user-1',
      email: 'a@example.com',
      name: 'A',
      role: 'admin',
      username: 'admin',
    };
    const created = await store.create(
      {
        eventId: 'event-1',
        eventName: 'Expo',
        merchant: 'Odd Vendor',
        amount: 5,
        date: '2026-08-01',
        category: 'Something Midas Has Never Heard Of',
        cardUsed: 'Haute PNC (...3490)',
      },
      actor
    );

    // Trade Show must not decide this. Midas applies exact name →
    // category_mappings → Other, and reports what it did. The mock mirrors
    // that, so the fallback lands on 'Other' — from Midas, not from us.
    const dto = await getMidasClient().getExpense(created.midasExpenseId!);
    expect(dto.category?.name).toBe('Other');
  });
});
