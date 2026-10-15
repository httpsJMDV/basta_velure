import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Copy, Loader2, MapPinOff, Radio, X } from 'lucide-react';
import { getDeliveryProofBlobUrl, getParcelTrackingApi } from '../../api/client';
import { useLivePolling } from '../../hooks/useLivePolling';
import type { ParcelTracking, TrackingEvent } from '../../types';
import TrackingMap from './TrackingMap';

const MAP_STATUSES = new Set([
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'AT_SORTING_CENTER',
  'SORTED',
  'ASSIGNED_TO_RIDER',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'DELIVERY_FAILED',
]);

function splitStamp(iso: string | null): { day: string; time: string } {
  if (!iso) return { day: '', time: '' };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`;
}

/** The two delivery photos, fetched through the authorized endpoint (an <img src> cannot send the login token). */
function ProofImages({ trackingNumber, count }: { trackingNumber: string; count: number }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    const wanted: Array<1 | 2> = count >= 2 ? [1, 2] : [1];
    void Promise.all(wanted.map((n) => getDeliveryProofBlobUrl(trackingNumber, n)))
      .then((list) => {
        made.push(...list);
        if (cancelled) list.forEach((u) => URL.revokeObjectURL(u));
        else setUrls(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [trackingNumber, count]);

  if (failed) return <p className="mt-2 text-xs text-gray-500">The delivery photos could not be loaded.</p>;
  if (urls.length === 0) return <div className="mt-3 h-28 rounded-xl bg-gray-100 animate-pulse" aria-hidden="true" />;

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl border border-gray-200">
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setZoom(u)} className="block bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red" aria-label={`Open delivery photo ${i + 1}`}>
            <img src={u} alt={i === 0 ? 'The parcel handed over' : 'The delivery address'} className="w-full h-32 object-cover" />
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">Photos from the courier</p>

      {zoom && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Delivery photo" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Delivery proof, enlarged" className="max-w-full max-h-full rounded-xl" />
          <button type="button" onClick={() => setZoom(null)} aria-label="Close photo" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/90 flex items-center justify-center">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function Timeline({ events, trackingNumber, proofCount }: { events: TrackingEvent[]; trackingNumber: string; proofCount: number }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const first = i === 0;
        const stamp = splitStamp(e.at);
        return (
          <li key={`${e.status}-${e.at}-${i}`} className="relative grid grid-cols-[4.25rem_1.5rem_1fr] gap-x-2 pb-6 last:pb-1">
            {i < events.length - 1 && <span className="absolute left-[calc(4.25rem+0.5rem+0.75rem-1px)] top-5 bottom-0 w-0.5 bg-gray-200" aria-hidden="true" />}
            <div className={`text-right text-[11px] leading-tight pt-0.5 ${first ? 'text-gray-900' : 'text-gray-500'}`}>
              <p className="font-semibold">{stamp.day}</p>
              <p>{stamp.time}</p>
            </div>
            <div className="relative flex justify-center pt-0.5">
              {first ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 bg-white relative z-10" aria-hidden="true" />
              ) : (
                <span className="w-2.5 h-2.5 mt-1.5 rounded-full bg-gray-300 ring-4 ring-white relative z-10" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-sm ${first ? 'font-black text-gray-900' : 'font-semibold text-gray-600'}`}>{e.title}</p>
              {e.detail && <p className={`mt-0.5 text-xs leading-relaxed ${first ? 'text-gray-700' : 'text-gray-500'}`}>{e.detail}</p>}
              {e.proof && proofCount > 0 && <ProofImages trackingNumber={trackingNumber} count={proofCount} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CourierBanner({ tracking, now }: { tracking: ParcelTracking; now: number }) {
  const { courier, status, origin, hub } = tracking;
  if (courier.state === 'not_with_courier') return null;

  const who = courier.name ?? 'The courier';
  const doing =
    courier.leg === 'delivery'
      ? 'is on the way with the package'
      : status === 'READY_FOR_PICKUP'
        ? `is on the way to collect it from ${origin.name}`
        : `is bringing it to ${hub?.name ?? 'the hub'}`;

  if (courier.state === 'live' && courier.location) {
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
        <Radio className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" aria-hidden="true" />
        <p className="text-xs text-emerald-900">
          <span className="font-bold">{who}</span> {doing}. <span className="text-emerald-800/80">Updated {ago(courier.location.updated_at, now)}.</span>
        </p>
      </div>
    );
  }
  if (courier.state === 'stale' && courier.location) {
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
        <AlertCircle className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-900">
          Last seen {ago(courier.location.updated_at, now)}. Waiting for <span className="font-bold">{who}</span> to update their location.
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5">
      <MapPinOff className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" aria-hidden="true" />
      <p className="text-xs text-gray-700">
        <span className="font-bold">{who}</span> has the package but is not sharing their location right now.
      </p>
    </div>
  );
}

