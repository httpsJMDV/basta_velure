import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ShoppingBag, Package, X, Download, ChevronRight } from 'lucide-react';
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
}

interface Props {
  type?: 'product_card' | 'order_card' | 'image' | string | null;
  data?: AttachmentData | null;
  /** Kept for callers; cards look the same on both sides of the thread. */
  isMe?: boolean;
  /** Where an order card leads (the buyer's order list, the admin's orders page); none: not a link. */
  orderHref?: (data: AttachmentData) => string | undefined;
}

/** A shared product, order or photo inside a message: white cards on either side, like the storefront's own. */
export default function ChatAttachmentBubble({ type, data, orderHref }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!type || !data) return null;

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
