import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MessageSquare, Send, Search, X, Plus, ChevronRight, ChevronLeft, CheckCircle2, RotateCcw, Package, ShoppingBag,
  PanelRightOpen, PanelRightClose, ExternalLink, Mail, Store, Inbox, Loader2, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getEcho } from '../../lib/echo';
import { usePolling, CHAT_POLL } from '../../hooks/usePolling';
import {
  getConversationsApi, getConversationMessagesApi, sendConversationMessageApi, startConversationApi,
  searchAdminContactsApi, openConversationForSellerApi, updateConversationStatusApi, getAttachableOrdersApi,
} from '../../api/client';
import type { Conversation, ChatMessage, AttachableOrder } from '../../types';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { Avatar } from '../../components/admin/listKit';
import ChatAttachmentBubble from '../../components/chat/ChatAttachmentBubble';
import { useChatAttach, AttachMenu } from '../../components/chat/ChatAttach';
import { mergeFetchedMessages, statusLabel, statusTone, inboxTime, dayLabel, clockTime, isAutoAttachmentBody } from '../../components/chat/chatUtils';
import { pesoCompact as peso } from '../../utils/pricing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TypeFilter = 'all' | 'buyer_admin' | 'seller_admin' | 'buyer_seller';
type StatusFilter = 'all' | 'open' | 'resolved';

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buyer_admin', label: 'Buyers' },
  { value: 'seller_admin', label: 'Sellers' },
  { value: 'buyer_seller', label: 'Shop chats' },
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

const EMPTY: ChatMessage[] = [];
const GROUP_GAP_MS = 5 * 60 * 1000;

/** Who a conversation is with, as the inbox and the thread header show it. */
function identity(c: Conversation) {
  const isSeller = c.type === 'seller_admin';
  const isBuyer = c.type === 'buyer_admin';
  const shop = c.seller?.shop_name || c.recipient?.shop_name || 'Shop';
  const buyer = c.buyer ? `${c.buyer.first_name} ${c.buyer.last_name}`.trim() : 'Buyer';
  const email = (isSeller ? c.seller?.email : c.buyer?.email) || '';
  return {
    name: isSeller ? shop : isBuyer ? buyer : `${buyer} · ${shop}`,
    sub: isSeller ? `Owner: ${c.seller?.owner_name || c.recipient?.seller_name || 'Seller'}` : isBuyer ? email || 'Buyer' : 'Buyer and shop chat',
    email,
    avatar: (isSeller ? c.seller?.shop_logo || c.seller?.avatar_url : c.buyer?.avatar_url) || null,
    kind: isSeller ? 'Seller' : isBuyer ? 'Buyer' : 'Shop chat',
    isSeller,
    isShopChat: c.type === 'buyer_seller',
    profileHref: email ? `/admin/${isSeller ? 'sellers' : 'buyers'}?search=${encodeURIComponent(email)}` : null,
  };
}

const KIND_TONE: Record<string, string> = {
  Buyer: 'bg-sky-50 text-sky-700',
  Seller: 'bg-amber-50 text-amber-700',
  'Shop chat': 'bg-gray-100 text-gray-600',
};

