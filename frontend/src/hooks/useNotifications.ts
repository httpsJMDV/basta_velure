// The signed-in person's in-app notifications: the unread count (polled), the latest items (loaded when the bell
// opens), and the read actions. Opening one marks it read; "Mark all as read" clears the count.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getNotificationsApi, getUnreadNotificationsCountApi, markAllNotificationsReadApi, markNotificationReadApi,
} from '../api/notifications';
import type { AppNotificationItem } from '../api/notifications';

const POLL_MS = 30_000;

export function useNotifications(enabled = true) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
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
    return () => { alive.current = false; window.clearInterval(t); };
  }, [enabled, refreshCount]);

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

  return { unread, items, loading, load, markRead, markAllRead };
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
