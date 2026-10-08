/**
 * Notifications about the app itself rather than a show: an account waiting
 * for a role, and a badge scan that could not reach the CRM.
 */
import { usersWithRole } from './recipients';
import { notifyMany } from './notifyMany';
import { textKey } from './values';

export interface PendingUser { name: string; email?: string | null; via: 'registration' | 'sso' }

export const adminNotifications = {
  async userPending(user: PendingUser): Promise<void> {
    const recipients = await usersWithRole(['admin', 'developer']);
    if (recipients.length === 0) return;
    const email = textKey(user.email);
    const how = user.via === 'sso' ? 'signed in with SSO for the first time' : 'registered';
    await notifyMany(recipients, {
      kind: 'admin.user_pending',
      title: 'New user awaiting approval',
      body: `${user.name}${email ? ` (${email})` : ''} ${how} and needs a role before they can use Argo.`,
      link: { page: 'admin-users' },
    });
  },
};
