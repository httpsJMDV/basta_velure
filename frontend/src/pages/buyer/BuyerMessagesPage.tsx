import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Search, Headphones, Send, ShoppingBag, Package, ShieldCheck, X, Bike, Lock, ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import AvatarWithFallback from '../../components/ui/AvatarWithFallback';
import ChatAttachmentBubble from '../../components/chat/ChatAttachmentBubble';
import { useChatAttach, AttachMenu } from '../../components/chat/ChatAttach';
import { isAutoAttachmentBody, buyerOrderHref, inboxTime, dayLabel, clockTime } from '../../components/chat/chatUtils';
import RiderThreadPane from '../../components/chat/RiderThreadPane';
import { isRiderThread } from '../../lib/riderThread';
import { SupportModeBar, SupportSenderLabel, AssistantTyping, AssistantText, AfterTyping, assistantIsTyping, scrollToBottom } from '../../components/chat/SupportAssistantKit';
import type { Conversation } from '../../types';

type Tab = 'all' | 'sellers' | 'delivery' | 'support';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sellers', label: 'Shops' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'support', label: 'Support' },
];
const GROUP_GAP_MS = 5 * 60 * 1000;
const SAFETY_KEY = 'loved_it_dismissed_safety_notice';

/** Who a conversation is with, as the inbox shows it. */
function who(c: Conversation) {
  if (isRiderThread(c)) return { name: 'Delivery rider', kind: 'rider' as const, avatar: null };
  if (c.type === 'buyer_admin') return { name: 'Loved-IT Support', kind: 'support' as const, avatar: null };
  return { name: c.seller?.shop_name || 'Shop', kind: 'shop' as const, avatar: c.seller?.shop_logo || c.seller?.avatar_url || null };
}

function Face({ c, size = 'w-11 h-11' }: { c: Conversation; size?: string }) {
  const w = who(c);
  if (w.kind === 'rider') return <span className={`${size} rounded-full bg-sky-50 text-sky-700 flex items-center justify-center shrink-0`}><Bike className="w-5 h-5" /></span>;
  if (w.kind === 'support') return <span className={`${size} rounded-full bg-brand-red text-white flex items-center justify-center shrink-0`}><Headphones className="w-5 h-5" /></span>;
  return <AvatarWithFallback src={w.avatar} alt={w.name} role="seller" fallbackInitials={w.name} className={`${size} rounded-full shrink-0`} />;
}

