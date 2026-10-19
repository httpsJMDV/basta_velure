import { useCallback, useEffect, useRef } from 'react';
import { getEcho } from '../lib/echo';
import { useAuth } from './useAuth';
import { usePolling } from './usePolling';

/** A notification as Reverb pushes it (the shape of an item of GET /notifications). */
export interface LiveNotice {
  id?: string;
  kind?: string;
  title?: string;
  link?: string | null;
}

/**
 * Runs `onNotice` the moment a notification for the signed-in person is pushed over Reverb on their private channel
 * (App.Models.User.{id}), the same push that lights up the bell. A rider hears this way about job offers, jobs added
 * to or taken off their list, and their account being verified or suspended.
 */
export function useLiveNotices(onNotice: (notice: LiveNotice) => void, enabled = true): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const saved = useRef(onNotice);
  useEffect(() => { saved.current = onNotice; }, [onNotice]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    const handler = (notice: LiveNotice) => saved.current(notice);
    let channel: ReturnType<ReturnType<typeof getEcho>['private']> | null = null;
    try {
      channel = getEcho().private(`App.Models.User.${userId}`);
      channel.notification(handler);
    } catch {
      // No live connection: the screen's own poll keeps it current.
    }
    return () => {
      try { channel?.stopListeningForNotification(handler); } catch { /* already gone */ }
    };
  }, [enabled, userId]);
}

/**
 * Keeps a screen current without a Refresh button. `refresh` runs at once when a notification is pushed to the
 * signed-in person over Reverb, when the tab or window comes back into view, and every `intervalMs` while the tab is
 * visible: the safety net for a dropped live connection and for changes nobody is notified about (a seller marking a
 * parcel ready, the hub scanning one in). `refresh` should be quiet: no spinner, and keep what is shown if it fails.
 * `paused` holds it, for example while a sheet is open over the list.
 */
export function useLiveRefresh(refresh: () => void, intervalMs: number, paused = false): void {
  const saved = useRef(refresh);
  const pausedRef = useRef(paused);
  useEffect(() => {
    saved.current = refresh;
    pausedRef.current = paused;
  }, [refresh, paused]);

  const run = useCallback(() => {
    if (!pausedRef.current && document.visibilityState === 'visible') saved.current();
  }, []);

  usePolling(run, intervalMs);
  useEffect(() => {
    window.addEventListener('focus', run);
    return () => window.removeEventListener('focus', run);
  }, [run]);
  useLiveNotices(run);
}
