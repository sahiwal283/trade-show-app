import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../../../src/services/notifications/recipients', () => ({
  activeUsers: vi.fn(async (ids: string[]) => ids),
}));
vi.mock('../../../src/services/NotificationService', () => ({
  notificationService: { notify: vi.fn(async () => ({ id: 'n-1' })) },
}));

import { expenseNotifications, CONVERSATION_KINDS } from '../../../src/services/notifications/expenseNotifications';
import { activeUsers } from '../../../src/services/notifications/recipients';
import { notificationService } from '../../../src/services/NotificationService';

const notify = notificationService.notify as unknown as ReturnType<typeof vi.fn>;

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/midasEvents.json'), 'utf8'));
const byType = (type: string) => fixture.events.find((e: { type: string }) => e.type === type);
const USER = '11111111-2222-4333-8444-555555555555';
const withUser = (e: object) => ({ ...e, externalUserId: USER });
const expenseLink = { page: 'expense', expenseId: 'argo-exp-1' };

describe('expenseNotifications.fromMidasEvent (contract fixture shared with Midas)', () => {
  it('approved', () => {
    expect(expenseNotifications.fromMidasEvent(byType('approved'))).toEqual({
      kind: 'expense.approved', title: 'Expense approved',
      body: 'Your $42.10 expense at Staples was approved.', link: expenseLink,
    });
  });
  it('rejected carries the note', () => {
    expect(expenseNotifications.fromMidasEvent(byType('rejected'))).toEqual({
      kind: 'expense.rejected', title: 'Expense rejected',
      body: 'Your $42.10 expense at Staples was rejected. Note: Duplicate submission', link: expenseLink,
    });
  });
  it('message quotes the sender', () => {
    expect(expenseNotifications.fromMidasEvent(byType('message'))).toEqual({
      kind: 'expense.message', title: 'New message on your expense',
      body: 'Rita on your $42.10 expense at Staples: "Which show was this for?"', link: expenseLink,
    });
  });
  it('action_required reads as a request', () => {
    expect(expenseNotifications.fromMidasEvent(byType('action_required'))).toEqual({
      kind: 'expense.info_requested', title: 'More info needed on your expense',
      body: 'Rita needs more information for your $42.10 expense at Staples: "Please attach the itemised receipt"',
      link: expenseLink,
    });
  });
  it('expense_incomplete lists what is missing and, with no source reference, links by the Midas expense id', () => {
    expect(expenseNotifications.fromMidasEvent(byType('expense_incomplete'))).toEqual({
      kind: 'expense.incomplete', title: 'Your expense is missing details',
      body: 'Your $18.00 expense at Uber is missing: receipt, payment method. Add them so the accountant can approve it.',
      link: { page: 'expense', expenseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    });
  });
  it('has no link only when the expense has neither a source reference nor an id', () => {
    const approved = byType('approved');
    const bare = { ...approved, expense: { ...approved.expense, sourceRefId: null, id: '' } };
    expect(expenseNotifications.fromMidasEvent(bare)!.link).toBeNull();
    const noId = { ...approved, expense: { ...approved.expense, sourceRefId: '', id: undefined } };
    expect(expenseNotifications.fromMidasEvent(noId as never)!.link).toBeNull();
  });
  it('shows a non-numeric amount as sent, clipped to 20 characters', () => {
    const approved = byType('approved');
    const withAmount = (amount: unknown) => ({ ...approved, expense: { ...approved.expense, amount } }) as never;
    expect(expenseNotifications.fromMidasEvent(withAmount('abc'))!.body).toBe('Your $abc expense at Staples was approved.');
    const long = expenseNotifications.fromMidasEvent(withAmount('9'.repeat(500) + 'x'))!.body;
    const shown = long.slice('Your '.length, long.indexOf(' expense at'));
    expect(shown.length).toBeLessThanOrEqual(20);
    expect(shown.startsWith('$999')).toBe(true);
    expect(shown.endsWith('…')).toBe(true);
  });
  it('leaves the amount out of the sentence when there is none', () => {
    const approved = byType('approved');
    for (const amount of [undefined, null, '', '   ']) {
      const event = { ...approved, expense: { ...approved.expense, amount } };
      expect(expenseNotifications.fromMidasEvent(event as never)!.body).toBe('Your expense at Staples was approved.');
      expect(expenseNotifications.fromMidasEvent({ ...event, type: 'reimbursement_paid' } as never)!.body)
        .toBe('Your reimbursement for Staples was marked paid.');
      expect(expenseNotifications.fromMidasEvent({ ...byType('message'), expense: event.expense } as never)!.body)
        .toBe('Rita on your expense at Staples: "Which show was this for?"');
    }
  });
  it('mention and reimbursement_paid', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('message'), type: 'mention' })).toEqual(expect.objectContaining({
      kind: 'expense.mention', title: 'Rita mentioned you on your expense',
    }));
    expect(expenseNotifications.fromMidasEvent({ ...byType('approved'), type: 'reimbursement_paid' })).toEqual({
      kind: 'expense.reimbursement_paid', title: 'Reimbursement paid',
      body: 'Your $42.10 reimbursement for Staples was marked paid.', link: expenseLink,
    });
  });
  it('words a single missing item and a missing sender sensibly', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('expense_incomplete'), missing: ['receipt'] })!.body)
      .toBe('Your $18.00 expense at Uber is missing: receipt. Add it so the accountant can approve it.');
    const noSender = { ...byType('message'), senderName: undefined };
    expect(expenseNotifications.fromMidasEvent(noSender)!.body).toMatch(/^Your accountant on your /);
  });
  it('returns null for a type this build does not know', () => {
    expect(expenseNotifications.fromMidasEvent({ ...byType('approved'), type: 'something_new' })).toBeNull();
  });
  it('the conversation kinds are exactly the three that clear when the thread is opened', () => {
    expect([...CONVERSATION_KINDS].sort()).toEqual(['expense.info_requested', 'expense.mention', 'expense.message']);
  });
});

