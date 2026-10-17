import { useEffect, useRef } from 'react';

/**
 * Runs `fn` every `ms` while `enabled`, skipping ticks while the tab is hidden, and once right away when the tab is
 * shown again. Chat uses it as the safety net under the websocket: fast while the socket is down, slow while it is up.
 */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    if (!enabled) return;
    const run = () => { if (document.visibilityState === 'visible') fnRef.current(); };
    const id = window.setInterval(run, ms);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, [ms, enabled]);
}

/** How often chat re-fetches: every few seconds without a live connection, now and then with one. */
export const CHAT_POLL = {
  thread: (live: boolean) => (live ? 20000 : 4000),
  inbox: (live: boolean) => (live ? 45000 : 10000),
};
