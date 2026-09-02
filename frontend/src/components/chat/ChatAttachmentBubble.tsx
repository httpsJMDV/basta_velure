import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, Package, ExternalLink, Eye, X, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  isMe?: boolean;
}

export default function ChatAttachmentBubble({ type, data, isMe = false }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!type || !data) return null;

  // 1. PRODUCT CARD
  if (type === 'product_card') {
    return (
      <div
        className={`mb-2 p-3 rounded-2xl border transition-all ${
          isMe
            ? 'bg-rose-900/40 border-white/20 text-white'
            : 'bg-white border-gray-200/90 text-gray-900 shadow-2xs'
        } max-w-[280px] sm:max-w-[320px]`}
      >
        <div className="flex items-center gap-3">
          {data.image ? (
            <img
              src={data.image}
              alt={data.name || 'Product'}
              className="object-cover w-12 h-12 border rounded-xl border-gray-100/20 shrink-0 shadow-2xs"
            />
          ) : (
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              isMe ? 'bg-white/10 text-white' : 'bg-rose-50 text-brand-red'
            }`}>
              <ShoppingBag className="w-6 h-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {data.category && (
              <span className={`text-[9px] font-bold uppercase tracking-wider block truncate ${
                isMe ? 'text-white/70' : 'text-gray-400'
              }`}>
                {data.category}
              </span>
            )}
            <p className="text-xs font-bold truncate leading-tight mt-0.5">
              {data.name || 'Product'}
            </p>
            <p className={`text-xs font-black mt-1 ${
              isMe ? 'text-rose-200' : 'text-brand-red'
            }`}>
              ₱{Number(data.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {data.id && (
          <div className="mt-2.5 pt-2 border-t border-current/10 flex justify-end">
            <Link
              to={`/products/${data.id}`}
              target="_blank"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors ${
                isMe
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-rose-50 hover:bg-rose-100 text-brand-red'
              }`}
            >
              <span>View Item</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  // 2. ORDER CARD
  if (type === 'order_card') {
    const statusLabel = (data.status || 'Order').replace(/_/g, ' ');
    return (
      <div
        className={`mb-2 p-3 rounded-2xl border transition-all ${
          isMe
            ? 'bg-blue-950/50 border-white/20 text-white'
            : 'bg-white border-blue-100 text-gray-900 shadow-2xs'
        } max-w-[280px] sm:max-w-[320px]`}
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isMe ? 'bg-white/15 text-blue-200' : 'bg-blue-50 text-blue-600'
          }`}>
            <Package className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-bold truncate">
                Order #{data.order_number || data.id}
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                isMe ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {statusLabel}
              </span>
            </div>

            {data.items_summary && (
              <p className={`text-[11px] truncate mt-1 ${isMe ? 'text-white/70' : 'text-gray-500'}`}>
                {data.items_summary}
              </p>
            )}

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-current/10">
              <span className={`text-[11px] ${isMe ? 'text-white/60' : 'text-gray-400'}`}>Total Amount</span>
              <span className={`text-xs font-black ${isMe ? 'text-blue-200' : 'text-blue-700'}`}>
                ₱{Number(data.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. IMAGE ATTACHMENT
  if (type === 'image' && data.url) {
    return (
      <>
        <div className="mb-2 relative group inline-block max-w-[240px] sm:max-w-[280px]">
          <div
            onClick={() => setLightboxOpen(true)}
            className="relative overflow-hidden border shadow-xs cursor-pointer rounded-2xl border-gray-200/50 bg-black/5"
          >
            <img
              src={data.url}
              alt={data.filename || 'Attached image'}
              className="object-cover w-full transition-transform duration-200 max-h-56 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-1 text-xs font-medium text-white transition-opacity opacity-0 bg-black/20 group-hover:opacity-100 backdrop-blur-xs">
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </div>
          </div>
          {data.filename && (
            <span className="text-[10px] text-gray-400 block truncate mt-0.5 px-1">
              {data.filename}
            </span>
          )}
        </div>

        {/* Fullscreen Lightbox Modal */}
        {lightboxOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setLightboxOpen(false)}
            >
              <div className="absolute flex items-center gap-2 top-4 right-4" onClick={(e) => e.stopPropagation()}>
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  download={data.filename || 'image'}
                  className="flex items-center justify-center w-10 h-10 text-white transition-colors rounded-full bg-white/10 hover:bg-white/20"
                  title="Download full size"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="flex items-center justify-center w-10 h-10 text-white transition-colors rounded-full bg-white/10 hover:bg-white/20"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-w-4xl max-h-[85vh] p-2" onClick={(e) => e.stopPropagation()}>
                <img
                  src={data.url}
                  alt={data.filename || 'Full image'}
                  className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10"
                />
                {data.filename && (
                  <p className="mt-3 text-xs text-center text-white/80">{data.filename}</p>
                )}
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return null;
}
