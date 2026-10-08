/**
 * Notifications about the app itself rather than a show: an account waiting
 * for a role, and a badge scan that could not reach the CRM.
 */
import { query } from '../../config/database';
import { usersWithRole, activeUsers } from './recipients';
import type { ExhaustedScan } from '../../database/repositories/BadgeScanRepository';
import { notifyMany } from './notifyMany';
import { textKey } from './values';

export interface PendingUser { name: string; email?: string | null; via: 'registration' | 'sso' }

const PENDING_NAME_MAX = 60;
const PENDING_EMAIL_MAX = 80;

/**
 * Registration is unauthenticated, so the name and email are whatever a
 * stranger typed: one line, no control characters, and a bounded length.
 */
function sanitise(value: string | null | undefined, max: number): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const clean = String(value ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Whoever already has an unread "awaiting approval" notification is not sent
 * another: a burst of registrations costs each admin one notification until
 * they read it, and the Users tab lists everyone who is waiting anyway.
 */
async function withoutUnreadPending(recipients: string[]): Promise<string[]> {
  const r = await query(
    `SELECT DISTINCT user_id FROM notifications
      WHERE user_id = ANY($1::uuid[]) AND kind = 'admin.user_pending' AND read_at IS NULL`,
    [recipients]
  );
  const waiting = new Set(r.rows.map((row: { user_id: string }) => row.user_id));
  return recipients.filter((id) => !waiting.has(id));
}

export const adminNotifications = {
  async userPending(user: PendingUser): Promise<void> {
    const everyone = await usersWithRole(['admin', 'developer']);
    if (everyone.length === 0) return;
    const recipients = await withoutUnreadPending(everyone);
    if (recipients.length === 0) return;
    const name = sanitise(user.name, PENDING_NAME_MAX) || 'Someone';
    const email = sanitise(user.email, PENDING_EMAIL_MAX);
    const how = user.via === 'sso' ? 'signed in with SSO for the first time' : 'registered';
    await notifyMany(recipients, {
      kind: 'admin.user_pending',
      title: 'New user awaiting approval',
      body: `${name}${email ? ` (${email})` : ''} ${how} and needs a role before they can use Argo.`,
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
