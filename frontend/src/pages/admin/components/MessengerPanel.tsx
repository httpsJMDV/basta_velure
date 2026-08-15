import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getConversationsApi,
  getConversationMessagesApi,
  sendConversationMessageApi,
} from '../../../api/client';
import { useAuth } from '../../../hooks/useAuth';
import type { Conversation, ChatMessage } from '../../../types';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react';

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

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Footer stats ─────────────────────────────────────────────────────────────

function MessengerFooter({ conversations }: { conversations: Conversation[] }) {
  const latest = conversations[0]?.shop_name ?? '—';
  return (
    <div
      className="shrink-0 border-t border-white/10 px-4 py-3 grid grid-cols-3 gap-2"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="text-center">
        <p className="text-[15px] font-bold text-white leading-none">
          {conversations.filter((c) => c.unread > 0 || c.last_message_at).length}
        </p>
        <p className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Sellers</p>
      </div>
      <div className="text-center border-x border-white/10">
        <p className="text-[15px] font-bold text-white leading-none">{conversations.length}</p>
        <p className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Total Chats</p>
      </div>
      <div className="text-center">
        <p className="text-[11px] font-semibold text-white leading-none truncate">{latest}</p>
        <p className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wide">Latest Chat</p>
      </div>
    </div>
  );
}

// ─── Conversation list (timeline style) ──────────────────────────────────────

function ConversationList({
  conversations,
  loading,
  onSelect,
}: {
  conversations: Conversation[];
  loading: boolean;
  onSelect: (c: Conversation) => void;
}) {
  return (
    <>
      {/* Fixed header */}
      <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em]">Seller Messages</p>
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'none' }}>
        {loading && (
          <div className="py-6 text-center text-[11px] text-gray-500">Loading…</div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="py-8 flex flex-col items-center gap-2 text-center">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <p className="text-[11px] text-gray-500">No conversations yet.</p>
          </div>
        )}

        {/* Timeline entries */}
        <div className="relative">
          {conversations.map((c, idx) => {
            const isLast = idx === conversations.length - 1;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-start gap-3 text-left group mb-0 focus-visible:outline-none"
              >
                {/* Dot + line */}
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className={[
                    'w-2 h-2 rounded-full shrink-0 transition-colors',
                    c.unread > 0 ? 'bg-brand-red' : 'bg-white/20 group-hover:bg-white/40',
                  ].join(' ')} />
                  {!isLast && <div className="w-px flex-1 bg-white/10 mt-1" style={{ minHeight: 28 }} />}
                </div>

                {/* Content */}
                <div className={`flex-1 min-w-0 pb-3 ${isLast ? '' : ''}`}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[12px] font-semibold text-white/90 group-hover:text-white truncate leading-tight transition-colors">
                      {c.shop_name}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.unread > 0 && (
                        <span className="min-w-[16px] h-[16px] px-1 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                          {c.unread}
                        </span>
                      )}
                      {c.last_message_at && (
                        <span className="text-[9px] text-gray-500">{timeLabel(c.last_message_at)}</span>
                      )}
                    </div>
                  </div>
                  {c.seller_name && (
                    <p className="text-[10px] text-gray-500 leading-tight">{c.seller_name}</p>
                  )}
                  <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">
                    {c.last_message?.body ?? 'No messages yet'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Thread view ──────────────────────────────────────────────────────────────

function ThreadView({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const latestCreatedAt         = useRef<string | undefined>(undefined);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getConversationMessagesApi(conversation.id).then((msgs) => {
      setMessages(msgs);
      if (msgs.length > 0) latestCreatedAt.current = msgs[msgs.length - 1].created_at;
    });
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const poll = useCallback(async () => {
    const newMsgs = await getConversationMessagesApi(conversation.id, latestCreatedAt.current);
    if (newMsgs.length > 0) {
      setMessages((prev) => [...prev, ...newMsgs]);
      latestCreatedAt.current = newMsgs[newMsgs.length - 1].created_at;
    }
  }, [conversation.id]);

  useEffect(() => {
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setBody('');
    try {
      const msg = await sendConversationMessageApi(conversation.id, trimmed);
      setMessages((prev) => [...prev, msg]);
      latestCreatedAt.current = msg.created_at;
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <>
      {/* Thread header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="w-6 h-6 rounded-full bg-brand-red flex items-center justify-center text-white text-[9px] font-bold shrink-0">
          {initials(conversation.shop_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white truncate leading-tight">{conversation.shop_name}</p>
          {conversation.seller_name && (
            <p className="text-[9px] text-gray-500 truncate">{conversation.seller_name}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5" style={{ scrollbarWidth: 'none' }}>
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-600 py-4">No messages yet. Say hello.</p>
        )}
        {messages.map((m) => {
          const isMe = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={[
                'max-w-[82%] px-2.5 py-1.5 rounded-xl text-[11px] leading-relaxed break-words',
                isMe ? 'bg-brand-red text-white rounded-br-sm' : 'bg-white/10 text-gray-100 rounded-bl-sm',
              ].join(' ')}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`text-[8px] mt-0.5 ${isMe ? 'text-white/60' : 'text-gray-500'} text-right`}>
                  {timeLabel(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
        <div className="flex items-end gap-2 bg-white/[0.07] rounded-lg px-2.5 py-1.5">
          <textarea
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message seller… (Enter to send)"
            rows={1}
            className="flex-1 bg-transparent text-[11px] text-white placeholder-gray-500 resize-none focus:outline-none leading-relaxed max-h-20 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="w-6 h-6 rounded-md bg-brand-red flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-red-dark transition-colors"
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Messenger panel ──────────────────────────────────────────────────────────

export interface MessengerPanelProps {
  openConversationId?: number | null;
  openConversation?: Conversation | null;
}

export default function MessengerPanel({ openConversationId, openConversation }: MessengerPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading]             = useState(true);
  const [active, setActive]               = useState<Conversation | null>(null);

  useEffect(() => {
    getConversationsApi()
      .then(setConversations)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (openConversation) {
      setActive(openConversation);
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === openConversation.id);
        return exists ? prev : [openConversation, ...prev];
      });
    }
  }, [openConversationId, openConversation]);

  return (
    // flex column, full height — header fixed, middle scrolls, footer fixed
    <div className="flex flex-col h-full">
      {active ? (
        <>
          <ThreadView conversation={active} onBack={() => setActive(null)} />
          <MessengerFooter conversations={conversations} />
        </>
      ) : (
        <>
          <ConversationList
            conversations={conversations}
            loading={loading}
            onSelect={setActive}
          />
          <MessengerFooter conversations={conversations} />
        </>
      )}
    </div>
  );
}
