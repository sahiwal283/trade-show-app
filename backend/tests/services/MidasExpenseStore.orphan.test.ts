import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/midas', () => ({ getMidasClient: vi.fn() }));
vi.mock('../../src/services/midas/paymentMethodMap', () => ({
  resolvePaymentMethod: vi.fn().mockResolvedValue(null),
}));

import { getMidasClient } from '../../src/services/midas';
import { MidasExpenseStore } from '../../src/services/expenseStore/MidasExpenseStore';

const actor = { id: 'u1', email: 'u@x.com', name: 'U', role: 'salesperson', username: 'u' };

const input = {
  eventId: 'ev1',
  eventName: 'Show',
  merchant: 'M',
  amount: 1,
  date: '2026-08-21',
  receipt: { buffer: Buffer.from('x'), filename: 'r.png', mime: 'image/png' },
} as any;

describe('MidasExpenseStore.create receipt-failure compensation', () => {
  let client: any;

  beforeEach(() => {
    client = {
      createExpense: vi.fn().mockResolvedValue({ expense: { id: 'mx1' }, warnings: [] }),
      uploadReceipt: vi.fn(),
      getExpense: vi.fn().mockResolvedValue({ id: 'mx1' }),
      deleteExpense: vi.fn().mockResolvedValue(undefined),
      listPaymentMethods: vi.fn().mockResolvedValue([]),
    };
    (getMidasClient as any).mockReturnValue(client);
  });

  it('deletes the just-created expense when the receipt upload fails, then rethrows', async () => {
    client.uploadReceipt.mockRejectedValue(new Error('midas rejected mime'));
    const store = new MidasExpenseStore();
    await expect(store.create(input, actor)).rejects.toThrow('midas rejected mime');
    expect(client.deleteExpense).toHaveBeenCalledWith('mx1', expect.objectContaining({ email: 'u@x.com' }));
  });

  it('still rethrows the upload error when the compensating delete also fails', async () => {
    client.uploadReceipt.mockRejectedValue(new Error('midas rejected mime'));
    client.deleteExpense.mockRejectedValue(new Error('delete also failed'));
    const store = new MidasExpenseStore();
    await expect(store.create(input, actor)).rejects.toThrow('midas rejected mime');
  });

  it('does not delete anything when the upload succeeds', async () => {
    client.uploadReceipt.mockResolvedValue(undefined);
    const store = new MidasExpenseStore();
    await store.create(input, actor);
    expect(client.deleteExpense).not.toHaveBeenCalled();
  });
});
