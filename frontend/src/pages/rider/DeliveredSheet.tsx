import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeEvent } from 'react';
import axios from 'axios';
import { Camera, CheckCircle2, KeyRound, RefreshCw, RotateCcw, Wallet, X } from 'lucide-react';
import { markRiderDeliveredApi } from '../../api/client';
import { downscaleImage, formatBytes } from '../../utils/imageDownscale';
import type { RiderDeliveredResponse, RiderDeliveryParcel } from '../../types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024; // matches the server's 8 MB limit

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface DeliveredSheetProps {
  parcel: RiderDeliveryParcel;
  onClose: () => void;
  onSuccess: (res: RiderDeliveredResponse) => void;
  /** The server says this stop is gone or no longer deliverable (404/409): close and refetch. */
  onConflict: (message: string) => void;
}

/** Collects the validation messages from a Laravel 422 into plain sentences. */
function validationMessages(data: unknown): string[] {
  const errors = (data as { errors?: Record<string, string[]> } | undefined)?.errors;
  return errors ? Object.values(errors).flat() : [];
}

interface PhotoSlotProps {
  id: string;
  step: number;
  title: string;
  hint: string;
  file: File | null;
  disabled: boolean;
  /** A second photo is optional; the first is required. */
  optional?: boolean;
  onChange: (file: File | null) => void;
  /** Reports that the slot is shrinking a photo, so the form waits for it. */
  onProcessing: (busy: boolean) => void;
}

