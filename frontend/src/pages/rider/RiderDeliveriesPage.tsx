import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { getRiderDeliveriesApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { RiderDeliveriesResponse, RiderDeliveryParcel, RiderDeliveryView } from '../../types';
import { PageHero, StateCard, TabBar } from './RiderUi';
import { BTN_PRIMARY } from './riderStyles';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import DeliveredSheet from './DeliveredSheet';
import DeliveryCollectScreen from './DeliveryCollectScreen';
import FailedSheet from './FailedSheet';
import type { RiderOutletContext } from './RiderLayout';
import RiderMessageControl from './RiderMessageControl';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import { ReturnJobs } from '../../components/rider/RiderWork';

/** The stop the rider is recording an outcome for. */
interface OutcomeTarget {
  kind: 'delivered' | 'failed';
  parcel: RiderDeliveryParcel;
}

const POLL_MS = 30000;

const EMPTY: RiderDeliveriesResponse = {
  data: [],
  hub: null,
  meta: { view: 'assigned', assigned_count: 0, out_for_delivery_count: 0 },
};

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

export default function RiderDeliveriesPage() {
  const { showToast } = useToast();
  const { chat } = useOutletContext<RiderOutletContext>();

  const [view, setView] = useState<RiderDeliveryView>('assigned');
  const [state, setState] = useState<RiderDeliveriesResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeTarget | null>(null);

  const viewRef = useRef<RiderDeliveryView>('assigned');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const outcomeTriggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const fetchDeliveries = useCallback(async (target: RiderDeliveryView, mode: 'initial' | 'silent') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await getRiderDeliveriesApi(target);
      if (viewRef.current !== target) return; // the rider switched segments meanwhile
      setState(res);
      setError(null);
    } catch (err: unknown) {
      if (mode === 'silent') return;
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load your deliveries.'
          : 'Could not load your deliveries.'
      );
    } finally {
      if (mode === 'initial') setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDeliveries(view, 'initial');
  }, [view, fetchDeliveries]);

  // Live: parcels the hub assigns are pushed over Reverb, with a poll as the fallback. Paused while the collect
  // screen or an outcome sheet is open, so nothing is reshuffled under the rider.
  useLiveRefresh(() => void fetchDeliveries(viewRef.current, 'silent'), POLL_MS, collecting || outcome !== null);

  const handleCopy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied((prev) => (prev === text ? null : prev)), 2000);
  };

  const switchView = (next: RiderDeliveryView) => {
    if (next === view) return;
    viewRef.current = next;
    setState((prev) => ({ ...prev, data: [] }));
    setView(next);
  };

  const openOutcome = (kind: OutcomeTarget['kind'], parcel: RiderDeliveryParcel, trigger: HTMLElement) => {
    outcomeTriggerRef.current = trigger;
    setOutcome({ kind, parcel });
  };

  // After a sheet closes, focus goes back to the button that opened it. When the stop was just
  // removed (success) that button is gone, so focus lands on the list instead.
  const closeOutcome = () => {
    setOutcome(null);
    requestAnimationFrame(() => {
      const el = outcomeTriggerRef.current;
      if (el && document.contains(el)) el.focus();
      else panelRef.current?.focus();
    });
  };

  const removeStop = (trackingNumber: string) => {
    setState((prev) => ({
      ...prev,
      data: prev.data
        .map((g) => ({ ...g, parcels: g.parcels.filter((p) => p.tracking_number !== trackingNumber) }))
        .filter((g) => g.parcels.length > 0),
      meta: { ...prev.meta, out_for_delivery_count: Math.max(prev.meta.out_for_delivery_count - 1, 0) },
    }));
  };

  const handleOutcomeSuccess = (message: string, trackingNumber: string) => {
    removeStop(trackingNumber);
    showToast(message, 'success');
    closeOutcome();
    void fetchDeliveries(viewRef.current, 'silent');
  };

  // 404 / 409 from the server: the stop is not (or no longer) out for delivery. Say so and resync.
  const handleOutcomeConflict = (message: string) => {
    showToast(message, 'error');
    closeOutcome();
    void fetchDeliveries(viewRef.current, 'silent');
  };

  const closeCollect = () => {
    setCollecting(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const { assigned_count: assignedCount, out_for_delivery_count: outCount } = state.meta;
  let stopNumber = 0;

  return (
    <div className="pb-4 space-y-4">
      <PageHero
        icon={Truck}
        title="Deliveries"
        subtitle="Collect your parcels at the hub, then deliver them."
      />

      <ReturnJobs />

      <TabBar
        label="Delivery views"
        idPrefix="deliveries-tab"
        panelId="deliveries-panel"
        value={view}
        onChange={switchView}
        tabs={[
          { key: 'assigned', label: 'To collect', count: assignedCount },
          { key: 'out_for_delivery', label: 'Out for delivery', count: outCount },
        ]}
      />

      <div
        id="deliveries-panel"
        ref={panelRef}
        tabIndex={-1}
        role="tabpanel"
        aria-labelledby={`deliveries-tab-${view}`}
        className="space-y-4 focus:outline-none"
      >
        {loading ? (
          <div className="space-y-4 animate-pulse" aria-label="Loading deliveries">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl bg-white border border-gray-200/80" />
            ))}
          </div>
        ) : error ? (
          <StateCard icon={AlertCircle} tone="red" alert title="Could not load your deliveries" message={error}>
            <button type="button" onClick={() => void fetchDeliveries(view, 'initial')} className={BTN_PRIMARY}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </StateCard>
        ) : state.data.length === 0 ? (
          <StateCard
            icon={Package}
            title={view === 'assigned' ? 'Nothing assigned to you yet' : 'Nothing out for delivery'}
            message={
              view === 'assigned'
                ? 'When your hub assigns parcels to you, they appear here so you can collect them.'
                : 'Parcels you start from the To collect tab appear here in route order.'
            }
          />
        ) : view === 'assigned' ? (
          <>
            {state.hub && (
              <section className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs space-y-1.5" aria-label="Collect from hub">
                <p className="flex items-center gap-2 text-sm font-black text-gray-900">
                  <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  Collect from {state.hub.hub_name}
                </p>
                <p className="flex items-start gap-2 text-xs text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{state.hub.full_address}</span>
                </p>
                <a
                  href={mapsUrl(`${state.hub.hub_name}, ${state.hub.full_address}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-red"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </section>
            )}

            {state.data.map((group) => (
              <section key={group.barangay_code} className="space-y-2" aria-label={group.barangay_name}>
                <h2 className="text-sm font-black text-gray-900">
                  {group.barangay_name || 'Unnamed barangay'}
                  {group.city && <span className="font-semibold text-gray-500">, {group.city}</span>}
                  <span className="ml-2 text-xs font-bold text-gray-500">
                    {group.parcels.length} {group.parcels.length === 1 ? 'parcel' : 'parcels'}
                  </span>
                </h2>
                <ul className="bg-white border border-gray-200/80 rounded-2xl shadow-xs divide-y divide-gray-100">
                  {group.parcels.map((p) => (
                    <li key={p.tracking_number} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-mono text-sm font-bold text-gray-900 break-all">{p.tracking_number}</p>
                        <p className="text-xs text-gray-600">{p.recipient.name}</p>
                        {p.item_summary && <p className="text-[11px] text-gray-500">{p.item_summary}</p>}
                      </div>
                      <RiderMessageControl
                        trackingNumber={p.tracking_number}
                        phase="delivery"
                        unread={chat.byTracking[p.tracking_number] ?? 0}
                        unreadByCounterpart={chat.byTrackingCounterpart[p.tracking_number]}
                        onActivity={chat.refresh}
                        className="shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <div className="sticky bottom-[4.75rem] lg:bottom-3">
              <button
                type="button"
                ref={triggerRef}
                onClick={() => setCollecting(true)}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold shadow-lg"
              >
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                Collect at hub ({assignedCount})
              </button>
            </div>
          </>
        ) : (
          state.data.map((group) => (
            <section key={group.barangay_code} className="space-y-3" aria-label={group.barangay_name}>
              <h2 className="text-sm font-black text-gray-900">
                {group.barangay_name || 'Unnamed barangay'}
                {group.city && <span className="font-semibold text-gray-500">, {group.city}</span>}
              </h2>
              {group.parcels.map((p: RiderDeliveryParcel) => {
                stopNumber += 1;
                return (
                  <article
                    key={p.tracking_number}
                    className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs space-y-3"
                    aria-label={`Stop ${stopNumber}, ${p.recipient.name}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="w-9 h-9 rounded-full bg-brand-red text-white text-sm font-black flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        {stopNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-gray-500">
                          Stop {stopNumber}
                          {p.attempt !== undefined && p.max_attempts !== undefined && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${p.attempt > 1 ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'}`}>
                              Attempt {p.attempt} of {p.max_attempts}
                            </span>
                          )}
                        </p>
                        {p.previous_failure && <p className="text-[11px] text-amber-800">Last try: {p.previous_failure}</p>}
                        <p className="flex items-center gap-1.5 text-base font-black text-gray-900">
                          <User className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                          <span className="truncate">{p.recipient.name}</span>
                        </p>
                      </div>
                    </div>

                    {p.cod_amount !== null ? (
                      <div
                        role="status"
                        className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 text-amber-950"
                      >
                        <Banknote className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <span className="text-base font-black">Collect {formatPeso(p.cod_amount)}</span>
                        <span className="text-xs font-semibold">cash on delivery</span>
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                        <Check className="w-4 h-4" aria-hidden="true" />
                        Prepaid, nothing to collect
                      </p>
                    )}

                    <a
                      href={telHref(p.recipient.phone)}
                      className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900"
                    >
                      <Phone className="w-4 h-4 text-gray-500" aria-hidden="true" />
                      {p.recipient.phone}
                    </a>

                    <div className="space-y-1">
                      <p className="flex items-start gap-2 text-sm text-gray-800">
                        <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{p.recipient.address.full_address}</span>
                      </p>
                      <a
                        href={mapsUrl(p.recipient.address.full_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-red"
                      >
                        <span>Open in Maps</span>
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      </a>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-gray-500">
                          {p.item_count} {p.item_count === 1 ? 'item' : 'items'}
                          {p.item_summary && `: ${p.item_summary}`}
                        </p>
                        <p className="font-mono text-xs font-bold text-gray-800 break-all">{p.tracking_number}</p>
                      </div>
                      <TrackPackageButton trackingNumber={p.tracking_number} label="Map" className="shrink-0" />
                      <button
                        type="button"
                        onClick={() => handleCopy(p.tracking_number)}
                        aria-label={`Copy tracking number ${p.tracking_number}`}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 shrink-0"
                      >
                        {copied === p.tracking_number ? (
                          <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    <RiderMessageControl
                      trackingNumber={p.tracking_number}
                      phase="delivery"
                      unread={chat.byTracking[p.tracking_number] ?? 0}
                      unreadByCounterpart={chat.byTrackingCounterpart[p.tracking_number]}
                      onActivity={chat.refresh}
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => openOutcome('delivered', p, e.currentTarget)}
                        disabled={outcome !== null}
                        className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        Delivered
                      </button>
                      <button
                        type="button"
                        onClick={(e) => openOutcome('failed', p, e.currentTarget)}
                        disabled={outcome !== null}
                        className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-bold disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        Delivery failed
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ))
        )}
      </div>

      {outcome?.kind === 'delivered' && (
        <DeliveredSheet
          parcel={outcome.parcel}
          onClose={closeOutcome}
          onSuccess={(res) =>
            handleOutcomeSuccess(`Delivery recorded for ${outcome.parcel.recipient.name}.${res.pay ? ` You earned ₱${res.pay}.` : ''}`, res.tracking_number)
          }
          onConflict={handleOutcomeConflict}
        />
      )}

      {outcome?.kind === 'failed' && (
        <FailedSheet
          parcel={outcome.parcel}
          onClose={closeOutcome}
          onSuccess={(res) =>
            handleOutcomeSuccess(
              res.return_to_sender
                ? `Marked failed: ${res.reason.label}. No more attempts: the parcel goes back to the seller.`
                : `Marked failed: ${res.reason.label}. Attempt ${res.delivery_attempts} of ${res.max_attempts ?? 3}; your company will reschedule it.`,
              res.tracking_number,
            )
          }
          onConflict={handleOutcomeConflict}
        />
      )}

      {collecting && (
        <DeliveryCollectScreen
          groups={state.data}
          hub={state.hub}
          onClose={closeCollect}
          onChanged={() => void fetchDeliveries(viewRef.current, 'silent')}
          onDone={() => {
            setCollecting(false);
            switchView('out_for_delivery');
          }}
        />
      )}
    </div>
  );
}