interface TrackingSheetProps {
  trackingNumber: string;
  onClose: () => void;
}

/**
 * "Track package": the timeline, the map and the courier's live position, for the buyer, seller, hub, rider and admin.
 * It refreshes itself (every 5 seconds while a courier is live, otherwise every 20) so the truck keeps moving.
 */
export default function TrackingSheet({ trackingNumber, onClose }: TrackingSheetProps) {
  const [tracking, setTracking] = useState<ParcelTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const load = useCallback(
    async (silent: boolean) => {
      try {
        setTracking(await getParcelTrackingApi(trackingNumber));
        setError(null);
      } catch (err: unknown) {
        // A refresh that fails keeps what is on screen; only the first load shows an error.
        if (!silent) {
          setError(axios.isAxiosError(err) && err.response?.status === 404 ? 'This parcel could not be found.' : 'Tracking could not be loaded. Check your connection and try again.');
        }
      }
    },
    [trackingNumber]
  );

  const live = tracking?.courier.state === 'live';
  useLivePolling(load, live ? 5_000 : 20_000);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the number is on screen anyway.
    }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="tracking-title" className="fixed inset-0 z-[60] bg-gray-100 overflow-y-auto">
      <div className="max-w-xl mx-auto min-h-full flex flex-col bg-gray-50 sm:border-x border-gray-200">
        <header className="sticky top-0 z-[600] bg-white border-b border-gray-200 px-3 py-2.5 flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 id="tracking-title" ref={headingRef} tabIndex={-1} className="flex-1 text-center text-base font-black text-gray-900 focus:outline-none pr-11">
            Track package
          </h2>
        </header>

        <div className="flex-1 p-4 space-y-4">
          {!tracking && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500" role="status">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading tracking...
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {tracking && (
            <>
              <section className="rounded-2xl bg-white border border-gray-200/80 shadow-xs p-4 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-sm font-bold text-gray-900 break-all">{tracking.tracking_number}</p>
                  <button type="button" onClick={() => void copy()} className="shrink-0 inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg text-[11px] font-bold text-gray-600 hover:bg-gray-100">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {tracking.order_number && <p className="text-xs text-gray-500">Order {tracking.order_number}</p>}
                <p className="text-xs text-gray-500">
                  {tracking.origin.name} <span aria-hidden="true">&rarr;</span> {tracking.destination.barangay || tracking.destination.city}
                </p>
              </section>

              <CourierBanner tracking={tracking} now={now} />

              {MAP_STATUSES.has(tracking.status) && <TrackingMap tracking={tracking} className="h-72 sm:h-80" />}

              <section className="rounded-2xl bg-white border border-gray-200/80 shadow-xs p-4" aria-label="Tracking history">
                {tracking.events.length === 0 ? (
                  <p className="text-sm text-gray-500">No updates yet.</p>
                ) : (
                  <Timeline events={tracking.events} trackingNumber={tracking.tracking_number} proofCount={tracking.proof.count} />
                )}
                <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-400">Times shown in your local time zone.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
