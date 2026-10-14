import { useCallback, useEffect, useRef, useState } from 'react';
import { getHubChatThreadsApi } from '../api/client';

const HUB_UNREAD_POLL_MS = 15000;

/**
 * Total unread rider messages for the hub, for the badge on the Messages nav item. Polls every 15 seconds while the
 * tab is visible; `refresh` lets the Messages page update it right after the hub reads a thread.
 */
export function useHubChatUnread(enabled: boolean): { total: number; refresh: () => void } {
  const [total, setTotal] = useState(0);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await getHubChatThreadsApi({ per_page: 1 });
      setTotal(res.meta.unread_total);
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
