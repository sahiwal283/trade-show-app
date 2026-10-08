// backend/tests/services/MidasEventScanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/midas', () => ({ getMidasClient: vi.fn() }));
vi.mock('../../src/services/ExpenseMessageService', () => ({ isMessagingEnabled: vi.fn(() => true) }));
vi.mock('../../src/database/repositories/ExpenseMessageNotificationRepository', () => ({
  getCursor: vi.fn(async () => '40'),
  setCursor: vi.fn(async () => undefined),
}));
vi.mock('../../src/services/notifications', () => ({
  expenseNotifications: { deliver: vi.fn(async () => 'sent') },
}));

import { getMidasClient } from '../../src/services/midas';
import { getCursor, setCursor } from '../../src/database/repositories/ExpenseMessageNotificationRepository';
import { expenseNotifications } from '../../src/services/notifications';
import { MidasEventScanner } from '../../src/services/midas/MidasEventScanner';

const event = (seq: number) => ({ seq, id: `evt-${seq}`, type: 'approved' });
const listEventsSince = vi.fn();
const KEY = 'trade_show:events';

describe('MidasEventScanner.scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMidasClient).mockReturnValue({ listEventsSince } as never);
    process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE = '2';
  });

  it('delivers a page in order, then moves the cursor', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41)], nextCursor: '41' });
    await new MidasEventScanner().scan();
    expect(getCursor).toHaveBeenCalledWith(KEY);
    expect(listEventsSince).toHaveBeenCalledWith('40', 2);
    expect(expenseNotifications.deliver).toHaveBeenCalledWith(event(41));
    expect(setCursor).toHaveBeenCalledWith(KEY, '41');
    expect(vi.mocked(expenseNotifications.deliver).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(setCursor).mock.invocationCallOrder[0]);
  });

  it('starts from 0 when it has never run', async () => {
    vi.mocked(getCursor).mockResolvedValueOnce(null);
    listEventsSince.mockResolvedValueOnce({ events: [], nextCursor: null });
    await new MidasEventScanner().scan();
    expect(listEventsSince).toHaveBeenCalledWith('0', 2);
    expect(setCursor).not.toHaveBeenCalled();
  });

  it('follows full pages to the end', async () => {
    listEventsSince
      .mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' })
      .mockResolvedValueOnce({ events: [event(43)], nextCursor: '43' });
    await new MidasEventScanner().scan();
    expect(listEventsSince).toHaveBeenNthCalledWith(2, '42', 2);
    expect(setCursor).toHaveBeenLastCalledWith(KEY, '43');
  });

  it('a skipped event does not hold up the feed', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' })
      .mockResolvedValueOnce({ events: [], nextCursor: null });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('skipped');
    await new MidasEventScanner().scan();
    expect(expenseNotifications.deliver).toHaveBeenCalledTimes(2);
    expect(setCursor).toHaveBeenCalledWith(KEY, '42');
  });

  it('leaves the cursor alone when delivery fails, so the page is retried', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: '42' });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('sent').mockRejectedValueOnce(new Error('db down'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('never throws when Midas is unreachable, and leaves the cursor alone', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('a trigger during a running scan does not overlap it, and runs exactly one more scan afterwards', async () => {
    let release!: (v: unknown) => void;
    listEventsSince
      .mockReturnValueOnce(new Promise((r) => { release = r; }))
      .mockResolvedValue({ events: [], nextCursor: null });
    const scanner = new MidasEventScanner();
    const first = scanner.scan();
    scanner.trigger();
    scanner.trigger();
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(1);
    release({ events: [], nextCursor: null });
    await first;
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(2);
  });

  it('trigger with nothing running starts a scan', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [], nextCursor: null });
    new MidasEventScanner().trigger();
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(1);
  });
});
