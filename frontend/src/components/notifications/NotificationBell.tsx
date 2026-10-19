// The bell: unread count, the latest notifications, open one (marks it read and goes to its page), mark all read.
// `variant` matches where it sits: the storefront's red bar, a dark portal bar or a light portal bar. A new notification
// arrives live: the red badge pulses and the bell rings once. `attention` (things waiting for action, like pending
// applications) shows a red dot when nothing is unread.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, Package, Truck, Bike, BadgeCheck, Ban, Inbox, ShoppingBag, AlertTriangle, Star, Wallet, Scale, Undo2,
} from 'lucide-react';
import { useNotifications, timeAgo } from '../../hooks/useNotifications';
import type { AppNotificationItem } from '../../api/notifications';

export type BellVariant = 'storefront' | 'dark' | 'light';

const ICONS: Record<string, React.ElementType> = {
  'order.status': Package,
  'order.new': ShoppingBag,
  'order.paid': ShoppingBag,
  'order.returned_to_sender': Undo2,
  'shipment.status': Truck,
  'shipment.rts': Undo2,
  'stock.low': AlertTriangle,
  'review.new': Star,
  'payout.update': Wallet,
  'settlement.paid': Wallet,
  'settlement.confirmed': BadgeCheck,
  'settlement.receipt': Wallet,
  'settlement.reminder': Wallet,
  'settlement.disputed': AlertTriangle,
  'settlement.resolved': Scale,
  'settlement.pay_again': Ban,
  'product.decision': BadgeCheck,
  'return.escalated': Scale,
  'return.rejected': Scale,
  'dispute.escalated': Scale,
  'rider.job_offer': Bike,
  'rider.job_assigned': Bike,
  'rider.job_removed': Bike,
  'rider.approved': BadgeCheck,
  'rider.rejected': Ban,
  'rider.suspended': Ban,
};

const BUTTON: Record<BellVariant, string> = {
  storefront: 'w-10 h-10 rounded-full text-white hover:bg-white/10',
  dark: 'w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-white/70 hover:text-white hover:bg-white/10',
  light: 'w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100',
};

/** The ring around the badge takes the colour of the bar it sits on, so the red stands out on red and on dark. */
const RING: Record<BellVariant, string> = {
  storefront: 'ring-2 ring-white',
  dark: 'ring-2 ring-[#111111]',
  light: 'ring-2 ring-white',
};

export function NotificationRows({ items, onOpen, empty }: { items: AppNotificationItem[]; onOpen: (n: AppNotificationItem) => void; empty?: ReactNode }) {
  if (items.length === 0) {
    return <>{empty ?? <p className="py-8 text-center text-[13px] text-stone-400">No notifications yet</p>}</>;
  }
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((n) => {
        const Icon = ICONS[n.kind] ?? (n.kind.startsWith('order.parcel_') ? Package : Inbox);
        return (
          <li key={n.id}>
            <button type="button" onClick={() => onOpen(n)} className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-stone-50 ${n.read_at ? '' : 'bg-rose-50/40'}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.read_at ? 'bg-stone-100 text-stone-500' : 'bg-brand-red/10 text-brand-red'}`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[13px] leading-snug truncate ${n.read_at ? 'font-medium text-stone-700' : 'font-semibold text-stone-900'}`}>{n.title}</span>
                  <span className="text-[11px] text-stone-400 shrink-0 tabular-nums">{timeAgo(n.created_at)}</span>
                </span>
                <span className="block text-[12px] leading-snug text-stone-500 line-clamp-2">{n.body}</span>
              </span>
              {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-brand-red shrink-0" aria-label="Unread" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function NotificationBell({ variant = 'storefront', extra, attention = 0 }: { variant?: BellVariant; extra?: ReactNode; attention?: number }) {
  const navigate = useNavigate();
  const { unread, items, loading, arrived, load, markRead, markAllRead } = useNotifications(true);
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // A live notification: ring the bell and pulse the badge for a few seconds.
  useEffect(() => {
    if (!arrived) return undefined;
    setRinging(true);
    const t = window.setTimeout(() => setRinging(false), 4000);
    return () => window.clearTimeout(t);
  }, [arrived]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  function openItem(n: AppNotificationItem) {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const label = unread > 0
    ? `Notifications, ${unread} unread`
    : attention > 0 ? `Notifications, ${attention} waiting for action` : 'Notifications';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={label}
        className={`relative flex items-center justify-center transition-colors ${BUTTON[variant]}`}>
        <Bell className={`${variant === 'storefront' ? 'w-[22px] h-[22px]' : 'w-[17px] h-[17px]'} ${ringing ? 'animate-bell-ring' : ''}`} aria-hidden="true" />
        {unread > 0 ? (
          <span className={`absolute ${variant === 'storefront' ? 'top-0.5 right-0' : '-top-1 -right-1'} flex`}>
            {ringing && <span className="absolute inset-0 rounded-full bg-red-500 opacity-75 animate-ping" aria-hidden="true" />}
            <span className={`relative min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none flex items-center justify-center ${RING[variant]}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          </span>
        ) : attention > 0 ? (
          <span className={`absolute ${variant === 'storefront' ? 'top-2 right-2' : 'top-1 right-1'} w-2.5 h-2.5 rounded-full bg-red-600 ${RING[variant]}`} aria-hidden="true" />
        ) : null}
      </button>
      <span className="sr-only" aria-live="polite">{ringing ? 'New notification' : ''}</span>

      {open && (
        <div className="absolute right-0 top-12 z-[60] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-stone-100">
            <div>
              <p className="text-[14px] font-semibold text-stone-900">Notifications</p>
              <p className="text-[11.5px] text-stone-500 tabular-nums">{unread} unread</p>
            </div>
            <button type="button" onClick={markAllRead} disabled={unread === 0}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] font-semibold text-brand-red hover:bg-rose-50 disabled:text-stone-300 disabled:hover:bg-transparent">
              <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && !items ? <p className="py-8 text-center text-[13px] text-stone-400">Loading…</p> : <NotificationRows items={items ?? []} onOpen={openItem} />}
            {extra}
          </div>
        </div>
      )}
    </div>
  );
}
