import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { AlertCircle, Lock, RefreshCw, X } from 'lucide-react';
import { openRiderChatThreadApi, riderThreadAdapter } from '../../api/client';
import ThreadView from '../../components/chat/ThreadView';
import { useAuth } from '../../hooks/useAuth';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import type { RiderChatCounterpart, RiderThread } from '../../types';

export type RiderChatTarget =
  | { kind: 'parcel'; trackingNumber: string; counterpart: RiderChatCounterpart }
  | { kind: 'thread'; thread: RiderThread };

interface RiderChatSheetProps {
  target: RiderChatTarget;
  onClose: () => void;
  /** The unread counts may have changed (messages were read or sent). */
  onActivity?: () => void;
}

const COUNTERPART_LABEL: Record<RiderChatCounterpart, string> = {
  seller: 'Seller',
  buyer: 'Buyer',
  hub: 'Hub',
};

const EMPTY_HINT: Record<RiderChatCounterpart, string> = {
  seller: 'No messages yet. Tell the seller you are on your way or ask where to collect.',
  buyer: 'No messages yet. Tell the buyer you are nearby or ask where to leave the parcel.',
  hub: 'No messages yet. Ask the hub dispatcher anything about this parcel.',
};

/**
 * The rider's conversation as a bottom sheet, so they never leave the delivery screen. Polls every 3 seconds only
 * while it is mounted, and gives focus back to the Message button when it closes.
 */
export default function RiderChatSheet({ target, onClose, onActivity }: RiderChatSheetProps) {
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y(dialogRef, onClose);

  const [thread, setThread] = useState<RiderThread | null>(target.kind === 'thread' ? target.thread : null);
  const [opening, setOpening] = useState(target.kind === 'parcel');
  const [openError, setOpenError] = useState<{ message: string; retryable: boolean } | null>(null);

  const trackingNumber = target.kind === 'parcel' ? target.trackingNumber : null;
  const counterpartKey = target.kind === 'parcel' ? target.counterpart : null;

  const openThread = useCallback(async () => {
    if (!trackingNumber || !counterpartKey) return;
    setOpening(true);
    setOpenError(null);
    try {
      setThread(await openRiderChatThreadApi(trackingNumber, counterpartKey));
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const data = err.response.data as { message?: string; errors?: Record<string, string[]> } | undefined;
        const field = data?.errors ? Object.values(data.errors).flat()[0] : undefined;
        // 404, 409 and 422 are answers, not glitches: retrying will not change them.
        const answered = [404, 409, 422].includes(err.response.status);
        setOpenError({ message: field || data?.message || 'Could not open this conversation.', retryable: !answered });
      } else {
        setOpenError({ message: 'No connection. Check your network and try again.', retryable: true });
      }
    } finally {
      setOpening(false);
    }
  }, [trackingNumber, counterpartKey]);

  useEffect(() => {
    void openThread();
  }, [openThread]);

  const adapter = useMemo(() => (thread ? riderThreadAdapter(thread.id) : null), [thread]);
  const initialMeta = useMemo(
    () => (thread ? { is_closed: thread.is_closed, can_send: thread.can_send, closed_message: thread.closed_message } : undefined),
    [thread]
  );

  const counterpart = thread?.counterpart ?? counterpartKey ?? 'hub';
  const title = thread?.recipient.name ?? COUNTERPART_LABEL[counterpart];
  const tracking = thread?.parcel?.tracking_number ?? trackingNumber;

  const close = () => {
    onActivity?.();
    onClose();
  };

  // In a portal, so no card around the Message button can clip or offset the sheet.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rider-chat-title"
        className="w-full max-w-xl h-[85vh] max-h-[92vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-200">
          <div className="min-w-0">
            <h2 id="rider-chat-title" tabIndex={-1} className="text-lg font-black text-gray-900 truncate focus:outline-none">
              {title}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {COUNTERPART_LABEL[counterpart]}
              {tracking && (
                <>
                  {' '}&bull; <span className="font-mono">{tracking}</span>
                </>
              )}
              {thread?.is_closed && (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-gray-600">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  Closed
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close conversation"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {opening ? (
          <div className="flex-1 p-5 space-y-3 animate-pulse" aria-label="Opening conversation">
            <div className="h-9 w-2/3 rounded-2xl bg-gray-200" />
            <div className="h-9 w-1/2 rounded-2xl bg-gray-200 ml-auto" />
          </div>
        ) : openError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-6">
            <AlertCircle className="w-7 h-7 text-red-500" aria-hidden="true" />
            <p role="alert" className="text-sm text-gray-700 max-w-xs">{openError.message}</p>
            {openError.retryable ? (
              <button
                type="button"
                onClick={() => void openThread()}
                data-autofocus
                className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                data-autofocus
                className="min-h-11 px-4 rounded-xl border border-gray-300 text-sm font-bold text-gray-800"
              >
                Close
              </button>
            )}
          </div>
        ) : adapter && user ? (
          <ThreadView
            adapter={adapter}
            currentUserId={user.id}
            initialMeta={initialMeta}
            onActivity={onActivity}
            emptyHint={EMPTY_HINT[counterpart]}
            focusComposer
            className="flex-1"
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
