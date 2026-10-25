import type { ChatMessage } from '../../types';

/**
 * A freshly fetched thread, or the one already on screen when nothing changed (same messages, same read receipts),
 * so a background refresh does not re-render or jump the scroll.
 */
export function mergeFetchedMessages(prev: ChatMessage[], next: ChatMessage[]): ChatMessage[] {
  if (prev.length !== next.length) return next;
  for (let i = 0; i < next.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].read_at !== next[i].read_at
      || prev[i].attachment_data?.confirmed_at !== next[i].attachment_data?.confirmed_at) return next;
  }
  return prev;
}

/** PLACED → Placed, OUT_FOR_DELIVERY → Out for delivery. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Order';
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The colour of an order status chip. */
export function statusTone(status: string | null | undefined): string {
  const s = (status || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED'].includes(s)) return 'bg-emerald-50 text-emerald-700';
  if (['CANCELLED', 'DELIVERY_FAILED', 'RETURNED', 'DISPUTED'].includes(s)) return 'bg-red-50 text-red-700';
  if (['PLACED', 'CONFIRMED', 'PREPARING'].includes(s)) return 'bg-amber-50 text-amber-700';
  return 'bg-sky-50 text-sky-700';
}

/** "2:05 PM" today, "Yesterday", "Mon" this week, then "Oct 3". */
export function inboxTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-PH', { weekday: 'short' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** The divider above a day's first message: "Today", "Yesterday" or "Oct 3, 2026". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** The caption the server writes under a shared card or photo ("Shared Order #…"); the card already says it. */
export function isAutoAttachmentBody(m: Pick<ChatMessage, 'attachment_type' | 'body'>): boolean {
  if (!m.attachment_type) return false;
  return /^(Shared a product: |Shared Order #|Order confirmation · #|Referencing |Inquiring |Sent an image$)/.test(m.body || '');
}

/** The buyer's order list, searched for the order a card is about. */
export function buyerOrderHref(data: { order_number?: string }): string {
  return data.order_number ? `/settings/orders?q=${encodeURIComponent(data.order_number)}` : '/settings/orders';
}
