// backend/tests/services/notifications/ReminderScheduler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/config/database', () => ({ query: vi.fn() }));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { query } from '../../../src/config/database';
import { notifyMany } from '../../../src/services/notifications/notifyMany';
import { ReminderScheduler } from '../../../src/services/notifications/ReminderScheduler';

const rows = (r: unknown[]) => ({ rows: r } as any);
const DEF = {
  kind: 'reminder.test', dueSql: 'SELECT due',
  build: (row: any) => ({ kind: 'reminder.test', title: `T ${row.subject_id}`, body: 'B', link: null }),
};
const due = (subject_id: string, user_id: string) => ({ subject_id, user_id });

describe('ReminderScheduler.scan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('claims the ledger row first, then notifies', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(rows([due('ev-1', 'u-1')]))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.test' }]));
    await new ReminderScheduler([DEF]).scan();
    const calls = vi.mocked(query).mock.calls;
    expect(calls[0]).toEqual(['SELECT due', ['reminder.test']]);
    expect(String(calls[1][0])).toMatch(/INSERT INTO notification_reminders \(kind, subject_id, user_id\)/);
    expect(String(calls[1][0])).toMatch(/ON CONFLICT \(kind, subject_id, user_id\) DO NOTHING/);
    expect(calls[1][1]).toEqual(['reminder.test', 'ev-1', 'u-1']);
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], expect.objectContaining({ title: 'T ev-1' }));
    expect(vi.mocked(query).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(notifyMany).mock.invocationCallOrder[0]);
  });

  it('does not notify when another pass already claimed the row', async () => {
    vi.mocked(query).mockResolvedValueOnce(rows([due('ev-1', 'u-1')])).mockResolvedValueOnce(rows([]));
    await new ReminderScheduler([DEF]).scan();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('one failing claim does not stop the next recipient', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(query)
      .mockResolvedValueOnce(rows([due('ev-1', 'u-1'), due('ev-1', 'u-2')]))
      .mockRejectedValueOnce(new Error('claim failed'))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.test' }]));
    await new ReminderScheduler([DEF]).scan();
    expect(vi.mocked(notifyMany).mock.calls.map((c) => c[0])).toEqual([['u-2']]);
    err.mockRestore();
  });

  it('one failing definition does not stop the next, and scan never throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(query)
      .mockRejectedValueOnce(new Error('bad sql'))
      .mockResolvedValueOnce(rows([due('ev-2', 'u-3')]))
      .mockResolvedValueOnce(rows([{ kind: 'reminder.other' }]));
    const other = { ...DEF, kind: 'reminder.other' };
    await expect(new ReminderScheduler([DEF, other]).scan()).resolves.toBeUndefined();
    expect(vi.mocked(notifyMany).mock.calls.map((c) => c[0])).toEqual([['u-3']]);
    err.mockRestore();
  });

  it('a scan that overlaps a running one is skipped', async () => {
    let release!: (v: any) => void;
    vi.mocked(query).mockReturnValueOnce(new Promise((r) => { release = r; }) as any);
    const scheduler = new ReminderScheduler([DEF]);
    const first = scheduler.scan();
    await scheduler.scan();
    expect(query).toHaveBeenCalledTimes(1);
    release(rows([]));
    await first;
  });
});
