import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, X, ChevronLeft, ChevronRight, Send, Headphones, Search, ShoppingBag, Package, Maximize2, Bike, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import AvatarWithFallback from '../ui/AvatarWithFallback';
import ChatAttachmentBubble from './ChatAttachmentBubble';
import { useChatAttach, AttachMenu } from './ChatAttach';
import { isAutoAttachmentBody, buyerOrderHref } from './chatUtils';
import FloatingToolbar from './FloatingToolbar';
import RiderThreadPane from './RiderThreadPane';
import { isRiderThread } from '../../lib/riderThread';
import { SupportModeBar, SupportSenderLabel, AssistantTyping, AssistantText, AfterTyping, assistantIsTyping, scrollToBottom } from './SupportAssistantKit';

export default function BuyerFloatingChat() {
  const { user } = useAuth();
  const location = useLocation();
  // The full Messages page shows the same inbox, so the floating panel stays closed there.
  const onMessagesPage = location.pathname.startsWith('/settings/messages');
  const {
    isChatOpen,
    activeConversation,
    conversations,
    messages,
    unreadTotal,
    loadingConversations,
    loadingMessages,
    sendingMessage,
    wsConnected,
    toggleChat,
    closeChat,
    selectConversation,
    clearActiveConversation,
    openChatWithSupport,
    sendMessage,
    confirmOrderAddress,
    talkToPerson,
    backToAssistant,
    refreshConversations,
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'sellers' | 'delivery' | 'support'>('all');
  const [inputBody, setInputBody] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (activeConversation) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeConversation]);

  // Handle selected image preview
  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [selectedImage]);

  // Photo, order and product sharing (the + menu above the composer). The server writes the caption of a card.
  const attach = useChatAttach({
    conversationId: activeConversation?.id,
    onImage: (file) => { setSelectedImage(file); inputRef.current?.focus(); },
    onOrder: (o) => { void sendMessage('', 'order_card', { id: o.id }); },
    onProduct: (p) => { void sendMessage('', 'product_card', { id: p.id }); },
  });

  // Don't render floating widget on admin pages or seller center pages
  if (
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/seller') ||
    // The rider and hub apps have their own chat; a shopper's bubble would only get in the way there.
    location.pathname.startsWith('/rider') ||
    location.pathname.startsWith('/hub') ||
    location.pathname.startsWith('/logistics')
  ) {
    return null;
  }

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'sellers' && c.type !== 'buyer_seller') return false;
    if (activeTab === 'delivery' && c.type !== 'rider_buyer') return false;
    if (activeTab === 'support' && c.type !== 'buyer_admin') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const shopName = c.seller?.shop_name?.toLowerCase() || '';
      const subj = c.subject?.toLowerCase() || '';
      const prodName = c.product?.name?.toLowerCase() || '';
      const lastMsg = c.last_message?.body?.toLowerCase() || '';
      return shopName.includes(q) || subj.includes(q) || prodName.includes(q) || lastMsg.includes(q);
    }
    return true;
  });

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputBody.trim() && !selectedImage) || sendingMessage) return;
    const text = inputBody;
    const img = selectedImage;
    setInputBody('');
    setSelectedImage(null);
    await sendMessage(text, undefined, undefined, img || undefined);
  };

  const formatTimeAgo = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  const formatMessengerDate = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) return `Today · ${timeStr}`;
    if (isYesterday) return `Yesterday · ${timeStr}`;

    const sameYear = d.getFullYear() === now.getFullYear();
    const dateStr = d.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    return `${dateStr} · ${timeStr}`;
  };

  const shouldShowDateSeparator = (currIso: string, prevIso?: string): boolean => {
    if (!prevIso) return true;
    const curr = new Date(currIso).getTime();
    const prev = new Date(prevIso).getTime();
    return curr - prev > 30 * 60 * 1000 || new Date(currIso).toDateString() !== new Date(prevIso).toDateString();
  };

  const formatTimeOnly = (iso: string | null | undefined): string => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const lastMyMessageId = [...messages].reverse().find((m) => m.sender_id === user?.id)?.id;

  const TABS = [
    { key: 'all', label: 'All' },
    { key: 'sellers', label: 'Shops' },
    { key: 'delivery', label: 'Delivery' },
    { key: 'support', label: 'Support' },
  ] as const;
  const iconButton = 'w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors';
  const isSupportThread = activeConversation?.type === 'buyer_admin';
  // The inbox copy is kept fresh by the websocket and polling, so a handoff made by the assistant shows here too.
  const supportMode = isSupportThread
    ? conversations.find((c) => c.id === activeConversation?.id)?.support_mode ?? activeConversation?.support_mode
    : null;
  const threadName = isSupportThread ? 'Loved-IT Support' : activeConversation?.seller?.shop_name || 'Shop';
  const threadAvatar = isSupportThread ? null : activeConversation?.seller?.shop_logo || null;

  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-40 flex flex-col sm:flex-row items-end gap-3 pointer-events-none">
      <AnimatePresence>
        {isChatOpen && !onMessagesPage && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'bottom right' }}
            className="pointer-events-auto w-[calc(100vw-32px)] sm:w-[380px] h-[600px] max-h-[calc(100vh-260px)] sm:max-h-[calc(100vh-100px)] bg-white rounded-[22px] border border-stone-200 shadow-[0_24px_60px_-12px_rgba(28,25,23,0.28)] flex flex-col overflow-hidden"
            role="dialog"
            aria-label="Messages"
          >
            {!activeConversation ? (
              /* ── Inbox ── */
              <div className="flex flex-col h-full">
                <div className="px-5 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-[20px] font-serif font-bold tracking-tight text-[#1E1B18]">Messages</h3>
                      {wsConnected && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                        </span>
                      )}
                    </div>
                    <div className="flex items-center -mr-1.5">
                      <Link to="/settings/messages" onClick={closeChat} className={iconButton} title="Open full page" aria-label="Open full page">
                        <Maximize2 className="w-4 h-4" />
                      </Link>
                      <button type="button" onClick={closeChat} className={iconButton} title="Close" aria-label="Close messages">
                        <X className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                  </div>

                  <div className="relative mt-3">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Search shops or messages"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 pl-10 pr-3 text-[13px] bg-stone-100 rounded-full outline-none border border-transparent focus:bg-white focus:border-stone-300 transition-colors placeholder:text-stone-400"
                    />
                  </div>

                  <div className="mt-2 flex gap-1 border-b border-stone-200">
                    {TABS.map((t) => {
                      const on = activeTab === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setActiveTab(t.key)}
                          className={`relative px-3 h-10 text-[13px] transition-colors ${on ? 'text-stone-900 font-semibold' : 'text-stone-500 hover:text-stone-800'}`}
                        >
                          {t.label}
                          {on && <motion.span layoutId="chat-tab" className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-brand-red" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {!user ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                      <span className="w-12 h-12 rounded-full bg-rose-50 text-brand-red flex items-center justify-center"><MessageSquare className="w-5 h-5" /></span>
                      <p className="mt-3 text-sm font-semibold text-stone-900">Sign in to see your messages</p>
                      <p className="mt-1 text-[12px] text-stone-500">Chat with shops about products, and with your rider about deliveries.</p>
                      <Link to="/login" onClick={closeChat} className="mt-4 h-9 px-5 rounded-full bg-brand-red text-white text-[13px] font-semibold flex items-center">Sign in</Link>
                    </div>
                  ) : loadingConversations && conversations.length === 0 ? (
                    <div className="space-y-1 px-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                          <div className="w-11 h-11 rounded-full bg-stone-100 animate-pulse" />
                          <div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-stone-100 animate-pulse" /><div className="h-3 w-3/4 rounded bg-stone-100 animate-pulse" /></div>
                        </div>
                      ))}
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                      <span className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center"><MessageSquare className="w-5 h-5" /></span>
                      <p className="mt-3 text-sm font-semibold text-stone-900">{searchQuery ? 'No matches' : 'No conversations yet'}</p>
                      <p className="mt-1 text-[12px] text-stone-500">{searchQuery ? 'Try another shop name or word.' : 'Tap “Chat” on any product or shop to ask the seller a question.'}</p>
                    </div>
                  ) : (
                    <ul>
                      {filteredConversations.map((c) => {
                        const isRider = isRiderThread(c);
                        const isSupport = c.type === 'buyer_admin';
                        const name = isRider ? 'Delivery rider' : isSupport ? 'Loved-IT Support' : c.seller?.shop_name || 'Shop';
                        const avatar = isSupport ? null : c.seller?.shop_logo || c.seller?.avatar_url;
                        const unread = c.unread > 0;
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => selectConversation(c)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-stone-50 transition-colors"
                            >
                              {isRider ? (
                                <span className="w-11 h-11 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center shrink-0"><Bike className="w-5 h-5" /></span>
                              ) : isSupport ? (
                                <span className="w-11 h-11 rounded-full bg-brand-red text-white flex items-center justify-center shrink-0"><Headphones className="w-5 h-5" /></span>
                              ) : (
                                <AvatarWithFallback src={avatar} alt={name} role="seller" fallbackInitials={name} className="w-11 h-11 rounded-full shrink-0" />
                              )}
                              <span className="flex-1 min-w-0">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className={`text-[13px] truncate ${unread ? 'font-bold text-stone-900' : 'font-semibold text-stone-800'}`}>{name}</span>
                                  <span className={`text-[11px] shrink-0 ${unread ? 'text-brand-red font-semibold' : 'text-stone-400'}`}>{formatTimeAgo(c.last_message_at)}</span>
                                </span>
                                {(isRider && c.parcel) ? (
                                  <span className="block text-[11px] text-stone-500 truncate">
                                    <span className="font-mono">{c.parcel.tracking_number}</span>
                                    {c.is_closed && <span className="ml-1.5 inline-flex items-center gap-0.5"><Lock className="w-3 h-3" />Closed</span>}
                                  </span>
                                ) : c.product ? (
                                  <span className="block text-[11px] text-stone-500 truncate">Re: {c.product.name}</span>
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

                {user && (
                  <button
                    type="button"
                    onClick={() => openChatWithSupport()}
                    className="mx-3 mb-3 flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200 text-left transition-colors group"
                  >
                    <Headphones className="w-[18px] h-[18px] text-brand-red shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-stone-900">Need help with an order?</span>
                      <span className="block text-[11px] text-stone-500">Chat with Loved-IT Support</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}
              </div>
            ) : isRiderThread(activeConversation) ? (
              user ? (
                <RiderThreadPane
                  conversation={activeConversation}
                  currentUserId={user.id}
                  onActivity={() => void refreshConversations()}
                  onBack={clearActiveConversation}
                />
              ) : null
            ) : (
              /* ── Conversation ── */
              <div className="flex flex-col h-full">
                <div className="px-3 h-[60px] flex items-center gap-2 border-b border-stone-200 shrink-0">
                  <button type="button" onClick={clearActiveConversation} className={iconButton} title="Back" aria-label="Back to messages">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {isSupportThread ? (
                    <span className="w-9 h-9 rounded-full bg-brand-red text-white flex items-center justify-center shrink-0"><Headphones className="w-4 h-4" /></span>
                  ) : (
                    <AvatarWithFallback src={threadAvatar} alt={threadName} role="seller" fallbackInitials={threadName} className="w-9 h-9 rounded-full shrink-0" iconClassName="w-4 h-4" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-stone-900 truncate leading-tight">{threadName}</p>
                    <p className="text-[11px] text-stone-500 truncate">{isSupportThread ? (supportMode === 'ai' ? 'Assistant replies right away' : 'Official Loved-IT support') : 'Shop on Loved-IT'}</p>
                  </div>
                  <Link to="/settings/messages" onClick={closeChat} className={iconButton} title="Open full page" aria-label="Open full page">
                    <Maximize2 className="w-4 h-4" />
                  </Link>
                  <button type="button" onClick={closeChat} className={iconButton} title="Close" aria-label="Close messages">
                    <X className="w-[18px] h-[18px]" />
                  </button>
                </div>

                {isSupportThread && <SupportModeBar mode={supportMode} assistantAvailable={activeConversation.assistant_available} onTalkToPerson={talkToPerson} onBackToAssistant={backToAssistant} />}

                {/* What the conversation is about */}
                {(activeConversation.product || activeConversation.order) && (
                  <div className="px-3 py-2 border-b border-stone-200 bg-white shrink-0">
                    {activeConversation.product ? (
                      <Link to={`/products/${activeConversation.product.id}`} onClick={closeChat} className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-stone-50 transition-colors">
                        {activeConversation.product.image
                          ? <img src={activeConversation.product.image} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-stone-200 shrink-0" />
                          : <span className="w-10 h-10 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center shrink-0"><ShoppingBag className="w-4 h-4" /></span>}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] text-stone-900 truncate">{activeConversation.product.name}</span>
                          <span className="block text-[12px] font-bold text-brand-red">₱{activeConversation.product.price.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-stone-500 shrink-0">View</span>
                      </Link>
                    ) : activeConversation.order ? (
                      <Link to="/settings/orders" onClick={closeChat} className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-stone-50 transition-colors">
                        <span className="w-10 h-10 rounded-lg bg-stone-100 text-stone-500 flex items-center justify-center shrink-0"><Package className="w-4 h-4" /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] text-stone-900 truncate">Order #{activeConversation.order.order_number}</span>
                          <span className="block text-[11px] text-stone-500 capitalize">{activeConversation.order.status.replace(/_/g, ' ').toLowerCase()}</span>
                        </span>
                        <span className="text-[11px] font-semibold text-stone-500 shrink-0">Details</span>
                      </Link>
                    ) : null}
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#FAF8F5]">
                  {loadingMessages && messages.length === 0 ? (
                    <div className="space-y-3">
                      <div className="h-9 w-2/3 rounded-2xl bg-stone-200/60 animate-pulse" />
                      <div className="h-9 w-1/2 rounded-2xl bg-stone-200/60 animate-pulse ml-auto" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                      <p className="text-[13px] font-semibold text-stone-900">Say hello to {threadName}</p>
                      <p className="mt-1 text-[12px] text-stone-500">{isSupportThread ? 'Ask about an order, delivery, payment or returns.' : <>Ask about stock, sizes, shipping or the shop&apos;s policies.</>}</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => {
                      const isMe = m.sender_id === user?.id;
                      const nextSame = messages[idx + 1]?.sender_id === m.sender_id;
                      const prevSame = messages[idx - 1]?.sender_id === m.sender_id;
                      const showDate = shouldShowDateSeparator(m.created_at, messages[idx - 1]?.created_at);
                      const isLastMine = isMe && m.id === lastMyMessageId;
                      const otherAvatar = isSupportThread ? null : activeConversation.seller?.shop_logo || m.sender_avatar;
                      const grouped = prevSame && !showDate;

                      return (
                        <div key={m.id} className={grouped ? 'mt-0.5' : 'mt-3 first:mt-0'}>
                          {showDate && (
                            <div className="flex items-center gap-3 my-4">
                              <span className="flex-1 h-px bg-stone-200" />
                              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">{formatMessengerDate(m.created_at)}</span>
                              <span className="flex-1 h-px bg-stone-200" />
                            </div>
                          )}
                          <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {!isMe && (
                              <span className="w-7 shrink-0">
                                {!nextSame && (isSupportThread
                                  ? <span className="w-7 h-7 rounded-full bg-brand-red text-white flex items-center justify-center"><Headphones className="w-3.5 h-3.5" /></span>
                                  : <AvatarWithFallback src={otherAvatar} alt={threadName} role="seller" fallbackInitials={threadName} className="w-7 h-7 rounded-full" iconClassName="w-3.5 h-3.5" />)}
                              </span>
                            )}
                            <div className={`flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                              {isSupportThread && !isMe && !grouped && <SupportSenderLabel role={m.sender_role} />}
                              {m.attachment_type && m.attachment_data && m.sender_role !== 'assistant' && (
                                <ChatAttachmentBubble type={m.attachment_type} data={m.attachment_data} isMe={isMe} orderHref={buyerOrderHref}
                                  onConfirmAddress={!isMe && m.attachment_type === 'order_confirmation' ? () => confirmOrderAddress(m.id) : undefined} />
                              )}
                              {m.body && !isAutoAttachmentBody(m) && (
                                <div
                                  title={formatTimeOnly(m.created_at)}
                                  className={`px-3.5 py-2 text-[13px] leading-relaxed ${
                                    isMe
                                      ? `bg-brand-red text-white rounded-[18px] ${nextSame ? 'rounded-br-md' : 'rounded-br-sm'} ${grouped ? 'rounded-tr-md' : ''}`
                                      : `bg-white text-stone-900 ring-1 ring-stone-200 rounded-[18px] ${nextSame ? 'rounded-bl-md' : 'rounded-bl-sm'} ${grouped ? 'rounded-tl-md' : ''}`
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap break-words">
                                    {m.sender_role === 'assistant'
                                      ? <AssistantText message={m} onGrow={() => scrollToBottom(messagesEndRef.current?.parentElement)} />
                                      : m.body}
                                  </p>
                                </div>
                              )}
                              {/* The assistant's order cards come under its reply, once the reply has typed out. */}
                              {m.sender_role === 'assistant' && m.attachment_type && m.attachment_data && (
                                <AfterTyping message={m} onShow={() => scrollToBottom(messagesEndRef.current?.parentElement)}>
                                  <ChatAttachmentBubble type={m.attachment_type} data={m.attachment_data} isMe={false} orderHref={buyerOrderHref} />
                                </AfterTyping>
                              )}
                              {isLastMine && (
                                <span className="mt-1 px-1 text-[10px] text-stone-400">
                                  {m.read_at ? `Seen · ${formatTimeOnly(m.created_at)}` : `Sent · ${formatTimeAgo(m.created_at)}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {isSupportThread && assistantIsTyping(supportMode, messages, user?.id) && <AssistantTyping />}
                  <div ref={messagesEndRef} />
                </div>

                {/* A fresh conversation: shortcuts to what shops and support usually need first */}
                {messages.length <= 2 && (
                  <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto no-scrollbar bg-white border-t border-stone-200">
                    <button type="button" onClick={attach.pickOrder} className="shrink-0 h-8 px-3 rounded-full border border-stone-300 text-[12px] text-stone-700 hover:border-stone-900 hover:text-stone-900 inline-flex items-center gap-1.5 transition-colors">
                      <Package className="w-3.5 h-3.5" /> Share an order
                    </button>
                    {!isSupportThread && (
                      <button type="button" onClick={attach.pickProduct} className="shrink-0 h-8 px-3 rounded-full border border-stone-300 text-[12px] text-stone-700 hover:border-stone-900 hover:text-stone-900 inline-flex items-center gap-1.5 transition-colors">
                        <ShoppingBag className="w-3.5 h-3.5" /> Ask about a product
                      </button>
                    )}
                  </div>
                )}

                {imagePreviewUrl && (
                  <div className="mx-3 mt-2 flex items-center gap-2.5 p-2 rounded-xl bg-stone-50 border border-stone-200">
                    <img src={imagePreviewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <span className="flex-1 min-w-0 text-[12px] text-stone-600 truncate">{selectedImage?.name}</span>
                    <button type="button" onClick={() => setSelectedImage(null)} className="w-6 h-6 rounded-full bg-stone-200 hover:bg-stone-300 text-stone-600 flex items-center justify-center" aria-label="Remove photo">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Composer */}
                <div className={`relative bg-white px-3 py-3 ${messages.length <= 2 ? '' : 'border-t border-stone-200'}`}>
                  <form onSubmit={handleSend} className="flex items-center gap-2">
                    <AttachMenu attach={attach} disabled={sendingMessage} products={!isSupportThread} />
                    <div className="flex-1 flex items-center h-11 px-2 rounded-full bg-stone-100 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-300 transition-colors">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Write a message"
                        maxLength={1000}
                        value={inputBody}
                        onChange={(e) => setInputBody(e.target.value)}
                        className="flex-1 min-w-0 h-full px-1.5 text-[13px] bg-transparent outline-none placeholder:text-stone-400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={(!inputBody.trim() && !selectedImage) || sendingMessage}
                      className="w-11 h-11 shrink-0 rounded-full bg-brand-red hover:bg-brand-red-dark text-white flex items-center justify-center transition-colors disabled:bg-stone-200 disabled:text-stone-400"
                      aria-label="Send"
                    >
                      <Send className="w-4 h-4 -ml-0.5" />
                    </button>
                  </form>
                </div>

                {attach.elements}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side toolbar: Messages, Feedback and (once scrolled) Top */}
      <FloatingToolbar chatOpen={isChatOpen && !onMessagesPage} unread={unreadTotal} onMessages={onMessagesPage ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : toggleChat} />
    </div>
  );
}
