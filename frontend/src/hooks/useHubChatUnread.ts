import { useCallback, useEffect, useRef, useState } from 'react';
import { getHubChatThreadsApi } from '../api/client';
import { getHubCourierThreadApi } from '../api/courierChat';

const HUB_UNREAD_POLL_MS = 15000;

/**
 * Total unread messages for the hub (its riders and its courier company), for the badge on the Messages nav item. Polls every 15 seconds while the
 * tab is visible; `refresh` lets the Messages page update it right after the hub reads a thread.
 */
export function useHubChatUnread(enabled: boolean): { total: number; refresh: () => void } {
  const [total, setTotal] = useState(0);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [riders, courier] = await Promise.all([getHubChatThreadsApi({ per_page: 1 }), getHubCourierThreadApi().catch(() => null)]);
      setTotal(riders.meta.unread_total + (courier?.unread ?? 0));
    } catch {
      // A missed badge refresh is not worth an error; the next poll tries again.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(tick, HUB_UNREAD_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, load]);

  return { total, refresh: () => void load() };
}
