import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Copy, Home, Loader2, MapPinOff, Radio, Store, Warehouse, X } from 'lucide-react';
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

  const latest = tracking?.events[0] ?? null;
  const offTrack = tracking ? OFF_TRACK[tracking.status] : undefined;
  const showMap = tracking ? MAP_STATUSES.has(tracking.status) : false;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="tracking-title" className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">
      <header className="sticky top-0 z-[600] bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="tracking-title" ref={headingRef} tabIndex={-1} className="text-base font-black text-gray-900 focus:outline-none leading-tight">Track package</h2>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-mono text-[12px] font-semibold text-gray-500 truncate">{trackingNumber}</p>
              <button type="button" onClick={() => void copy()} className="shrink-0 inline-flex items-center gap-1 min-h-7 px-1.5 rounded-md text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100" aria-label="Copy the tracking number">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          {tracking && <StatusPill status={tracking.status} />}
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        {!tracking && !error && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading tracking...
          </div>
        )}

        {error && (
          <div role="alert" className="max-w-xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {tracking && (
          <>
            {/* Where the parcel is now, and how far along the trip it is */}
            <section className="rounded-2xl bg-white border border-gray-200/80 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Latest update{latest?.at ? ` · ${splitStamp(latest.at).day}, ${splitStamp(latest.at).time}` : ''}
                  </p>
                  <p className="mt-1 text-xl sm:text-2xl font-black text-gray-900 leading-tight">{latest?.title ?? 'Waiting for the first update'}</p>
                  {latest?.detail && <p className="mt-1 text-[13px] text-gray-600 max-w-xl">{latest.detail}</p>}
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-1 gap-x-6 gap-y-2 md:text-right shrink-0 text-[12.5px]">
                  {tracking.order_number && (
                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Order</dt>
                      <dd className="font-mono font-semibold text-gray-800">{tracking.order_number}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Route</dt>
                    <dd className="font-semibold text-gray-800">
                      {tracking.origin.name} <span aria-hidden="true" className="text-gray-400">&rarr;</span>
                      <span className="sr-only">to</span> {tracking.destination.barangay || tracking.destination.city}
                    </dd>
                  </div>
                </dl>
              </div>
              {offTrack ? (
                <p className={`flex items-center gap-2 px-4 sm:px-5 py-3 border-t text-[13px] font-semibold ${offTrack.cls}`}>
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {offTrack.text}
                </p>
              ) : (
                <Stepper status={tracking.status} />
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
              <div className={`lg:col-span-3 space-y-4 ${showMap ? 'lg:sticky lg:top-[84px]' : ''}`}>
                <CourierBanner tracking={tracking} now={now} />
                {showMap ? (
                  <div className="rounded-2xl overflow-hidden border border-gray-200/80 shadow-xs bg-white">
                    <TrackingMap tracking={tracking} className="h-72 sm:h-96 lg:h-[min(560px,calc(100vh-300px))]" />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center">
                    <MapPinOff className="w-6 h-6 mx-auto text-gray-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-gray-700">The map appears once the package is ready for pickup</p>
                    <p className="mt-0.5 text-xs text-gray-500">Then the courier can be followed from the shop to the door.</p>
                  </div>
                )}
                <RouteCard tracking={tracking} />
              </div>

              <section className="lg:col-span-2 rounded-2xl bg-white border border-gray-200/80 shadow-xs p-4 sm:p-5" aria-label="Tracking history">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-4">History</h3>
                {tracking.events.length === 0 ? (
                  <p className="text-sm text-gray-500">No updates yet.</p>
                ) : (
                  <Timeline events={tracking.events} trackingNumber={tracking.tracking_number} proofCount={tracking.proof.count} />
                )}
                <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-400">Times shown in your local time zone.</p>
              </section>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── The trip at a glance ─────────────────────────────────────────────────────

const STEPS: { label: string; statuses: string[] }[] = [
  { label: 'Ordered', statuses: ['PLACED', 'CONFIRMED', 'PREPARING'] },
  { label: 'Packed', statuses: ['READY_FOR_PICKUP'] },
  { label: 'Picked up', statuses: ['PICKED_UP'] },
  { label: 'At the hub', statuses: ['AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER'] },
  { label: 'Out for delivery', statuses: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'] },
  { label: 'Delivered', statuses: ['DELIVERED', 'COMPLETED', 'DISPUTED'] },
];

/** Statuses that leave the normal trip: shown as a notice instead of the steps. */
const OFF_TRACK: Record<string, { text: string; cls: string }> = {
  RETURNED: { text: 'The package is going back to the seller.', cls: 'bg-amber-50 border-amber-200 text-amber-900' },
  CANCELLED: { text: 'The order was cancelled. This package will not be delivered.', cls: 'bg-gray-50 border-gray-200 text-gray-700' },
};

function Stepper({ status }: { status: string }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.statuses.includes(status)));
  const failed = status === 'DELIVERY_FAILED';
  return (
    <ol className="grid grid-cols-6 border-t border-gray-100 bg-gray-50/60 px-2 sm:px-4 py-3.5" aria-label="Delivery progress">
      {STEPS.map((step, i) => {
        const done = i < at || (i === at && i === STEPS.length - 1);
        const current = i === at && !done;
        return (
          <li key={step.label} className="relative flex flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={`absolute top-[11px] right-1/2 w-full h-0.5 ${i <= at ? 'bg-emerald-500' : 'bg-gray-200'}`} aria-hidden="true" />}
            <span className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
              done ? 'bg-emerald-500 text-white' : current ? (failed ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-brand-red text-white ring-4 ring-rose-100') : 'bg-white border-2 border-gray-200 text-gray-400'
            }`}>
              {done ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[10px] sm:text-[11.5px] leading-tight ${current ? 'font-bold text-gray-900' : done ? 'font-semibold text-gray-600' : 'text-gray-400'}`}>
              {current && failed ? 'Attempt failed' : step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = OFF_TRACK[status] || status === 'DELIVERY_FAILED'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : ['DELIVERED', 'COMPLETED'].includes(status)
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-rose-50 text-brand-red border-rose-200';
  return <span className={`hidden sm:inline-flex shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-bold capitalize ${tone}`}>{status.toLowerCase().replace(/_/g, ' ')}</span>;
}

/** From, through and to: the places of the trip. */
function RouteCard({ tracking }: { tracking: ParcelTracking }) {
  const stops: { icon: React.ElementType; tone: string; label: string; place: ParcelTracking['origin'] }[] = [
    { icon: Store, tone: 'bg-amber-100 text-amber-700', label: 'From', place: tracking.origin },
    ...(tracking.hub ? [{ icon: Warehouse, tone: 'bg-blue-100 text-blue-700', label: 'Through', place: tracking.hub }] : []),
    { icon: Home, tone: 'bg-emerald-100 text-emerald-700', label: 'To', place: tracking.destination },
  ];
  return (
    <section className="rounded-2xl bg-white border border-gray-200/80 shadow-xs p-4 sm:p-5" aria-label="Route">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Route</h3>
      <ol className="relative space-y-4">
        <span className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-100" aria-hidden="true" />
        {stops.map(({ icon: Icon, tone, label, place }) => (
          <li key={label} className="relative flex items-start gap-3">
            <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white ${tone}`}><Icon className="w-4 h-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
              <p className="text-[13.5px] font-semibold text-gray-900">{place.name}</p>
              <p className="text-[12px] text-gray-500">{place.full_address || [place.barangay, place.city, place.province].filter(Boolean).join(', ')}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