/** The buyer's inbox on the account pages: shops, delivery riders and Loved-IT Support, side by side with the thread. */
export default function BuyerMessagesPage() {
  const { user } = useAuth();
  const {
    conversations, activeConversation, messages, loadingConversations, loadingMessages, sendingMessage, wsConnected,
    selectConversation, clearActiveConversation, openChatWithSupport, sendMessage, confirmOrderAddress, talkToPerson, backToAssistant, refreshConversations,
  } = useChat();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [safetyDismissed, setSafetyDismissed] = useState(() => {
    try { return localStorage.getItem(SAFETY_KEY) === 'true'; } catch { return false; }
  });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const imageUrl = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const attach = useChatAttach({
    conversationId: activeConversation?.id,
    onImage: (file) => { setImage(file); inputRef.current?.focus(); },
    onOrder: (o) => { void sendMessage('', 'order_card', { id: o.id }); },
    onProduct: (p) => { void sendMessage('', 'product_card', { id: p.id }); },
  });

  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [lastId, activeConversation?.id]);

  const list = conversations.filter((c) => {
    if (tab === 'sellers' && c.type !== 'buyer_seller') return false;
    if (tab === 'delivery' && c.type !== 'rider_buyer') return false;
    if (tab === 'support' && c.type !== 'buyer_admin') return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.seller?.shop_name, c.subject, c.product?.name, c.last_message?.body].some((v) => (v ?? '').toLowerCase().includes(q));
  });
  const unreadByTab = (t: Tab) => conversations.filter((c) => (t === 'all' || (t === 'sellers' && c.type === 'buyer_seller') || (t === 'delivery' && c.type === 'rider_buyer') || (t === 'support' && c.type === 'buyer_admin')) && c.unread > 0).length;

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!draft.trim() && !image) || sendingMessage) return;
    const text = draft;
    const img = image;
    setDraft('');
    setImage(null);
    if (inputRef.current) inputRef.current.style.height = '';
    await sendMessage(text, undefined, undefined, img || undefined);
  };

  const dismissSafety = () => {
    setSafetyDismissed(true);
    try { localStorage.setItem(SAFETY_KEY, 'true'); } catch { /* private window */ }
  };

  const active = activeConversation;
  const activeWho = active ? who(active) : null;
  // Loved-IT Support: the inbox copy is kept fresh, so a handoff made by the assistant shows here too.
  const supportMode = active?.type === 'buyer_admin' ? conversations.find((c) => c.id === active.id)?.support_mode ?? active.support_mode : null;
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === user?.id)?.id;

  return (
    <section className="rounded-3xl bg-white/60 border border-stone-200 overflow-hidden">
      <header className="px-6 pt-6 pb-5 bg-white border-b border-stone-200 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif font-bold tracking-tight text-[#1E1B18]">Messages</h2>
          <p className="mt-1 text-[13px] text-stone-500">Chats with shops, your delivery riders and Loved-IT Support.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[12px] ${wsConnected ? 'text-emerald-700' : 'text-stone-500'}`} title={wsConnected ? 'New messages appear right away.' : 'Refreshing every few seconds.'}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
            {wsConnected ? 'Live' : 'Auto-refresh'}
          </span>
          <button type="button" onClick={() => openChatWithSupport()} className="h-9 px-4 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-800 hover:border-stone-900 inline-flex items-center gap-1.5">
            <Headphones className="w-4 h-4 text-brand-red" /> Contact support
          </button>
        </div>
      </header>

      {!safetyDismissed && (
        <div className="flex items-start gap-3 px-6 py-3 bg-[#FAF8F5] border-b border-stone-200 text-[12.5px] text-stone-700">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
          <p className="flex-1">Keep chats and payments on Loved-IT. A shop will never ask you to pay outside checkout or to share your password or OTP.</p>
          <button type="button" onClick={dismissSafety} aria-label="Dismiss" className="text-stone-400 hover:text-stone-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex h-[640px] bg-white">
        {/* Inbox */}
        <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] shrink-0 flex-col border-r border-stone-200`}>
          <div className="px-4 pt-4">
            <label className="relative block">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shops or messages" aria-label="Search conversations"
                className="w-full h-10 pl-10 pr-3 rounded-full bg-stone-100 border border-transparent text-[13px] outline-none focus:bg-white focus:border-stone-300 placeholder:text-stone-400" />
            </label>
            <div role="tablist" aria-label="Conversation type" className="flex gap-4 mt-3 border-b border-stone-200">
              {TABS.map((t) => {
                const unread = unreadByTab(t.key);
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                    className={`relative pb-2.5 text-[13px] transition-colors ${tab === t.key ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                    {t.label}{unread > 0 && <span className="ml-1 text-brand-red tabular-nums">{unread}</span>}
                    {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-red" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingConversations && conversations.length === 0 ? (
              <ul aria-busy="true">{[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 p-3"><span className="w-11 h-11 rounded-full bg-stone-100 animate-pulse" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-stone-100 animate-pulse" /><span className="block h-3 w-3/4 rounded bg-stone-100 animate-pulse" /></span></li>
              ))}</ul>
            ) : list.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <span className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center"><MessageSquare className="w-5 h-5" /></span>
                <p className="mt-3 text-[13px] font-semibold text-stone-900">{search ? 'No matches' : 'No conversations here'}</p>
                <p className="mt-1 text-[12px] text-stone-500">{search ? 'Try another shop name or word.' : 'Tap "Chat" on a product or shop page to ask the seller.'}</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {list.map((c) => {
                  const w = who(c);
                  const on = active?.id === c.id;
                  const unread = c.unread > 0;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => selectConversation(c)} aria-current={on ? 'true' : undefined}
                        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors ${on ? 'bg-[#FAF8F5]' : 'hover:bg-stone-50'}`}>
                        {on && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-brand-red" aria-hidden="true" />}
                        <Face c={c} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`text-[13px] truncate ${unread ? 'font-bold text-stone-900' : 'font-semibold text-stone-800'}`}>{w.name}</span>
                            <span className={`text-[11px] shrink-0 ${unread ? 'text-brand-red font-semibold' : 'text-stone-400'}`}>{inboxTime(c.last_message_at)}</span>
                          </span>
                          {isRiderThread(c) && c.parcel ? (
                            <span className="block text-[11px] text-stone-500 truncate"><span className="font-mono">{c.parcel.tracking_number}</span>{c.is_closed && <span className="ml-1.5 inline-flex items-center gap-0.5"><Lock className="w-3 h-3" />Closed</span>}</span>
                          ) : c.product ? (
                            <span className="block text-[11px] text-stone-500 truncate">About: {c.product.name}</span>
                          ) : null}
                          <span className="flex items-center gap-2">
                            <span className={`flex-1 text-[12px] truncate ${unread ? 'text-stone-900 font-medium' : 'text-stone-500'}`}>{c.last_message?.body || 'No messages yet'}</span>
                            {unread && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center">{c.unread > 99 ? '99+' : c.unread}</span>}
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

        {/* Thread */}
        <div className={`${active ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
          {!active || !activeWho ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#FAF8F5]">
              <span className="w-16 h-16 rounded-2xl bg-white border border-stone-200 text-brand-red flex items-center justify-center"><MessageSquare className="w-7 h-7" /></span>
              <h3 className="mt-4 text-[15px] font-semibold text-stone-900">Pick a conversation</h3>
              <p className="mt-1 text-[12.5px] text-stone-500 max-w-xs">Questions about an order? Contact Loved-IT Support and share the order right in the chat.</p>
            </div>
          ) : isRiderThread(active) ? (
            user ? <RiderThreadPane conversation={active} currentUserId={user.id} onActivity={() => void refreshConversations()} onBack={clearActiveConversation} /> : null
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 h-[64px] border-b border-stone-200 shrink-0">
                <button type="button" onClick={clearActiveConversation} className="md:hidden -ml-1 w-8 h-8 rounded-full text-stone-500 hover:bg-stone-100 flex items-center justify-center" aria-label="Back to the inbox"><ChevronLeft className="w-5 h-5" /></button>
                <Face c={active} size="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-stone-900 truncate">{activeWho.name}</p>
                  <p className="text-[12px] text-stone-500 truncate">{activeWho.kind === 'support' ? (supportMode === 'ai' ? 'Assistant replies right away' : 'Official Loved-IT support') : 'Shop on Loved-IT'}</p>
                </div>
                {activeWho.kind === 'shop' && active.seller?.shop_name && (
                  <Link to={`/shop/${active.seller.shop_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`} className="hidden sm:inline-flex h-8 px-3 rounded-full border border-stone-300 text-[12px] font-semibold text-stone-700 hover:border-stone-900 items-center">Visit shop</Link>
                )}
              </div>

              {activeWho.kind === 'support' && <SupportModeBar mode={supportMode} assistantAvailable={active.assistant_available} onTalkToPerson={talkToPerson} onBackToAssistant={backToAssistant} />}

              {(active.product || active.order) && (
                <div className="px-4 py-2 border-b border-stone-200 shrink-0">
                  {active.product ? (
                    <Link to={`/products/${active.product.id}`} className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-stone-50">
                      {active.product.image ? <img src={active.product.image} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-stone-200" /> : <span className="w-10 h-10 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center"><ShoppingBag className="w-4 h-4" /></span>}
                      <span className="flex-1 min-w-0"><span className="block text-[12.5px] text-stone-900 truncate">{active.product.name}</span><span className="block text-[12px] font-bold text-brand-red">₱{active.product.price.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span></span>
                      <span className="text-[11.5px] font-semibold text-stone-500">View</span>
                    </Link>
                  ) : active.order ? (
                    <Link to="/settings/orders" className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-stone-50">
                      <span className="w-10 h-10 rounded-lg bg-stone-100 text-stone-500 flex items-center justify-center"><Package className="w-4 h-4" /></span>
                      <span className="flex-1 min-w-0"><span className="block text-[12.5px] text-stone-900 truncate">Order <span className="font-mono">#{active.order.order_number}</span></span><span className="block text-[11.5px] text-stone-500 capitalize">{active.order.status.replace(/_/g, ' ').toLowerCase()}</span></span>
                      <span className="text-[11.5px] font-semibold text-stone-500">Details</span>
                    </Link>
                  ) : null}
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-[#FAF8F5]">
                {loadingMessages && messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-stone-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <p className="text-[13px] font-semibold text-stone-900">Say hello to {activeWho.name}</p>
                    <p className="mt-1 text-[12px] text-stone-500">{activeWho.kind === 'support' ? 'Ask about an order, delivery, payment or returns.' : 'Ask about stock, sizes or shipping, or share an order with the + button.'}</p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const t = new Date(m.created_at).getTime();
                    const sameDay = (a?: string) => !!a && new Date(a).toDateString() === new Date(m.created_at).toDateString();
                    const newDay = !prev || !sameDay(prev.created_at);
                    const joinsPrev = !!prev && !newDay && prev.sender_id === m.sender_id && t - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
                    const endsGroup = !next || next.sender_id !== m.sender_id || !sameDay(next.created_at) || new Date(next.created_at).getTime() - t >= GROUP_GAP_MS;
                    const mine = m.sender_id === user?.id;
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="flex items-center gap-3 my-4" role="separator">
                            <span className="flex-1 h-px bg-stone-200" /><span className="text-[11px] font-medium text-stone-400">{dayLabel(m.created_at)}</span><span className="flex-1 h-px bg-stone-200" />
                          </div>
                        )}
                        <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${joinsPrev ? 'mt-0.5' : 'mt-3'}`}>
                          {!mine && <span className="w-8 shrink-0">{endsGroup && <Face c={active} size="w-8 h-8" />}</span>}
                          <div className={`flex flex-col min-w-0 max-w-[min(78%,480px)] ${mine ? 'items-end' : 'items-start'}`}>
                            {activeWho.kind === 'support' && !mine && !joinsPrev && <SupportSenderLabel role={m.sender_role} />}
                            {m.attachment_type && m.attachment_data && m.sender_role !== 'assistant' && <ChatAttachmentBubble type={m.attachment_type} data={m.attachment_data} isMe={mine} orderHref={buyerOrderHref}
                              onConfirmAddress={!mine && m.attachment_type === 'order_confirmation' ? () => confirmOrderAddress(m.id) : undefined} />}
                            {m.body && !isAutoAttachmentBody(m) && (
                              <div className={`px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${mine
                                ? `bg-brand-red text-white rounded-[18px] ${endsGroup ? 'rounded-br-md' : ''}`
                                : `bg-white text-stone-900 ring-1 ring-stone-200 rounded-[18px] ${endsGroup ? 'rounded-bl-md' : ''}`}`}>
                                {m.sender_role === 'assistant' ? <AssistantText message={m} onGrow={() => scrollToBottom(endRef.current?.parentElement)} /> : m.body}
                              </div>
                            )}
                            {/* The assistant's order cards come under its reply, once the reply has typed out. */}
                            {m.sender_role === 'assistant' && m.attachment_type && m.attachment_data && (
                              <AfterTyping message={m} onShow={() => scrollToBottom(endRef.current?.parentElement)}>
                                <ChatAttachmentBubble type={m.attachment_type} data={m.attachment_data} isMe={false} orderHref={buyerOrderHref} />
                              </AfterTyping>
                            )}
                            {endsGroup && (
                              <span className="mt-1 px-1 text-[10.5px] text-stone-400">
                                {clockTime(m.created_at)}{mine && m.id === lastMineId && <span className={m.read_at ? 'text-stone-600 font-semibold' : ''}> · {m.read_at ? 'Seen' : 'Sent'}</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {activeWho.kind === 'support' && assistantIsTyping(supportMode, messages, user?.id) && <AssistantTyping />}
                <div ref={endRef} />
              </div>

              <div className="border-t border-stone-200 bg-white px-3 sm:px-4 py-3 shrink-0">
                {imageUrl && (
                  <div className="mb-2 inline-flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-stone-200 bg-stone-50">
                    <img src={imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    <span className="text-[12px] text-stone-600 max-w-[200px] truncate">{image?.name}</span>
                    <button type="button" onClick={() => setImage(null)} aria-label="Remove the photo" className="w-6 h-6 rounded-full text-stone-400 hover:text-stone-800 hover:bg-stone-200 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                <form onSubmit={send} className="flex items-end gap-2">
                  <AttachMenu attach={attach} disabled={sendingMessage} products={activeWho.kind !== 'support'} />
                  <div className="flex-1 min-w-0 rounded-[22px] bg-stone-100 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-300 transition-colors">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                      placeholder={`Message ${activeWho.name}`}
                      aria-label="Message"
                      maxLength={1000}
                      className="block w-full resize-none bg-transparent px-4 py-2.5 text-[13.5px] leading-5 outline-none placeholder:text-stone-400 max-h-[120px]"
                    />
                  </div>
                  <button type="submit" disabled={(!draft.trim() && !image) || sendingMessage} aria-label="Send"
                    className="w-10 h-10 shrink-0 rounded-full bg-brand-red hover:bg-brand-red-dark text-white flex items-center justify-center transition-colors disabled:bg-stone-200 disabled:text-stone-400">
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 -ml-0.5" />}
                  </button>
                </form>
              </div>
              {attach.elements}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
