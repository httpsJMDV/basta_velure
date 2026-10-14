import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Lock, RefreshCw, Send, WifiOff } from 'lucide-react';
import { THREAD_MESSAGE_MAX, useThreadMessages } from '../../hooks/useThreadMessages';
import type { ChatMessage, ThreadAdapter, ThreadMeta } from '../../types';

interface ThreadViewProps {
  /** Must keep the same identity for the life of a thread (create it with useMemo). */
  adapter: ThreadAdapter;
  currentUserId: number;
  /** Polling runs only while true. */
  active?: boolean;
  /** The thread list's view of open/closed, so a closed thread never shows an enabled composer first. */
  initialMeta?: ThreadMeta;
  /** Called after a send or when the other side's messages arrive, so lists and badges can refresh. */
  onActivity?: () => void;
  /** Shown in the empty state, for example "Ask the buyer where to leave the parcel." */
  emptyHint?: string;
  /** Focus the composer once the thread has loaded (the sheet does this; a list/detail page does not). */
  focusComposer?: boolean;
  className?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const ROLE_LABEL: Record<string, string> = {
  rider: 'Rider',
  seller: 'Seller',
  buyer: 'Buyer',
  hub: 'Hub',
};

/**
 * One conversation: the messages, a composer, and the closed notice. Used by the rider's bottom sheet, the hub's
 * Messages page, and the buyer and seller pages for rider threads.
 *
 * Message bodies are rendered as text nodes (React escapes them), never as HTML.
 */
export default function ThreadView({
  adapter,
  currentUserId,
  active = true,
  initialMeta,
  onActivity,
  emptyHint = 'No messages yet. Say hello.',
  focusComposer = false,
  className = '',
}: ThreadViewProps) {
  const { messages, meta, loading, loadError, offline, sending, sendError, send, reload } = useThreadMessages(adapter, {
    currentUserId,
    active,
    initialMeta,
    onActivity,
  });

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);

  const closed = meta.is_closed || !meta.can_send;

  // Keep the newest message in view, unless the reader has scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (focusComposer && !loading && !loadError && !closed) composerRef.current?.focus();
  }, [focusComposer, loading, loadError, closed]);

  const handleScroll = () => {
    const el = listRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const submit = async () => {
    if (draft.trim() === '' || sending) return;
    stickToBottomRef.current = true;
    const ok = await send(draft);
    if (ok) {
      setDraft('');
      composerRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on desktop; on a phone the keyboard's Enter adds a line and the Send button sends.
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      void submit();
    }
  };

  const remaining = THREAD_MESSAGE_MAX - draft.length;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {offline && (
        <p role="status" className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border-b border-amber-200">
          <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Connection lost. Retrying…
        </p>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-busy={loading}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50"
      >
        {loading ? (
          <div className="space-y-3 animate-pulse" aria-label="Loading messages">
            <div className="h-9 w-2/3 rounded-2xl bg-gray-200" />
            <div className="h-9 w-1/2 rounded-2xl bg-gray-200 ml-auto" />
            <div className="h-9 w-3/5 rounded-2xl bg-gray-200" />
          </div>
        ) : loadError ? (
          <div className="text-center space-y-3 py-8">
            <AlertCircle className="w-6 h-6 text-red-500 mx-auto" aria-hidden="true" />
            <p role="alert" className="text-sm text-gray-700">{loadError}</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">{emptyHint}</p>
        ) : (
          messages.map((m: ChatMessage, i) => {
            const mine = m.sender_id === currentUserId;
            const showDay = i === 0 || !sameDay(messages[i - 1].created_at, m.created_at);
            return (
              <div key={m.id}>
                {showDay && (
                  <p className="text-center text-[11px] font-semibold text-gray-500 py-1">{formatDay(m.created_at)}</p>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                      mine ? 'bg-brand-red text-white rounded-br-md' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                    }`}
                  >
                    {!mine && (
                      <p className="text-[11px] font-bold text-gray-500">
                        {m.sender_name || 'User'}
                        {m.sender_role && ROLE_LABEL[m.sender_role] ? ` · ${ROLE_LABEL[m.sender_role]}` : ''}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-0.5 ${mine ? 'text-rose-100' : 'text-gray-500'}`}>
                      {formatTime(m.created_at)}
                      {mine && m.read_at ? ' · Seen' : ''}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {closed && !loading && !loadError ? (
        <div role="status" className="px-4 py-3 bg-gray-100 border-t border-gray-200 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-gray-800">This conversation is closed</p>
            {meta.closed_message && <p className="text-xs text-gray-600">{meta.closed_message}</p>}
          </div>
        </div>
      ) : (
        !loadError && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="border-t border-gray-200 bg-white p-3 space-y-2"
          >
            {sendError && (
              <p role="alert" className="text-xs font-semibold text-red-700">
                {sendError}
              </p>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <label htmlFor="thread-composer" className="sr-only">
                  Message
                </label>
                <textarea
                  id="thread-composer"
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={THREAD_MESSAGE_MAX}
                  rows={2}
                  disabled={loading}
                  placeholder="Type a message"
                  className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-red/40 disabled:bg-gray-100"
                />
                {remaining <= 100 && (
                  <p className={`text-[11px] mt-0.5 ${remaining <= 0 ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
                    {remaining} characters left
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || sending || draft.trim() === ''}
                aria-label="Send message"
                className="min-h-12 min-w-12 inline-flex items-center justify-center rounded-xl bg-brand-red hover:bg-brand-red-dark text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Send className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
          </form>
        )
      )}
    </div>
  );
}
