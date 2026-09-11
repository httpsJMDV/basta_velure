import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Search,
  Send,
  ShoppingBag,
  Package,
  ExternalLink,
  Paperclip,
  Smile,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getEcho } from '../../lib/echo';
import CustomSelect from '../../components/ui/CustomSelect';
import Button from '../../components/ui/Button';
import AvatarWithFallback from '../../components/ui/AvatarWithFallback';
import ChatAttachmentBubble from '../../components/chat/ChatAttachmentBubble';
import EmojiPickerPopover from '../../components/chat/EmojiPickerPopover';
import ChatAttachmentModal from '../../components/chat/ChatAttachmentModal';
import {
  getConversationsApi,
  getConversationMessagesApi,
  sendConversationMessageApi,
} from '../../api/client';
import type { Conversation, ChatMessage } from '../../types';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Conversations' },
  { value: 'buyer_seller', label: 'Buyer Inquiries' },
  { value: 'seller_admin', label: 'Admin Support' },
  { value: 'unread', label: 'Unread Messages' },
];

export default function SellerMessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputBody, setInputBody] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  selectedConvRef.current = selectedConversation;

  const userId = user?.id;
  const selectedConvId = selectedConversation?.id;

  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [selectedImage]);

  const loadConversations = useCallback(async (selectId?: number) => {
    try {
      setLoadingList(true);
      const params: any = { scope: 'seller' };
      if (filterType === 'buyer_seller' || filterType === 'seller_admin') {
        params.type = filterType;
      } else if (filterType === 'unread') {
        params.unread_only = true;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const list = await getConversationsApi(params);
      setConversations(list);

      if (selectId) {
        const found = list.find((c) => c.id === selectId);
        if (found) setSelectedConversation(found);
      } else {
        setSelectedConversation((prev) => {
          if (prev && list.some((c) => c.id === prev.id)) return prev;
          return list.length > 0 ? list[0] : null;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [filterType, searchQuery]);

  const loadConversationsRef = useRef(loadConversations);
  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── 1. WebSockets: Per-user Channel for Live Inbox Updates ──
  useEffect(() => {
    if (!userId) return;

    const echo = getEcho();
    const pusher = echo.connector?.pusher;
    if (pusher?.connection) {
      setWsConnected(pusher.connection.state === 'connected');
      const handleStateChange = (states: { current: string; previous: string }) => {
        const isConn = states.current === 'connected';
        setWsConnected(isConn);
        if (isConn && states.previous !== 'connected') {
          loadConversationsRef.current(selectedConvRef.current?.id);
          if (selectedConvRef.current) {
            getConversationMessagesApi(selectedConvRef.current.id).then(setMessages).catch(() => {});
          }
        }
      };
      pusher.connection.bind('state_change', handleStateChange);
    }

    const channelName = `user.${userId}.conversations`;
    const userChannel = echo.private(channelName);

    const handleConvUpdated = (payload: any) => {
      if (payload?.conversation) {
        const updated: Conversation = payload.conversation;
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === updated.id);
          if (exists) {
            return prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
          }
          return [updated, ...prev];
        });
      }
    };

    userChannel.listen('.ConversationUpdated', handleConvUpdated);
    userChannel.listen('ConversationUpdated', handleConvUpdated);

    return () => {
      echo.leave(channelName);
    };
  }, [userId]);

  // ── 2. WebSockets: Active Conversation Channel for Instant Messages & Read Status ──
  useEffect(() => {
    if (!userId || !selectedConvId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    getConversationMessagesApi(selectedConvId)
      .then((data) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    const echo = getEcho();
    const channelName = `conversation.${selectedConvId}`;
    const convChannel = echo.private(channelName);

    const handleMessageSent = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Update snippet in conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConvId
            ? {
                ...c,
                last_message: {
                  id: msg.id,
                  body: msg.body,
                  sender_id: msg.sender_id,
                  created_at: msg.created_at,
                },
                last_message_at: msg.created_at,
              }
            : c
        )
      );
    };

    const handleMessageRead = (data: { conversation_id: number; reader_id: number; read_at: string }) => {
      if (data.reader_id !== userId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender_id === userId && !m.read_at
              ? { ...m, read_at: data.read_at }
              : m
          )
        );
      }
    };

    convChannel.listen('.MessageSent', handleMessageSent);
    convChannel.listen('MessageSent', handleMessageSent);
    convChannel.listen('.MessageRead', handleMessageRead);
    convChannel.listen('MessageRead', handleMessageRead);

    return () => {
      echo.leave(channelName);
    };
  }, [userId, selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConversation || (!inputBody.trim() && !selectedImage) || sending) return;

    const text = inputBody.trim();
    const img = selectedImage;
    setInputBody('');
    setSelectedImage(null);
    setShowEmoji(false);
    setSending(true);
    try {
      let payload: any;
      if (img) {
        const fd = new FormData();
        if (text) fd.append('body', text);
        fd.append('image', img);
        payload = fd;
      } else {
        payload = { body: text };
      }

      const newMsg = await sendConversationMessageApi(selectedConversation.id, payload);
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputBody((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAttachProduct = async (product: any) => {
    if (!selectedConversation) return;
    setSending(true);
    try {
      const newMsg = await sendConversationMessageApi(selectedConversation.id, {
        body: `Sharing product details: ${product.name}`,
        attachment_type: 'product_card',
        attachment_data: {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category,
        },
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to attach product.');
    } finally {
      setSending(false);
    }
  };

  const handleAttachOrder = async (order: any) => {
    if (!selectedConversation) return;
    setSending(true);
    try {
      const newMsg = await sendConversationMessageApi(selectedConversation.id, {
        body: `Regarding customer order #${order.order_number}`,
        attachment_type: 'order_card',
        attachment_data: {
          id: order.id,
          order_number: order.order_number,
          total: order.total,
          status: order.status,
          items_summary: order.items_summary,
        },
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to attach order.');
    } finally {
      setSending(false);
    }
  };

  const handleTemplateReply = (tpl: string) => {
    setInputBody(tpl);
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

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
  const buyerInquiriesCount = conversations.filter((c) => c.type === 'buyer_seller').length;
  const supportInquiriesCount = conversations.filter((c) => c.type === 'seller_admin').length;

  return (
    <div className="space-y-5">
      {/* Header Band */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Seller Messages &amp; Inquiries</h1>
            {totalUnread > 0 ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-brand-red text-white shadow-xs animate-pulse">
                {totalUnread} Unread
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                All responded
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Respond promptly to customer questions about products, shipping schedules, and communicate with Loved-IT Support.
          </p>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3.5 py-1.5 rounded-2xl bg-gray-50 border border-gray-200/80 text-xs font-semibold text-gray-700 flex items-center gap-2">
            <span className="text-gray-400">Buyers:</span>
            <span className="font-bold text-gray-900">{buyerInquiriesCount}</span>
          </div>
          <div className="px-3.5 py-1.5 rounded-2xl bg-rose-50/60 border border-rose-200/80 text-xs font-semibold text-brand-red flex items-center gap-2">
            <span className="text-rose-500">Support:</span>
            <span className="font-bold text-brand-red">{supportInquiriesCount}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 px-3.5 py-1.5 rounded-2xl font-semibold text-gray-700">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            {wsConnected ? 'Live Updates' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Main 2-Pane Box */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden h-[760px] flex flex-col md:flex-row">
        {/* LEFT PANE: CONVERSATION LIST */}
        <div className="w-full md:w-80 lg:w-96 border-r border-gray-200/80 flex flex-col h-full bg-gray-50/40">
          {/* Filter Bar */}
          <div className="p-4 border-b border-gray-200/80 space-y-3 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search buyer name or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="w-full">
              <CustomSelect
                value={filterType}
                onChange={(val) => setFilterType(val)}
                options={FILTER_OPTIONS}
                className="text-xs"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2">
            {loadingList ? (
              <div className="p-8 text-center text-xs text-gray-400">Loading inquiries...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-gray-800">No conversations found</p>
                <p className="text-[11px] text-gray-400">
                  Customer inquiries regarding your merchandise will appear here.
                </p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSupport = c.type === 'seller_admin';
                const buyerName = isSupport
                  ? 'Loved-IT Partner Support'
                  : c.buyer
                  ? `${c.buyer.first_name} ${c.buyer.last_name}`
                  : 'Customer';
                const avatar = isSupport ? null : c.buyer?.avatar_url;
                const isSelected = selectedConversation?.id === c.id;
                const hasUnread = c.unread > 0;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConversation(c)}
                    className={`w-full p-3 rounded-2xl flex items-start gap-3 text-left transition-all ${
                      isSelected
                        ? 'bg-rose-50/80 border border-rose-200/80 shadow-2xs'
                        : 'hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <AvatarWithFallback
                        src={avatar}
                        alt={buyerName}
                        role={isSupport ? 'admin' : 'buyer'}
                        fallbackInitials={isSupport ? 'CS' : buyerName}
                        className="w-11 h-11 rounded-2xl"
                      />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-bold text-gray-900 truncate">{buyerName}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{formatTimeAgo(c.last_message_at)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                          isSupport ? 'bg-rose-50 text-brand-red border border-rose-100' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {isSupport ? 'Loved-IT Support' : 'Buyer Inquiry'}
                        </span>
                        {c.status === 'resolved' && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700">
                            Resolved
                          </span>
                        )}
                      </div>

                      {c.product && (
                        <p className="text-[10px] text-brand-red font-semibold truncate flex items-center gap-1 mb-0.5">
                          <ShoppingBag className="w-3 h-3 shrink-0" />
                          {c.product.name}
                        </p>
                      )}

                      {c.order && (
                        <p className="text-[10px] text-blue-600 font-semibold truncate flex items-center gap-1 mb-0.5">
                          <Package className="w-3 h-3 shrink-0" />
                          Order #{c.order.order_number}
                        </p>
                      )}

                      <p className={`text-xs truncate ${hasUnread ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>
                        {c.last_message?.body || 'No messages yet'}
                      </p>
                    </div>

                    {hasUnread && (
                      <span className="w-5 h-5 rounded-full bg-brand-red text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-2xs">
                        {c.unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT MAIN PANE: SELECTED CONVERSATION */}
        <div className="flex-1 flex flex-col h-full bg-white">
          {!selectedConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-gray-50/20">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-brand-red flex items-center justify-center border border-rose-100 shadow-sm">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Select an inquiry to view chat</h3>
              <p className="text-xs text-gray-400 max-w-sm">
                Communicate directly with your buyers and provide prompt customer assistance.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarWithFallback
                    src={
                      selectedConversation.type === 'seller_admin'
                        ? null
                        : selectedConversation.buyer?.avatar_url
                    }
                    alt={
                      selectedConversation.type === 'seller_admin'
                        ? 'Loved-IT Partner Support'
                        : selectedConversation.buyer
                        ? `${selectedConversation.buyer.first_name} ${selectedConversation.buyer.last_name}`
                        : 'Customer'
                    }
                    role={selectedConversation.type === 'seller_admin' ? 'admin' : 'buyer'}
                    className="w-10 h-10 rounded-2xl shrink-0"
                  />

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {selectedConversation.type === 'seller_admin'
                        ? 'Loved-IT Partner Support'
                        : selectedConversation.buyer
                        ? `${selectedConversation.buyer.first_name} ${selectedConversation.buyer.last_name}`
                        : 'Customer'}
                    </h3>
                    <p className="text-[11px] text-gray-400 truncate">
                      {selectedConversation.type === 'seller_admin'
                        ? 'Official Platform Admin'
                        : selectedConversation.buyer?.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                    selectedConversation.status === 'resolved'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {selectedConversation.status === 'resolved' ? 'Resolved' : 'Active Chat'}
                  </span>
                </div>
              </div>

              {/* Pinned Product Card */}
              {selectedConversation.product && (
                <div className="p-3 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    {selectedConversation.product.image ? (
                      <img
                        src={selectedConversation.product.image}
                        alt={selectedConversation.product.name}
                        className="w-11 h-11 rounded-xl object-cover border border-rose-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-rose-100 text-brand-red flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-brand-red tracking-wider">Inquired Product</span>
                      <p className="font-bold text-gray-900 truncate">{selectedConversation.product.name}</p>
                      <p className="text-xs font-black text-brand-red">
                        ₱{selectedConversation.product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/seller/products`}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    Manage Product <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* Pinned Order Card */}
              {selectedConversation.order && (
                <div className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-blue-700 tracking-wider">Related Customer Order</span>
                      <p className="font-bold text-gray-900 truncate">Order #{selectedConversation.order.order_number}</p>
                      <p className="text-[11px] text-gray-500 capitalize">
                        Total: ₱{selectedConversation.order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · Status: <span className="font-bold text-blue-700">{selectedConversation.order.status.replace(/_/g, ' ')}</span>
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/seller/orders`}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    View Order <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fafafa]">
                {loadingMessages ? (
                  <div className="text-center text-xs text-gray-400 py-10">Loading conversation history...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <p className="text-xs font-bold text-gray-700">No messages in this chat yet</p>
                    <p className="text-[11px] text-gray-400">Reply to the buyer below to assist them with their purchase.</p>
                  </div>
                ) : (
                messages.map((m, idx) => {
                  const isMe = m.sender_id === user?.id;
                  const isLastFromSender = idx === messages.length - 1 || messages[idx + 1]?.sender_id !== m.sender_id;
                  const isLastMyMessage = isMe && m.id === lastMyMessageId;
                  const showDateHeader = shouldShowDateSeparator(m.created_at, messages[idx - 1]?.created_at);

                  const otherAvatar = selectedConversation.type === 'seller_admin'
                    ? null
                    : selectedConversation.buyer?.avatar_url || m.sender_avatar;

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
                                alt={selectedConversation.buyer ? `${selectedConversation.buyer.first_name} ${selectedConversation.buyer.last_name}` : 'Customer'}
                                role={selectedConversation.type === 'seller_admin' ? 'admin' : 'buyer'}
                                fallbackInitials={selectedConversation.type === 'seller_admin' ? 'CS' : undefined}
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
                                      role={selectedConversation.type === 'seller_admin' ? 'admin' : 'buyer'}
                                      fallbackInitials={selectedConversation.type === 'seller_admin' ? 'CS' : undefined}
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

              {/* Quick Seller Templates Bar */}
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold uppercase text-gray-400 shrink-0">Quick Templates:</span>
                <button
                  onClick={() => handleTemplateReply('Hello! Yes, this item is in stock and available for immediate shipping.')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  ✅ In Stock
                </button>
                <button
                  onClick={() => handleTemplateReply('Your order has been safely packed and is scheduled for rider pickup.')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  📦 Order Packed
                </button>
                <button
                  onClick={() => handleTemplateReply('Thank you so much for choosing our shop! Please let us know if you need anything else.')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  🙏 Thank You
                </button>
              </div>

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
                      <p className="text-[10px] text-gray-400">Ready to send with reply</p>
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

              {/* Reply Form */}
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
                    placeholder="Type your response to customer..."
                    value={inputBody}
                    onChange={(e) => setInputBody(e.target.value)}
                    className="flex-1 px-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={(!inputBody.trim() && !selectedImage) || sending}
                    className="text-xs font-bold flex items-center gap-2 px-5 py-2.5 rounded-2xl shrink-0"
                  >
                    <Send className="w-4 h-4" /> Reply
                  </Button>
                </form>
              </div>

              {/* Attachments Modal */}
              <ChatAttachmentModal
                isOpen={showAttachModal}
                onClose={() => setShowAttachModal(false)}
                conversation={selectedConversation}
                onAttachProduct={handleAttachProduct}
                onAttachOrder={handleAttachOrder}
                onAttachImage={(file) => setSelectedImage(file)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

