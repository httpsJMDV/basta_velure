// The in-app notification inbox (the bell): every order and shipment status change, job offers and decisions.
import { http } from './client';

export interface AppNotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationPage {
  data: AppNotificationItem[];
  meta: { current_page: number; last_page: number; total: number; unread: number };
}

export const getNotificationsApi = (params?: { unread?: 0 | 1; page?: number; per_page?: number }) =>
  http.get<NotificationPage>('/notifications', { params }).then((r) => r.data);

export const getUnreadNotificationsCountApi = () =>
  http.get<{ data: { unread: number } }>('/notifications/unread-count').then((r) => r.data.data.unread);

export const markNotificationReadApi = (id: string) =>
  http.post<{ data: AppNotificationItem; meta: { unread: number } }>(`/notifications/${id}/read`).then((r) => r.data);

export const markAllNotificationsReadApi = () =>
  http.post<{ message: string }>('/notifications/read-all').then((r) => r.data);
