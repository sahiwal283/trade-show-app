/**
 * One call = one bell row + one push. Callers never do both by hand, so a
 * channel can never be forgotten. Push failure is logged, never thrown.
 */
import { notificationRepository, NotificationRow, NotificationLink } from '../database/repositories/NotificationRepository';
import { pushService } from './PushService';

export interface NotifyInput {
  kind: string; title: string; body: string; link?: NotificationLink | null;
}

/** Links that need an event id. Mirrored by src/utils/notificationLinks.ts. */
const EVENT_LINKS = new Map<string, (eventId: string) => string>([
  ['checklist', (id) => `/#event=${id}&tab=my`],
  ['samples', (id) => `/#event=${id}&tab=samples`],
  ['expenses', (id) => `/#expenses-event=${id}`],
]);

/** Links that only pick a page. */
const PAGE_LINKS = new Map<string, string>([
  ['admin-users', '/#users'],
  ['booth-inventory', '/#booths'],
  ['badge-scans', '/#leads'],
]);

/**
 * Hash deep link the app understands. The same table lives on the frontend;
 * src/utils/__fixtures__/notificationLinks.json is asserted by both sides.
 */
export function linkToUrl(link: NotificationLink | null | undefined): string {
  if (!link) return '/';
  const forEvent = EVENT_LINKS.get(link.page);
  if (forEvent) return link.eventId ? forEvent(link.eventId) : '/';
  return PAGE_LINKS.get(link.page) ?? '/';
}

class NotificationService {
  async notify(userId: string, input: NotifyInput): Promise<NotificationRow> {
    const row = await notificationRepository.insert({
      user_id: userId, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null,
    });
    try {
      await pushService.sendToUser(userId, { title: input.title, body: input.body, url: linkToUrl(input.link) });
    } catch (error) {
      console.error(`[Notifications] push failed for user ${userId} (${input.kind}):`, error);
    }
    return row;
  }

  listUnread(userId: string): Promise<NotificationRow[]> {
    return notificationRepository.listUnread(userId);
  }

  markRead(userId: string, ids: string[]): Promise<number> {
    return notificationRepository.markRead(userId, ids);
  }

  markAllRead(userId: string): Promise<number> {
    return notificationRepository.markAllRead(userId);
  }
}

export const notificationService = new NotificationService();
