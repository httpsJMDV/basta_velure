import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getEcho } from '../../lib/echo';
import {
  getConversationsApi,
  getConversationMessagesApi,
  sendConversationMessageApi,
  startConversationApi,
  searchAdminContactsApi,
  openConversationForSellerApi,
  updateConversationStatusApi,
} from '../../api/client';
import type { Conversation, ChatMessage } from '../../types';
import {
  MessageSquare, Send, Search,
  ExternalLink, CheckCircle2,
  ShoppingBag, Package,
  Paperclip, Smile, X, Plus,
  ChevronRight,
} from 'lucide-react';
import CustomSelect from '../../components/ui/CustomSelect';
import Button from '../../components/ui/Button';
import AvatarWithFallback from '../../components/ui/AvatarWithFallback';
import ChatAttachmentBubble from '../../components/chat/ChatAttachmentBubble';
import EmojiPickerPopover from '../../components/chat/EmojiPickerPopover';
import ChatAttachmentModal from '../../components/chat/ChatAttachmentModal';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString('en-PH', { weekday: 'short' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Inquiries' },
  { value: 'buyer_admin', label: 'Buyer Support' },
  { value: 'seller_admin', label: 'Seller Support' },
  { value: 'buyer_seller', label: 'Marketplace Chats' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'open', label: 'Open Inquiries' },
  { value: 'resolved', label: 'Resolved Inquiries' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const pageRef = useMountAnim();
  const [searchParams] = useSearchParams();
  const sellerIdParam = searchParams.get('seller');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [wsConnected, setWsConnected] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedConvRef = useRef<Conversation | null>(null);
  selectedConvRef.current = selectedConv;

  const userId = user?.id;
  const selectedConvId = selectedConv?.id;

  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreviewUrl(null);
    }
  }, [selectedImage]);

  // Load conversations list
  const loadConversations = useCallback(async (selectId?: number) => {
    try {
      setLoadingList(true);
      const params: any = {};
      if (roleFilter !== 'all') params.type = roleFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getConversationsApi(params);
      setConversations(res);

      if (selectId) {
        const match = res.find((c) => c.id === selectId);
        if (match) setSelectedConv(match);
      } else {
        setSelectedConv((prev) => {
          if (prev && res.some((c) => c.id === prev.id)) return prev;
          return res.length > 0 ? res[0] : null;
        });
      }
      return res;
    } catch {
      return [];
    } finally {
      setLoadingList(false);
    }
  }, [roleFilter, statusFilter, searchQuery]);

  const loadConversationsRef = useRef(loadConversations);
  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    loadConversations().then((list) => {
      if (sellerIdParam) {
        const match = list.find((c) => c.seller_id === Number(sellerIdParam));
        if (match) {
          setSelectedConv(match);
        } else {
          openConversationForSellerApi(Number(sellerIdParam))
            .then((created) => {
              setSelectedConv(created);
              setConversations((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
            })
            .catch(() => {});
        }
      }
    });
  }, [loadConversations, sellerIdParam]);

  // ── 1. WebSockets: Per-user Channel for Live Admin Inbox Updates ──
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

  // ── 2. WebSockets: Active Thread Channel for Instant Messages & Read Status ──
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

      // Update snippet in conversations list
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

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedConv || (!draft.trim() && !selectedImage) || sending) return;

    const text = draft.trim();
    const img = selectedImage;
    setDraft('');
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

      const sent = await sendConversationMessageApi(selectedConv.id, payload);
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, sent];
      });
    } catch {
      alert('Failed to send message. Please try again.');
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAttachProduct = async (product: any) => {
    if (!selectedConv) return;
    setSending(true);
    try {
      const newMsg = await sendConversationMessageApi(selectedConv.id, {
        body: `Referencing product: ${product.name}`,
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
    } catch {
      alert('Failed to attach product.');
    } finally {
      setSending(false);
    }
  };

  const handleAttachOrder = async (order: any) => {
    if (!selectedConv) return;
    setSending(true);
    try {
      const newMsg = await sendConversationMessageApi(selectedConv.id, {
        body: `Referencing Order #${order.order_number}`,
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
    } catch {
      alert('Failed to attach order.');
    } finally {
      setSending(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!selectedConv) return;
    const newStatus = selectedConv.status === 'open' ? 'resolved' : 'open';
    try {
      await updateConversationStatusApi(selectedConv.id, newStatus);
      setSelectedConv((prev) => (prev ? { ...prev, status: newStatus } : null));
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConv.id ? { ...c, status: newStatus } : c))
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleTemplate = (tpl: string) => {
    setDraft(tpl);
  };

  const handleStartNewChat = async (contact: any) => {
    setShowNewChatModal(false);
    try {
      const type = contact.role === 'seller' ? 'seller_admin' : 'buyer_admin';
      const payload: any = { type };
      if (contact.role === 'seller') {
        payload.seller_id = contact.id;
      } else {
        payload.buyer_id = contact.id;
      }
      const newConv = await startConversationApi(payload);
      await loadConversations(newConv.id);
    } catch {
      alert('Failed to initiate conversation with this contact.');
    }
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

  const lastAdminMessageId = [...messages].reverse().find((m) => m.sender_role === 'admin')?.id;

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
  const openCount = conversations.filter((c) => c.status !== 'resolved').length;
  const resolvedCount = conversations.filter((c) => c.status === 'resolved').length;

  return (
    <div ref={pageRef} className="space-y-6">
      {/* Hero band with luxury gradient */}
      <div
        className="rounded-2xl px-7 py-6 overflow-hidden relative shadow-sm"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1">
              Admin / Overview
            </p>
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] font-black text-white leading-tight tracking-tight">
                Messages &amp; Support Inquiries
              </h1>
              {totalUnread > 0 && (
                <span className="px-3 py-1 rounded-full text-xs font-black bg-brand-red text-white shadow-xs animate-pulse">
                  {totalUnread} Unread
                </span>
              )}
            </div>
            <p className="text-[12px] text-white/60 mt-1.5">
              Resolve buyer inquiries, assist seller partners, and monitor marketplace communication in real time
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-2xl bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center gap-2">
              <span className="text-white/50">Open:</span>
              <span className="font-bold text-white">{openCount}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-xs font-semibold text-emerald-300 flex items-center gap-2">
              <span className="text-emerald-400">Resolved:</span>
              <span className="font-bold text-emerald-200">{resolvedCount}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs bg-white/10 border border-white/10 px-3.5 py-1.5 rounded-2xl font-semibold text-white">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
              {wsConnected ? 'Live Updates' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Pane Box */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden h-[760px] flex flex-col md:flex-row">
        {/* LEFT PANE: Filter & List */}
        <div className="w-full md:w-80 lg:w-96 border-r border-gray-200/80 flex flex-col h-full bg-gray-50/40">
          {/* Filters Bar */}
          <div className="p-4 border-b border-gray-200/80 space-y-3 bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-900">Conversations</span>
              <button
                type="button"
                onClick={() => setShowNewChatModal(true)}
                className="px-3 py-1.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                title="Start a new message with any Buyer or Seller"
              >
                <Plus className="w-3.5 h-3.5" /> New Chat
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search user, store name, or text…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 rounded-2xl border border-gray-200 outline-none focus:border-brand-red focus:bg-white focus:ring-2 focus:ring-brand-red/10 transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CustomSelect
                value={roleFilter}
                onChange={(val) => setRoleFilter(val)}
                options={ROLE_FILTER_OPTIONS}
                className="text-xs"
              />
              <CustomSelect
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={STATUS_FILTER_OPTIONS}
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
                <p className="text-xs font-bold text-gray-800">No matching conversations</p>
                <p className="text-[11px] text-gray-400">Support tickets and messages will appear here.</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSellerConv = c.type === 'seller_admin';
                const isBuyerConv = c.type === 'buyer_admin';
                const isSelected = selectedConv?.id === c.id;
                const hasUnread = (c.unread || 0) > 0;

                const shopName = c.seller?.shop_name || c.recipient?.shop_name || 'Store';
                const sellerOwner = c.seller?.owner_name || c.recipient?.seller_name;
                const buyerName = c.buyer ? `${c.buyer.first_name} ${c.buyer.last_name}` : 'Buyer';

                const title = isSellerConv
                  ? shopName
                  : isBuyerConv
                  ? buyerName
                  : `${buyerName} ↔ ${shopName}`;

                const subtitle = isSellerConv
                  ? `Owner: ${sellerOwner || 'Seller'} · ${c.seller?.email || ''}`
                  : isBuyerConv
                  ? `Buyer · ${c.buyer?.email || ''}`
                  : `Store: ${shopName} (Owner: ${sellerOwner || 'Seller'})`;

                const avatarSrc = isSellerConv
                  ? (c.seller?.avatar_url || c.seller?.shop_logo)
                  : (c.buyer?.avatar_url);

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConv(c)}
                    className={`w-full p-3.5 rounded-2xl flex items-start gap-3 text-left transition-all ${
                      isSelected
                        ? 'bg-rose-50/80 border border-rose-200 shadow-2xs'
                        : 'hover:bg-white'
                    }`}
                  >
                    <AvatarWithFallback
                      src={avatarSrc}
                      alt={title}
                      role={isSellerConv ? 'seller' : 'buyer'}
                      className="w-10 h-10 rounded-2xl shrink-0 border border-gray-100 shadow-2xs"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-bold text-gray-900 truncate">{title}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{timeLabel(c.last_message_at || c.created_at)}</span>
                      </div>

                      <p className="text-[10px] text-gray-500 truncate mb-1">{subtitle}</p>

                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                          isSellerConv ? 'bg-sky-50 text-sky-700' : isBuyerConv ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {isSellerConv ? 'Seller Support' : isBuyerConv ? 'Buyer Support' : 'Marketplace'}
                        </span>
                        {c.status === 'resolved' && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700">
                            Resolved
                          </span>
                        )}
                      </div>

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

        {/* RIGHT PANE: Selected Thread */}
        <div className="flex-1 flex flex-col h-full bg-white">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-gray-50/20">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-brand-red flex items-center justify-center border border-rose-100 shadow-sm">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Select a conversation</h3>
              <p className="text-xs text-gray-400 max-w-sm">
                Choose a ticket from the left panel to review message history and provide support assistance.
              </p>
            </div>
          ) : (
            <>
              {/* Top Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarWithFallback
                    src={
                      selectedConv.type === 'seller_admin'
                        ? (selectedConv.seller?.avatar_url || selectedConv.seller?.shop_logo)
                        : selectedConv.buyer?.avatar_url
                    }
                    alt={
                      selectedConv.type === 'seller_admin'
                        ? (selectedConv.seller?.shop_name || 'Seller')
                        : (selectedConv.buyer ? `${selectedConv.buyer.first_name} ${selectedConv.buyer.last_name}` : 'Customer')
                    }
                    role={selectedConv.type === 'seller_admin' ? 'seller' : 'buyer'}
                    className="w-10 h-10 rounded-2xl shrink-0 border border-gray-100 shadow-2xs"
                  />

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {selectedConv.type === 'seller_admin'
                        ? selectedConv.seller?.shop_name || 'Seller Store'
                        : selectedConv.buyer
                        ? `${selectedConv.buyer.first_name} ${selectedConv.buyer.last_name}`
                        : 'Customer'}
                    </h3>
                    <p className="text-[11px] text-gray-500 truncate">
                      {selectedConv.type === 'seller_admin' ? (
                        <>
                          <span className="font-semibold text-gray-700">
                            Store Owner: {selectedConv.seller?.owner_name || selectedConv.recipient?.seller_name || 'Seller'}
                          </span>
                          {' · '}
                          {selectedConv.seller?.email}
                        </>
                      ) : (
                        `Buyer · ${selectedConv.buyer?.email || ''}`
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStatusToggle}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                      selectedConv.status === 'resolved'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {selectedConv.status === 'resolved' ? 'Resolved (Click to Reopen)' : 'Mark as Resolved'}
                  </button>
                </div>
              </div>

              {/* Context Banners */}
              {selectedConv.product && (
                <div className="p-3 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    {selectedConv.product.image ? (
                      <img
                        src={selectedConv.product.image}
                        alt={selectedConv.product.name}
                        className="w-11 h-11 rounded-xl object-cover border border-rose-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-rose-100 text-brand-red flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-brand-red tracking-wider">Referenced Product</span>
                      <p className="font-bold text-gray-900 truncate">{selectedConv.product.name}</p>
                      <p className="text-xs font-black text-brand-red">
                        ₱{selectedConv.product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/admin/products/${selectedConv.product.id}`}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    Review Product <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {selectedConv.order && (
                <div className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-blue-700 tracking-wider">Referenced Order</span>
                      <p className="font-bold text-gray-900 truncate">Order #{selectedConv.order.order_number}</p>
                      <p className="text-[11px] text-gray-500 capitalize">
                        Total: ₱{selectedConv.order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · Status: <span className="font-bold text-blue-700">{selectedConv.order.status.replace(/_/g, ' ')}</span>
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/admin/orders`}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1 shrink-0 shadow-2xs"
                  >
                    View in Orders <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fafafa]">
                {loadingMessages ? (
                  <div className="text-center text-xs text-gray-400 py-10">Loading message log...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <p className="text-xs font-bold text-gray-700">No messages in this inquiry yet</p>
                    <p className="text-[11px] text-gray-400">Send an official reply below to communicate with the user.</p>
                  </div>
                ) : (
                messages.map((m, idx) => {
                  const isAdminSender = m.sender_role === 'admin';
                  const isLastFromSender = idx === messages.length - 1 || (messages[idx + 1]?.sender_role === 'admin') !== isAdminSender;
                  const isLastAdminMessage = isAdminSender && m.id === lastAdminMessageId;
                  const showDateHeader = shouldShowDateSeparator(m.created_at, messages[idx - 1]?.created_at);

                  const otherAvatar = selectedConv.type === 'seller_admin'
                    ? (selectedConv.seller?.avatar_url || selectedConv.seller?.shop_logo)
                    : selectedConv.buyer?.avatar_url;

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

                      <div className={`flex items-end gap-2.5 ${isAdminSender ? 'justify-end' : 'justify-start'}`}>
                        {!isAdminSender && (
                          <div className="w-8 h-8 shrink-0 mb-1">
                            {isLastFromSender ? (
                              <AvatarWithFallback
                                src={m.sender_avatar || otherAvatar}
                                alt={m.sender_name || 'User'}
                                role={m.sender_role || 'buyer'}
                                className="w-8 h-8 rounded-full border border-gray-200/70 shadow-2xs"
                                iconClassName="w-4 h-4"
                              />
                            ) : (
                              <div className="w-8 h-8" />
                            )}
                          </div>
                        )}

                        <div className={`flex flex-col ${isAdminSender ? 'items-end' : 'items-start'} max-w-[78%] sm:max-w-md`}>
                          {/* Rich Attachment Bubble */}
                          {m.attachment_type && m.attachment_data && (
                            <ChatAttachmentBubble
                              type={m.attachment_type}
                              data={m.attachment_data}
                              isMe={isAdminSender}
                            />
                          )}

                          {m.body && (
                            <div
                              className={`px-4 py-2.5 text-xs leading-relaxed ${
                                isAdminSender
                                  ? 'bg-brand-red text-white rounded-2xl rounded-br-xs shadow-xs'
                                  : 'bg-white text-gray-900 border border-gray-200/80 rounded-2xl rounded-bl-xs shadow-2xs'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            </div>
                          )}

                          {/* Messenger Seen / Sent receipt on the most recent outgoing message */}
                          {isLastAdminMessage && (
                            <div className="flex items-center justify-end gap-1.5 mt-1 px-1">
                              {m.read_at ? (
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 animate-in fade-in duration-200">
                                  <span>{formatTimeOnly(m.created_at)}</span>
                                  <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white shadow-2xs">
                                    <AvatarWithFallback
                                      src={otherAvatar}
                                      alt="Seen"
                                      role={selectedConv.type === 'seller_admin' ? 'seller' : 'buyer'}
                                      className="w-4 h-4 rounded-full"
                                      iconClassName="w-2 h-2"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-500">Seen</span>
                                </div>
                              ) : (
                                <div className="text-[10px] font-medium text-gray-400">
                                  <span>Sent {timeLabel(m.created_at)}</span>
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

              {/* Quick Admin Reply Templates */}
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold uppercase text-gray-400 shrink-0">Quick Responses:</span>
                <button
                  onClick={() => handleTemplate('Hello! Velure Support has received your inquiry. We are reviewing this and will update you shortly.')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  ⏳ Reviewing Inquiry
                </button>
                <button
                  onClick={() => handleTemplate('This matter has been verified and processed. Please check your account updates.')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  ✅ Processed
                </button>
                <button
                  onClick={() => handleTemplate('Thank you for contacting Velure Support. Have a wonderful day!')}
                  className="px-3 py-1 bg-gray-50 hover:bg-rose-50 hover:text-brand-red text-gray-600 text-xs font-medium rounded-full border border-gray-200 shrink-0 transition-colors"
                >
                  🙏 Sign-off
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
                      <p className="text-[10px] text-gray-400">Ready to send with official response</p>
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
                    placeholder="Type an official admin response..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 px-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={(!draft.trim() && !selectedImage) || sending}
                    className="text-xs font-bold flex items-center gap-2 px-5 py-2.5 rounded-2xl shrink-0"
                  >
                    <Send className="w-4 h-4" /> Send Reply
                  </Button>
                </form>
              </div>

              {/* Attachments Modal */}
              <ChatAttachmentModal
                isOpen={showAttachModal}
                onClose={() => setShowAttachModal(false)}
                conversation={selectedConv}
                onAttachProduct={handleAttachProduct}
                onAttachOrder={handleAttachOrder}
                onAttachImage={(file) => setSelectedImage(file)}
              />
            </>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      <AdminNewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onSelectUser={handleStartNewChat}
      />
    </div>
  );
}

// ─── Admin New Chat Modal ───────────────────────────────────────────────────

function AdminNewChatModal({
  isOpen,
  onClose,
  onSelectUser,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: { id: number; role: 'buyer' | 'seller'; name: string; shop_name?: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchAdminContactsApi(query);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-brand-red flex items-center justify-center font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Start New Conversation</h3>
              <p className="text-[11px] text-gray-400">Search any Buyer or Store Partner in Velure</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or shop name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/10"
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1 divide-y divide-gray-50">
          {loading ? (
            <p className="text-center py-8 text-xs text-gray-400">Searching contacts...</p>
          ) : results.length === 0 ? (
            <p className="text-center py-8 text-xs text-gray-400">
              {query ? 'No matching users found.' : 'Type to search users or stores.'}
            </p>
          ) : (
            results.map((c) => (
              <button
                key={`${c.role}-${c.id}`}
                onClick={() => onSelectUser(c)}
                className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-rose-50/50 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <AvatarWithFallback
                    src={c.avatar_url || c.shop_logo}
                    alt={c.shop_name || c.name}
                    role={c.role}
                    className="w-9 h-9 rounded-full border border-gray-100 shadow-2xs"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900 group-hover:text-brand-red">
                        {c.shop_name || c.name}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        c.role === 'seller' ? 'bg-rose-100 text-brand-red' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {c.role === 'seller' ? 'Seller' : 'Buyer'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {c.role === 'seller' ? `Owner: ${c.name} · ${c.email}` : c.email}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

