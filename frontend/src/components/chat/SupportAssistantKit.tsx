import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Conversation } from '../../types';

/**
 * The Loved-IT Assistant in the buyer's Loved-IT Support chat (Amaru task 8): the note that it answers first with a
 * "Talk to a person" button, who wrote each reply, "is typing…" while it answers, and new replies typing themselves
 * out.
 */

/** The assistant is answering the buyer's last message (it usually replies within seconds). */
export function assistantIsTyping(mode: Conversation['support_mode'], messages: ChatMessage[], userId?: number): boolean {
  const last = messages[messages.length - 1];
  return mode === 'ai' && !!last && last.sender_id === userId && Date.now() - new Date(last.created_at).getTime() < 60_000;
}

/**
 * Who answers the chat, with the switch: while the assistant answers, "Talk to a person"; after a handoff, a note that
 * the team will reply and "Ask the assistant instead" (shown only when the assistant is switched on).
 */
export function SupportModeBar({ mode, assistantAvailable, onTalkToPerson, onBackToAssistant }: {
  mode: Conversation['support_mode'];
  assistantAvailable?: boolean;
  onTalkToPerson: () => Promise<string | null>;
  onBackToAssistant: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withAssistant = mode === 'ai';
  if (!withAssistant && !(mode === 'human' && assistantAvailable)) return null;

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(await action());
    setBusy(false);
  };

  return (
    <div className="px-4 py-2 border-b border-stone-200 bg-stone-50 shrink-0">
      <div className="flex items-center gap-3">
        <p className="flex-1 min-w-0 text-[11.5px] leading-snug text-stone-600">
          {withAssistant
            ? <><span className="font-semibold text-stone-800">Loved-IT Assistant</span> answers first. It can check your orders and explain the rules, but it can&apos;t cancel or refund.</>
            : <><span className="font-semibold text-stone-800">A Loved-IT team member</span> will reply here. For quick answers about your orders, you can ask the assistant.</>}
        </p>
        <button type="button" disabled={busy} onClick={() => run(withAssistant ? onTalkToPerson : onBackToAssistant)}
          className="shrink-0 h-8 px-3 rounded-full border border-stone-300 bg-white text-[12px] font-semibold text-stone-800 hover:border-stone-900 disabled:opacity-60 transition-colors">
          {busy ? 'Connecting…' : withAssistant ? 'Talk to a person' : 'Ask the assistant'}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/** Above the first of a run of support replies: the assistant or a person from the team. */
export function SupportSenderLabel({ role }: { role?: string }) {
  if (role !== 'assistant' && role !== 'admin') return null;
  return <span className="mb-0.5 px-1 text-[10.5px] font-medium text-stone-500">{role === 'assistant' ? 'Loved-IT Assistant' : 'Loved-IT team'}</span>;
}

/** While the assistant works on an answer: "is typing…" with three dots rising in a wave, as in a chat with a person. */
export function AssistantTyping() {
  return (
    <div className="flex items-end gap-2 mt-3" role="status">
      <span className="w-7 shrink-0" />
      <div className="flex flex-col items-start">
        <span className="mb-0.5 px-1 text-[10.5px] font-medium text-stone-500">Loved-IT Assistant is typing…</span>
        <span className="inline-flex items-center gap-1 px-3.5 py-3 bg-white ring-1 ring-stone-200 rounded-[18px] rounded-bl-sm">
          {[0, 1, 2].map((i) => <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-stone-500" style={{ animationDelay: `${i * 160}ms` }} />)}
        </span>
      </div>
    </div>
  );
}

/**
 * What comes with an assistant reply (its order cards): shown once the reply has finished typing itself out, with a
 * soft fade-in, and at once for older replies. onShow runs when it appears late, so the chat can scroll to it.
 */
export function AfterTyping({ message, onShow, children }: { message: ChatMessage; onShow?: () => void; children: React.ReactNode }) {
  const [visible, setVisible] = useState(() => typedOut.has(message.id) || Date.now() - new Date(message.created_at).getTime() >= 20_000);
  const appearedLate = useRef(false);
  const onShowRef = useRef(onShow);
  useEffect(() => { onShowRef.current = onShow; });

  useEffect(() => {
    if (visible) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => { appearedLate.current = true; setVisible(true); }, reduce ? 0 : typingMs(message.body.length) + 200);
    return () => window.clearTimeout(timer);
  }, [visible, message.body]);

  useEffect(() => {
    if (visible && appearedLate.current) onShowRef.current?.();
  }, [visible]);

  return visible ? <div className={appearedLate.current ? 'chat-card-in' : undefined}>{children}</div> : null;
}

/** All the way down, past the list's bottom padding, so the last bubble is fully in view. */
export function scrollToBottom(list: HTMLElement | null | undefined) {
  if (list) list.scrollTop = list.scrollHeight;
}

/** Replies already typed out in this visit, so reopening the chat shows them whole. */
const typedOut = new Set<number>();

/** How long a reply takes to type itself out: about 45 characters a second, never more than 4 seconds. */
const typingMs = (length: number) => Math.min(4000, Math.max(600, length * 22));

/**
 * The text of an assistant reply. A reply that just arrived (in the last 20 seconds) types itself out with a blinking
 * caret, a few characters at a time, like a person writing; older replies, and everything for people who prefer less
 * motion, show at once. onGrow runs as the text grows, so the chat can stay scrolled to the bottom.
 */
export function AssistantText({ message, onGrow }: { message: ChatMessage; onGrow?: () => void }) {
  const text = message.body;
  const [fresh] = useState(() => !typedOut.has(message.id) && Date.now() - new Date(message.created_at).getTime() < 20_000);
  const [shown, setShown] = useState(fresh ? 0 : text.length);
  const onGrowRef = useRef(onGrow);
  useEffect(() => { onGrowRef.current = onGrow; });

  useEffect(() => {
    if (!fresh) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      typedOut.add(message.id);
      setShown(text.length);
      return;
    }
    const started = performance.now();
    const duration = typingMs(text.length);
    let frame = 0;
    const tick = (now: number) => {
      const count = Math.min(text.length, Math.ceil(((now - started) / duration) * text.length));
      setShown(count);
      if (count < text.length) frame = requestAnimationFrame(tick);
      else typedOut.add(message.id);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fresh, text, message.id]);

  // After the new letters are on screen, so the chat scrolls to the real bottom, including the last line.
  useEffect(() => {
    if (fresh) onGrowRef.current?.();
  }, [fresh, shown]);

  const typing = shown < text.length;
  return (
    <>
      {/* Screen readers get the whole reply once, not a letter at a time. */}
      <span aria-hidden={typing || undefined}>{text.slice(0, shown)}</span>
      {typing && <span className="typing-caret inline-block w-[2px] h-[1em] -mb-[2px] ml-0.5 bg-stone-500 align-baseline" aria-hidden="true" />}
      {typing && <span className="sr-only">{text}</span>}
    </>
  );
}
