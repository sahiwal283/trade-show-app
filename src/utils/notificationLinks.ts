/**
 * Where a notification takes you. The backend builds push URLs from the same
 * table (linkToUrl in backend/src/services/NotificationService.ts);
 * __fixtures__/notificationLinks.json is asserted by both sides.
 */
import type { AppNotification } from './notificationsApi';

export interface NotificationTarget { page: string | null; hash: string | null }

const NOWHERE: NotificationTarget = { page: null, hash: null };

/** Links that need an event id. */
const EVENT_TARGETS = new Map<string, (eventId: string) => NotificationTarget>([
  ['checklist', (id) => ({ page: 'checklist', hash: `event=${id}&tab=my` })],
  ['samples', (id) => ({ page: 'checklist', hash: `event=${id}&tab=samples` })],
  ['expenses', (id) => ({ page: 'expenses', hash: `expenses-event=${id}` })],
]);

/** Links that only pick a page. */
const PAGE_TARGETS = new Map<string, NotificationTarget>([
  ['admin-users', { page: 'settings', hash: 'users' }],
  ['booth-inventory', { page: 'booths', hash: 'booths' }],
  ['badge-scans', { page: 'leads', hash: 'leads' }],
]);

export function notificationTarget(link: AppNotification['link']): NotificationTarget {
  if (!link) return NOWHERE;
  // One expense, by its id: ExpenseSubmission opens the modal for `#expense=<id>`.
  if (link.page === 'expense') {
    return link.expenseId ? { page: 'expenses', hash: `expense=${link.expenseId}` } : NOWHERE;
  }
  const forEvent = EVENT_TARGETS.get(link.page);
  if (forEvent) return link.eventId ? forEvent(link.eventId) : NOWHERE;
  return PAGE_TARGETS.get(link.page) ?? NOWHERE;
}

/** Hash (no leading #) carried by a push URL such as "/#event=…", or null. */
export function hashFromPushUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const at = url.indexOf('#');
  if (at < 0) return null;
  return url.slice(at + 1) || null;
}

/** The show to filter Expenses to, from an event card or a notification. */
export function eventFilterFromHash(hash: string): string | null {
  if (!hash.startsWith('#event=') && !hash.startsWith('#expenses-event=')) return null;
  const params = new URLSearchParams(hash.slice(1));
  return params.get('event') ?? params.get('expenses-event');
}

/**
 * Hashes that only choose a page. App clears them once applied, so a later
 * reload does not drag the user back there.
 */
export const PAGE_ONLY_HASHES: ReadonlySet<string> = new Set(['#booths', '#leads']);

/** Pages a deep link may only open for these roles (mirrors App's render guards). */
export const PAGE_ROLES: Record<string, string[]> = {
  booths: ['admin', 'coordinator', 'developer'],
  leads: ['admin', 'coordinator', 'salesperson', 'developer'],
};
