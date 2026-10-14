import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MessageSquare } from 'lucide-react';
import type { RiderChatCounterpart } from '../../types';
import RiderChatSheet, { type RiderChatTarget } from './RiderChatSheet';

/** The phase decides who the rider may message: the seller while collecting, the buyer while delivering, the hub always. */
export type MessagePhase = 'pickup' | 'delivery';

const OPTIONS: Record<MessagePhase, { counterpart: RiderChatCounterpart; label: string }[]> = {
  pickup: [
    { counterpart: 'seller', label: 'Message the seller' },
    { counterpart: 'hub', label: 'Message the hub' },
  ],
  delivery: [
    { counterpart: 'buyer', label: 'Message the buyer' },
    { counterpart: 'hub', label: 'Message the hub' },
  ],
};

interface RiderMessageControlProps {
  /** The parcel the thread is about. For a grouped pickup card this is the group's first tracking number. */
  trackingNumber: string;
  phase: MessagePhase;
  /** Unread messages across this card's threads. */
  unread?: number;
  /** Per-counterpart unread, to mark which menu entry has the new message. */
  unreadByCounterpart?: Partial<Record<RiderChatCounterpart, number>>;
  /** Refresh the unread badges (messages were read or sent). */
  onActivity?: () => void;
  className?: string;
}

/**
 * A "Message" button for a stop card. It offers the counterparts allowed in the card's phase and opens the
 * conversation in a bottom sheet on top of the delivery screen.
 */
export default function RiderMessageControl({
  trackingNumber,
  phase,
  unread = 0,
  unreadByCounterpart,
  onActivity,
  className = '',
}: RiderMessageControlProps) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [target, setTarget] = useState<RiderChatTarget | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const choose = (counterpart: RiderChatCounterpart) => {
    // Focus goes back to the button first, so the sheet remembers it as the opener and returns focus there.
    buttonRef.current?.focus();
    setMenuOpen(false);
    setTarget({ kind: 'parcel', trackingNumber, counterpart });
  };

  const label = unread > 0 ? `Message, ${unread} unread` : 'Message';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={label}
        className="relative min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-sm font-bold"
      >
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
        Message
        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center"
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {menuOpen && (
        <ul
          id={menuId}
          className="absolute left-0 bottom-full mb-1 z-20 min-w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1"
        >
          {OPTIONS[phase].map((option) => {
            const count = unreadByCounterpart?.[option.counterpart] ?? 0;
            return (
              <li key={option.counterpart}>
                <button
                  type="button"
                  onClick={() => choose(option.counterpart)}
                  className="w-full min-h-11 px-4 flex items-center justify-between gap-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  <span>{option.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-red-600 text-white text-[11px] font-black px-1.5 min-w-5 text-center">
                      {count}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {target && <RiderChatSheet target={target} onClose={() => setTarget(null)} onActivity={onActivity} />}
    </div>
  );
}
