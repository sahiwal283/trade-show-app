import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/notifications/recipients', () => ({
  usersWithRole: vi.fn(async () => ['adm-1', 'dev-1']),
  activeUsers: vi.fn(async (ids: string[]) => ids.filter(Boolean)),
}));
vi.mock('../../../src/services/notifications/notifyMany', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { adminNotifications } from '../../../src/services/notifications/adminNotifications';
import { usersWithRole } from '../../../src/services/notifications/recipients';
import { notifyMany } from '../../../src/services/notifications/notifyMany';

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
  });
});
