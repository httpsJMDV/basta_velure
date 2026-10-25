import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { getEcho, resetEcho } from '../lib/echo';
import { usePolling, CHAT_POLL } from './usePolling';
import { mergeFetchedMessages } from '../components/chat/chatUtils';
import {
  getConversationsApi,
  startConversationApi,
  getConversationMessagesApi,
  sendConversationMessageApi,
  confirmOrderAddressApi,
  handoffSupportChatApi,
  resumeAssistantApi,
} from '../api/client';
import type {
  Conversation,
  ChatMessage,
  ProductContext,
  OrderContext,
} from '../types';

interface ChatContextType {
  isChatOpen: boolean;
  activeConversation: Conversation | null;
  conversations: Conversation[];
  messages: ChatMessage[];
  unreadTotal: number;
  loadingConversations: boolean;
  loadingMessages: boolean;
  sendingMessage: boolean;
  wsConnected: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  selectConversation: (conversation: Conversation) => void;
  clearActiveConversation: () => void;
  openChatWithSeller: (sellerId: number, product?: ProductContext, initialMessage?: string) => Promise<Conversation | null>;
  openChatWithSupport: (order?: OrderContext, initialMessage?: string) => Promise<Conversation | null>;
  sendMessage: (body: string, attachmentType?: string, attachmentData?: any, imageFile?: File) => Promise<void>;
  /** Confirms the address on a shop's order confirmation card; resolves to an error message, or null. */
  confirmOrderAddress: (messageId: number) => Promise<string | null>;
  /** "Talk to a person" in the Loved-IT Support chat; resolves to an error message, or null. */
  talkToPerson: () => Promise<string | null>;
  /** After a handoff, "Ask the assistant instead"; resolves to an error message, or null. */
  backToAssistant: () => Promise<string | null>;
  refreshConversations: () => Promise<void>;
  refreshMessages: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const activeConvRef = useRef<Conversation | null>(null);
  activeConvRef.current = activeConversation;
  const chatOpenRef = useRef(isChatOpen);
  chatOpenRef.current = isChatOpen;

  const userId = user?.id;
  const activeConvId = activeConversation?.id;

