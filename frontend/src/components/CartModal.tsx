import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Trash2, Plus, Minus, Store, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { DELIVERY_FEE } from '../utils/shipping';
import { pesoCompact as peso } from '../utils/pricing';

export interface CartItem {
  id: number;
  productId?: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
  shopName?: string;
}

interface CartModalProps {
  open: boolean;
  onClose: () => void;
  items?: CartItem[];
  onRemove?: (id: number) => void;
  onUpdateQty?: (id: number, qty: number) => void;
  onClear?: () => void;
}

/**
 * The cart drawer. Items are grouped by shop, because every shop ships its own parcel: the delivery fee is
 * ₱50 per shop, exactly what checkout charges.
 */
export default function CartModal({ open, onClose, items: propItems, onRemove, onUpdateQty, onClear }: CartModalProps) {
  const navigate = useNavigate();
  const cart = useCart();

  const items: CartItem[] = propItems ?? cart.items.map((i) => ({
    id: i.variantId, productId: i.productId, name: i.name, variant: i.variant, price: i.price, quantity: i.quantity, image: i.image, shopName: i.shopName,
  }));

  const remove = (id: number) => (onRemove ? onRemove(id) : cart.removeItem(id));
  const setQty = (id: number, qty: number) => {
    if (qty <= 0) { remove(id); return; }
    if (onUpdateQty) onUpdateQty(id, qty);
    else cart.updateQty(id, qty);
  };
  const clear = () => (onClear ? onClear() : cart.clearCart());

  const groups = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    items.forEach((i) => {
      const key = i.shopName || 'Shop';
      map.set(key, [...(map.get(key) ?? []), i]);
    });
    return [...map.entries()];
  }, [items]);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const delivery = items.length ? groups.length * DELIVERY_FEE : 0;
  const total = subtotal + delivery;

  const go = (to: string) => { onClose(); navigate(to); };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-[#FAF8F5] shadow-[-24px_0_60px_-20px_rgba(28,25,23,0.35)] flex flex-col"
            role="dialog"
            aria-label="Your cart"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-16 bg-white border-b border-stone-200 shrink-0">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[20px] font-serif font-bold tracking-tight text-[#1E1B18]">Your cart</h2>
                {count > 0 && <span className="text-[13px] text-stone-500">{count} item{count === 1 ? '' : 's'}</span>}
              </div>
              <button type="button" onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100" aria-label="Close cart">
                <X className="w-5 h-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <span className="w-16 h-16 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400">
                  <ShoppingBag className="w-7 h-7" strokeWidth={1.6} />
                </span>
                <p className="mt-4 text-base font-semibold text-stone-900">Your cart is empty</p>
                <p className="mt-1 text-[13px] text-stone-500 max-w-xs">Everything you add shows up here, grouped by shop.</p>
                <button type="button" onClick={() => go('/search')} className="mt-5 h-11 px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center gap-2 transition-colors">
                  Start shopping <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {groups.map(([shop, list]) => (
                    <section key={shop} className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
                      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-stone-100">
                        <span className="flex items-center gap-2 min-w-0 text-[13px] font-semibold text-stone-900">
                          <Store className="w-4 h-4 text-stone-400 shrink-0" /><span className="truncate">{shop}</span>
                        </span>
                        <span className="text-[11px] text-stone-500 shrink-0">{peso(DELIVERY_FEE)} delivery</span>
                      </header>
                      <ul className="divide-y divide-stone-100">
                        {list.map((item) => (
                          <li key={item.id} className="flex gap-3 p-3">
                            <Link to={`/products/${item.productId}`} onClick={onClose} className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-stone-50 ring-1 ring-stone-200 shrink-0">
                              {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-6 h-6 m-6 text-stone-300" />}
                            </Link>
                            <div className="flex-1 min-w-0 flex flex-col">
                              <div className="flex items-start gap-2">
                                <Link to={`/products/${item.productId}`} onClick={onClose} className="flex-1 text-[13px] leading-snug text-stone-900 line-clamp-2 hover:text-brand-red">{item.name}</Link>
                                <button type="button" onClick={() => remove(item.id)} className="w-7 h-7 -mt-1 -mr-1 rounded-full flex items-center justify-center text-stone-400 hover:text-brand-red hover:bg-rose-50 shrink-0" aria-label={`Remove ${item.name}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {item.variant && <span className="mt-0.5 text-[11px] text-stone-500 truncate">{item.variant}</span>}
                              <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                                <div className="flex items-center h-8 rounded-full border border-stone-300 bg-white">
                                  <button type="button" onClick={() => setQty(item.id, item.quantity - 1)} className="w-8 h-full flex items-center justify-center text-stone-600 hover:text-stone-900" aria-label="Fewer">
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="w-7 text-center text-[13px] font-semibold tabular-nums">{item.quantity}</span>
                                  <button type="button" onClick={() => setQty(item.id, item.quantity + 1)} className="w-8 h-full flex items-center justify-center text-stone-600 hover:text-stone-900" aria-label="More">
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <span className="text-[14px] font-bold text-stone-900 tabular-nums">{peso(item.price * item.quantity)}</span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  <button type="button" onClick={clear} className="mx-auto block text-[12px] font-medium text-stone-500 hover:text-brand-red">Remove everything</button>
                </div>

                {/* Summary */}
                <div className="bg-white border-t border-stone-200 px-5 pt-4 pb-5 shrink-0">
                  <dl className="space-y-1.5 text-[13px]">
                    <div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd className="tabular-nums text-stone-900">{peso(subtotal)}</dd></div>
                    <div className="flex justify-between text-stone-600">
                      <dt>Delivery <span className="text-stone-400">({groups.length} shop{groups.length === 1 ? '' : 's'} × {peso(DELIVERY_FEE)})</span></dt>
                      <dd className="tabular-nums text-stone-900">{peso(delivery)}</dd>
                    </div>
                    <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-stone-100">
                      <dt className="text-[15px] font-semibold text-stone-900">Total</dt>
                      <dd className="text-[22px] font-bold tracking-tight text-brand-red tabular-nums">{peso(total)}</dd>
                    </div>
                  </dl>
                  <button type="button" onClick={() => go('/checkout')} className="mt-4 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                    Check out <ArrowRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => go('/cart')} className="mt-2 w-full h-10 rounded-full text-[13px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors">
                    View full cart
                  </button>
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-stone-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> GCash or cash on delivery · paid to the seller only after delivery
                  </p>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
