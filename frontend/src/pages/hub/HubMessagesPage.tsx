import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, ArrowLeft, Lock, MessageSquare, RefreshCw } from 'lucide-react';
import { getHubChatThreadsApi, hubThreadAdapter } from '../../api/client';
import ThreadView from '../../components/chat/ThreadView';
import { useAuth } from '../../hooks/useAuth';
import type { RiderThread, ThreadMeta } from '../../types';
import type { HubOutletContext } from './HubLayout';
import { PageHeader } from './hubKit';

const LIST_POLL_MS = 10000;

type Filter = 'all' | 'unread';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/**
 * The hub's inbox for rider conversations. Riders start a thread from a pickup or delivery; the hub reads it here
 * and replies. A thread whose parcel has finished stays readable but cannot be replied to.
 */
export default function HubMessagesPage() {
  const { user } = useAuth();
  const { refreshChatUnread } = useOutletContext<HubOutletContext>();

  const [threads, setThreads] = useState<RiderThread[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'silent') => {
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await getHubChatThreadsApi({ per_page: 100 });
        setThreads(res.data);
        setUnreadTotal(res.meta.unread_total);
        setError(null);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        if (mode === 'silent') return;
        setError(
          axios.isAxiosError(err) && err.response?.data?.message
            ? err.response.data.message
            : 'Could not load rider messages. Check your connection.'
        );
      } finally {
        if (mode === 'initial') setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load('silent');
    };
    const timer = setInterval(tick, LIST_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const selected = threads.find((t) => t.id === selectedId) ?? null;
  const visible = filter === 'unread' ? threads.filter((t) => t.unread > 0) : threads;

  const selectedThreadId = selected?.id ?? null;
  const adapter = useMemo(() => (selectedThreadId !== null ? hubThreadAdapter(selectedThreadId) : null), [selectedThreadId]);
  const initialMeta: ThreadMeta | undefined = selected
    ? { is_closed: selected.is_closed, can_send: selected.can_send, closed_message: selected.closed_message }
    : undefined;

  const onActivity = useCallback(() => {
    void load('silent');
    refreshChatUnread();
  }, [load, refreshChatUnread]);

  return (
    <div className="space-y-4">
      <PageHeader
        accent="sky"
        updatedAt={lastUpdated}
        icon={MessageSquare}
        title="Rider messages"
        subtitle="Conversations riders start about the parcels they are collecting or delivering. They close when the parcel is done."
       />

      <div className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden md:grid md:grid-cols-[20rem_1fr] h-[calc(100vh-14rem)] min-h-[28rem]">
        {/* Thread list: hidden on a phone while a thread is open */}
        <section
          aria-label="Conversations"
          className={`${selected ? 'hidden md:flex' : 'flex'} flex-col min-h-0 border-r border-gray-200`}
        >
          <div className="p-2 border-b border-gray-100 bg-gray-50/40">
            <div className="flex gap-0.5 p-1 bg-gray-100/80 rounded-xl" role="group" aria-label="Filter conversations">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`flex-1 min-h-9 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                    filter === f ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {f === 'all' ? 'All' : 'Unread'}
                  {f === 'unread' && unreadTotal > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === f ? 'bg-red-100 text-brand-red-dark' : 'bg-gray-200 text-gray-600'}`}>{unreadTotal}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2 animate-pulse" aria-label="Loading conversations">
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="h-16 rounded-xl bg-gray-100" />
              </div>
            ) : error ? (
              <div className="p-6 text-center space-y-3">
                <AlertCircle className="w-6 h-6 text-red-500 mx-auto" aria-hidden="true" />
                <p role="alert" className="text-sm text-gray-700">{error}</p>
                <button
                  type="button"
                  onClick={() => void load('initial')}
                  className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto" aria-hidden="true" />
                <p className="text-sm font-bold text-gray-800">
                  {filter === 'unread' ? 'No unread messages' : 'No rider messages yet'}
                </p>
                <p className="text-xs text-gray-500">
                  {filter === 'unread'
                    ? 'You are all caught up.'
                    : 'When a rider messages the hub about a parcel, the conversation appears here.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      aria-current={t.id === selectedId ? 'true' : undefined}
                      className={`w-full min-h-16 px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 ${
                        t.id === selectedId ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-sm font-bold text-gray-900 truncate">{t.recipient.name}</p>
                        <p className="font-mono text-[11px] text-gray-500">{t.parcel?.tracking_number}</p>
                        {t.last_message && <p className="text-xs text-gray-600 truncate">{t.last_message.body}</p>}
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        <p className="text-[11px] text-gray-400">{timeAgo(t.last_message_at)}</p>
                        {t.unread > 0 && (
                          <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-black">
                            {t.unread}
                            <span className="sr-only"> unread</span>
                          </span>
                        )}
                        {t.is_closed && (
                          <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            Closed
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Thread */}
        <section aria-label="Conversation" className={`${selected ? 'flex' : 'hidden md:flex'} flex-col min-h-0`}>
          {selected && adapter && user ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversations"
                  className="md:hidden min-h-11 min-w-11 -ml-2 inline-flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"
                >
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-gray-900 truncate">{selected.recipient.name}</h2>
                  <p className="text-xs text-gray-500 truncate">
                    Rider &bull; <span className="font-mono">{selected.parcel?.tracking_number}</span>
                    {selected.parcel?.status && <> &bull; {selected.parcel.status.replace(/_/g, ' ').toLowerCase()}</>}
                  </p>
                </div>
              </div>
              <ThreadView
                key={selected.id}
                adapter={adapter}
                currentUserId={user.id}
                initialMeta={initialMeta}
                onActivity={onActivity}
                emptyHint="No messages yet."
                className="flex-1"
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500">
              <MessageSquare className="w-10 h-10 text-gray-300 mb-3" aria-hidden="true" />
              <p className="text-sm font-semibold">Select a conversation</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
