import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  usersWithRole: vi.fn(async () => ['adm-1', 'dev-1']),
  activeUsers: vi.fn(async (ids: string[]) => ids.filter(Boolean)),
}));
vi.mock('../../../src/config/database', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { adminNotifications } from '../../../src/services/notifications/adminNotifications';
import { usersWithRole } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';
import { query } from '../../../src/config/database';

describe('adminNotifications.userPending', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells admins and developers about a registration, linking to Users', async () => {
    await adminNotifications.userPending({ name: 'Jane Doe', email: 'jane@x.com', via: 'registration' });
    expect(usersWithRole).toHaveBeenCalledWith(['admin', 'developer']);
    expect(notifyMany).toHaveBeenCalledWith(['adm-1', 'dev-1'], {
      kind: 'admin.user_pending',
      title: 'New user awaiting approval',
      body: 'Jane Doe (jane@x.com) registered and needs a role before they can use Argo.',
      link: { page: 'admin-users' },
    });
  });

  it('words an SSO sign-in differently and copes with no email', async () => {
    await adminNotifications.userPending({ name: 'Jane Doe', via: 'sso' });
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe('Jane Doe signed in with SSO for the first time and needs a role before they can use Argo.');
  });

  it('sends nothing when there is nobody to tell', async () => {
    vi.mocked(usersWithRole).mockResolvedValueOnce([]);
    await adminNotifications.userPending({ name: 'Jane', via: 'sso' });
    expect(notifyMany).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('skips a recipient who already has an unread pending notification, and notifies the rest', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ user_id: 'adm-1' }] } as never);
    await adminNotifications.userPending({ name: 'Jane Doe', via: 'registration' });
    const [sql, params] = vi.mocked(query).mock.calls[0];
    expect(sql).toMatch(/FROM notifications\s+WHERE user_id = ANY\(\$1::uuid\[\]\) AND kind = 'admin\.user_pending' AND read_at IS NULL/);
    expect(params).toEqual([['adm-1', 'dev-1']]);
    expect(vi.mocked(notifyMany).mock.calls[0][0]).toEqual(['dev-1']);
  });

  it('sends nothing when every recipient already has an unread pending notification', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ user_id: 'adm-1' }, { user_id: 'dev-1' }] } as never);
    await adminNotifications.userPending({ name: 'Jane Doe', via: 'registration' });
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('collapses whitespace and control characters and cuts a long name to 60 characters', async () => {
    const name = `Eve\n\n\tMallory\u0000\u007f ${'x'.repeat(300)}`;
    await adminNotifications.userPending({ name, email: `  a\r\nb@x.com ${'y'.repeat(100)}`, via: 'registration' });
    const shownName = `Eve Mallory ${'x'.repeat(48)}…`;
    const shownEmail = `a b@x.com ${'y'.repeat(70)}…`;
    expect(shownName).toHaveLength(61);
    expect(shownEmail).toHaveLength(81);
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe(`${shownName} (${shownEmail}) registered and needs a role before they can use Argo.`);
  });

  it('reads as "Someone" when the name is empty after sanitising', async () => {
    await adminNotifications.userPending({ name: ' \n\t ', via: 'registration' });
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe('Someone registered and needs a role before they can use Argo.');
  });
});

describe('adminNotifications.badgeCrmFailed', () => {
  beforeEach(() => vi.clearAllMocks());
  const scan = { id: 's-1', scanned_by: 'u-1', first_name: 'Shamsher', last_name: 'Jessani', company: 'VTA' };

  it('tells the person who scanned it, linking to Leads', async () => {
    await adminNotifications.badgeCrmFailed(scan);
    expect(notifyMany).toHaveBeenCalledWith(['u-1'], {
      kind: 'badge.crm_failed',
      title: "A badge scan didn't reach the CRM",
      body: 'Shamsher Jessani (VTA) could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.',
      link: { page: 'badge-scans' },
    });
  });

  it('falls back to "A lead" when the scan has no name', async () => {
    await adminNotifications.badgeCrmFailed({ ...scan, first_name: null, last_name: ' ', company: null });
    expect(vi.mocked(notifyMany).mock.calls[0][1].body)
      .toBe('A lead could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.');
  });

  it('sends nothing when nobody is recorded as the scanner', async () => {
    await adminNotifications.badgeCrmFailed({ ...scan, scanned_by: null });
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
