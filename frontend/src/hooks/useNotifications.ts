// The signed-in person's in-app notifications: the unread count, the latest items (loaded when the bell opens), and
// the read actions. A new notification is pushed over Reverb on the person's private channel the moment it is written,
// so the bell lights up at once; the count is also polled (and refreshed when the tab comes back) in case the live
// connection is down. Opening one marks it read; "Mark all as read" clears the count.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNotificationsApi, getUnreadNotificationsCountApi, markAllNotificationsReadApi, markNotificationReadApi,
} from '../api/notifications';
import type { AppNotificationItem } from '../api/notifications';
import { getEcho } from '../lib/echo';
import { useAuth } from './useAuth';

const POLL_MS = 30_000;

export function useNotifications(enabled = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** When the last live notification arrived (for the bell's "new" animation). */
  const [arrived, setArrived] = useState<number | null>(null);
  const alive = useRef(true);

  const refreshCount = useCallback(() => {
    if (!enabled) return;
    getUnreadNotificationsCountApi().then((n) => { if (alive.current) setUnread(n); }).catch(() => {});
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const page = await getNotificationsApi({ per_page: 15 });
      if (!alive.current) return;
      setItems(page.data);
      setUnread(page.meta.unread);
    } catch {
      if (alive.current) setItems((prev) => prev ?? []);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    refreshCount();
    const t = window.setInterval(refreshCount, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refreshCount]);

  // Live: App\Notifications\AppNotification is broadcast on App.Models.User.{id} as it is written.
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    const onNotice = (n: Partial<AppNotificationItem> & { id?: string }) => {
      if (!alive.current || !n.id) return;
      const item: AppNotificationItem = {
        id: n.id, kind: n.kind ?? 'notice', title: n.title ?? 'Notification', body: n.body ?? '', link: n.link ?? null,
        meta: n.meta ?? {}, read_at: null, created_at: n.created_at ?? new Date().toISOString(),
      };
      setItems((list) => (list ? [item, ...list.filter((x) => x.id !== item.id)].slice(0, 15) : list));
      setUnread((u) => u + 1);
      setArrived(Date.now());
    };
    let channel: ReturnType<ReturnType<typeof getEcho>['private']> | null = null;
    try {
      channel = getEcho().private(`App.Models.User.${userId}`);
      channel.notification(onNotice);
    } catch {
      // No live connection: the poll above keeps the count right.
    }
    return () => {
      try { channel?.stopListeningForNotification(onNotice); } catch { /* already gone */ }
    };
  }, [enabled, userId]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)) ?? list);
    try {
      const res = await markNotificationReadApi(id);
      setUnread(res.meta.unread);
    } catch {
      refreshCount();
    }
  }, [refreshCount]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? list);
    setUnread(0);
    try { await markAllNotificationsReadApi(); } catch { refreshCount(); }
  }, [refreshCount]);

  return { unread, items, loading, arrived, load, markRead, markAllRead };
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
