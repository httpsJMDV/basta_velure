import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  Phone,
  RefreshCw,
  Truck,
  X,
} from 'lucide-react';
import TrackingScanner from '../../components/logistics/TrackingScanner';
import { confirmRiderHandoverApi, verifyRiderParcelApi } from '../../api/client';
import type { RiderConfirmHandoverResponse, RiderPickupGroup } from '../../types';

interface PickupHandoverScreenProps {
  group: RiderPickupGroup;
  /** Close without finishing (back arrow / Escape). */
  onClose: () => void;
  /** Called after the rider dismisses the success state. */
  onDone: () => void;
  /** Called after a confirm attempt changed or may have changed server state. */
  onChanged: () => void;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || fallback;
  }
  return fallback;
}

export default function PickupHandoverScreen({ group, onClose, onDone, onChanged }: PickupHandoverScreenProps) {
  const [scanned, setScanned] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RiderConfirmHandoverResponse | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const scannedRef = useRef<string[]>([]);
  const busyRef = useRef(false);

  const busy = verifying || submitting;

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

  const handleScan = useCallback(
    async (code: string) => {
      if (busyRef.current) return;

      setConfirmError(null);
      setItemErrors([]);

      if (scannedRef.current.includes(code)) {
        setScanError(`${code} is already ticked off.`);
        return;
      }

      busyRef.current = true;
      setVerifying(true);
      setScanError(null);
      try {
        const res = await verifyRiderParcelApi(code);
        const parcel = res.data;
        if (parcel.seller_id !== group.seller_id) {
          setScanError(`${parcel.tracking_number} belongs to ${parcel.shop_name}, not ${group.shop_name}.`);
          return;
        }
        if (!scannedRef.current.includes(parcel.tracking_number)) {
          scannedRef.current = [...scannedRef.current, parcel.tracking_number];
          setScanned(scannedRef.current);
        }
      } catch (err: unknown) {
        setScanError(errorMessage(err, `Could not verify ${code}. Check your connection and try again.`));
      } finally {
        busyRef.current = false;
        setVerifying(false);
      }
    },
    [group.seller_id, group.shop_name]
  );

  const handleConfirm = async () => {
    if (busyRef.current || scanned.length === 0) return;

    busyRef.current = true;
    setSubmitting(true);
    setConfirmError(null);
    setItemErrors([]);
    try {
      const res = await confirmRiderHandoverApi(scanned);
      setResult(res);
      onChanged();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422 && err.response.data?.errors) {
        const errors = err.response.data.errors as Record<string, string[]>;
        const failed = new Set<string>();
        const lines = Object.entries(errors).map(([key, msgs]) => {
          const index = Number(key.split('.')[1]);
          const code = Number.isInteger(index) ? scanned[index] : undefined;
          if (code) failed.add(code);
          return code ? `${code}: ${msgs[0]}` : msgs[0];
        });
        // Untick the codes the server rejected so the rider can confirm the rest.
        scannedRef.current = scannedRef.current.filter((code) => !failed.has(code));
        setScanned(scannedRef.current);
        setItemErrors(lines);
        setConfirmError(err.response.data.message || 'Some parcels could not be confirmed.');
        onChanged();
      } else {
        setConfirmError(errorMessage(err, 'Could not confirm the handover. Check your connection and try again.'));
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const trackingNumbers = group.tracking_numbers ?? []; // always present for a pickup the rider has accepted
  const total = trackingNumbers.length;
  const remaining = result ? Math.max(total - result.picked_up_count, 0) : 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handover-title"
      className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto"
    >
      <div className="max-w-xl mx-auto min-h-full flex flex-col bg-gray-50 sm:border-x border-gray-200">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          {!result && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Back to pickups"
              className="w-11 h-11 -ml-2 inline-flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2
            id="handover-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-black text-gray-900 focus:outline-none"
          >
            {result ? 'Handover confirmed' : 'Pickup handover'}
          </h2>
        </header>

        {result ? (
          <div className="flex-1 p-4 space-y-4">
            <div className="bg-white border border-emerald-200 rounded-2xl p-5 text-center space-y-2" role="status">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-lg font-black text-gray-900">
                {result.picked_up_count} {result.picked_up_count === 1 ? 'parcel' : 'parcels'} picked up
              </p>
              <p className="text-xs text-gray-500">from {group.shop_name}</p>
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
                {remaining} {remaining === 1 ? 'parcel is' : 'parcels are'} still waiting for you in My pickups.
              </p>
            )}

            {result.hub ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-black text-gray-900">
                  <Truck className="w-4 h-4" aria-hidden="true" />
                  Take these to {result.hub.hub_name}
                </p>
                <p className="flex items-start gap-2 text-xs text-gray-700">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{result.hub.full_address}</span>
                </p>
                <a
                  href={mapsUrl(`${result.hub.hub_name}, ${result.hub.full_address}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-11 text-sm font-bold text-brand-red hover:underline"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded-xl p-3">
                Your account has no hub on file. Ask your hub manager where to drop these parcels off.
              </p>
            )}

            <button
              type="button"
              onClick={onDone}
              className="w-full min-h-12 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex-1 p-4 space-y-5">
            {/* Seller */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2" aria-label="Seller">
              <p className="text-base font-black text-gray-900">{group.shop_name}</p>
              <p className="flex items-start gap-2 text-xs text-gray-600">
                <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{group.pickup_address.full_address}</span>
              </p>
              <div className="flex flex-wrap gap-x-4">
                <a
                  href={`tel:${group.shop_phone}`}
                  className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-gray-900"
                >
                  <Phone className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  {group.shop_phone}
                </a>
                <a
                  href={mapsUrl(group.pickup_address.full_address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-red"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            </section>

            {/* Checklist */}
            <section aria-label="Parcels to collect" className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-gray-900">Parcels to collect</h3>
                <span className="text-xs font-bold text-gray-600">
                  {scanned.length} of {total} scanned
                </span>
              </div>
              <ul className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                {trackingNumbers.map((tn) => {
                  const done = scanned.includes(tn);
                  return (
                    <li key={tn} className="flex items-center gap-3 px-4 py-3">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300 shrink-0" aria-hidden="true" />
                      )}
                      <span className={`flex-1 font-mono text-sm ${done ? 'text-gray-900' : 'text-gray-600'}`}>
                        {tn}
                      </span>
                      <span className={`text-xs font-bold ${done ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {done ? 'Scanned' : 'Waiting'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Scanner */}
            <section aria-label="Scan parcels" className="space-y-2">
              <TrackingScanner onScan={handleScan} disabled={busy} />
              {verifying && (
                <p className="flex items-center gap-2 text-xs text-gray-500" role="status">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  Checking parcel...
                </p>
              )}
              <div aria-live="assertive">
                {scanError && (
                  <p className="flex items-start gap-2 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
                    <X className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{scanError}</span>
                  </p>
                )}
              </div>
            </section>

            {/* Confirm errors */}
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
              onClick={handleConfirm}
              disabled={busy || scanned.length === 0}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
            >
              {submitting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>
                Confirm handover ({scanned.length} of {total})
              </span>
            </button>
            {scanned.length > 0 && scanned.length < total && (
              <p className="mt-2 text-center text-xs text-gray-500">
                Parcels you do not scan stay in My pickups.
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
