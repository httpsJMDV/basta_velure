import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowLeft, Lock, MessageSquare, Warehouse } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListError } from '../../components/admin/listKit';
import ThreadView from '../../components/chat/ThreadView';
import { useAuth } from '../../hooks/useAuth';
import { courierThreadAdapter, getCourierChatHubsApi, openCourierHubThreadApi } from '../../api/courierChat';
import type { CourierHubThreadRow } from '../../api/courierChat';
import type { ThreadMeta } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';
import type { LogisticsOutletContext } from './LogisticsLayout';

const LIST_POLL_MS = 10000;

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
 * The courier company's Messages: one conversation with each hub in its network, for the day-to-day (riders short,
 * a parcel stuck at intake, pay questions). The hub manager answers from the hub's Messages page. Only the company's
 * team and the hub see a thread.
 */
export default function LogisticsMessagesPage() {
  const { user } = useAuth();
  const { refreshChatUnread } = useOutletContext<LogisticsOutletContext>();
  const [rows, setRows] = useState<CourierHubThreadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hubId, setHubId] = useState<number | null>(null);
  const [thread, setThread] = useState<{ id: number; meta: ThreadMeta } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (silent = false) => {
    try {
      const res = await getCourierChatHubsApi();
      setRows(res.data);
      setFailed(false);
    } catch {
      if (!silent) setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = setInterval(tick, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const open = async (row: CourierHubThreadRow) => {
    setHubId(row.hub.id);
    setThread(null);
    setOpenError(null);
    setOpening(true);
    try {
      const t = await openCourierHubThreadApi(row.hub.id);
      setThread({ id: t.id, meta: t.meta });
      void load(true);
    } catch (e) {
      setOpenError(apiErrorMessage(e, 'This conversation could not be opened.'));
    } finally {
      setOpening(false);
    }
  };

  const adapter = useMemo(() => (thread ? courierThreadAdapter(thread.id) : null), [thread]);
  const onActivity = useCallback(() => { void load(true); refreshChatUnread(); }, [load, refreshChatUnread]);
  const selected = rows?.find((r) => r.hub.id === hubId) ?? null;
  const q = search.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => !q || r.hub.name.toLowerCase().includes(q) || r.hub.place.toLowerCase().includes(q));

  return (
    <div className="pb-8 space-y-4">
      <PageHero icon={MessageSquare} eyebrow="Network" title="Messages" subtitle="Talk with the hubs in your network. Only your team and that hub's manager see a conversation." />

      <div className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden md:grid md:grid-cols-[20rem_1fr] h-[calc(100vh-15rem)] min-h-[28rem]">
        <section aria-label="Hubs" className={`${selected ? 'hidden md:flex' : 'flex'} flex-col min-h-0 border-r border-gray-200`}>
          <div className="p-2 border-b border-gray-100 bg-gray-50/40">
            <label htmlFor="hub-chat-search" className="sr-only">Search hubs</label>
            <input id="hub-chat-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a hub or city"
              className="w-full h-9 px-3 text-[13px] bg-white border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {failed ? <div className="p-4"><ListError message="The hubs could not be loaded." onRetry={() => void load()} /></div>
              : rows === null ? (
                <div className="p-3 space-y-2 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100" />)}</div>
              ) : visible.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Warehouse className="w-8 h-8 text-gray-300 mx-auto" aria-hidden="true" />
                  <p className="text-sm font-bold text-gray-800">{q ? 'No hub matches' : 'No hubs in your network yet'}</p>
                  <p className="text-xs text-gray-500">{q ? 'Try another name or city.' : 'Once you approve a hub, you can message it here.'}</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((r) => (
                    <li key={r.hub.id}>
                      <button type="button" onClick={() => void open(r)} aria-current={r.hub.id === hubId ? 'true' : undefined}
                        className={`w-full min-h-16 px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 ${r.hub.id === hubId ? 'bg-gray-50' : ''}`}>
                        <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Warehouse className="w-4 h-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.hub.name}</p>
                          <p className="text-[11.5px] text-gray-500 truncate">{r.hub.place || 'Hub'}</p>
                          {r.last_message
                            ? <p className="text-xs text-gray-600 truncate">{r.last_message.from_hub ? '' : 'You: '}{r.last_message.body}</p>
                            : <p className="text-xs text-gray-400">No messages yet</p>}
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          <p className="text-[11px] text-gray-400">{timeAgo(r.last_message?.created_at ?? null)}</p>
                          {r.unread > 0 && (
                            <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-black">{r.unread}<span className="sr-only"> unread</span></span>
                          )}
                          {r.hub.status !== 'APPROVED' && <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500"><Lock className="w-3 h-3" aria-hidden="true" /> {r.hub.status === 'SUSPENDED' ? 'Suspended' : 'Closed'}</p>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>

        <section aria-label="Conversation" className={`${selected ? 'flex' : 'hidden md:flex'} flex-col min-h-0`}>
          {selected ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                <button type="button" onClick={() => { setHubId(null); setThread(null); }} aria-label="Back to hubs"
                  className="md:hidden min-h-11 min-w-11 -ml-2 inline-flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100">
                  <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-gray-900 truncate">{selected.hub.name}</h2>
                  <p className="text-xs text-gray-500 truncate">{selected.hub.place || 'Hub'} · hub manager</p>
                </div>
              </div>
              {thread && adapter && user ? (
                <ThreadView key={thread.id} adapter={adapter} currentUserId={user.id} initialMeta={thread.meta} onActivity={onActivity}
                  emptyHint="No messages yet. Say hello to the hub." focusComposer className="flex-1" />
              ) : openError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <Lock className="w-6 h-6 text-gray-400 mb-2" aria-hidden="true" />
                  <p className="text-sm text-gray-700">{openError}</p>
                </div>
              ) : (
                <div className="flex-1 p-4 space-y-3 animate-pulse" aria-busy={opening}>
                  <div className="h-9 w-2/3 rounded-2xl bg-gray-100" /><div className="h-9 w-1/2 rounded-2xl bg-gray-100 ml-auto" />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500">
              <MessageSquare className="w-10 h-10 text-gray-300 mb-3" aria-hidden="true" />
              <p className="text-sm font-semibold">Pick a hub to message</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
