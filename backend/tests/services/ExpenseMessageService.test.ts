import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/midas', () => ({
  getMidasClient: vi.fn(),
  getExpenseBackend: vi.fn(() => 'midas'),
  getMidasMode: vi.fn(() => 'live'),
}));
vi.mock('../../src/services/expenseStore', () => ({ getExpenseStore: vi.fn() }));
vi.mock('../../src/database/repositories/NotificationRepository', () => ({
  notificationRepository: { markReadForExpense: vi.fn(async () => 3) },
}));

import { getMidasClient } from '../../src/services/midas';
import { getExpenseStore } from '../../src/services/expenseStore';
import { notificationRepository } from '../../src/database/repositories/NotificationRepository';
import { ExpenseMessageService } from '../../src/services/ExpenseMessageService';

const salesperson = { id: 'u1', email: 'u@x.com', name: 'U', role: 'salesperson', username: 'u' };
const accountant = { id: 'a1', email: 'a@x.com', name: 'A', role: 'accountant', username: 'a' };

describe('ExpenseMessageService', () => {
  let client: any;
  let store: any;
  let service: ExpenseMessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      listExpenseMessages: vi.fn().mockResolvedValue([]),
      postExpenseMessage: vi.fn().mockResolvedValue({ id: 'm1', body: 'hi' }),
    };
    store = {
      getById: vi.fn().mockResolvedValue({ id: 'ts-1', midasExpenseId: 'midas-1', userId: salesperson.id }),
    };
    (getMidasClient as any).mockReturnValue(client);
    (getExpenseStore as any).mockReturnValue(store);
    service = new ExpenseMessageService();
  });

  it('resolves the trade-show id to the Midas id before reading', async () => {
    await service.getThread('ts-1', salesperson as any);
    expect(store.getById).toHaveBeenCalledWith('ts-1', salesperson);
    expect(client.listExpenseMessages).toHaveBeenCalledWith('midas-1');
  });

  it('throws NOT_FOUND when the actor cannot see the expense', async () => {
    store.getById.mockResolvedValue(null);
    await expect(service.getThread('ts-1', salesperson as any)).rejects.toThrow(/not found/i);
    expect(client.listExpenseMessages).not.toHaveBeenCalled();
  });

  it('throws when the expense has no Midas id', async () => {
    store.getById.mockResolvedValue({ id: 'ts-1', userId: salesperson.id });
    await expect(service.getThread('ts-1', salesperson as any)).rejects.toThrow(/not linked/i);
  });

  it('sends actor headers derived from the trade-show user', async () => {
    await service.postMessage('ts-1', { body: 'because buyers' }, salesperson as any);
    expect(client.postExpenseMessage).toHaveBeenCalledWith(
      'midas-1',
      { body: 'because buyers', requestType: null },
      expect.objectContaining({
        email: 'u@x.com',
        externalUserId: 'u1',
        name: 'U',
      })
    );
  });

  it('rejects requestType from a salesperson', async () => {
    await expect(
      service.postMessage('ts-1', { body: 'x', requestType: 'info_request' }, salesperson as any)
    ).rejects.toThrow(/not permitted/i);
    expect(client.postExpenseMessage).not.toHaveBeenCalled();
  });

  it('allows requestType from an accountant', async () => {
    await service.postMessage('ts-1', { body: 'x', requestType: 'info_request' }, accountant as any);
    expect(client.postExpenseMessage).toHaveBeenCalledWith(
      'midas-1',
      { body: 'x', requestType: 'info_request' },
      expect.anything()
    );
  });

  it('flags the viewer own messages by email, not by user id', async () => {
    client.listExpenseMessages.mockResolvedValue([
      { id: 'm1', body: 'from them', sender: { id: 'midas-a', name: 'Dana', role: 'accountant', email: 'a@x.com' } },
      { id: 'm2', body: 'from me', sender: { id: 'midas-u', name: 'U', role: 'user', email: 'U@X.com' } },
    ]);

    const thread = await service.getThread('ts-1', salesperson as any);

    // Midas ids never equal trade-show ids; the match is on email, case-insensitively.
    expect(thread.map((m) => m.isMine)).toEqual([false, true]);
  });

  describe('markRead', () => {
    it('marks the caller\'s conversation notifications for that expense read, without calling Midas', async () => {
      const actor = { id: 'u-1', email: 'a@x.com', name: 'Ana', role: 'salesperson', username: 'ana' };
      const updated = await service.markRead('ex-1', actor as never);
      expect(updated).toBe(3);
      expect(notificationRepository.markReadForExpense).toHaveBeenCalledWith(
        'u-1', 'ex-1', ['expense.message', 'expense.mention', 'expense.info_requested']
      );
      expect(store.getById).not.toHaveBeenCalled();
      expect(client.listExpenseMessages).not.toHaveBeenCalled();
      expect(client.postExpenseMessage).not.toHaveBeenCalled();
    });
  });

  it('strips sender.email from the returned thread', async () => {
    client.listExpenseMessages.mockResolvedValue([
      { id: 'm1', body: 'hi', sender: { id: 'midas-a', name: 'Dana', role: 'accountant', email: 'a@x.com' } },
    ]);
    const thread = await service.getThread('ts-1', salesperson as any);
    expect(thread[0].sender.email).toBeNull();
  });

  describe('authorization', () => {
    it('allows the expense owner to read and reply', async () => {
      store.getById.mockResolvedValue({ id: 'ts-1', midasExpenseId: 'midas-1', userId: salesperson.id });

      await expect(service.getThread('ts-1', salesperson as any)).resolves.toBeDefined();
      await expect(
        service.postMessage('ts-1', { body: 'hi' }, salesperson as any)
      ).resolves.toBeDefined();
    });

    it('allows a privileged non-owner to read and reply', async () => {
      store.getById.mockResolvedValue({ id: 'ts-1', midasExpenseId: 'midas-1', userId: 'someone-else' });

      await expect(service.getThread('ts-1', accountant as any)).resolves.toBeDefined();
      await expect(
        service.postMessage('ts-1', { body: 'hi' }, accountant as any)
      ).resolves.toBeDefined();
    });

    it('hides the thread from an unrelated non-privileged user behind the same not-found error', async () => {
      store.getById.mockResolvedValue({ id: 'ts-1', midasExpenseId: 'midas-1', userId: 'someone-else' });

      await expect(service.getThread('ts-1', salesperson as any)).rejects.toThrow(/not found/i);
      expect(client.listExpenseMessages).not.toHaveBeenCalled();

      await expect(
        service.postMessage('ts-1', { body: 'hi' }, salesperson as any)
      ).rejects.toThrow(/not found/i);
      expect(client.postExpenseMessage).not.toHaveBeenCalled();
    });
  });
});
