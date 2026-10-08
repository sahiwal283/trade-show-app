/**
 * Notifications about the app itself rather than a show: an account waiting
 * for a role, and a badge scan that could not reach the CRM.
 */
import { usersWithRole, activeUsers } from './recipients';
import type { ExhaustedScan } from '../../database/repositories/BadgeScanRepository';
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

  async badgeCrmFailed(scan: ExhaustedScan): Promise<void> {
    const recipients = await activeUsers([scan.scanned_by]);
    if (recipients.length === 0) return;
    const name = [textKey(scan.first_name), textKey(scan.last_name)].filter(Boolean).join(' ');
    const company = textKey(scan.company);
    const who = name ? `${name}${company ? ` (${company})` : ''}` : (company ?? 'A lead');
    await notifyMany(recipients, {
      kind: 'badge.crm_failed',
      title: "A badge scan didn't reach the CRM",
      body: `${who} could not be sent to Zoho CRM after several tries. Open Leads to check it and retry.`,
      link: { page: 'badge-scans' },
    });
  },
};
