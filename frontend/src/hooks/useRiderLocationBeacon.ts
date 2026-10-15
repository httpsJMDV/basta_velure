import { useCallback, useEffect, useRef, useState } from 'react';
import { getRiderLocationStatusApi, postRiderLocationApi } from '../api/client';
import { useLivePolling } from './useLivePolling';

export type BeaconState =
  /** The rider has nothing to carry, so nothing is asked or sent. */
  | 'idle'
  /** Waiting for the first position (or the permission prompt). */
  | 'starting'
  /** Positions are being sent. */
  | 'sharing'
  /** The rider (or the phone) refused location. */
  | 'denied'
  /** Allowed, but the phone cannot find itself right now. */
  | 'unavailable'
  /** This browser has no location support. */
  | 'unsupported'
  /** Browsers only give location to pages opened over HTTPS (or localhost). */
  | 'insecure';

const SEND_EVERY_MS = 5_000;
const STATUS_EVERY_MS = 30_000;

/**
 * Shares the courier's position while they have a parcel to collect or carry. It asks the server (every 30 seconds)
 * whether sharing is required, and only while it is does it watch the phone's location and send the latest point
 * every few seconds. Nothing is sent, and nothing is asked, for a rider with an empty list.
 *
 * A browser can only report a position while the page is open, so the screen is kept awake where the phone allows it.
 */
export function useRiderLocationBeacon(enabled: boolean): {
  required: boolean;
  activeParcels: number;
  state: BeaconState;
  /** Triggers the permission prompt (it has to come from a tap on most phones). */
  ask: () => void;
  lastSentAt: Date | null;
} {
  const [required, setRequired] = useState(false);
  const [activeParcels, setActiveParcels] = useState(0);
  const [state, setState] = useState<BeaconState>('idle');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);

  const lastSent = useRef(0);
  const sending = useRef(false);

  const loadStatus = useCallback(
    async () => {
      if (!enabled) return;
      try {
        const status = await getRiderLocationStatusApi();
        setRequired(status.sharing_required);
        setActiveParcels(status.active_parcels);
      } catch {
        // Keep the last known answer; a blip must not unlock or lock the screens.
      }
    },
    [enabled]
  );
  const { refresh } = useLivePolling(loadStatus, STATUS_EVERY_MS);

  useEffect(() => {
    if (!enabled || !required) {
      setState('idle');
      return;
    }
    if (!('geolocation' in navigator)) {
      setState('unsupported');
      return;
    }
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }

    setState('starting');
    let wakeLock: { release: () => Promise<void> } | null = null;
    const keepAwake = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
        wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        // Not supported or refused; sharing still works while the page stays open.
      }
    };
    void keepAwake();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void keepAwake();
    };
    document.addEventListener('visibilitychange', onVisible);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState('sharing');
        const now = Date.now();
        if (sending.current || now - lastSent.current < SEND_EVERY_MS) return;
        sending.current = true;
        lastSent.current = now;
        void postRiderLocationApi({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading !== null && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        })
          .then(() => setLastSentAt(new Date()))
          .catch(() => {
            // The next position retries; if the rider's list emptied the next status check turns sharing off.
            lastSent.current = 0;
            refresh();
          })
          .finally(() => {
            sending.current = false;
          });
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLock?.release().catch(() => undefined);
    };
    // `attempt` restarts the watch when the rider taps "Try again".
  }, [enabled, required, attempt, refresh]);

  const ask = useCallback(() => setAttempt((n) => n + 1), []);

  return { required, activeParcels, state, ask, lastSentAt };
}
