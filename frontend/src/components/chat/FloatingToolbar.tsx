import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, SquarePen, ChevronUp, X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';
import { useToast } from '../ui/Toast';

const SHOW_TOP_AFTER = 480; // px scrolled

function ToolButton({ icon: Icon, label, onClick, active, badge }: {
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative w-full flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition-colors ${
        active ? 'text-brand-red bg-rose-50' : 'text-gray-700 hover:text-brand-red hover:bg-gray-50'
      }`}
    >
      <Icon className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={1.8} aria-hidden="true" />
      <span className="text-[11px] font-medium leading-none">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

/**
 * The storefront's side toolbar (like Temu's): Messages opens the chat, Feedback sends a note to Loved-IT support,
 * and Top scrolls back up. Top only appears once the page is scrolled, rising in from below.
 */
export default function FloatingToolbar({ chatOpen, unread, onMessages }: { chatOpen: boolean; unread: number; onMessages: () => void }) {
  const { user } = useAuth();
  const { openChatWithSupport } = useChat();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_TOP_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!feedbackOpen) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setFeedbackOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFeedbackOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [feedbackOpen]);

  async function sendFeedback(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    setSending(true);
    const conversation = await openChatWithSupport(undefined, `Feedback: ${text}`);
    setSending(false);
    if (conversation) {
      setNote('');
      setFeedbackOpen(false);
      showToast('Thanks! Your feedback was sent to Loved-IT support.', 'success');
    } else {
      showToast('Could not send your feedback. Please try again.', 'error');
    }
  }

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <AnimatePresence>
        {feedbackOpen && (
          <motion.div
            initial={{ opacity: 0, x: 8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-full bottom-0 mr-3 w-[min(320px,calc(100vw-120px))] bg-white rounded-2xl shadow-2xl border border-gray-100 p-4"
            role="dialog"
            aria-label="Send feedback"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-bold text-gray-900">Share your feedback</p>
                <p className="text-[12px] text-gray-500 mt-0.5">Tell us what we can do better. It goes straight to our support team.</p>
              </div>
              <button type="button" onClick={() => setFeedbackOpen(false)} className="p-1 -m-1 text-gray-400 hover:text-gray-700" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {user ? (
              <form onSubmit={sendFeedback} className="space-y-2.5">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                  rows={4}
                  autoFocus
                  placeholder="Something confusing, a bug, an idea…"
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">{note.length}/1000</span>
                  <button
                    type="submit"
                    disabled={sending || !note.trim()}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-1 w-full h-9 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold transition-colors"
              >
                Sign in to send feedback
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-[68px] flex flex-col p-1 bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <ToolButton icon={MessageSquareText} label="Messages" onClick={onMessages} active={chatOpen} badge={chatOpen ? 0 : unread} />
        <ToolButton icon={SquarePen} label="Feedback" onClick={() => setFeedbackOpen((o) => !o)} active={feedbackOpen} />
        <AnimatePresence initial={false}>
          {scrolled && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: 14 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: 14 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <ToolButton icon={ChevronUp} label="Top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
