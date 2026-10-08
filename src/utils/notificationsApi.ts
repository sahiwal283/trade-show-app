import { apiClient } from './apiClient';

export interface AppNotification {
  id: string; kind: string; title: string; body: string;
  link: { page: string; eventId?: string; expenseId?: string } | null; read_at: string | null; created_at: string;
}

export const notificationsApi = {
  listUnread: () => apiClient.get<{ notifications: AppNotification[] }>('/notifications/unread'),
  markRead: (ids: string[]) => apiClient.post<{ updated: number }>('/notifications/read', { ids }),
  markAllRead: () => apiClient.post<{ updated: number }>('/notifications/read-all'),
};
