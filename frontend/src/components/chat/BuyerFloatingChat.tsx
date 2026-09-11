import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  X,
  ChevronLeft,
  Send,
  Headphones,
  Search,
  ExternalLink,
  ShoppingBag,
  Package,
  Maximize2,
  Paperclip,
  Smile,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import AvatarWithFallback from '../ui/AvatarWithFallback';
import ChatAttachmentBubble from './ChatAttachmentBubble';
import EmojiPickerPopover from './EmojiPickerPopover';
import ChatAttachmentModal from './ChatAttachmentModal';

export default function BuyerFloatingChat() {
  const { user } = useAuth();
  const location = useLocation();
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
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'sellers' | 'support'>('all');
  const [inputBody, setInputBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
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

  // Don't render floating widget on admin pages or seller center pages
  if (
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/seller')
  ) {
    return null;
  }

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'sellers' && c.type !== 'buyer_seller') return false;
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
    setShowEmoji(false);
    await sendMessage(text, undefined, undefined, img || undefined);
  };

  const handleQuickChip = async (chipText: string) => {
    setInputBody('');
    await sendMessage(chipText);
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputBody((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAttachProduct = async (product: any) => {
    await sendMessage(`Inquiring about ${product.name}`, 'product_card', {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
    });
  };

  const handleAttachOrder = async (order: any) => {
    await sendMessage(`Inquiring regarding Order #${order.order_number}`, 'order_card', {
      id: order.id,
      order_number: order.order_number,
      total: order.total,
      status: order.status,
      items_summary: order.items_summary,
    });
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

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {/* Floating Chat Modal */}
      {isChatOpen && (
        <div className="pointer-events-auto mb-3 w-[calc(100vw-32px)] sm:w-[390px] h-[580px] max-h-[calc(100vh-100px)] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* SCREEN 1: CONVERSATION LIST */}
          {!activeConversation ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 bg-gradient-to-r from-[#8a2424] to-[#A32D2D] text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-white/15 flex items-center justify-center font-bold">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm leading-tight">Messages</h3>
                      <span className="inline-flex items-center gap-1 text-[9px] bg-white/20 px-1.5 py-0.2 rounded-md font-semibold">
                        <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                        {wsConnected ? 'Live' : 'Connecting'}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/80">Chat with Stores &amp; Support</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to="/settings/messages"
                    onClick={closeChat}
                    className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                    title="Open Full Screen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={closeChat}
                    className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search & Tabs */}
              <div className="p-3 bg-gray-50 border-b border-gray-100 space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search shops or messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-brand-red"
                  />
                </div>

                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs">
                    {(['all', 'sellers', 'support'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all ${
                          activeTab === t
                            ? 'bg-brand-red text-white shadow-xs'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => openChatWithSupport()}
                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-brand-red text-[11px] font-bold flex items-center gap-1 border border-rose-100 transition-colors"
                  >
                    <Headphones className="w-3.5 h-3.5" /> Support
                  </button>
                </div>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2">
                {!user ? (
                  <div className="p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center mx-auto">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-gray-700">Log in to view and send messages</p>
                    <Link
                      to="/login"
                      onClick={closeChat}
                      className="inline-block px-4 py-2 bg-brand-red text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Sign In
                    </Link>
                  </div>
                ) : loadingConversations ? (
                  <div className="p-8 text-center text-xs text-gray-400">Loading your conversations...</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800">No conversations yet</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Inquire about any item on its product page or contact Customer Support.
                      </p>
                    </div>
                    <button
                      onClick={() => openChatWithSupport()}
                      className="px-3.5 py-1.5 bg-brand-red text-white text-xs font-bold rounded-xl"
                    >
                      Contact Loved-IT Support
                    </button>
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isSupport = c.type === 'buyer_admin';
                    const name = isSupport ? 'Loved-IT Customer Support' : c.seller?.shop_name || 'Store Merchant';
                    const avatar = isSupport ? null : c.seller?.shop_logo || c.seller?.avatar_url;
                    const hasUnread = c.unread > 0;

                    return (
                      <button
                        key={c.id}
                        onClick={() => selectConversation(c)}
                        className={`w-full p-3 rounded-2xl flex items-start gap-3 text-left hover:bg-gray-50 transition-colors ${
                          hasUnread ? 'bg-rose-50/40 font-semibold' : ''
                        }`}
                      >
                        <div className="relative shrink-0">
                          <AvatarWithFallback
                            src={avatar}
                            alt={name}
                            role={isSupport ? 'admin' : 'seller'}
                            fallbackInitials={isSupport ? 'CS' : name}
                            className="w-10 h-10 rounded-2xl"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-bold text-gray-900 truncate">{name}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{formatTimeAgo(c.last_message_at)}</span>
                          </div>

                          {c.product && (
                            <p className="text-[10px] text-brand-red font-semibold truncate flex items-center gap-1">
                              <ShoppingBag className="w-3 h-3 shrink-0" />
                              {c.product.name}
                            </p>
                          )}

                          <p className="text-xs text-gray-500 truncate">
                            {c.last_message?.body || 'No messages yet'}
                          </p>
                        </div>

                        {hasUnread && (
                          <span className="w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-black flex items-center justify-center shrink-0">
                            {c.unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* SCREEN 2: ACTIVE CONVERSATION */
            <div className="flex flex-col h-full">
              {/* Active Header */}
              <div className="p-3.5 bg-gradient-to-r from-[#8a2424] to-[#A32D2D] text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={clearActiveConversation}
                    className="p-1 rounded-xl hover:bg-white/20 text-white transition-colors shrink-0"
                    title="Back to list"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <AvatarWithFallback
                    src={activeConversation.seller?.shop_logo || undefined}
                    alt={activeConversation.seller?.shop_name || 'Merchant'}
                    role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                    fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : (activeConversation.seller?.shop_name || undefined)}
                    className="w-8 h-8 rounded-xl border-white/20"
                    iconClassName="w-4 h-4"
                  />

                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate leading-tight">
                      {activeConversation.type === 'buyer_admin'
                        ? 'Loved-IT Customer Support'
                        : activeConversation.seller?.shop_name || 'Store Merchant'}
                    </p>
                    <p className="text-[10px] text-white/80 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {activeConversation.type === 'buyer_admin' ? 'Official Support' : 'Online Store'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    to="/settings/messages"
                    onClick={closeChat}
                    className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                    title="Full Screen View"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={closeChat}
                    className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Pinned Product/Order Context Card */}
              {activeConversation.product && (
                <div className="p-2.5 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {activeConversation.product.image ? (
                      <img
                        src={activeConversation.product.image}
                        alt={activeConversation.product.name}
                        className="w-9 h-9 rounded-xl object-cover border border-rose-200 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-rose-100 text-brand-red flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate leading-tight">{activeConversation.product.name}</p>
                      <p className="text-[11px] font-black text-brand-red">
                        ₱{activeConversation.product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/products/${activeConversation.product.id}`}
                    target="_blank"
                    className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 text-[11px] font-bold rounded-xl border border-gray-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {activeConversation.order && (
                <div className="p-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate leading-tight">
                        Order #{activeConversation.order.order_number}
                      </p>
                      <p className="text-[11px] text-gray-500 capitalize">
                        Status: <span className="font-bold text-blue-700">{activeConversation.order.status.replace(/_/g, ' ')}</span>
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/settings/orders`}
                    className="px-2.5 py-1 bg-white hover:bg-gray-50 text-blue-700 text-[11px] font-bold rounded-xl border border-blue-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    Details <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {/* Message History Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fafafa]">
                {loadingMessages ? (
                  <div className="text-center text-xs text-gray-400 py-6">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-xs font-bold text-gray-700">Start the conversation</p>
                    <p className="text-[11px] text-gray-400">
                      Ask about item availability, shipping schedules, or shop policies.
                    </p>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isMe = m.sender_id === user?.id;
                    const isLastFromSender = idx === messages.length - 1 || messages[idx + 1]?.sender_id !== m.sender_id;
                    const isLastMyMessage = isMe && m.id === lastMyMessageId;
                    const showDateHeader = shouldShowDateSeparator(m.created_at, messages[idx - 1]?.created_at);

                    const otherAvatar = activeConversation.type === 'buyer_admin'
                      ? null
                      : activeConversation.seller?.shop_logo || m.sender_avatar;

                    return (
                      <div key={m.id} className="space-y-1">
                        {/* Date Header Pill */}
                        {showDateHeader && (
                          <div className="flex items-center justify-center my-3">
                            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100/90 px-3 py-0.5 rounded-full shadow-2xs border border-gray-200/50">
                              {formatMessengerDate(m.created_at)}
                            </span>
                          </div>
                        )}

                        <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {!isMe && (
                            <div className="w-7 h-7 shrink-0 mb-1">
                              {isLastFromSender ? (
                                <AvatarWithFallback
                                  src={otherAvatar}
                                  alt={activeConversation.seller?.shop_name || 'Store'}
                                  role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                                  fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : undefined}
                                  className="w-7 h-7 rounded-full border border-gray-200/70 shadow-2xs"
                                  iconClassName="w-3.5 h-3.5"
                                />
                              ) : (
                                <div className="w-7 h-7" />
                              )}
                            </div>
                          )}

                          <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                            {/* Rich Attachment Bubble (product_card, order_card, image) */}
                            {m.attachment_type && m.attachment_data && (
                              <ChatAttachmentBubble
                                type={m.attachment_type}
                                data={m.attachment_data}
                                isMe={isMe}
                              />
                            )}

                            {m.body && (
                              <div
                                className={`px-3.5 py-2 text-xs leading-relaxed ${
                                  isMe
                                    ? 'bg-brand-red text-white rounded-2xl rounded-br-xs shadow-xs'
                                    : 'bg-white text-gray-900 border border-gray-200/80 rounded-2xl rounded-bl-xs shadow-2xs'
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              </div>
                            )}

                            {/* Messenger Seen / Sent receipt on the most recent outgoing message */}
                            {isLastMyMessage && (
                              <div className="flex items-center justify-end gap-1.5 mt-1 px-1">
                                {m.read_at ? (
                                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 animate-in fade-in duration-200">
                                    <span>{formatTimeOnly(m.created_at)}</span>
                                    <div className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 border border-white shadow-2xs">
                                      <AvatarWithFallback
                                        src={otherAvatar}
                                        alt="Seen"
                                        role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                                        fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : undefined}
                                        className="w-3.5 h-3.5 rounded-full"
                                        iconClassName="w-2 h-2"
                                      />
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-500">Seen</span>
                                  </div>
                                ) : (
                                  <div className="text-[9px] font-medium text-gray-400">
                                    <span>Sent {formatTimeAgo(m.created_at)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Inquiry Chips (for fast shopping questions) */}
              {messages.length <= 2 && (
                <div className="px-3 py-1.5 bg-white border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => handleQuickChip('Is this item available in stock?')}
                    className="px-2.5 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-[10px] font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                  >
                    📦 Is this in stock?
                  </button>
                  <button
                    onClick={() => handleQuickChip('When will this order be shipped?')}
                    className="px-2.5 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-[10px] font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                  >
                    🚚 When will it ship?
                  </button>
                  <button
                    onClick={() => handleQuickChip('Can I request actual photos of the item?')}
                    className="px-2.5 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-[10px] font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                  >
                    📸 Actual photos?
                  </button>
                </div>
              )}

              {/* Image Draft Preview Bar */}
              {imagePreviewUrl && (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={imagePreviewUrl}
                      alt="Preview"
                      className="w-10 h-10 rounded-xl object-cover border border-gray-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{selectedImage?.name}</p>
                      <p className="text-[10px] text-gray-400">Ready to send with message</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Reply Input Bar */}
              <div className="relative">
                <EmojiPickerPopover
                  isOpen={showEmoji}
                  onClose={() => setShowEmoji(false)}
                  onSelectEmoji={handleSelectEmoji}
                  position="top"
                />

                <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAttachModal(true)}
                    className="p-2 text-gray-400 hover:text-brand-red hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                    title="Attach Product, Order, or Photo"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEmoji((v) => !v)}
                    className={`p-2 rounded-xl transition-colors shrink-0 ${
                      showEmoji ? 'text-brand-red bg-rose-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Insert Emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Type your message..."
                    value={inputBody}
                    onChange={(e) => setInputBody(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                  />

                  <button
                    type="submit"
                    disabled={(!inputBody.trim() && !selectedImage) || sendingMessage}
                    className="p-2.5 bg-brand-red hover:bg-[#8a2424] disabled:opacity-40 text-white rounded-2xl shadow-xs transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* Attachments Modal */}
              <ChatAttachmentModal
                isOpen={showAttachModal}
                onClose={() => setShowAttachModal(false)}
                conversation={activeConversation}
                onAttachProduct={handleAttachProduct}
                onAttachOrder={handleAttachOrder}
                onAttachImage={(file) => setSelectedImage(file)}
              />
            </div>
          )}
        </div>
      )}

      {/* Floating Launcher Button */}
      <button
        onClick={toggleChat}
        className="pointer-events-auto group relative w-14 h-14 rounded-full bg-brand-red hover:bg-[#8a2424] text-white shadow-xl shadow-red-900/20 flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
        aria-label="Open Loved-IT Chat"
      >
        {isChatOpen ? (
          <X className="w-6 h-6 transition-transform duration-200 rotate-0 group-hover:rotate-90" />
        ) : (
          <MessageSquare className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
        )}

        {/* Unread Counter Badge */}
        {!isChatOpen && unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-white text-brand-red border-2 border-brand-red text-[11px] font-black flex items-center justify-center shadow-md animate-bounce">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    </div>
  );
}

