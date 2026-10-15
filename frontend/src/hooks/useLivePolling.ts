import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a screen live without a refresh button: runs `load` on mount, every `intervalMs` while the tab is visible, when
 * the tab becomes visible again and when the window regains focus. `load` should be quiet (no spinner) when called
 * with `true`. `lastUpdated` is when the latest refresh finished, for the "Live" stamp.
 */
export function useLivePolling(load: (silent: boolean) => Promise<unknown> | void, intervalMs: number): { lastUpdated: Date | null; refresh: () => void } {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loadRef = useRef(load);
  const inFlight = useRef(false);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const run = useCallback(async (silent: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await loadRef.current(silent);
      setLastUpdated(new Date());
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void run(false);
    const tick = () => {
      if (document.visibilityState === 'visible') void run(true);
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [run, intervalMs]);

  // Stable, so a screen can list it as an effect dependency without the effect re-running every render.
  const refresh = useCallback(() => void run(true), [run]);

  return { lastUpdated, refresh };
}
