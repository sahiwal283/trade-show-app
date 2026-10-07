/**
 * One call = one bell row + one push. Callers never do both by hand, so a
 * channel can never be forgotten. Push failure is logged, never thrown.
 */
import { notificationRepository, NotificationRow, NotificationLink } from '../database/repositories/NotificationRepository';
import { pushService } from './PushService';

export interface NotifyInput {
  kind: string; title: string; body: string; link?: NotificationLink | null;
}

/** Hash deep link understood by App.tsx / the checklist page (Task 10). */
export function linkToUrl(link: NotificationLink | null | undefined): string {
  if (!link) return '/';
  if (link.page === 'checklist' && link.eventId) return `/#event=${link.eventId}&tab=my`;
  if (link.page === 'samples' && link.eventId) return `/#event=${link.eventId}&tab=samples`;
  return '/';
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