describe('expenseNotifications.deliver', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it('notifies the Argo user once, keyed on the event id', async () => {
    const event = withUser(byType('approved'));
    expect(await expenseNotifications.deliver(event as never)).toBe('sent');
    expect(activeUsers).toHaveBeenCalledWith([USER]);
    expect(notify).toHaveBeenCalledWith(USER, expect.objectContaining({
      kind: 'expense.approved', dedupeKey: '11111111-1111-4111-8111-111111111111',
    }));
  });

  it('skips an event whose user id is not an Argo id, without touching the database', async () => {
    expect(await expenseNotifications.deliver(byType('approved'))).toBe('skipped'); // "argo-user-1" is not a UUID
    expect(log).toHaveBeenCalled();
    expect(activeUsers).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips an unknown or inactive user', async () => {
    vi.mocked(activeUsers).mockResolvedValueOnce([]);
    expect(await expenseNotifications.deliver(withUser(byType('approved')) as never)).toBe('skipped');
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips an unknown type', async () => {
    expect(await expenseNotifications.deliver(withUser({ ...byType('approved'), type: 'something_new' }) as never)).toBe('skipped');
    expect(notify).not.toHaveBeenCalled();
  });

  it('lets a database failure through so the scanner retries the page', async () => {
    vi.mocked(activeUsers).mockRejectedValueOnce(new Error('db down'));
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toThrow('db down');
  });

  it('skips an event with no expense, even of an unknown type, without throwing', async () => {
    const { expense: _x, ...noExpense } = withUser(byType('approved')) as { expense: unknown };
    expect(await expenseNotifications.deliver(noExpense as never)).toBe('skipped');
    expect(await expenseNotifications.deliver({ ...noExpense, type: 'something_new' } as never)).toBe('skipped');
    expect(await expenseNotifications.deliver(null as never)).toBe('skipped');
    expect(activeUsers).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('builds the wording when missing is not an array', () => {
    const n = expenseNotifications.fromMidasEvent({ ...byType('expense_incomplete'), missing: 'receipt' as never });
    expect(n!.body).toContain('is missing: .');
  });

  it('lets a failed notification write through so the scanner retries', async () => {
    notify.mockRejectedValueOnce(new Error('insert failed'));
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toThrow('insert failed');
  });

  it('skips an event the database rejects as invalid data, so it cannot block the feed', async () => {
    notify.mockRejectedValueOnce(Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: '22021' }));
    expect(await expenseNotifications.deliver(withUser(byType('approved')) as never)).toBe('skipped');
    expect(log).toHaveBeenCalledWith(
      '[MidasEvents] Event 11111111-1111-4111-8111-111111111111 could not be stored (22021) — skipped',
    );
  });

  it('lets a connection failure during the notification write through', async () => {
    const down = Object.assign(new Error('connection failure'), { code: '08006' });
    notify.mockRejectedValueOnce(down);
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toBe(down);
    notify.mockRejectedValueOnce({ code: 22021 }); // a code that is not a string is not a Postgres data exception
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toEqual({ code: 22021 });
  });

  it('does not treat a failing recipient lookup as a rejected event', async () => {
    vi.mocked(activeUsers).mockRejectedValueOnce(Object.assign(new Error('bad uuid'), { code: '22P02' }));
    await expect(expenseNotifications.deliver(withUser(byType('approved')) as never)).rejects.toThrow('bad uuid');
    expect(notify).not.toHaveBeenCalled();
  });

  it('counts a duplicate (notify returns null) as sent', async () => {
    notify.mockResolvedValueOnce(null);
    expect(await expenseNotifications.deliver(withUser(byType('approved')) as never)).toBe('sent');
  });

  it('clips an over-long note', () => {
    const n = expenseNotifications.fromMidasEvent({ ...byType('rejected'), note: 'x'.repeat(2000) });
    expect(n!.body.length).toBeLessThan(400);
    expect(n!.body.endsWith('…')).toBe(true);
  });
});
