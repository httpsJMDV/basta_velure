import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, RefreshCw, X, XCircle } from 'lucide-react';
import { getRiderFailureReasonsApi, markRiderFailedApi } from '../../api/client';
import type { RiderDeliveryParcel, RiderFailedResponse, RiderFailureReason } from '../../types';

const NOTE_MAX = 500;

interface FailedSheetProps {
  parcel: RiderDeliveryParcel;
  onClose: () => void;
  onSuccess: (res: RiderFailedResponse) => void;
  /** The server says this stop is gone or no longer updatable (404/409): close and refetch. */
  onConflict: (message: string) => void;
}

function validationMessages(data: unknown): string[] {
  const errors = (data as { errors?: Record<string, string[]> } | undefined)?.errors;
  return errors ? Object.values(errors).flat() : [];
}

export default function FailedSheet({ parcel, onClose, onSuccess, onConflict }: FailedSheetProps) {
  const [reasons, setReasons] = useState<RiderFailureReason[]>([]);
  const [loadingReasons, setLoadingReasons] = useState(true);
  const [reasonsError, setReasonsError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const busyRef = useRef(false);

  const loadReasons = useCallback(async () => {
    setLoadingReasons(true);
    setReasonsError(null);
    try {
      setReasons(await getRiderFailureReasonsApi());
    } catch (err: unknown) {
      setReasonsError(
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : 'Could not load the reasons. Check your connection.'
      );
    } finally {
      setLoadingReasons(false);
    }
  }, []);

  useEffect(() => {
    void loadReasons();
  }, [loadReasons]);

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

  const selected = reasons.find((r) => r.code === reasonCode) ?? null;
  const noteRequired = selected?.requires_note ?? false;
  const trimmedNote = note.trim();
  const canSubmit = selected !== null && (!noteRequired || trimmedNote !== '') && !submitting;

  const handleSubmit = async () => {
    if (!selected || busyRef.current) return;

    busyRef.current = true;
    setSubmitting(true);
    setErrors([]);
    try {
      const res = await markRiderFailedApi(parcel.tracking_number, selected.code, trimmedNote !== '' ? trimmedNote : null);
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
          setErrors(lines.length > 0 ? lines : [message || 'The failure could not be recorded.']);
          return;
        }
        setErrors([message || 'The server could not record this. Try again.']);
        return;
      }
      setErrors(['No connection. Check your network and try again.']);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="failed-title"
        className="w-full max-w-xl bg-white rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="failed-title" ref={headingRef} tabIndex={-1} className="text-lg font-black text-gray-900 focus:outline-none">
              Delivery failed
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

        {loadingReasons ? (
          <div className="space-y-2 animate-pulse" aria-label="Loading reasons">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-200/80" />
            ))}
          </div>
        ) : reasonsError ? (
          <div role="alert" className="text-center space-y-2 py-4">
            <AlertCircle className="w-7 h-7 text-red-500 mx-auto" aria-hidden="true" />
            <p className="text-sm text-gray-700">{reasonsError}</p>
            <button
              type="button"
              onClick={() => void loadReasons()}
              className="inline-flex items-center gap-1.5 min-h-11 px-5 rounded-xl bg-blue-600 text-white text-xs font-bold"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2" disabled={submitting}>
              <legend className="text-sm font-bold text-gray-900 mb-1">
                Why could it not be delivered? <span className="text-red-700">(required)</span>
              </legend>
              {reasons.map((r) => {
                const checked = reasonCode === r.code;
                return (
                  <label
                    key={r.code}
                    className={`flex items-center gap-3 min-h-12 px-3 rounded-xl border cursor-pointer ${
                      checked ? 'border-red-600 bg-red-50 ring-2 ring-red-100' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="failure-reason"
                      value={r.code}
                      checked={checked}
                      onChange={() => setReasonCode(r.code)}
                      className="w-5 h-5 accent-red-600 shrink-0"
                    />
                    <span className="text-sm font-semibold text-gray-900">{r.label}</span>
                  </label>
                );
              })}
            </fieldset>

            <div className="space-y-1">
              <label htmlFor="failed-note" className="block text-sm font-bold text-gray-900">
                Note{' '}
                {noteRequired ? (
                  <span className="text-red-700">(required for this reason)</span>
                ) : (
                  <span className="font-normal text-gray-500">(optional)</span>
                )}
              </label>
              <textarea
                id="failed-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={3}
                disabled={submitting}
                aria-required={noteRequired}
                placeholder="What happened?"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              <p className="text-right text-[11px] text-gray-500">
                {note.length}/{NOTE_MAX}
              </p>
            </div>
          </>
        )}

        {errors.length > 0 && (
          <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            <p className="font-bold">The failure was not recorded.</p>
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
            className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" aria-hidden="true" />
                <span>Report failed delivery</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
