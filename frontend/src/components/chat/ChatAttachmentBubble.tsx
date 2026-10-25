import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ShoppingBag, Package, X, Download, ChevronRight, Check, Clock, Loader2, MapPin } from 'lucide-react';
import { pesoCompact as peso } from '../../utils/pricing';
import { statusLabel, statusTone } from './chatUtils';

interface AttachmentData {
  id?: number;
  name?: string;
  price?: number;
  image?: string | null;
  category?: string | null;
  order_number?: string;
  total?: number;
  status?: string;
  items_count?: number;
  items_summary?: string;
  url?: string;
  filename?: string;
  size?: number;
  phone?: string | null;
  address?: string | null;
  confirmed_at?: string | null;
  /** order_list: the orders the Loved-IT Assistant talked about. */
  orders?: OrderCardData[];
}

interface OrderCardData {
  id: number;
  order_number: string;
  status: string;
  status_label?: string;
  total: number;
  items_count?: number;
  items_summary?: string;
  image?: string | null;
  placed_at?: string | null;
  tracking_number?: string | null;
}

interface Props {
  type?: 'product_card' | 'order_card' | 'order_confirmation' | 'image' | string | null;
  data?: AttachmentData | null;
  /** Kept for callers; cards look the same on both sides of the thread. */
  isMe?: boolean;
  /** Where an order card leads (the buyer's order list, the admin's orders page); none: not a link. */
  orderHref?: (data: AttachmentData) => string | undefined;
  /** The buyer's side of an order confirmation card: confirms the address, resolving to an error message or null. */
  onConfirmAddress?: () => Promise<string | null>;
}

/** A shared product, order or photo inside a message: white cards on either side, like the storefront's own. */
export default function ChatAttachmentBubble({ type, data, orderHref, onConfirmAddress }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!type || !data) return null;

  if (type === 'order_confirmation') {
    return <OrderConfirmationCard data={data} href={orderHref?.(data)} onConfirm={onConfirmAddress} />;
  }

  if (type === 'order_list' && data.orders?.length) {
    return <AssistantOrdersCard orders={data.orders} orderHref={orderHref} />;
  }

  if (type === 'product_card') {
    return (
      <Link
        to={data.id ? `/products/${data.id}` : '#'}
        target="_blank"
        className="mb-1.5 flex items-center gap-3 w-[264px] max-w-full p-2.5 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors group"
      >
        <Thumb src={data.image} icon={ShoppingBag} />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">{data.category || 'Product'}</span>
          <span className="block text-[13px] font-semibold leading-snug line-clamp-2">{data.name || 'Product'}</span>
          <span className="block text-[13px] font-bold text-brand-red mt-0.5 tabular-nums">{peso(Number(data.price || 0))}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 shrink-0" />
      </Link>
    );
  }

  if (type === 'order_card') {
    const href = orderHref?.(data);
    const body = (
      <>
        <span className="flex items-center gap-3 p-2.5">
          <Thumb src={data.image} icon={Package} />
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">Order</span>
            <span className="block font-mono text-[12.5px] font-semibold truncate">#{data.order_number || data.id}</span>
            {data.items_summary && <span className="block text-[12px] text-stone-500 truncate">{data.items_summary}</span>}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 px-3 py-2 border-t border-stone-100 bg-stone-50/70">
          <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${statusTone(data.status)}`}>{statusLabel(data.status)}</span>
          <span className="text-[13px] font-bold tabular-nums">{peso(Number(data.total || 0))}</span>
        </span>
      </>
    );
    const cls = 'mb-1.5 block w-[264px] max-w-full rounded-2xl bg-white border border-stone-200 overflow-hidden text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
    return href
      ? <Link to={href} className={`${cls} hover:border-stone-300 transition-colors`}>{body}</Link>
      : <div className={cls}>{body}</div>;
  }

  if (type === 'image' && data.url) {
    return (
      <>
        <button type="button" onClick={() => setLightboxOpen(true)} className="mb-1.5 block max-w-[260px] overflow-hidden rounded-2xl border border-stone-200 bg-stone-100" aria-label="Open the photo">
          <img src={data.url} alt={data.filename || 'Attached photo'} loading="lazy" className="block w-full max-h-64 object-cover hover:scale-[1.02] transition-transform duration-300" />
        </button>

        {lightboxOpen && createPortal(
          <div className="fixed inset-0 z-[100001] bg-stone-950/90 flex items-center justify-center p-4" onClick={() => setLightboxOpen(false)} role="dialog" aria-modal="true" aria-label="Photo">
            <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <a href={data.url} target="_blank" rel="noreferrer" download={data.filename || 'image'} title="Download" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <Download className="w-5 h-5" />
              </a>
              <button type="button" onClick={() => setLightboxOpen(false)} title="Close" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <img src={data.url} alt={data.filename || 'Photo'} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
          </div>,
          document.body,
        )}
      </>
    );
  }

  return null;
}

/**
 * The shop's automatic order confirmation: what was bought, where it goes, and (for the buyer, until they do) a
 * button to confirm the address. The shop and the admin see whether the buyer has confirmed.
 */
function OrderConfirmationCard({ data, href, onConfirm }: { data: AttachmentData; href?: string; onConfirm?: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = !!data.confirmed_at;
  const count = Number(data.items_count || 1);

  const confirm = async () => {
    if (!onConfirm || busy) return;
    setBusy(true);
    setError(null);
    setError(await onConfirm());
    setBusy(false);
  };

  return (
    <div className="mb-1.5 w-[288px] max-w-full rounded-2xl bg-white border border-stone-200 text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <p className="px-3.5 pt-3 text-[14px] font-semibold">Order confirmation</p>

      <div className="mx-3 mt-2.5 flex items-center gap-3 p-2 rounded-xl bg-stone-50">
        <Thumb src={data.image} icon={Package} />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold leading-snug truncate">{data.items_summary || `Order #${data.order_number}`}</span>
          <span className="block text-[12px] text-stone-500 tabular-nums">{count} item{count === 1 ? '' : 's'} · {peso(Number(data.total || 0))}</span>
        </span>
      </div>

      <dl className="px-3.5 pt-3 pb-1 space-y-1.5 text-[12px]">
        <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Order ID</dt><dd className="flex-1 min-w-0 text-right font-mono text-[11.5px] truncate">{data.order_number}</dd></div>
        {data.phone && <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Phone</dt><dd className="flex-1 min-w-0 text-right tabular-nums">{data.phone}</dd></div>}
        {data.address && <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Address</dt><dd className="flex-1 min-w-0 text-right leading-snug line-clamp-3">{data.address}</dd></div>}
      </dl>

      <div className="p-3 pt-2 space-y-1.5">
        {confirmed ? (
          <p className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-emerald-50 text-[12.5px] font-semibold text-emerald-700"><Check className="w-4 h-4" /> Address confirmed</p>
        ) : onConfirm ? (
          <button type="button" onClick={confirm} disabled={busy}
            className="w-full h-9 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Confirm address
          </button>
        ) : (
          <p className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-stone-50 text-[12px] text-stone-500"><Clock className="w-3.5 h-3.5" /> Waiting for the buyer to confirm</p>
        )}
        {href && (
          <Link to={href} className="w-full h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-[12.5px] font-semibold text-stone-800 flex items-center justify-center transition-colors">View details</Link>
        )}
        {error && <p role="alert" className="text-[11.5px] font-medium text-brand-red text-center">{error}</p>}
      </div>
    </div>
  );
}

