import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/services/midas', () => ({ getMidasClient: vi.fn() }));
vi.mock('../../src/services/ExpenseMessageService', () => ({ isMessagingEnabled: vi.fn(() => true) }));
import { isMessagingEnabled } from '../../src/services/ExpenseMessageService';
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
    vi.mocked(isMessagingEnabled).mockReturnValue(true);
    vi.mocked(getCursor).mockResolvedValue('40');
    process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE = '2';
  });

  afterEach(() => {
    delete process.env.MIDAS_MESSAGE_SCAN_PAGE_SIZE;
  });

  it('delivers a page in order, then moves the cursor', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41)], nextCursor: '9999' });
    await new MidasEventScanner().scan();
    expect(getCursor).toHaveBeenCalledWith(KEY);
    expect(listEventsSince).toHaveBeenCalledWith('40', 2);
    expect(expenseNotifications.deliver).toHaveBeenCalledWith(event(41));
    expect(setCursor).toHaveBeenCalledWith(KEY, '41');
    expect(vi.mocked(expenseNotifications.deliver).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(setCursor).mock.invocationCallOrder[0]);
  });

  it('a full page whose last seq does not pass the cursor is not re-requested', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValue({ events: [event(39), event(40)], nextCursor: '41' });
    await new MidasEventScanner().scan();
    expect(listEventsSince).toHaveBeenCalledTimes(1);
    expect(setCursor).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('never moves the cursor backwards', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(10)], nextCursor: '99' });
    await new MidasEventScanner().scan();
    expect(setCursor).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('does nothing when messaging is not enabled, on scan or trigger', async () => {
    vi.mocked(isMessagingEnabled).mockReturnValue(false);
    const scanner = new MidasEventScanner();
    await scanner.scan();
    scanner.trigger();
    await new Promise((r) => setImmediate(r));
    expect(getMidasClient).not.toHaveBeenCalled();
    expect(listEventsSince).not.toHaveBeenCalled();
    vi.mocked(isMessagingEnabled).mockReturnValue(true);
    listEventsSince.mockResolvedValue({ events: [], nextCursor: null });
    await scanner.scan();
    await new Promise((r) => setImmediate(r));
    expect(listEventsSince).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the cursor write fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(41)], nextCursor: '41' });
    vi.mocked(setCursor).mockRejectedValueOnce(new Error('db down'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    err.mockRestore();
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
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42)], nextCursor: null })
      .mockResolvedValueOnce({ events: [], nextCursor: null });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('skipped');
    await new MidasEventScanner().scan();
    expect(expenseNotifications.deliver).toHaveBeenCalledTimes(2);
    expect(setCursor).toHaveBeenCalledWith(KEY, '42');
  });

  it('a malformed last element does not stall the feed: the cursor comes from the highest seq on the page', async () => {
    listEventsSince.mockResolvedValueOnce({ events: [event(41), null], nextCursor: null })
      .mockResolvedValueOnce({ events: [], nextCursor: null });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('sent').mockResolvedValueOnce('skipped');
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(expenseNotifications.deliver).toHaveBeenNthCalledWith(1, event(41));
    expect(expenseNotifications.deliver).toHaveBeenNthCalledWith(2, null);
    expect(setCursor).toHaveBeenCalledTimes(1);
    expect(setCursor).toHaveBeenCalledWith(KEY, '41');
  });

  it('a last element with a non-numeric seq does not stall the feed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(41), { seq: 'x', id: 'bad', type: 'approved' }], nextCursor: null })
      .mockResolvedValueOnce({ events: [], nextCursor: null });
    await new MidasEventScanner().scan();
    expect(expenseNotifications.deliver).toHaveBeenCalledTimes(2);
    expect(setCursor).toHaveBeenCalledTimes(1);
    expect(setCursor).toHaveBeenCalledWith(KEY, '41');
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('a page of only malformed elements stops the scan without moving the cursor', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValue({ events: [null, { seq: 'x', id: 'bad', type: 'approved' }], nextCursor: '99' });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('skipped').mockResolvedValueOnce('skipped');
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(listEventsSince).toHaveBeenCalledTimes(1);
    expect(setCursor).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain('did not advance past cursor 40');
    err.mockRestore();
  });

  it('a delivery failure on a malformed element is logged without throwing, and the page is retried', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [null, event(41)], nextCursor: null });
    vi.mocked(expenseNotifications.deliver).mockRejectedValueOnce(new Error('db down'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toContain('Delivery failed');
    err.mockRestore();
  });

  it('leaves the cursor alone when delivery fails, so the page is retried', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    listEventsSince.mockResolvedValueOnce({ events: [event(41), event(42), event(43)], nextCursor: '43' });
    vi.mocked(expenseNotifications.deliver).mockResolvedValueOnce('sent').mockRejectedValueOnce(new Error('db down'));
    await expect(new MidasEventScanner().scan()).resolves.toBeUndefined();
    expect(setCursor).not.toHaveBeenCalled();
    expect(expenseNotifications.deliver).toHaveBeenCalledTimes(2);
    expect(expenseNotifications.deliver).toHaveBeenCalledWith(event(41));
    expect(expenseNotifications.deliver).not.toHaveBeenCalledWith(event(43));
    expect(err.mock.calls[0][0]).toContain('seq 42');
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
