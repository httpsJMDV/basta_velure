import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Image as ImageIcon, Package, ShoppingBag, Search, X, ChevronRight } from 'lucide-react';
import { getAttachableOrdersApi, getAttachableProductsApi } from '../../api/client';
import type { AttachableOrder, AttachableProduct } from '../../types';
import { pesoCompact as peso } from '../../utils/pricing';
import { statusLabel, statusTone } from './chatUtils';

export type AttachKind = 'order' | 'product';

interface AttachHandlers {
  conversationId: number | null | undefined;
  onImage: (file: File) => void;
  onOrder: (order: AttachableOrder) => void;
  onProduct: (product: AttachableProduct) => void;
}

export interface ChatAttachController {
  pickImage: () => void;
  pickOrder: () => void;
  pickProduct: () => void;
  /** The hidden file input and the order / product picker: render once, anywhere in the chat. */
  elements: ReactNode;
}

/**
 * Everything a chat composer needs to share a photo, an order or a product. The triggers can be called from the
 * attach menu or from any other button (the admin's action row uses them directly).
 */
export function useChatAttach({ conversationId, onImage, onOrder, onProduct }: AttachHandlers): ChatAttachController {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState<AttachKind | null>(null);

  const elements = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImage(file);
          e.target.value = '';
        }}
      />
      <AnimatePresence>
        {picker && conversationId && (
          <AttachPicker
            key={picker}
            kind={picker}
            conversationId={conversationId}
            onClose={() => setPicker(null)}
            onPickOrder={(o) => { setPicker(null); onOrder(o); }}
            onPickProduct={(p) => { setPicker(null); onProduct(p); }}
          />
        )}
      </AnimatePresence>
    </>
  );

  return {
    pickImage: () => fileRef.current?.click(),
    pickOrder: () => setPicker('order'),
    pickProduct: () => setPicker('product'),
    elements,
  };
}