/**
 * The orders the Loved-IT Assistant talked about, in the order confirmation card's style. One order gets the full
 * card (items, order ID, placed, tracking, total); several get one row each. Every order opens the buyer's order.
 */
function AssistantOrdersCard({ orders, orderHref }: { orders: OrderCardData[]; orderHref?: (data: AttachmentData) => string | undefined }) {
  const placed = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
  const chip = (o: OrderCardData) => (
    <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold whitespace-nowrap ${statusTone(o.status)}`}>{o.status_label || statusLabel(o.status)}</span>
  );

  if (orders.length === 1) {
    const o = orders[0];
    const href = orderHref?.(o);
    const count = Number(o.items_count || 1);
    return (
      <div className="mt-1.5 w-[288px] max-w-full rounded-2xl bg-white border border-stone-200 text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-3.5 pt-3 flex items-center justify-between gap-2">
          <p className="text-[14px] font-semibold">Your order</p>
          {chip(o)}
        </div>
        <div className="mx-3 mt-2.5 flex items-center gap-3 p-2 rounded-xl bg-stone-50">
          <Thumb src={o.image} icon={Package} />
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold leading-snug truncate">{o.items_summary || `Order #${o.order_number}`}</span>
            <span className="block text-[12px] text-stone-500 tabular-nums">{count} item{count === 1 ? '' : 's'} · {peso(Number(o.total || 0))}</span>
          </span>
        </div>
        <dl className="px-3.5 pt-3 pb-1 space-y-1.5 text-[12px]">
          <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Order ID</dt><dd className="flex-1 min-w-0 text-right font-mono text-[11.5px] truncate">{o.order_number}</dd></div>
          {o.placed_at && <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Placed</dt><dd className="flex-1 min-w-0 text-right">{placed(o.placed_at)}</dd></div>}
          {o.tracking_number && <div className="flex gap-3"><dt className="w-[72px] shrink-0 text-stone-500">Tracking</dt><dd className="flex-1 min-w-0 text-right font-mono text-[11.5px] truncate">{o.tracking_number}</dd></div>}
        </dl>
        {href && (
          <div className="p-3 pt-2">
            <Link to={href} className="w-full h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-[12.5px] font-semibold text-stone-800 flex items-center justify-center transition-colors">View order</Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5 w-[288px] max-w-full rounded-2xl bg-white border border-stone-200 text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <p className="px-3.5 pt-3 pb-1 text-[14px] font-semibold">Your orders</p>
      <ul className="px-2 pb-2">
        {orders.map((o) => {
          const href = orderHref?.(o);
          const row = (
            <>
              <Thumb src={o.image} icon={Package} />
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-semibold leading-snug truncate">{o.items_summary || 'Order'}</span>
                <span className="block font-mono text-[10.5px] text-stone-500 truncate">#{o.order_number}</span>
                <span className="mt-1 flex items-center justify-between gap-2">
                  {chip(o)}
                  <span className="text-[12.5px] font-bold tabular-nums">{peso(Number(o.total || 0))}</span>
                </span>
              </span>
            </>
          );
          return (
            <li key={o.id} className="border-t border-stone-100 first:border-t-0">
              {href
                ? <Link to={href} className="flex items-center gap-3 p-2 rounded-xl hover:bg-stone-50 transition-colors">{row}</Link>
                : <div className="flex items-center gap-3 p-2">{row}</div>}
            </li>
          );
        })}
      </ul>
      {orderHref && (
        <div className="px-3 pb-3">
          <Link to="/settings/orders" className="w-full h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-[12.5px] font-semibold text-stone-800 flex items-center justify-center transition-colors">View all orders</Link>
        </div>
      )}
    </div>
  );
}

function Thumb({ src, icon: Icon }: { src?: string | null; icon: React.ElementType }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="w-12 h-12 rounded-xl object-cover bg-stone-100 shrink-0" />
  ) : (
    <span className="w-12 h-12 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5" strokeWidth={1.6} />
    </span>
  );
}
