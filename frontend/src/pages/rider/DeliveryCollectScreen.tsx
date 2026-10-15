import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  RefreshCw,
  Truck,
  X,
} from 'lucide-react';
import TrackingScanner from '../../components/logistics/TrackingScanner';
import { startRiderDeliveryApi } from '../../api/client';
import type { RiderDeliveryGroup, RiderHubDropoff, RiderStartDeliveryResponse } from '../../types';

interface DeliveryCollectScreenProps {
  /** The rider's assigned (not yet collected) parcels, grouped by barangay. */
  groups: RiderDeliveryGroup[];
  hub: RiderHubDropoff | null;
  /** Close without finishing (back arrow / Escape). */
  onClose: () => void;
  /** Called after the rider dismisses the success state. */
  onDone: () => void;
  /** Called after a start attempt changed or may have changed server state. */
  onChanged: () => void;
}

function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function DeliveryCollectScreen({ groups, hub, onClose, onDone, onChanged }: DeliveryCollectScreenProps) {
  // Snapshot of what is expected, taken when the screen opens, so a background refresh cannot reshuffle the checklist.
  const [expectedGroups] = useState(groups);
  const expected = expectedGroups.flatMap((g) => g.parcels.map((p) => p.tracking_number));
  const total = expected.length;

  const [scanned, setScanned] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RiderStartDeliveryResponse | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const scannedRef = useRef<string[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current && !result) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, result]);

  // Matching happens against the list already loaded: nothing to look up on the server.
  const handleScan = useCallback(
    (code: string) => {
      if (busyRef.current) return;
      setConfirmError(null);
      setItemErrors([]);

      if (scannedRef.current.includes(code)) {
        setScanError(`${code} is already ticked off.`);
        return;
      }
      if (!expected.includes(code)) {
        setScanError(`${code} is not assigned to you.`);
        return;
      }
      setScanError(null);
      scannedRef.current = [...scannedRef.current, code];
      setScanned(scannedRef.current);
    },
    // `expected` is derived from a state snapshot that never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expectedGroups]
  );

  const handleStart = async () => {
    if (busyRef.current || scanned.length === 0) return;

    busyRef.current = true;
    setSubmitting(true);
    setConfirmError(null);
    setItemErrors([]);
    const sent = scanned;
    try {
      const res = await startRiderDeliveryApi(sent);
      setResult(res);
      onChanged();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422 && err.response.data?.errors) {
        const errors = err.response.data.errors as Record<string, string[]>;
        const failed = new Set<string>();
        const lines = Object.entries(errors).map(([key, msgs]) => {
          const index = Number(key.split('.')[1]);
          const code = Number.isInteger(index) ? sent[index] : undefined;
          if (code) failed.add(code);
          return code ? `${code}: ${msgs[0]}` : msgs[0];
        });
        // Untick the codes the server rejected so the rest can still be started.
        scannedRef.current = scannedRef.current.filter((code) => !failed.has(code));
        setScanned(scannedRef.current);
        setItemErrors(lines);
        setConfirmError(err.response.data.message || 'Some parcels could not be started.');
        onChanged();
      } else {
        setConfirmError(
          axios.isAxiosError(err) && err.response?.data?.message
            ? err.response.data.message
            : 'Could not start the delivery. Check your connection and try again.'
        );
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const remaining = result ? Math.max(total - result.started_count, 0) : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collect-title"
      className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto"
    >
      <div className="max-w-xl mx-auto min-h-full flex flex-col bg-gray-50 sm:border-x border-gray-200">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          {!result && (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Back to deliveries"
              className="w-11 h-11 -ml-2 inline-flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2
            id="collect-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-black text-gray-900 focus:outline-none"
          >
            {result ? 'Delivery started' : 'Collect at hub'}
          </h2>
        </header>

        {result ? (
          <div className="flex-1 p-4 space-y-4">
            <div className="bg-white border border-emerald-200 rounded-2xl p-5 text-center space-y-2" role="status">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-lg font-black text-gray-900">
                {result.started_count} {result.started_count === 1 ? 'parcel is' : 'parcels are'} now out for delivery
              </p>
              <p className="text-xs text-gray-500">Your route is ready under Out for delivery.</p>
            </div>

            <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {result.tracking_numbers.map((tn) => (
                <li key={tn} className="flex items-center gap-2 px-4 py-3 text-sm font-mono text-gray-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>{tn}</span>
                </li>
              ))}
            </ul>

            {remaining > 0 && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {remaining} {remaining === 1 ? 'parcel is' : 'parcels are'} still waiting to be collected at the hub.
              </p>
            )}

            <button
              type="button"
              onClick={onDone}
              className="w-full min-h-12 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold"
            >
              View my route
            </button>
          </div>
        ) : (
          <div className="flex-1 p-4 space-y-5">
            {hub && (
              <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1.5" aria-label="Hub">
                <p className="flex items-center gap-2 text-sm font-black text-gray-900">
                  <Truck className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  Collect from {hub.hub_name}
                </p>
                <p className="flex items-start gap-2 text-xs text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{hub.full_address}</span>
                </p>
                <a
                  href={mapsUrl(`${hub.hub_name}, ${hub.full_address}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-red"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </section>
            )}

            <section aria-label="Parcels to collect" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-gray-900">Parcels to collect</h3>
                <span className="text-xs font-bold text-gray-600">
                  {scanned.length} of {total} scanned
                </span>
              </div>

              {expectedGroups.map((group) => (
                <div key={group.barangay_code} className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-500">
                    {group.barangay_name || 'Unnamed barangay'}
                    {group.city && `, ${group.city}`}
                  </p>
                  <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                    {group.parcels.map((p) => {
                      const done = scanned.includes(p.tracking_number);
                      return (
                        <li key={p.tracking_number} className="flex items-center gap-3 px-4 py-3">
                          {done ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300 shrink-0" aria-hidden="true" />
                          )}
                          <span className="flex-1 min-w-0">
                            <span className={`block font-mono text-sm break-all ${done ? 'text-gray-900' : 'text-gray-600'}`}>
                              {p.tracking_number}
                            </span>
                            <span className="block text-[11px] text-gray-500">{p.recipient.name}</span>
                          </span>
                          <span className={`text-xs font-bold ${done ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {done ? 'Scanned' : 'Waiting'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>

            <section aria-label="Scan parcels" className="space-y-2">
              <TrackingScanner onScan={handleScan} disabled={submitting} />
              <div aria-live="assertive">
                {scanError && (
                  <p className="flex items-start gap-2 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
                    <X className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{scanError}</span>
                  </p>
                )}
              </div>
            </section>

            <div aria-live="assertive">
              {confirmError && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  <p className="font-bold">{confirmError}</p>
                  {itemErrors.length > 0 && (
                    <ul className="list-disc pl-5 text-xs space-y-0.5">
                      {itemErrors.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!result && (
          <footer className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={submitting || scanned.length === 0}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
            >
              {submitting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>
                Start delivery ({scanned.length} of {total})
              </span>
            </button>
            {scanned.length > 0 && scanned.length < total && (
              <p className="mt-2 text-center text-xs text-gray-500">
                Parcels you do not scan stay in To collect.
              </p>
            )}
          </footer>
        )}
      </div>
    </div>
    ,
    document.body
  );
}