function orderLink(d: { order_number?: string }) {
  return d.order_number ? `/admin/orders?search=${encodeURIComponent(d.order_number)}` : undefined;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [searchParams] = useSearchParams();
  const sellerIdParam = searchParams.get('seller');

  // Inbox filters; the search is applied once typing pauses.
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const listKey = JSON.stringify([typeFilter, statusFilter, search]);
  const listKeyRef = useRef(listKey);
  useEffect(() => { listKeyRef.current = listKey; });
  const [list, setList] = useState<{ key: string; items: Conversation[] } | null>(null);
  const conversations = list?.items ?? [];
  const loadingList = list?.key !== listKey;

  // The open conversation: looked up in the inbox (fresh data), else the copy kept when it was opened.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pinned, setPinned] = useState<Conversation | null>(null);
  const selectedConv = conversations.find((c) => c.id === selectedId) ?? (pinned && pinned.id === selectedId ? pinned : null);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; });
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('list');

  const [thread, setThread] = useState<{ id: number; messages: ChatMessage[] } | null>(null);
  const messages = thread && thread.id === selectedId ? thread.messages : EMPTY;
  const loadingMessages = selectedId !== null && thread?.id !== selectedId;

  const [wsConnected, setWsConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1536);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const fetchList = useCallback((key: string) => {
    const [type, status, q] = JSON.parse(key) as [TypeFilter, StatusFilter, string];
    return getConversationsApi({
      ...(type !== 'all' ? { type } : {}),
      ...(status !== 'all' ? { status } : {}),
      ...(q ? { search: q } : {}),
    });
  }, []);

  // Inbox: on load and whenever a filter changes.
  useEffect(() => {
    let alive = true;
    fetchList(listKey)
      .then((items) => {
        if (!alive) return;
        setList({ key: listKey, items: items.map((c) => (c.id === selectedIdRef.current ? { ...c, unread: 0 } : c)) });
        setSelectedId((prev) => prev ?? items[0]?.id ?? null);
      })
      .catch(() => { if (alive) setList({ key: listKey, items: [] }); });
    return () => { alive = false; };
  }, [listKey, fetchList]);

  // ?seller=ID (from a seller's page): open, or start, the support chat with that shop.
  useEffect(() => {
    if (!sellerIdParam) return;
    let alive = true;
    openConversationForSellerApi(Number(sellerIdParam))
      .then((conv) => { if (!alive) return; setPinned(conv); setSelectedId(conv.id); setMobilePane('thread'); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sellerIdParam]);

  // ?conversation=ID (from a "buyer wants to talk to a person" notice): open that chat.
  const conversationParam = Number(searchParams.get('conversation')) || null;
  useEffect(() => {
    if (!conversationParam) return;
    setSelectedId(conversationParam);
    setMobilePane('thread');
  }, [conversationParam]);

  // Thread: whenever another conversation opens. Fetching marks its messages read.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    getConversationMessagesApi(selectedId)
      .then((m) => { if (alive) setThread({ id: selectedId, messages: m }); })
      .catch(() => { if (alive) setThread({ id: selectedId, messages: [] }); });
    return () => { alive = false; };
  }, [selectedId]);

  const refreshThread = useCallback(() => {
    const id = selectedIdRef.current;
    if (!id) return;
    getConversationMessagesApi(id)
      .then((m) => setThread((t) => (t && t.id === id ? { id, messages: mergeFetchedMessages(t.messages, m) } : t)))
      .catch(() => {});
  }, []);

  const refreshList = useCallback(() => {
    const key = listKeyRef.current;
    fetchList(key)
      .then((items) => setList((l) => (l && l.key === key ? { key, items: items.map((c) => (c.id === selectedIdRef.current ? { ...c, unread: 0 } : c)) } : l)))
      .catch(() => {});
  }, [fetchList]);

  const patchConv = useCallback((id: number, patch: Partial<Conversation>) => {
    setList((l) => (l ? { ...l, items: l.items.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : l));
    setPinned((p) => (p && p.id === id ? { ...p, ...patch } : p));
  }, []);

  const touchLastMessage = useCallback((msg: ChatMessage) => {
    patchConv(msg.conversation_id, {
      last_message: { id: msg.id, body: msg.body, sender_id: msg.sender_id, created_at: msg.created_at },
      last_message_at: msg.created_at,
    });
  }, [patchConv]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setThread((t) => (t && t.id === msg.conversation_id && !t.messages.some((m) => m.id === msg.id) ? { ...t, messages: [...t.messages, msg] } : t));
  }, []);

  // ── Live: the admin's inbox channel ──
  useEffect(() => {
    if (!userId) return;
    const echo = getEcho();
    const connection = echo.connector?.pusher?.connection;
    const onState = (states: { current: string; previous: string }) => {
      const live = states.current === 'connected';
      setWsConnected(live);
      if (live && states.previous !== 'connected') { refreshList(); refreshThread(); }
    };
    if (connection) {
      setWsConnected(connection.state === 'connected');
      connection.bind('state_change', onState);
    }

    const channelName = `user.${userId}.conversations`;
    const onUpdated = (payload: { conversation?: Conversation }) => {
      const updated = payload?.conversation;
      if (!updated) return;
      const unread = updated.id === selectedIdRef.current ? 0 : updated.unread;
      setList((l) => {
        if (!l) return l;
        const exists = l.items.some((c) => c.id === updated.id);
        const items = exists
          ? l.items.map((c) => (c.id === updated.id ? { ...c, ...updated, unread: unread ?? c.unread } : c))
          : [{ ...updated, unread: unread ?? 0 }, ...l.items];
        return { ...l, items: [...items].sort((a, b) => (b.last_message_at || b.created_at).localeCompare(a.last_message_at || a.created_at)) };
      });
    };
    const channel = echo.private(channelName);
    channel.listen('.ConversationUpdated', onUpdated);

    return () => {
      connection?.unbind?.('state_change', onState);
      echo.leave(channelName);
    };
  }, [userId, refreshList, refreshThread]);

  // ── Live: the open conversation's channel ──
  useEffect(() => {
    if (!userId || !selectedId) return;
    const echo = getEcho();
    const channelName = `conversation.${selectedId}`;
    const channel = echo.private(channelName);

    const onSent = (msg: ChatMessage) => {
      appendMessage(msg);
      touchLastMessage(msg);
      // Someone else wrote while the thread is open: fetch it once more so it is marked read (they see "Seen").
      if (msg.sender_id !== userId) refreshThread();
    };
    const onRead = (data: { reader_id: number; read_at: string }) => {
      if (data.reader_id === userId) return;
      setThread((t) => (t && t.id === selectedId
        ? { ...t, messages: t.messages.map((m) => (m.sender_id === userId && !m.read_at ? { ...m, read_at: data.read_at } : m)) }
        : t));
    };
    channel.listen('.MessageSent', onSent);
    channel.listen('.MessageRead', onRead);
    return () => { echo.leave(channelName); };
  }, [userId, selectedId, appendMessage, touchLastMessage, refreshThread]);

  // The safety net under the websocket: every few seconds while it is down, now and then while it is up.
  usePolling(refreshThread, CHAT_POLL.thread(wsConnected), selectedId !== null);
  usePolling(refreshList, CHAT_POLL.inbox(wsConnected));

  // Keep the newest message in view.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId, selectedId]);

  // ── Actions ──

  const send = async (payload: FormData | { body?: string; attachment_type?: string; attachment_data?: unknown }, restore?: () => void) => {
    if (!selectedConv) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendConversationMessageApi(selectedConv.id, payload);
      appendMessage(msg);
      touchLastMessage(msg);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || 'The message did not send. Check the connection and try again.');
      restore?.();
    } finally {
      setSending(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    const img = image;
    if (!selectedConv || (!text && !img) || sending) return;
    setDraft('');
    setImage(null);
    if (inputRef.current) inputRef.current.style.height = '';
    let payload: FormData | { body: string };
    if (img) {
      const fd = new FormData();
      if (text) fd.append('body', text);
      fd.append('image', img);
      payload = fd;
    } else {
      payload = { body: text };
    }
    send(payload, () => { setDraft(text); setImage(img); });
  };

  const shareOrder = (orderId: number) => send({ body: '', attachment_type: 'order_card', attachment_data: { id: orderId } });

  const attach = useChatAttach({
    conversationId: selectedConv?.id,
    onImage: (file) => { setImage(file); inputRef.current?.focus(); },
    onOrder: (o) => shareOrder(o.id),
    onProduct: (p) => send({ body: '', attachment_type: 'product_card', attachment_data: { id: p.id } }),
  });

  const toggleStatus = async () => {
    if (!selectedConv) return;
    const next = selectedConv.status === 'resolved' ? 'open' : 'resolved';
    try {
      await updateConversationStatusApi(selectedConv.id, next);
      patchConv(selectedConv.id, { status: next });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || 'Could not update the conversation.');
    }
  };

  const selectConv = (c: Conversation) => {
    setSelectedId(c.id);
    setPinned(c);
    setMobilePane('thread');
    setError(null);
    if (c.id !== selectedId) { setDraft(''); setImage(null); }
    if (c.unread) patchConv(c.id, { unread: 0 });
  };

  const startChat = async (contact: { id: number; role: 'buyer' | 'seller' }) => {
    setShowNewChat(false);
    try {
      const conv = await startConversationApi(contact.role === 'seller'
        ? { type: 'seller_admin', seller_id: contact.id }
        : { type: 'buyer_admin', buyer_id: contact.id });
      setPinned(conv);
      setSelectedId(conv.id);
      setMobilePane('thread');
      refreshList();
    } catch {
      setError('Could not start a conversation with this person.');
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const who = selectedConv ? identity(selectedConv) : null;
  const lastMineId = [...messages].reverse().find((m) => m.sender_role === 'admin' || m.sender_role === 'assistant')?.id;
  const resolved = selectedConv?.status === 'resolved';

  return (
    <div className="space-y-4">
      <PageHero icon={MessageSquare} eyebrow="Admin / Support" title="Messages" subtitle="Answer buyers and sellers, share their orders, and close conversations once they are sorted.">
        {totalUnread > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-red text-white">
            {totalUnread} unread
          </span>
        )}
        <span
          role="status"
          title={wsConnected ? 'New messages appear the moment they are sent.' : 'The live connection is down, so the inbox refreshes itself every few seconds.'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${wsConnected ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-200 border-amber-500/30'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`} aria-hidden="true" />
          {wsConnected ? 'Live' : 'Auto-refresh'}
        </span>
        <button type="button" onClick={() => setShowNewChat(true)} className={HERO_BUTTON}>
          <Plus className="w-4 h-4" /> New conversation
        </button>
      </PageHero>

      <div className="relative bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden flex h-[calc(100dvh-196px)] min-h-[560px]">
        {/* ── Inbox ── */}
        <aside className={`${mobilePane === 'thread' ? 'hidden lg:flex' : 'flex'} w-full lg:w-[330px] shrink-0 flex-col border-r border-gray-200/80`}>
          <div className="p-3 space-y-3 border-b border-gray-100">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search names, shops or messages"
                aria-label="Search conversations"
                className="w-full h-10 pl-9 pr-8 rounded-xl bg-gray-50 border border-gray-200 text-[13px] outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 placeholder:text-gray-400"
              />
              {searchInput && (
                <button type="button" onClick={() => setSearchInput('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-gray-400 hover:text-gray-700 flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <div role="tablist" aria-label="Conversation type" className="flex gap-4 border-b border-gray-100 -mx-3 px-3">
              {TYPE_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === t.value}
                  onClick={() => setTypeFilter(t.value)}
                  className={`relative pb-2 text-[12.5px] font-semibold transition-colors ${typeFilter === t.value ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                >
                  {t.label}
                  {typeFilter === t.value && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-red" />}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Conversation status" className="inline-flex p-0.5 rounded-lg bg-gray-100">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === t.value}
                  onClick={() => setStatusFilter(t.value)}
                  className={`px-3 h-7 rounded-md text-[12px] font-semibold transition-colors ${statusFilter === t.value ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingList ? (
              <ul aria-busy="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <li key={i} className="flex gap-3 px-3 py-3">
                    <span className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                    <span className="flex-1 space-y-2 pt-1">
                      <span className="block h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                      <span className="block h-3 w-4/5 rounded bg-gray-100 animate-pulse" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : conversations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <span className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center"><Inbox className="w-6 h-6" /></span>
                <p className="mt-3 text-[13px] font-semibold text-gray-800">{search || typeFilter !== 'all' || statusFilter !== 'all' ? 'Nothing matches these filters' : 'No conversations yet'}</p>
                <p className="mt-1 text-[12px] text-gray-500">Messages from buyers and sellers land here.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((c) => {
                  const id = identity(c);
                  const active = c.id === selectedId;
                  const unread = c.unread || 0;
                  const mine = c.last_message?.sender_id === userId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectConv(c)}
                        aria-current={active ? 'true' : undefined}
                        className={`relative w-full flex gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${active ? 'bg-red-50/70' : 'hover:bg-gray-50'}`}
                      >
                        {active && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-brand-red" aria-hidden="true" />}
                        <Avatar name={id.name} src={id.avatar} icon={id.isSeller && !id.avatar ? Store : undefined} size="md" />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={`flex-1 truncate text-[13px] ${unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{id.name}</span>
                            <span className="text-[11px] text-gray-400 shrink-0">{inboxTime(c.last_message_at || c.created_at)}</span>
                          </span>
                          <span className="flex items-center gap-1.5 mt-0.5">
                            <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${KIND_TONE[id.kind]}`}>{id.kind}</span>
                            {c.status === 'resolved' && <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Resolved</span>}
                          </span>
                          <span className="flex items-center gap-2 mt-1">
                            <span className={`flex-1 truncate text-[12px] ${unread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              {c.last_message ? `${mine ? 'You: ' : ''}${c.last_message.body}` : 'No messages yet'}
                            </span>
                            {unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-[10.5px] font-bold flex items-center justify-center shrink-0">{unread > 99 ? '99+' : unread}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Thread ── */}
        <section className={`${mobilePane === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 min-w-0 flex-col`}>
          {!selectedConv || !who ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50/50">
              <span className="w-16 h-16 rounded-2xl bg-white border border-gray-200 text-brand-red flex items-center justify-center shadow-xs"><MessageSquare className="w-7 h-7" /></span>
              <h2 className="mt-4 text-[15px] font-bold text-gray-900">Pick a conversation</h2>
              <p className="mt-1 text-[12.5px] text-gray-500 max-w-xs">Choose one from the inbox, or start a new one with any buyer or shop.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 px-4 h-[64px] border-b border-gray-100 shrink-0">
                <button type="button" onClick={() => setMobilePane('list')} className="lg:hidden -ml-1 w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center" aria-label="Back to the inbox">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <Avatar name={who.name} src={who.avatar} icon={who.isSeller && !who.avatar ? Store : undefined} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-[14px] font-bold text-gray-900 truncate">{who.name}</h2>
                    <span className={`px-1.5 py-px rounded text-[10px] font-semibold shrink-0 ${KIND_TONE[who.kind]}`}>{who.kind}</span>
                  </div>
                  <p className="text-[12px] text-gray-500 truncate">
                    {selectedConv.support_mode === 'ai' ? 'The Loved-IT Assistant is answering. Reply to take over.' : who.sub}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleStatus}
                  className={`h-9 px-3 rounded-xl text-[12px] font-semibold inline-flex items-center gap-1.5 border transition-colors ${resolved ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                >
                  {resolved ? <><RotateCcw className="w-3.5 h-3.5" /> Reopen</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved</>}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
                  aria-pressed={detailsOpen}
                  aria-label={detailsOpen ? 'Hide details' : 'Show details'}
                  title={detailsOpen ? 'Hide details' : 'Details and orders'}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${detailsOpen ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {detailsOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                </button>
              </header>

              {resolved && (
                <div className="px-4 py-2 text-[12px] text-emerald-800 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Marked resolved. A new message from them reopens it in the inbox.
                </div>
              )}

              <div className="flex-1 min-h-0 flex relative">
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-gray-50/60">
                    {loadingMessages ? (
                      <div className="h-full flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center">
                        <p className="text-[13px] font-semibold text-gray-700">No messages yet</p>
                        <p className="mt-1 text-[12px] text-gray-500">Say hello, or share one of their orders to get started.</p>
                      </div>
                    ) : (
                      messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const next = messages[i + 1];
                        const t = new Date(m.created_at).getTime();
                        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                        const joinsPrev = !!prev && !newDay && prev.sender_id === m.sender_id && t - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
                        const endsGroup = !next || next.sender_id !== m.sender_id
                          || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString()
                          || new Date(next.created_at).getTime() - t >= GROUP_GAP_MS;
                        // The Loved-IT Assistant answers for support, so its replies sit on the support side.
                        const bot = m.sender_role === 'assistant';
                        const mine = m.sender_role === 'admin' || bot;
                        const avatar = m.sender_avatar || (m.sender_role === 'seller' ? selectedConv.seller?.shop_logo || selectedConv.seller?.avatar_url : selectedConv.buyer?.avatar_url) || null;
                        const showBody = !!m.body && !isAutoAttachmentBody(m);
                        return (
                          <div key={m.id}>
                            {newDay && (
                              <div className="flex items-center gap-3 my-4" role="separator">
                                <span className="flex-1 h-px bg-gray-200" />
                                <span className="text-[11px] font-semibold text-gray-400">{dayLabel(m.created_at)}</span>
                                <span className="flex-1 h-px bg-gray-200" />
                              </div>
                            )}
                            <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${joinsPrev ? 'mt-0.5' : 'mt-3'}`}>
                              {!mine && (
                                <span className="w-8 shrink-0">
                                  {endsGroup && <Avatar name={m.sender_name || who.name} src={avatar} size="sm" />}
                                </span>
                              )}
                              <div className={`flex flex-col min-w-0 max-w-[min(78%,520px)] ${mine ? 'items-end' : 'items-start'}`}>
                                {!mine && !joinsPrev && who.isShopChat && (
                                  <span className="mb-1 px-1 text-[11px] font-semibold text-gray-500">{m.sender_shop_name || m.sender_name}</span>
                                )}
                                {bot && !joinsPrev && <span className="mb-1 px-1 text-[11px] font-semibold text-gray-500">Loved-IT Assistant</span>}
                                {m.attachment_type && m.attachment_data && (
                                  <ChatAttachmentBubble type={m.attachment_type} data={m.attachment_data} isMe={mine} orderHref={orderLink} />
                                )}
                                {showBody && (
                                  <div className={`px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${bot
                                    ? `bg-gray-800 text-white rounded-2xl ${endsGroup ? 'rounded-br-md' : ''}`
                                    : mine
                                    ? `bg-brand-red text-white rounded-2xl ${endsGroup ? 'rounded-br-md' : ''}`
                                    : `bg-white text-gray-900 border border-gray-200/80 rounded-2xl ${endsGroup ? 'rounded-bl-md' : ''}`}`}>
                                    {m.body}
                                  </div>
                                )}
                                {endsGroup && (
                                  <span className="mt-1 px-1 text-[10.5px] text-gray-400">
                                    {clockTime(m.created_at)}
                                    {mine && m.id === lastMineId && <span className={m.read_at ? 'text-gray-600 font-semibold' : ''}> · {m.read_at ? 'Seen' : 'Sent'}</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={endRef} />
                  </div>

                  {/* Composer */}
                  <div className="border-t border-gray-100 bg-white px-3 sm:px-4 pt-2.5 pb-3">
                    {error && (
                      <p role="alert" className="mb-2 flex items-center gap-2 text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> <span className="flex-1">{error}</span>
                        <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-700"><X className="w-3.5 h-3.5" /></button>
                      </p>
                    )}
                    {imageUrl && (
                      <div className="mb-2 inline-flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-gray-200 bg-gray-50">
                        <img src={imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        <span className="text-[12px] text-gray-600 max-w-[200px] truncate">{image?.name}</span>
                        <button type="button" onClick={() => setImage(null)} aria-label="Remove the photo" className="w-6 h-6 rounded-full text-gray-400 hover:text-gray-800 hover:bg-gray-200 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                    <form onSubmit={handleSend} className="flex items-end gap-2">
                      <AttachMenu attach={attach} disabled={sending} />
                      <div className="flex-1 min-w-0 rounded-2xl border border-gray-200 bg-white focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/10 transition-colors">
                        <textarea
                          ref={inputRef}
                          rows={1}
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
                          }}
                          placeholder={`Reply to ${who.name}`}
                          aria-label="Message"
                          className="block w-full resize-none bg-transparent px-3.5 py-2.5 text-[13px] leading-5 outline-none placeholder:text-gray-400 max-h-[140px]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={(!draft.trim() && !image) || sending}
                        className="h-10 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span className="hidden sm:inline">Send</span>
                      </button>
                    </form>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {selectedConv.order && (
                        <ActionChip icon={Package} onClick={() => shareOrder(selectedConv.order!.id)} disabled={sending}>
                          Send order #{selectedConv.order.order_number.slice(-6)} card
                        </ActionChip>
                      )}
                      <ActionChip icon={Package} onClick={attach.pickOrder} disabled={sending}>Look up an order</ActionChip>
                      {!detailsOpen && <ActionChip icon={PanelRightOpen} onClick={() => setDetailsOpen(true)}>Details</ActionChip>}
                      <span className="ml-auto hidden md:inline text-[11px] text-gray-400">Enter to send · Shift + Enter for a new line</span>
                    </div>
                  </div>
                </div>

                {detailsOpen && (
                  <ContactPanel key={selectedConv.id} conv={selectedConv} onShareOrder={shareOrder} sending={sending} onClose={() => setDetailsOpen(false)} />
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {attach.elements}
      {showNewChat && <NewChatSheet onClose={() => setShowNewChat(false)} onSelect={startChat} />}
    </div>
  );
}

function ActionChip({ icon: Icon, onClick, disabled, children }: { icon: React.ElementType; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-7 px-2.5 rounded-full border border-gray-200 text-[11.5px] font-semibold text-gray-600 hover:border-gray-400 hover:text-gray-900 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40">
      <Icon className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

// ─── Details: who this is, what they ordered ──────────────────────────────────

function ContactPanel({ conv, onShareOrder, sending, onClose }: { conv: Conversation; onShareOrder: (orderId: number) => void; sending: boolean; onClose: () => void }) {
  const who = identity(conv);
  const [orders, setOrders] = useState<AttachableOrder[] | null>(null);

  useEffect(() => {
    let alive = true;
    getAttachableOrdersApi(conv.id).then((o) => { if (alive) setOrders(o); }).catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, [conv.id]);

  return (
    <aside className="absolute xl:static inset-y-0 right-0 z-20 w-[300px] max-w-full shrink-0 bg-white border-l border-gray-200/80 shadow-2xl xl:shadow-none flex flex-col">
      <div className="flex items-center justify-between px-4 h-11 border-b border-gray-100">
        <h3 className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">Details</h3>
        <button type="button" onClick={onClose} aria-label="Close details" className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 text-center border-b border-gray-100">
          <div className="flex justify-center"><Avatar name={who.name} src={who.avatar} icon={who.isSeller && !who.avatar ? Store : undefined} size="xl" /></div>
          <p className="mt-3 text-[14px] font-bold text-gray-900">{who.name}</p>
          <p className="text-[12px] text-gray-500">{who.sub}</p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${KIND_TONE[who.kind]}`}>{who.kind}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${conv.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{conv.status === 'resolved' ? 'Resolved' : 'Open'}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {who.email ? (
              <a href={`mailto:${who.email}`} className="h-9 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</a>
            ) : <span />}
            {who.profileHref ? (
              <Link to={who.profileHref} className="h-9 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Profile</Link>
            ) : <span />}
          </div>
        </div>

        {(conv.product || conv.order) && (
          <div className="px-4 py-4 border-b border-gray-100 space-y-2">
            <p className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">Started about</p>
            {conv.product && (
              <Link to={`/admin/products/${conv.product.id}`} className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-200 hover:border-gray-300">
                {conv.product.image
                  ? <img src={conv.product.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                  : <span className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center"><ShoppingBag className="w-4 h-4" /></span>}
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-gray-900 truncate">{conv.product.name}</span>
                  <span className="block text-[12px] font-bold text-brand-red">{peso(Number(conv.product.price))}</span>
                </span>
              </Link>
            )}
            {conv.order && (
              <Link to={orderLink(conv.order) || '/admin/orders'} className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-200 hover:border-gray-300">
                <span className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center"><Package className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] font-semibold text-gray-900 truncate">#{conv.order.order_number}</span>
                  <span className="block text-[11.5px] text-gray-500">{statusLabel(conv.order.status)} · {peso(Number(conv.order.total))}</span>
                </span>
              </Link>
            )}
          </div>
        )}

        <div className="px-4 py-4">
          <p className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">{who.isSeller ? 'Shop orders' : 'Their orders'}</p>
          {orders === null ? (
            <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
          ) : orders.length === 0 ? (
            <p className="mt-2 text-[12px] text-gray-500">No orders yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id} className="p-2.5 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] font-semibold text-gray-900 truncate">#{o.order_number}</span>
                    <span className="text-[12px] font-bold text-gray-900 tabular-nums shrink-0">{peso(Number(o.total))}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-gray-500 truncate">{o.items_summary || `${o.items_count} items`}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                    <span className="flex-1" />
                    <button type="button" disabled={sending} onClick={() => onShareOrder(o.id)} className="h-7 px-2.5 rounded-lg bg-gray-900 hover:bg-black text-white text-[11px] font-semibold disabled:opacity-40">Send</button>
                    <Link to={orderLink(o) || '/admin/orders'} className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center" aria-label={`Open order ${o.order_number}`}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── New conversation ─────────────────────────────────────────────────────────

type Contact = Awaited<ReturnType<typeof searchAdminContactsApi>>[number];

function NewChatSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (c: Contact) => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ q: string; items: Contact[] } | null>(null);
  const loading = result?.q !== query;

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      searchAdminContactsApi(query)
        .then((items) => { if (alive) setResult({ q: query, items }); })
        .catch(() => { if (alive) setResult({ q: query, items: [] }); });
    }, 250);
    return () => { alive = false; window.clearTimeout(id); };
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="New conversation">
      <div className="absolute inset-0 bg-gray-950/45" onClick={onClose} />
      <div className="relative w-full sm:max-w-[440px] h-[78vh] sm:h-[520px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <header className="relative px-5 pt-5 pb-3 text-center">
          <h2 className="text-[16px] font-bold text-gray-900">New conversation</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Message any buyer or shop on Loved-IT.</p>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </header>
        <div className="px-5 pb-3">
          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or shop name" aria-label="Search people"
              className="w-full h-10 pl-10 pr-4 rounded-full bg-gray-100 border border-transparent text-[13px] outline-none focus:bg-white focus:border-gray-300" />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-gray-100 pt-2">
          {loading && !result ? (
            <div className="h-full flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (result?.items.length ?? 0) === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <span className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><Search className="w-7 h-7" strokeWidth={1.5} /></span>
              <p className="mt-3 text-[13px] font-semibold text-gray-800">{query ? 'Nobody matches that' : 'Search for someone'}</p>
              <p className="mt-1 text-[12px] text-gray-500">Try a name, an email address or a shop name.</p>
            </div>
          ) : (
            <ul className={`space-y-0.5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {result!.items.map((c) => (
                <li key={`${c.role}-${c.id}`}>
                  <button type="button" onClick={() => onSelect(c)} className="group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-gray-50">
                    <Avatar name={c.shop_name || c.name} src={c.shop_logo || c.avatar_url} icon={c.role === 'seller' && !(c.shop_logo || c.avatar_url) ? Store : undefined} size="md" />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-900 truncate">{c.shop_name || c.name}</span>
                        <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${c.role === 'seller' ? KIND_TONE.Seller : KIND_TONE.Buyer}`}>{c.role === 'seller' ? 'Seller' : 'Buyer'}</span>
                      </span>
                      <span className="block text-[12px] text-gray-500 truncate">{c.role === 'seller' ? `${c.name} · ${c.email}` : c.email}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
