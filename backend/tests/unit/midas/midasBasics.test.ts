import { describe, it, expect } from 'vitest';
import {
  mapTsStatusToMidas,
  mapMidasStatusToTs,
  mapTsReimbursementToMidas,
  mapMidasReimbursementToTs,
} from '../../../src/services/midas/statusMaps';
import { resolveCategoryName } from '../../../src/services/midas/categoryMap';
import { MockMidasClient } from '../../../src/services/midas/MockMidasClient';

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

describe('categoryMap', () => {
  it('resolves known and unknown names', () => {
    expect(resolveCategoryName('Meal and Entertainment')).toBe('Meal and Entertainment');
    expect(resolveCategoryName('Uber ride')).toBe('Transportation - Uber / Lyft / Others');
    expect(resolveCategoryName('weird stuff')).toBe('Other');
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
});
