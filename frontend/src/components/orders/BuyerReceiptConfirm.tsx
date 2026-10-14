import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Clock, Image as ImageIcon, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { confirmBuyerOrderReceiptApi, getDeliveryProofBlobUrl } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { Order } from '../../types';

interface BuyerReceiptConfirmProps {
  order: Order;
  /** Called with the updated order after a successful confirmation, so the card turns Completed in place. */
  onUpdated?: (updated: Order) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "in 2 days", "in 5 hours", "within the hour", or "soon" once the time has passed. */
function untilLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hours = Math.ceil(ms / 3600000);
  if (hours < 1) return 'within the hour';
  if (hours < 48) return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `in about ${Math.ceil(hours / 24)} days`;
}

/**
 * Shown on a buyer's DELIVERED order: the delivery proof photo, the auto-confirm hint and the
 * "Confirm Order Received" button with its confirm dialog. Confirming ends the return window and
 * starts the seller's payment protection period.
 */
export default function BuyerReceiptConfirm({ order, onUpdated }: BuyerReceiptConfirmProps) {
  const { showToast } = useToast();

  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofState, setProofState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showProof, setShowProof] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);
  const proofTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const busyRef = useRef(false);

  const canShowProof = Boolean(order.delivery_proof_available && order.tracking_number);

  const loadProof = useCallback(async () => {
    if (!order.tracking_number) return;
    setProofState('loading');
    try {
      setProofUrl(await getDeliveryProofBlobUrl(order.tracking_number));
      setProofState('ready');
    } catch {
      setProofState('error');
    }
  }, [order.tracking_number]);

  // Fetch the photo through the authorized endpoint (an <img src> could not send the login token).
  useEffect(() => {
    if (canShowProof) void loadProof();
  }, [canShowProof, loadProof]);

  // Free the blob URL when it is replaced or the card goes away.
  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  const closeConfirm = useCallback(() => {
    setShowConfirm(false);
    setError(null);
    requestAnimationFrame(() => confirmTriggerRef.current?.focus());
  }, []);

  const closeProof = useCallback(() => {
    setShowProof(false);
    requestAnimationFrame(() => proofTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!showConfirm && !showProof) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showProof) closeProof();
      else if (!busyRef.current) closeConfirm();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showConfirm, showProof, closeConfirm, closeProof]);

  useEffect(() => {
    if (showConfirm) dialogHeadingRef.current?.focus();
  }, [showConfirm]);

  const handleConfirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await confirmBuyerOrderReceiptApi(order.id);
      showToast('Order marked as received. Thank you!', 'success');
      setShowConfirm(false);
      onUpdated?.(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const { status, data } = err.response;
        // 404/409 mean the order is no longer waiting for confirmation (already confirmed, disputed, ...).
        setError(
          data?.message ||
            (status === 409 ? 'This order can no longer be confirmed.' : 'The order could not be confirmed. Try again.')
        );
      } else {
        setError('No connection. Check your network and try again.');
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  // Not offered once a return request is open (the order would be DISPUTED anyway).
  if (order.dispute) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3" aria-label="Confirm receipt">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-black text-emerald-950">Your order was delivered</p>
          <p className="text-xs text-emerald-900">
            Please check your parcel, then confirm it arrived.
            {order.auto_complete_at && (
              <>
                {' '}
                If you do nothing, it is confirmed for you {untilLabel(order.auto_complete_at)}
                <span className="sr-only"> ({formatDate(order.auto_complete_at)})</span>.
              </>
            )}
          </p>
          {order.auto_complete_at && (
            <p className="flex items-center gap-1 text-[11px] text-emerald-800 mt-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Auto-confirms {formatDate(order.auto_complete_at)}
            </p>
          )}
        </div>
      </div>

      {/* Delivery proof */}
      {canShowProof && (
        <div className="flex items-center gap-3">
          {proofState === 'ready' && proofUrl ? (
            <button
              type="button"
              ref={proofTriggerRef}
              onClick={() => setShowProof(true)}
              className="relative w-20 h-20 rounded-xl overflow-hidden border border-emerald-200 bg-white shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              aria-label="View delivery proof photo"
            >
              <img src={proofUrl} alt="Delivery proof thumbnail" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-20 h-20 rounded-xl border border-emerald-200 bg-white flex items-center justify-center shrink-0 text-emerald-700" aria-live="polite">
              {proofState === 'loading' ? <RefreshCw className="w-5 h-5 animate-spin" aria-label="Loading delivery proof" /> : <ImageIcon className="w-5 h-5" aria-hidden="true" />}
            </div>
          )}
          <div className="min-w-0 text-xs text-emerald-900">
            <p className="font-bold">Delivery proof</p>
            {proofState === 'ready' && <p>Tap the photo to view it before you confirm.</p>}
            {proofState === 'loading' && <p>Loading the photo...</p>}
            {proofState === 'error' && (
              <p>
                The photo could not be loaded.{' '}
                <button type="button" onClick={() => void loadProof()} className="font-bold underline min-h-11">
                  Try again
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        ref={confirmTriggerRef}
        onClick={() => setShowConfirm(true)}
        disabled={submitting}
        className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        Confirm Order Received
      </button>

      {/* Confirm dialog */}
      {showConfirm && (
        <div role="dialog" aria-modal="true" aria-labelledby={`confirm-title-${order.id}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 id={`confirm-title-${order.id}`} ref={dialogHeadingRef} tabIndex={-1} className="text-base font-black text-gray-900 focus:outline-none">
              Confirm that you received order #{order.order_number}?
            </h3>
            <div className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                The seller&apos;s payment is released after the protection period. Once you confirm, the order is
                completed and you can no longer request a return or refund for it.
              </p>
            </div>

            <div aria-live="assertive">
              {error && (
                <p role="alert" className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={submitting}
                className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {error ? 'Close' : 'Not yet'}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {submitting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>{submitting ? 'Confirming...' : error ? 'Try again' : 'Yes, I received it'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size proof photo */}
      {showProof && proofUrl && (
        <div role="dialog" aria-modal="true" aria-label="Delivery proof photo" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative max-w-2xl w-full">
            <button
              type="button"
              onClick={closeProof}
              aria-label="Close photo"
              className="absolute -top-2 -right-2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-white text-gray-800 shadow-lg"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <img src={proofUrl} alt="Delivery proof photo" className="w-full max-h-[85vh] object-contain rounded-2xl bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}