/** The round + button of a composer and the small menu above it (photo, order, product). */
export function AttachMenu({ attach, disabled, align = 'left', size = 'md', products = true }: {
  attach: ChatAttachController;
  disabled?: boolean;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  /** Offer "Share a product" (off where a chat has no products to share). */
  products?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn: () => void) => { setOpen(false); fn(); };
  const box = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Attach a photo, order or product"
        title="Attach"
        className={`${box} rounded-full flex items-center justify-center border transition-all disabled:opacity-40 ${open ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900'}`}
      >
        <Plus className={`w-[18px] h-[18px] transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className={`absolute bottom-full mb-2 z-40 w-64 p-1.5 rounded-2xl bg-white border border-stone-200 shadow-[0_16px_40px_-16px_rgba(28,25,23,0.35)] ${align === 'left' ? 'left-0 origin-bottom-left' : 'right-0 origin-bottom-right'}`}
          >
            <MenuRow icon={ImageIcon} title="Choose a photo" text="JPG, PNG or WEBP, up to 5 MB" onClick={() => choose(attach.pickImage)} />
            <MenuRow icon={Package} title="Select an order" text="Share an order's number and status" onClick={() => choose(attach.pickOrder)} />
            {products && <MenuRow icon={ShoppingBag} title="Share a product" text="Send a product card" onClick={() => choose(attach.pickProduct)} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({ icon: Icon, title, text, onClick }: { icon: React.ElementType; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-stone-100 focus:bg-stone-100 outline-none transition-colors">
      <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-stone-900">{title}</span>
        <span className="block text-[11.5px] text-stone-500 truncate">{text}</span>
      </span>
    </button>
  );
}

type PickerItems = { key: string; orders: AttachableOrder[]; products: AttachableProduct[] };

/** "Select an order" / "Share a product": a compact searchable list in a sheet (bottom sheet on phones). */
function AttachPicker({ kind, conversationId, onClose, onPickOrder, onPickProduct }: {
  kind: AttachKind;
  conversationId: number;
  onClose: () => void;
  onPickOrder: (o: AttachableOrder) => void;
  onPickProduct: (p: AttachableProduct) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [result, setResult] = useState<PickerItems | null>(null);
  const key = `${kind}:${conversationId}:${debounced}`;
  const loading = result?.key !== key;

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let alive = true;
    const q = debounced || undefined;
    const done = (orders: AttachableOrder[], products: AttachableProduct[]) => { if (alive) setResult({ key, orders, products }); };
    if (kind === 'order') getAttachableOrdersApi(conversationId, q).then((o) => done(o, [])).catch(() => done([], []));
    else getAttachableProductsApi(conversationId, q).then((p) => done([], p)).catch(() => done([], []));
    return () => { alive = false; };
  }, [kind, conversationId, debounced, key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const isOrder = kind === 'order';
  const title = isOrder ? 'Select an order' : 'Share a product';
  const count = isOrder ? result?.orders.length ?? 0 : result?.products.length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div className="absolute inset-0 bg-stone-950/45" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full sm:max-w-[440px] h-[78vh] sm:h-[560px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="relative px-5 pt-5 pb-3 text-center">
          <span className="sm:hidden absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-stone-200" aria-hidden="true" />
          <h2 className="text-[16px] font-bold text-stone-900">{title}</h2>
          <p className="text-[12px] text-stone-500 mt-0.5">{isOrder ? 'Tap an order to send it in the chat.' : 'Tap a product to send it in the chat.'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 w-8 h-8 rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 pb-3">
          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isOrder ? 'Order number or item name' : 'Product name'}
              aria-label={isOrder ? 'Search orders' : 'Search products'}
              className="w-full h-10 pl-10 pr-9 rounded-full bg-stone-100 border border-transparent text-[13px] text-stone-900 placeholder:text-stone-400 outline-none focus:bg-white focus:border-stone-300 transition-colors"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-stone-400 hover:text-stone-700 flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-stone-100 pt-2">
          {loading ? (
            <ul className="space-y-1" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 p-2.5">
                  <span className="w-[52px] h-[52px] rounded-xl bg-stone-100 animate-pulse shrink-0" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3 w-2/3 rounded bg-stone-100 animate-pulse" />
                    <span className="block h-3 w-1/3 rounded bg-stone-100 animate-pulse" />
                  </span>
                </li>
              ))}
            </ul>
          ) : count === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8 pb-6">
              <span className="w-20 h-20 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center">
                {isOrder ? <Package className="w-9 h-9" strokeWidth={1.4} /> : <ShoppingBag className="w-9 h-9" strokeWidth={1.4} />}
              </span>
              <p className="mt-4 text-[14px] font-semibold text-stone-800">
                {debounced ? `Nothing matches "${debounced}"` : isOrder ? 'No orders yet' : 'No products to share'}
              </p>
              <p className="mt-1 text-[12.5px] text-stone-500 leading-relaxed">
                {debounced ? 'Try another order number or item name.' : isOrder ? 'Orders between the two of you show up here once one is placed.' : 'Active products of this shop show up here.'}
              </p>
            </div>
          ) : isOrder ? (
            <ul className="space-y-0.5">
              {result!.orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onPickOrder(o)} className="group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-stone-50 focus:bg-stone-50 outline-none transition-colors">
                    <Thumb src={o.image} icon={Package} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[12.5px] font-semibold text-stone-900 truncate">#{o.order_number}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                      </span>
                      <span className="block text-[12px] text-stone-600 truncate mt-0.5">{o.items_summary || 'Order items'}</span>
                      <span className="block text-[11.5px] text-stone-400 mt-0.5">
                        {o.items_count} item{o.items_count === 1 ? '' : 's'} · {new Date(o.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </span>
                    <span className="text-[13px] font-bold text-stone-900 tabular-nums">{peso(Number(o.total))}</span>
                    <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-0.5">
              {result!.products.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPickProduct(p)} className="group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-stone-50 focus:bg-stone-50 outline-none transition-colors">
                    <Thumb src={p.image} icon={ShoppingBag} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-stone-900 leading-snug line-clamp-2">{p.name}</span>
                      <span className="block text-[11.5px] text-stone-400 mt-0.5 truncate">
                        {[p.category, p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-[13px] font-bold text-brand-red tabular-nums">{peso(Number(p.price))}</span>
                    <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-600 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function Thumb({ src, icon: Icon }: { src: string | null; icon: React.ElementType }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="w-[52px] h-[52px] rounded-xl object-cover bg-stone-100 border border-stone-200 shrink-0" />
  ) : (
    <span className="w-[52px] h-[52px] rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5" strokeWidth={1.6} />
    </span>
  );
}