/** One proof photo: take or retake it, see a preview, and shrink it in the browser before upload. */
function PhotoSlot({ id, step, title, hint, file, disabled, optional = false, onChange, onProcessing }: PhotoSlotProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [info, setInfo] = useState<{ finalBytes: number; originalBytes: number; downscaled: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Free the preview's memory when it changes and when the sheet closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reject = (message: string) => {
    onChange(null);
    setPreviewUrl(null);
    setInfo(null);
    setError(message);
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again after Retake
    if (!picked) return;

    if (!ALLOWED_TYPES.includes(picked.type)) {
      reject('Use a JPG, PNG or WebP photo.');
      return;
    }

    // Shrink in the browser first: phone photos are several MB, and a smaller upload is faster on mobile data.
    setError(null);
    setProcessing(true);
    onProcessing(true);
    const result = await downscaleImage(picked);
    setProcessing(false);
    onProcessing(false);

    // Checked on what will actually be uploaded. A big photo only fails here if shrinking was not possible.
    if (result.file.size > MAX_BYTES) {
      reject('That photo is larger than 8 MB and could not be reduced. Take a new one.');
      return;
    }

    onChange(result.file);
    setPreviewUrl(URL.createObjectURL(result.file));
    setInfo({ finalBytes: result.file.size, originalBytes: picked.size, downscaled: result.downscaled });
  };

  const showPreview = file !== null && previewUrl !== null;

  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-start gap-2.5">
        <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-black flex items-center justify-center shrink-0" aria-hidden="true">
          {step}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">
            {title} {optional ? <span className="font-normal text-gray-500">(optional)</span> : <span className="text-red-700">(required)</span>}
          </p>
          <p className="text-xs text-gray-500">{hint}</p>
        </div>
      </div>

      <input
        ref={fileRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(e) => void handleFile(e)}
        disabled={disabled}
        className="sr-only"
        aria-describedby={error ? `${id}-error` : undefined}
      />

      {showPreview ? (
        <div className="space-y-2">
          <img
            src={previewUrl}
            alt={`Preview of ${title.toLowerCase()}`}
            className="w-full max-h-60 object-contain rounded-2xl bg-gray-100 border border-gray-200"
          />
          {info && (
            <p className="text-xs text-gray-600" role="status">
              Photo ready: <span className="font-bold">{formatBytes(info.finalBytes)}</span>
              {info.downscaled && ` (reduced from ${formatBytes(info.originalBytes)})`}
            </p>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || processing}
            className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Retake photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || processing}
          className="w-full min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-sm font-bold text-gray-800 hover:bg-gray-100 disabled:opacity-50"
        >
          {processing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
              Preparing photo...
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" aria-hidden="true" />
              Take photo
            </>
          )}
        </button>
      )}

      <div aria-live="assertive">
        {error && (
          <p id={`${id}-error`} className="text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

export default function DeliveredSheet({ parcel, onClose, onSuccess, onConflict }: DeliveredSheetProps) {
  const isCod = parcel.cod_amount !== null;

  const [photo, setPhoto] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [processingCount, setProcessingCount] = useState(0);
  const [receivedBy, setReceivedBy] = useState('');
  const [otp, setOtp] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [lockedUntil, setLockedUntil] = useState<string | null>(parcel.otp_locked_until ?? null);
  const [now, setNow] = useState(() => Date.now());
  const otpRequired = parcel.otp_required === true;
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Count the code lock down, and lift it when it ends.
  useEffect(() => {
    if (!lockedUntil) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [lockedUntil]);
  const lockLeft = lockedUntil ? Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000)) : 0;
  const locked = lockLeft > 0;

  const processing = processingCount > 0;
  const trackProcessing = (busy: boolean) => setProcessingCount((n) => Math.max(0, n + (busy ? 1 : -1)));

  const otpOk = !otpRequired || /^\d{6}$/.test(otp);
  const codOk = !isCod || codAmount.trim() !== '';
  const canSubmit = photo !== null && !processing && otpOk && codOk && !locked && !submitting;

  const handleSubmit = async () => {
    if (!photo || busyRef.current) return;

    busyRef.current = true;
    setSubmitting(true);
    setProgress(0);
    setErrors([]);

    const form = new FormData();
    form.append('proof_photo', photo);
    if (photo2) form.append('proof_photo_2', photo2);
    if (receivedBy.trim() !== '') form.append('received_by', receivedBy.trim());
    if (otpRequired) form.append('otp', otp);
    if (isCod) form.append('cod_amount', codAmount.trim());

    try {
      const res = await markRiderDeliveredApi(parcel.tracking_number, form, setProgress);
      onSuccess(res);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;
        const message = err.response.data?.message as string | undefined;
        if (status === 404 || status === 409) {
          onConflict(message || 'This stop can no longer be updated.');
          return;
        }
        if (status === 423) {
          // Five wrong codes: entry is locked for 15 minutes, even for the right code.
          setLockedUntil((err.response.data?.locked_until as string | undefined) ?? new Date(Date.now() + 15 * 60 * 1000).toISOString());
          setOtp('');
          setErrors([message || 'Too many wrong codes. Code entry is locked for 15 minutes.']);
          return;
        }
        if (status === 422) {
          const lines = validationMessages(err.response.data);
          setErrors(lines.length > 0 ? lines : [message || 'The delivery could not be recorded.']);
          return;
        }
        setErrors([message || 'The server could not record the delivery. Try again.']);
        return;
      }
      setErrors(['No connection. Check your network and try again. Your photos are kept.']);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
      setProgress(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivered-title"
        className="w-full max-w-xl bg-white rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="delivered-title" ref={headingRef} tabIndex={-1} className="text-lg font-black text-gray-900 focus:outline-none">
              Confirm delivery
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {parcel.recipient.name} &bull; <span className="font-mono">{parcel.tracking_number}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="min-h-11 min-w-11 -mr-2 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
          In order: a photo of the parcel at the door, the buyer's delivery code{isCod ? ', and the cash you collected' : ''}. The buyer, the seller and your company can see the photos.
        </p>

        <PhotoSlot
          id="delivered-photo"
          step={1}
          title="Parcel handed over"
          hint="The parcel with the recipient, or at their door."
          file={photo}
          disabled={submitting}
          onChange={(f) => {
            setPhoto(f);
            setErrors([]);
          }}
          onProcessing={trackProcessing}
        />

        <PhotoSlot
          id="delivered-photo-2"
          step={2}
          title="Delivery address"
          hint="The house, gate or building so the location is clear."
          file={photo2}
          disabled={submitting}
          optional
          onChange={(f) => {
            setPhoto2(f);
            setErrors([]);
          }}
          onProcessing={trackProcessing}
        />

        {/* Received by */}
        <div className="space-y-1">
          <label htmlFor="delivered-received-by" className="block text-sm font-bold text-gray-900">
            Received by <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="delivered-received-by"
            type="text"
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
            maxLength={100}
            disabled={submitting}
            placeholder="Name of the person who received it"
            autoComplete="off"
            className="w-full min-h-12 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/40 disabled:opacity-60"
          />
        </div>

        {/* The buyer's delivery code (A32) */}
        {otpRequired && (
          <section aria-label="Delivery code" className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-black flex items-center justify-center shrink-0" aria-hidden="true">3</span>
              <div className="min-w-0">
                <label htmlFor="delivered-otp" className="text-sm font-bold text-gray-900">Delivery code <span className="text-red-700">(required)</span></label>
                <p className="text-xs text-gray-500">Ask the buyer for the 6-digit code on their order page.</p>
              </div>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="delivered-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={submitting || locked}
                placeholder="••••••"
                className="w-full min-h-12 pl-9 pr-3 rounded-xl border border-gray-300 bg-white text-lg font-black tracking-[0.4em] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-red/40 disabled:opacity-60"
              />
            </div>
            {locked && (
              <p role="status" className="text-xs font-bold text-red-800 bg-red-50 border border-red-200 rounded-xl p-2.5">
                Locked after 5 wrong codes. Try again in {Math.floor(lockLeft / 60)}:{String(lockLeft % 60).padStart(2, '0')}.
              </p>
            )}
          </section>
        )}

        {/* COD: the exact amount (R6) */}
        {isCod && parcel.cod_amount !== null && (
          <section aria-label="Cash collected" className="space-y-2 rounded-2xl bg-amber-50 border border-amber-300 p-3">
            <label htmlFor="delivered-cod" className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <Wallet className="w-4 h-4" aria-hidden="true" /> Cash collected: collect exactly {formatPeso(parcel.cod_amount)}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-amber-900">₱</span>
              <input
                id="delivered-cod"
                inputMode="decimal"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value.replace(/[^\d.]/g, ''))}
                disabled={submitting}
                placeholder={parcel.cod_amount.toFixed(2)}
                className="w-full min-h-12 pl-7 pr-3 rounded-xl border border-amber-300 bg-white text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60"
              />
            </div>
            <p className="text-xs text-amber-900">Type what you counted. It must match the order to the centavo.</p>
          </section>
        )}

        {errors.length > 0 && (
          <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            <p className="font-bold">The delivery was not recorded.</p>
            <ul className="list-disc pl-5 text-xs space-y-0.5">
              {errors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>{progress !== null && progress < 100 ? `Uploading ${progress}%` : 'Saving...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Confirm delivered</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
