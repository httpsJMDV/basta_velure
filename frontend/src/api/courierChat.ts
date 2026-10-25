// The courier company portal's Settings (contact details, logo) and Messages (a thread with each of its hubs), and
// the hub's side of that chat (Amaru task 2).
import { http } from './client';
import type { ChatMessage, LogisticsCompanyDetail, ThreadAdapter, ThreadMessagesResult, ThreadMeta } from '../types';

export interface CourierHubThreadRow {
  hub: { id: number; name: string; place: string; status: string };
  thread_id: number | null;
  unread: number;
  last_message: { body: string; created_at: string | null; from_hub: boolean } | null;
  last_message_at: string | null;
}

export interface HubCourierThread {
  id: number;
  unread: number;
  company: { name: string; code: string; logo_url: string | null } | null;
  last_message: { body: string; created_at: string | null } | null;
  meta: ThreadMeta;
}

export const updateLogisticsCompanyApi = (body: { description?: string | null; contact_email: string; contact_phone: string }) =>
  http.patch<{ data: LogisticsCompanyDetail; message: string }>('/logistics/company', body).then((r) => r.data);

export const uploadLogisticsLogoApi = (file: File) => {
  const fd = new FormData();
  fd.append('logo', file);
  return http.post<{ data: LogisticsCompanyDetail; message: string }>('/logistics/company/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const getCourierChatHubsApi = () =>
  http.get<{ data: CourierHubThreadRow[]; meta: { unread: number } }>('/logistics/chat/hubs').then((r) => r.data);

export const getCourierChatUnreadApi = () =>
  http.get<{ data: { unread: number } }>('/logistics/chat/unread').then((r) => r.data.data.unread);

export const openCourierHubThreadApi = (hubId: number) =>
  http.post<{ data: { id: number; unread: number; meta: ThreadMeta } }>(`/logistics/chat/hubs/${hubId}/thread`).then((r) => r.data.data);

/** The courier company's side of one hub thread, for ThreadView. */
export function courierThreadAdapter(threadId: number): ThreadAdapter {
  return {
    fetchMessages: (afterId?: number) =>
      http.get<ThreadMessagesResult>(`/logistics/chat/threads/${threadId}/messages`, { params: afterId ? { after_id: afterId } : undefined }).then((r) => r.data),
    sendMessage: (body: string) => http.post<{ data: ChatMessage }>(`/logistics/chat/threads/${threadId}/messages`, { body }).then((r) => r.data.data),
    markRead: () => http.post(`/logistics/chat/threads/${threadId}/read`).then(() => undefined),
  };
}

export const getHubCourierThreadApi = () => http.get<{ data: HubCourierThread }>('/hub/courier-chat').then((r) => r.data.data);

/** The hub's side of its thread with its courier company, for ThreadView. */
export const hubCourierThreadAdapter: ThreadAdapter = {
  fetchMessages: (afterId?: number) =>
    http.get<ThreadMessagesResult>('/hub/courier-chat/messages', { params: afterId ? { after_id: afterId } : undefined }).then((r) => r.data),
  sendMessage: (body: string) => http.post<{ data: ChatMessage }>('/hub/courier-chat/messages', { body }).then((r) => r.data.data),
  markRead: () => http.post('/hub/courier-chat/read').then(() => undefined),
};