  // Refresh conversation list from API and update unread total simultaneously
  const refreshConversations = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadingConversations(true);
      const data = await getConversationsApi();
      setConversations(data);
      const sum = data.reduce((acc, c) => acc + (Number(c.unread) || 0), 0);
      setUnreadTotal(sum);
    } catch {
      // silently handle
    } finally {
      setLoadingConversations(false);
    }
  }, [userId]);

  // Refresh active conversation messages from API
  const refreshMessages = useCallback(async () => {
    if (!activeConvId) return;
    try {
      const list = await getConversationMessagesApi(activeConvId);
      setMessages(list);
    } catch {
      // ignore
    }
  }, [activeConvId]);

  const refreshConversationsRef = useRef(refreshConversations);
  refreshConversationsRef.current = refreshConversations;

  // Background refreshes (no loading state): the safety net under the websocket, and the way a message from the
  // other side gets marked read while the thread is open.
  const refreshThreadSilently = useCallback(() => {
    const id = activeConvRef.current?.id;
    if (!id) return;
    getConversationMessagesApi(id)
      .then((list) => setMessages((prev) => (activeConvRef.current?.id === id ? mergeFetchedMessages(prev, list) : prev)))
      .catch(() => {});
  }, []);

  const refreshInboxSilently = useCallback(() => {
    getConversationsApi()
      .then((data) => {
        const openId = chatOpenRef.current ? activeConvRef.current?.id : undefined;
        const list = data.map((c) => (c.id === openId ? { ...c, unread: 0 } : c));
        setConversations(list);
        setUnreadTotal(list.reduce((acc, c) => acc + (Number(c.unread) || 0), 0));
      })
      .catch(() => {});
  }, []);

  // Initial load on user login - only buyers need global floating chat initialization
  useEffect(() => {
    if (userId && user?.role === 'buyer') {
      refreshConversationsRef.current();
    } else if (!userId) {
      setConversations([]);
      setMessages([]);
      setActiveConversation(null);
      setUnreadTotal(0);
      setIsChatOpen(false);
      resetEcho();
    }
  }, [userId, user?.role]);

  // ── 1. WebSockets: Per-User Channel for Real-time Inboxes & Unread Count ────
  useEffect(() => {
    if (!userId) return;

    const echo = getEcho();

    // Listen to connection state
    const pusher = echo.connector?.pusher;
    if (pusher?.connection) {
      setWsConnected(pusher.connection.state === 'connected');
      const handleStateChange = (states: { current: string; previous: string }) => {
        const isConn = states.current === 'connected';
        setWsConnected(isConn);
        if (isConn && states.previous !== 'connected') {
          // Silent backfill on reconnect
          refreshConversationsRef.current();
          if (activeConvRef.current) {
            getConversationMessagesApi(activeConvRef.current.id).then(setMessages).catch(() => {});
          }
        }
      };
      pusher.connection.bind('state_change', handleStateChange);
    }

    const channelName = `user.${userId}.conversations`;
    const userChannel = echo.private(channelName);

    const handleConvUpdated = (payload: any) => {
      if (payload?.conversation) {
        const updatedConv: Conversation = payload.conversation;
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === updatedConv.id);
          if (exists) {
            return prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c));
          }
          return [updatedConv, ...prev];
        });
      }

      if (typeof payload?.unread_total === 'number') {
        setUnreadTotal(payload.unread_total);
      }
    };

    userChannel.listen('.ConversationUpdated', handleConvUpdated);
    userChannel.listen('ConversationUpdated', handleConvUpdated);

    return () => {
      echo.leave(channelName);
    };
  }, [userId]);

  // ── 2. WebSockets: Active Conversation Channel for Instant Messages & Read Receipts ──
  useEffect(() => {
    if (!userId || !activeConvId) {
      return;
    }

    setLoadingMessages(true);

    // Initial fetch of message stream for this specific conversation
    getConversationMessagesApi(activeConvId)
      .then((data) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    const echo = getEcho();
    const channelName = `conversation.${activeConvId}`;
    const convChannel = echo.private(channelName);

    const handleMessageSent = (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // From the other side while the thread is on screen: fetch once more so the server marks it read.
      if (msg.sender_id !== userId && chatOpenRef.current) refreshThreadSilently();

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId
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
  }, [userId, activeConvId, refreshThreadSilently]);

  // Every few seconds while the websocket is down, now and then while it is up.
  usePolling(refreshThreadSilently, CHAT_POLL.thread(wsConnected), Boolean(userId && activeConvId && isChatOpen));
  usePolling(refreshInboxSilently, CHAT_POLL.inbox(wsConnected), Boolean(userId && user?.role === 'buyer'));

  const openChat = useCallback(() => {
    setIsChatOpen(true);
    refreshConversations();
  }, [refreshConversations]);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
    if (!isChatOpen) {
      refreshConversations();
    }
  }, [isChatOpen, refreshConversations]);

  const selectConversation = useCallback((conversation: Conversation) => {
    setActiveConversation(conversation);
    setIsChatOpen(true);
    // Instant local optimistic update for unread counter
    if (conversation.unread > 0) {
      setUnreadTotal((prev) => Math.max(0, prev - conversation.unread));
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, unread: 0 } : c))
      );
    }
  }, []);

  const clearActiveConversation = useCallback(() => {
    setActiveConversation(null);
    refreshConversations();
  }, [refreshConversations]);

  const openChatWithSeller = useCallback(
    async (sellerId: number, product?: ProductContext, initialMessage?: string) => {
      try {
        const conv = await startConversationApi({
          type: 'buyer_seller',
          seller_id: sellerId,
          product_id: product?.id,
          initial_message: initialMessage,
        });
        setActiveConversation(conv);
        setIsChatOpen(true);
        refreshConversations();
        return conv;
      } catch (err: any) {
        alert(err.response?.data?.message || 'Unable to open chat with this seller.');
        return null;
      }
    },
    [refreshConversations]
  );

  const openChatWithSupport = useCallback(
    async (order?: OrderContext, initialMessage?: string) => {
      try {
        const conv = await startConversationApi({
          type: 'buyer_admin',
          order_id: order?.id,
          subject: order ? `Inquiry regarding Order #${order.order_number}` : 'Customer Support Inquiry',
          initial_message: initialMessage,
        });
        setActiveConversation(conv);
        setIsChatOpen(true);
        refreshConversations();
        return conv;
      } catch (err: any) {
        alert(err.response?.data?.message || 'Unable to open customer support chat.');
        return null;
      }
    },
    [refreshConversations]
  );

  const sendMessage = useCallback(
    async (body: string, attachmentType?: string, attachmentData?: any, imageFile?: File) => {
      if (!activeConversation) return;
      if (!body.trim() && !attachmentType && !imageFile) return;
      setSendingMessage(true);
      try {
        let payload: any;
        if (imageFile) {
          const fd = new FormData();
          if (body.trim()) fd.append('body', body.trim());
          fd.append('image', imageFile);
          if (attachmentType) fd.append('attachment_type', attachmentType);
          payload = fd;
        } else {
          payload = {
            body: body.trim(),
            attachment_type: attachmentType,
            attachment_data: attachmentData,
          };
        }

        const newMsg = await sendConversationMessageApi(activeConversation.id, payload);
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to send message.');
      } finally {
        setSendingMessage(false);
      }
    },
    [activeConversation]
  );

  const confirmOrderAddress = useCallback(
    async (messageId: number) => {
      if (!activeConversation) return null;
      try {
        const updated = await confirmOrderAddressApi(activeConversation.id, messageId);
        setMessages((prev) => {
          const byId = new Map(updated.map((m) => [m.id, m]));
          const merged = prev.map((m) => byId.get(m.id) ?? m);
          return [...merged, ...updated.filter((m) => !prev.some((p) => p.id === m.id))];
        });
        return null;
      } catch (err: any) {
        return err.response?.data?.message || 'The address could not be confirmed. Try again.';
      }
    },
    [activeConversation]
  );

  // Switches the Loved-IT Support chat between the assistant and the Loved-IT team.
  const switchSupport = useCallback(async (call: (id: number) => Promise<Conversation>, failure: string) => {
    const id = activeConvRef.current?.id;
    if (!id) return null;
    try {
      const updated = await call(id);
      setActiveConversation((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      refreshThreadSilently();
      return null;
    } catch (err: any) {
      return err.response?.data?.message || failure;
    }
  }, [refreshThreadSilently]);

  const talkToPerson = useCallback(
    () => switchSupport(handoffSupportChatApi, 'Could not reach the Loved-IT team. Try again.'),
    [switchSupport]
  );
  const backToAssistant = useCallback(
    () => switchSupport(resumeAssistantApi, 'The assistant could not be reached. Try again.'),
    [switchSupport]
  );

  return (
    <ChatContext.Provider
      value={{
        isChatOpen,
        activeConversation,
        conversations,
        messages,
        unreadTotal,
        loadingConversations,
        loadingMessages,
        sendingMessage,
        wsConnected,
        openChat,
        closeChat,
        toggleChat,
        selectConversation,
        clearActiveConversation,
        openChatWithSeller,
        openChatWithSupport,
        sendMessage,
        confirmOrderAddress,
        talkToPerson,
        backToAssistant,
        refreshConversations,
        refreshMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}


