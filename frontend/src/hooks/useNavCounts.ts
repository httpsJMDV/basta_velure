import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveRefresh } from './useLiveNotices';

const POLL_MS = 60_000;

/**
 * The sidebar's numbers for one portal. Read when the page changes (an approval on one page shows when the person
 * moves on), when the tab comes back into view, on a pushed notification, and once a minute while visible. A failed
 * read keeps the last numbers. `null` until the first answer, so badges stay hidden instead of flashing 0.
 */
export function useNavCounts<T>(fetcher: () => Promise<T>, enabled = true): { counts: T | null; refresh: () => void } {
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<T | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetcher().then(setCounts).catch(() => { /* keep what is shown */ });
  }, [fetcher, enabled]);

  useEffect(() => { refresh(); }, [refresh, pathname]);
  useLiveRefresh(refresh, POLL_MS, !enabled);

  return { counts, refresh };
}
