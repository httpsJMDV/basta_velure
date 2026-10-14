import { useCallback, useEffect, useRef, useState } from 'react';
import { getRiderChatUnreadApi } from '../api/client';
import type { RiderChatCounterpart } from '../types';

const UNREAD_POLL_MS = 10000;

export interface RiderChatUnread {
  /** Unread messages across all of the rider's threads. */
  total: number;
  /** Unread messages per tracking number, for the badges on stop cards. */
  byTracking: Record<string, number>;
  /** Unread messages per tracking number and counterpart. */
  byTrackingCounterpart: Record<string, Partial<Record<RiderChatCounterpart, number>>>;
  refresh: () => void;
}

/**
 * Polls the rider's unread summary (a small payload: only threads with unread messages) every 10 seconds while the
 * tab is visible. Mounted once in the rider layout and shared with the pages through the outlet context.
 */
export function useRiderChatUnread(enabled: boolean): RiderChatUnread {
  const [total, setTotal] = useState(0);
  const [byTracking, setByTracking] = useState<Record<string, number>>({});
  const [byTrackingCounterpart, setByTrackingCounterpart] = useState<RiderChatUnread['byTrackingCounterpart']>({});
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await getRiderChatUnreadApi();
      const perTracking: Record<string, number> = {};
      const perCounterpart: RiderChatUnread['byTrackingCounterpart'] = {};
      for (const item of res.data) {
        if (!item.tracking_number) continue;
        perTracking[item.tracking_number] = (perTracking[item.tracking_number] ?? 0) + item.unread;
        perCounterpart[item.tracking_number] = { ...perCounterpart[item.tracking_number], [item.counterpart]: item.unread };
      }
      setTotal(res.meta.unread_total);
      setByTracking(perTracking);
      setByTrackingCounterpart(perCounterpart);
    } catch {
      // A failed badge refresh is not worth interrupting the rider; the next poll tries again.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void load();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void load(), UNREAD_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
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
  }, [enabled, load]);

  const refresh = useCallback(() => void load(), [load]);

  return { total, byTracking, byTrackingCounterpart, refresh };
}

/** Unread messages across several parcels, for a card that stands for a group of them. */
export function groupUnread(
  chat: RiderChatUnread,
  trackingNumbers: string[]
): { total: number; byCounterpart: Partial<Record<RiderChatCounterpart, number>> } {
  let total = 0;
  const byCounterpart: Partial<Record<RiderChatCounterpart, number>> = {};
  for (const tracking of trackingNumbers) {
    total += chat.byTracking[tracking] ?? 0;
    for (const [counterpart, count] of Object.entries(chat.byTrackingCounterpart[tracking] ?? {}) as [RiderChatCounterpart, number][]) {
      byCounterpart[counterpart] = (byCounterpart[counterpart] ?? 0) + count;
    }
  }
  return { total, byCounterpart };
}
