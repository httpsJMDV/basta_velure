import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import axios from 'axios';
import { Camera, CheckCircle2, RefreshCw, RotateCcw, X } from 'lucide-react';
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

export default function DeliveredSheet({ parcel, onClose, onSuccess, onConflict }: DeliveredSheetProps) {
  const isCod = parcel.cod_amount !== null;

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [photoInfo, setPhotoInfo] = useState<{ finalBytes: number; originalBytes: number; downscaled: boolean } | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [codChecked, setCodChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  // Free the preview's memory when it changes and when the sheet closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again after Retake
    if (!file) return;

    const reject = (message: string) => {
      setPhoto(null);
      setPreviewUrl(null);
      setPhotoInfo(null);
      setPhotoError(message);
    };

    if (!ALLOWED_TYPES.includes(file.type)) {
      reject('Use a JPG, PNG or WebP photo.');
      return;
    }

    // Shrink in the browser first: phone photos are several MB, and a smaller upload is faster on mobile data.
    setPhotoError(null);
    setErrors([]);
    setProcessing(true);
    const result = await downscaleImage(file);
    setProcessing(false);

    // Checked on what will actually be uploaded. A big photo only fails here if shrinking was not possible.
    if (result.file.size > MAX_BYTES) {
      reject('That photo is larger than 8 MB and could not be reduced. Take a new one.');
      return;
    }

    setPhoto(result.file);
    setPreviewUrl(URL.createObjectURL(result.file));
    setPhotoInfo({
      finalBytes: result.file.size,
      originalBytes: file.size,
      downscaled: result.downscaled,
    });
  };

  const canSubmit = photo !== null && !processing && (!isCod || codChecked) && !submitting;

  const handleSubmit = async () => {
    if (!photo || busyRef.current) return;

    busyRef.current = true;
    setSubmitting(true);
    setProgress(0);
    setErrors([]);

    const form = new FormData();
    form.append('proof_photo', photo);
    if (receivedBy.trim() !== '') form.append('received_by', receivedBy.trim());
    if (isCod) form.append('cod_collected', codChecked ? '1' : '0');

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
        if (status === 422) {
          const lines = validationMessages(err.response.data);
          setErrors(lines.length > 0 ? lines : [message || 'The delivery could not be recorded.']);
          return;
        }
        setErrors([message || 'The server could not record the delivery. Try again.']);
        return;
      }
      setErrors(['No connection. Check your network and try again. Your photo is kept.']);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
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

        {/* Photo proof */}
        <section aria-label="Proof photo" className="space-y-2">
          <p className="text-sm font-bold text-gray-900">
            Proof photo <span className="text-red-700">(required)</span>
          </p>

          <input
            ref={fileRef}
            id="delivered-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => void handleFile(e)}
            disabled={submitting}
            className="sr-only"
            aria-describedby={photoError ? 'delivered-photo-error' : undefined}
          />

          {previewUrl ? (
            <div className="space-y-2">
              <img
                src={previewUrl}
                alt="Preview of the proof photo you took"
                className="w-full max-h-72 object-contain rounded-2xl bg-gray-100 border border-gray-200"
              />
              {photoInfo && (
                <p className="text-xs text-gray-600" role="status">
                  Photo ready: <span className="font-bold">{formatBytes(photoInfo.finalBytes)}</span>
                  {photoInfo.downscaled && ` (reduced from ${formatBytes(photoInfo.originalBytes)})`}
                </p>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={submitting || processing}
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
              disabled={submitting || processing}
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
            {photoError && (
              <p id="delivered-photo-error" className="text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
                {photoError}
              </p>
            )}
          </div>
        </section>

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

        {/* COD confirmation */}
        {isCod && parcel.cod_amount !== null && (
          <label className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-300 p-3 min-h-14 cursor-pointer">
            <input
              type="checkbox"
              checked={codChecked}
              onChange={(e) => setCodChecked(e.target.checked)}
              disabled={submitting}
              className="w-6 h-6 mt-0.5 accent-brand-red shrink-0"
            />
            <span className="text-sm font-bold text-amber-950">
              I collected {formatPeso(parcel.cod_amount)} in cash
              <span className="block text-xs font-normal text-amber-900">Required for cash on delivery orders.</span>
            </span>
          </label>
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
    </div>
  );
}
