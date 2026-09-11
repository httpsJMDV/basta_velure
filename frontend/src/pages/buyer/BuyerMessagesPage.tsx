import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Headphones,
  Store,
  Send,
  ShoppingBag,
  Package,
  ExternalLink,
  ShieldCheck,
  X,
  Paperclip,
  Smile,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import Button from '../../components/ui/Button';
import AvatarWithFallback from '../../components/ui/AvatarWithFallback';
import ChatAttachmentBubble from '../../components/chat/ChatAttachmentBubble';
import EmojiPickerPopover from '../../components/chat/EmojiPickerPopover';
import ChatAttachmentModal from '../../components/chat/ChatAttachmentModal';

export default function BuyerMessagesPage() {
  const { user } = useAuth();
  const {
    conversations,
    activeConversation,
    messages,
    loadingConversations,
    loadingMessages,
    sendingMessage,
    wsConnected,
    selectConversation,
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
  const [safetyDismissed, setSafetyDismissed] = useState(() => {
    return (
      localStorage.getItem('loved_it_dismissed_safety_notice') === 'true' ||
      localStorage.getItem('velure_dismissed_safety_notice') === 'true'
    );
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDismissSafety = () => {
    setSafetyDismissed(true);
    localStorage.setItem('loved_it_dismissed_safety_notice', 'true');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [selectedImage]);

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden h-[720px] flex flex-col md:flex-row">
      {/* LEFT SIDEBAR: CONVERSATION LIST */}
      <div className="w-full md:w-80 lg:w-96 border-r border-gray-100 flex flex-col h-full bg-gray-50/40">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center font-bold border border-rose-100">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-gray-900 leading-tight">Messages</h2>
                <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 px-2 py-0.5 rounded-full font-medium text-gray-600">
                  <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                  {wsConnected ? 'Live' : 'Connecting'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Stores &amp; Customer Support</p>
            </div>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="p-3 border-b border-gray-100 space-y-2 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
            />
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs">
              {(['all', 'sellers', 'support'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold capitalize transition-all ${
                    activeTab === t
                      ? 'bg-white text-gray-900 shadow-xs'
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
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100/70 p-2">
          {loadingConversations ? (
            <div className="p-8 text-center text-xs text-gray-400">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-700">No conversations</p>
              <p className="text-[11px] text-gray-400">
                You can chat with any store on the product detail page or initiate support chat.
              </p>
              <Button variant="secondary" onClick={() => openChatWithSupport()} className="text-xs">
                Contact Support
              </Button>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSupport = c.type === 'buyer_admin';
              const name = isSupport ? 'Loved-IT Customer Support' : c.seller?.shop_name || 'Store Merchant';
              const avatar = isSupport ? null : c.seller?.shop_logo || c.seller?.avatar_url;
              const isSelected = activeConversation?.id === c.id;
              const hasUnread = c.unread > 0;

              return (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c)}
                  className={`w-full p-3 rounded-2xl flex items-start gap-3 text-left transition-all ${
                    isSelected
                      ? 'bg-rose-50/80 border border-rose-200/80 shadow-2xs'
                      : 'hover:bg-white'
                  }`}
                >
                  <div className="relative shrink-0">
                    <AvatarWithFallback
                      src={avatar}
                      alt={name}
                      role={isSupport ? 'admin' : 'seller'}
                      fallbackInitials={isSupport ? 'CS' : name}
                      className="w-11 h-11 rounded-2xl"
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

                    <p className={`text-xs truncate ${hasUnread ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
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

      {/* RIGHT MAIN PANE: ACTIVE CHAT */}
      <div className="flex-1 flex flex-col h-full bg-white">
        {!activeConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-gray-50/20">
            <div className="w-16 h-16 rounded-3xl bg-rose-50 text-brand-red flex items-center justify-center border border-rose-100 shadow-sm">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Select a Conversation</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Choose a store from the sidebar to view chat history, ask questions about products, or request support.
              </p>
            </div>
            <button
              onClick={() => openChatWithSupport()}
              className="px-4 py-2 bg-brand-red text-white text-xs font-bold rounded-2xl shadow-xs hover:bg-[#8a2424] transition-colors"
            >
              Contact Customer Support
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <AvatarWithFallback
                  src={activeConversation.seller?.shop_logo || undefined}
                  alt={activeConversation.seller?.shop_name || 'Merchant'}
                  role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                  fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : (activeConversation.seller?.shop_name || undefined)}
                  className="w-10 h-10 rounded-2xl"
                />

                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 truncate">
                    {activeConversation.type === 'buyer_admin'
                      ? 'Loved-IT Customer Support'
                      : activeConversation.seller?.shop_name || 'Store Merchant'}
                  </h3>
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {activeConversation.type === 'buyer_admin' ? 'Official Platform Support' : 'Merchant'}
                  </p>
                </div>
              </div>

              {activeConversation.type === 'buyer_seller' && activeConversation.seller_id && (
                <Link
                  to={`/store/${activeConversation.seller_id}`}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1.5 hover:border-brand-red hover:text-brand-red transition-colors shrink-0"
                >
                  <Store className="w-3.5 h-3.5" /> View Shop
                </Link>
              )}
            </div>

            {/* Buyer Safety Notice */}
            {!safetyDismissed && (
              <div className="px-4 py-2.5 bg-amber-50/90 border-b border-amber-200/80 flex items-center justify-between gap-3 text-xs text-amber-900">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-[11.5px] leading-snug truncate sm:whitespace-normal">
                    <span className="font-bold">Safety Tip:</span> Stay safe! Only transact within the Loved-IT app. Avoid sellers who ask you to deal or send payments outside the platform.{' '}
                    <Link to="/help/safety" className="font-bold text-amber-800 underline hover:text-amber-950 ml-1">
                      Learn More
                    </Link>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDismissSafety}
                  className="p-1 rounded-lg text-amber-600 hover:text-amber-900 hover:bg-amber-100/80 transition-colors shrink-0"
                  title="Dismiss safety notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Pinned Context Banner */}
            {activeConversation.product && (
              <div className="p-3 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  {activeConversation.product.image ? (
                    <img
                      src={activeConversation.product.image}
                      alt={activeConversation.product.name}
                      className="w-11 h-11 rounded-xl object-cover border border-rose-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-rose-100 text-brand-red flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-brand-red tracking-wider">Product Inquired</span>
                    <p className="font-bold text-gray-900 truncate">{activeConversation.product.name}</p>
                    <p className="text-xs font-black text-brand-red">
                      ₱{activeConversation.product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/products/${activeConversation.product.id}`}
                  target="_blank"
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-200 flex items-center gap-1 shrink-0 shadow-2xs"
                >
                  View Product <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {activeConversation.order && (
              <div className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-blue-700 tracking-wider">Order Context</span>
                    <p className="font-bold text-gray-900 truncate">Order #{activeConversation.order.order_number}</p>
                    <p className="text-[11px] text-gray-500 capitalize">
                      Status: <span className="font-bold text-blue-700">{activeConversation.order.status.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                </div>
                <Link
                  to="/settings/orders"
                  className="px-3 py-1.5 bg-white hover:bg-gray-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1 shrink-0 shadow-2xs"
                >
                  View Details <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fafafa]">
              {loadingMessages ? (
                <div className="text-center text-xs text-gray-400 py-10">Loading message history...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-xs font-bold text-gray-700">No messages in this chat yet</p>
                  <p className="text-[11px] text-gray-400">Send your inquiry below to connect directly with the seller.</p>
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
                  <div key={m.id} className="space-y-1.5">
                    {/* Date Header Pill */}
                    {showDateHeader && (
                      <div className="flex items-center justify-center my-4">
                        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100/90 px-3.5 py-1 rounded-full shadow-2xs border border-gray-200/50">
                          {formatMessengerDate(m.created_at)}
                        </span>
                      </div>
                    )}

                    <div className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {!isMe && (
                        <div className="w-8 h-8 shrink-0 mb-1">
                          {isLastFromSender ? (
                            <AvatarWithFallback
                              src={otherAvatar}
                              alt={activeConversation.seller?.shop_name || 'Store'}
                              role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                              fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : undefined}
                              className="w-8 h-8 rounded-full border border-gray-200/70 shadow-2xs"
                              iconClassName="w-4 h-4"
                            />
                          ) : (
                            <div className="w-8 h-8" />
                          )}
                        </div>
                      )}

                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[78%] sm:max-w-md`}>
                        {/* Rich Attachment Bubble */}
                        {m.attachment_type && m.attachment_data && (
                          <ChatAttachmentBubble
                            type={m.attachment_type}
                            data={m.attachment_data}
                            isMe={isMe}
                          />
                        )}

                        {m.body && (
                          <div
                            className={`px-4 py-2.5 text-xs leading-relaxed ${
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
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 animate-in fade-in duration-200">
                                <span>{formatTimeOnly(m.created_at)}</span>
                                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white shadow-2xs">
                                  <AvatarWithFallback
                                    src={otherAvatar}
                                    alt="Seen"
                                    role={activeConversation.type === 'buyer_admin' ? 'admin' : 'seller'}
                                    fallbackInitials={activeConversation.type === 'buyer_admin' ? 'CS' : undefined}
                                    className="w-4 h-4 rounded-full"
                                    iconClassName="w-2 h-2"
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-gray-500">Seen</span>
                              </div>
                            ) : (
                              <div className="text-[10px] font-medium text-gray-400">
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

            {/* Quick Inquiry Chips */}
            {messages.length <= 2 && (
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => handleQuickChip('Is this item available in stock?')}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  📦 Is this in stock?
                </button>
                <button
                  onClick={() => handleQuickChip('When will this order be shipped?')}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  🚚 When will it ship?
                </button>
                <button
                  onClick={() => handleQuickChip('Can I request actual photos of the item?')}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-semibold rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  📸 Actual photos?
                </button>
              </div>
            )}

            {/* Image Draft Preview Bar */}
            {imagePreviewUrl && (
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2">
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

            {/* Message Input */}
            <div className="relative">
              <EmojiPickerPopover
                isOpen={showEmoji}
                onClose={() => setShowEmoji(false)}
                onSelectEmoji={handleSelectEmoji}
                position="top"
              />

              <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAttachModal(true)}
                  className="p-2.5 text-gray-400 hover:text-brand-red hover:bg-rose-50 rounded-2xl transition-colors shrink-0"
                  title="Attach Product, Order, or Photo"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmoji((v) => !v)}
                  className={`p-2.5 rounded-2xl transition-colors shrink-0 ${
                    showEmoji ? 'text-brand-red bg-rose-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                  title="Insert Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type your reply here..."
                  value={inputBody}
                  onChange={(e) => setInputBody(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                />

                <Button
                  type="submit"
                  variant="primary"
                  disabled={(!inputBody.trim() && !selectedImage) || sendingMessage}
                  className="text-xs font-bold flex items-center gap-2 px-5 py-2.5 rounded-2xl shrink-0"
                >
                  <Send className="w-4 h-4" /> Send
                </Button>
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
          </>
        )}
      </div>
    </div>
  );
}

