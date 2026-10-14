import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { ChatMessage, ThreadAdapter, ThreadMeta } from '../types';

/** How often an open conversation asks the server for new messages. */
export const THREAD_POLL_MS = 3000;

export const THREAD_MESSAGE_MAX = 1000;

const OPEN: ThreadMeta = { is_closed: false, can_send: true, closed_message: null };

interface Options {
  /** The current user, to tell their own messages from the other side's. */
  currentUserId: number;
  /** Polling runs only while true (the sheet or pane is on screen). */
  active?: boolean;
  /** What the thread list already knows, so a closed thread never flashes an enabled composer. */
  initialMeta?: ThreadMeta;
  /** Called after a send, and when a poll brings messages from the other side. */
  onActivity?: () => void;
}

export interface ThreadMessagesState {
  messages: ChatMessage[];
  meta: ThreadMeta;
  /** First load in progress. */
  loading: boolean;
  /** First load failed; `reload` retries. */
  loadError: string | null;
  /** Background polls have been failing; the thread still shows what it has. */
  offline: boolean;
  sending: boolean;
  sendError: string | null;
  send: (body: string) => Promise<boolean>;
  reload: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'No connection. Check your network and try again.';
    const data = err.response.data as { message?: string; errors?: Record<string, string[]> } | undefined;
    const firstField = data?.errors ? Object.values(data.errors).flat()[0] : undefined;
    return firstField || data?.message || fallback;
  }
  return fallback;
}

/**
 * Loads a thread's messages, then polls for newer ones by id every 3 seconds while `active`.
 * Polling pauses while the browser tab is hidden. Messages are deduplicated by id, so a message returned by a
 * send and by the next poll appears once.
 */
export function useThreadMessages(adapter: ThreadAdapter, options: Options): ThreadMessagesState {
  const { currentUserId, active = true, initialMeta, onActivity } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<ThreadMeta>(initialMeta ?? OPEN);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const adapterRef = useRef(adapter);
  const onActivityRef = useRef(onActivity);
  const lastIdRef = useRef(0);
  const markedUpToRef = useRef(0);
  const busyRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    adapterRef.current = adapter;
    onActivityRef.current = onActivity;
  }, [adapter, onActivity]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length === 0 ? prev : [...prev, ...fresh].sort((a, b) => a.id - b.id);
    });
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
  }, []);

  /** Tells the server the other side's messages were seen (rider and hub endpoints only). */
  const markSeen = useCallback(
    (incoming: ChatMessage[]) => {
      const mark = adapterRef.current.markRead;
      if (!mark) return;
      const unseen = incoming.filter((m) => m.sender_id !== currentUserId && m.id > markedUpToRef.current);
      if (unseen.length === 0) return;
      markedUpToRef.current = Math.max(...unseen.map((m) => m.id));
      void mark().then(() => onActivityRef.current?.()).catch(() => {
        // Try again with the next batch.
        markedUpToRef.current = 0;
      });
    },
    [currentUserId]
  );

  // First load, and again when `reload` is called or the adapter (the thread) changes.
  useEffect(() => {
    let cancelled = false;
    lastIdRef.current = 0;
    markedUpToRef.current = 0;
    setMessages([]);
    setLoading(true);
    setLoadError(null);
    setOffline(false);

    adapter
      .fetchMessages()
      .then((res) => {
        if (cancelled) return;
        setMessages(res.data);
        lastIdRef.current = res.data.reduce((max, m) => Math.max(max, m.id), 0);
        setMeta(res.meta);
        markSeen(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not load this conversation.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, reloadTick, markSeen]);

  // Poll for newer messages while the conversation is on screen and the tab is visible.
  useEffect(() => {
    if (!active || loading || loadError) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (pollingRef.current || busyRef.current || document.visibilityState !== 'visible') return;
      pollingRef.current = true;
      try {
        const res = await adapterRef.current.fetchMessages(lastIdRef.current || undefined);
        setOffline(false);
        setMeta(res.meta);
        if (res.data.length > 0) {
          merge(res.data);
          markSeen(res.data);
          if (res.data.some((m) => m.sender_id !== currentUserId)) onActivityRef.current?.();
        }
      } catch {
        setOffline(true);
      } finally {
        pollingRef.current = false;
      }
    };

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void poll(), THREAD_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, loading, loadError, currentUserId, merge, markSeen]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (text === '' || busyRef.current) return false;

      busyRef.current = true;
      setSending(true);
      setSendError(null);
      try {
        const message = await adapterRef.current.sendMessage(text);
        merge([message]);
        onActivityRef.current?.();
        return true;
      } catch (err: unknown) {
        setSendError(errorMessage(err, 'The message could not be sent.'));
        // 409 means the parcel just moved on: ask the server for the closed state right away.
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          try {
            const res = await adapterRef.current.fetchMessages(lastIdRef.current || undefined);
            setMeta(res.meta);
            merge(res.data);
          } catch {
            setMeta((m) => ({ ...m, is_closed: true, can_send: false }));
          }
        }
        return false;
      } finally {
        busyRef.current = false;
        setSending(false);
      }
    },
    [merge]
  );

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  return { messages, meta, loading, loadError, offline, sending, sendError, send, reload };
}
