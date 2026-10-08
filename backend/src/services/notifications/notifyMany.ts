import { notificationService, NotifyInput } from '../NotificationService';

/** One bell row + push per user. One user's failure never stops the rest. */
export async function notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
  for (const userId of userIds) {
    try {
      await notificationService.notify(userId, input);
    } catch (error) {
      console.error(`[Notifications] ${input.kind} failed for user ${userId}:`, error);
    }
  }
}

/** `void catalogCall(...).catch(logNotifyError('booth.ordered'))` */
export const logNotifyError = (label: string) => (error: unknown): void => {
  console.error(`[Notifications] ${label} failed:`, error);
};
