import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Trash2, Plus, Minus, Store, ArrowRight, ShieldCheck, Banknote, RotateCcw, ChevronRight, Gift } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { useCart, type CartItem } from '../hooks/useCart';
import { useShopPaymentInfo, shopDelivery } from '../hooks/useShopDelivery';
import { pesoCompact as peso } from '../utils/pricing';

/**
 * The full cart. Items are grouped by shop because every shop ships its own parcel, so each shop charges one
 * delivery fee, or none once its own free-delivery minimum is met: the same total checkout charges. There are no
 * platform vouchers; shops set discounts on their products and their own free-delivery minimum.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const { items, removeItem, updateQty, clearCart } = useCart();

  const shopInfo = useShopPaymentInfo(items.map((i) => i.sellerId));
  const groups = useMemo(() => {
    const map = new Map<string, { shop: string; sellerId?: number; list: CartItem[] }>();
    items.forEach((i) => {
      const key = String(i.sellerId ?? i.shopName ?? 'Shop');
      const g = map.get(key) ?? { shop: i.shopName || 'Shop', sellerId: i.sellerId, list: [] };
      g.list.push(i);
      map.set(key, g);
    });
    return [...map.entries()].map(([key, g]) => {
      const subtotal = g.list.reduce((s, i) => s + i.price * i.quantity, 0);
      return { key, ...g, subtotal, ...shopDelivery(subtotal, g.sellerId ? shopInfo[g.sellerId] : undefined) };
    });
  }, [items, shopInfo]);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const delivery = groups.reduce((s, g) => s + g.fee, 0);
  const freeShops = groups.filter((g) => g.fee === 0).length;
  const total = subtotal + delivery;
  const setQty = (id: number, qty: number) => (qty <= 0 ? removeItem(id) : updateQty(id, qty));

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />

      <div className="bg-white border-b border-stone-200/70">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6">
          <nav className="flex items-center gap-1.5 text-[12px] text-stone-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-brand-red">Home</Link>
            <ChevronRight className="w-3 h-3 text-stone-300" />
            <span className="text-stone-900 font-medium">Cart</span>
          </nav>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-serif font-bold tracking-tight text-[#1E1B18]">Your cart</h1>
            {items.length > 0 && (
              <p className="text-[13px] text-stone-500 pb-1">{count} item{count === 1 ? '' : 's'} from {groups.length} shop{groups.length === 1 ? '' : 's'}</p>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-8 py-8">
        {items.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16">
            <span className="mx-auto w-20 h-20 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400">
              <ShoppingBag className="w-9 h-9" strokeWidth={1.5} />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-stone-900">Your cart is empty</h2>
            <p className="mt-1.5 text-sm text-stone-500">Find something you love from shops across Laguna. Everything you add shows up here, grouped by shop.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
              <button type="button" onClick={() => navigate('/')} className="h-11 px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                Start shopping <ArrowRight className="w-4 h-4" />
              </button>
              <Link to="/search" className="h-11 px-6 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 hover:border-stone-900 flex items-center justify-center">Browse everything</Link>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
            {/* Items by shop */}
            <div className="space-y-4">
              {groups.map(({ key, shop, list, subtotal: shopSubtotal, fee, freeFrom, short }) => {
                return (
                  <section key={key} className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
                    <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center shrink-0"><Store className="w-4 h-4" /></span>
                        <span className="text-[14px] font-semibold text-stone-900 truncate">{shop}</span>
                      </span>
                      {fee === 0
                        ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 shrink-0"><Gift className="w-3.5 h-3.5" /> Free delivery</span>
                        : <span className="text-[12px] text-stone-500 shrink-0">Ships as one parcel · {peso(fee)}</span>}
                    </header>
                    {freeFrom !== null && <FreeDeliveryBar subtotal={shopSubtotal} freeFrom={freeFrom} short={short} />}
                    <ul className="divide-y divide-stone-100">
                      {list.map((item) => (
                        <li key={item.variantId} className="flex gap-4 p-5">
                          <Link to={`/products/${item.productId}`} className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-stone-50 ring-1 ring-stone-200 shrink-0">
                            {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-8 h-8 m-8 text-stone-300" />}
                          </Link>
                          <div className="flex-1 min-w-0 flex flex-col">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <Link to={`/products/${item.productId}`} className="text-[15px] leading-snug text-stone-900 line-clamp-2 hover:text-brand-red">{item.name}</Link>
                                {item.variant && <p className="mt-1 text-[12px] text-stone-500">{item.variant}</p>}
                                <p className="mt-1 text-[12px] text-stone-500 tabular-nums">{peso(item.price)} each</p>
                              </div>
                              <p className="text-[16px] font-bold text-stone-900 tabular-nums">{peso(item.price * item.quantity)}</p>
                            </div>
                            <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                              <div className="flex items-center h-10 rounded-full border border-stone-300 bg-white">
                                <button type="button" onClick={() => setQty(item.variantId, item.quantity - 1)} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-stone-900" aria-label="Fewer">
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                                <button type="button" onClick={() => setQty(item.variantId, item.quantity + 1)} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-stone-900" aria-label="More">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <button type="button" onClick={() => removeItem(item.variantId)} className="h-9 px-3 rounded-full text-[13px] font-medium text-stone-500 hover:text-brand-red hover:bg-rose-50 flex items-center gap-1.5 transition-colors">
                                <Trash2 className="w-4 h-4" /> Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <footer className="flex justify-between px-5 py-3 bg-stone-50/70 border-t border-stone-100 text-[13px]">
                      <span className="text-stone-500">Shop subtotal + delivery</span>
                      <span className="font-semibold text-stone-900 tabular-nums">{peso(shopSubtotal + fee)}</span>
                    </footer>
                  </section>
                );
              })}

              <div className="flex items-center justify-between">
                <Link to="/search" className="text-[13px] font-semibold text-stone-700 hover:text-brand-red">← Keep shopping</Link>
                <button type="button" onClick={clearCart} className="text-[13px] font-medium text-stone-500 hover:text-brand-red">Remove everything</button>
              </div>
            </div>

            {/* Summary */}
            <aside className="lg:sticky lg:top-[126px] space-y-3">
              <div className="rounded-3xl bg-white border border-stone-200 p-6">
                <h2 className="text-lg font-semibold text-stone-900">Order summary</h2>
                <dl className="mt-4 space-y-2.5 text-[14px]">
                  <div className="flex justify-between text-stone-600"><dt>Subtotal ({count} item{count === 1 ? '' : 's'})</dt><dd className="text-stone-900 tabular-nums">{peso(subtotal)}</dd></div>
                  <div className="flex justify-between text-stone-600">
                    <dt>Delivery</dt>
                    <dd className={delivery === 0 ? 'font-semibold text-emerald-700' : 'text-stone-900 tabular-nums'}>{delivery === 0 ? 'Free' : peso(delivery)}</dd>
                  </div>
                  <p className="text-[12px] text-stone-400 -mt-1">
                    One parcel per shop · {groups.length} shop{groups.length === 1 ? '' : 's'}{freeShops > 0 && groups.length > 1 ? ` · ${freeShops} free` : ''}
                  </p>
                  <div className="flex justify-between items-baseline pt-3 border-t border-stone-200">
                    <dt className="text-[15px] font-semibold text-stone-900">Total</dt>
                    <dd className="text-[26px] font-bold tracking-tight text-brand-red tabular-nums">{peso(total)}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => navigate('/checkout')}
                  className="mt-5 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                  Check out <ArrowRight className="w-4 h-4" />
                </button>
                <p className="mt-3 text-center text-[12px] text-stone-500">Pay with GCash or cash on delivery</p>
              </div>
              <ul className="rounded-3xl bg-white border border-stone-200 divide-y divide-stone-100 text-[13px]">
                {[
                  { icon: ShieldCheck, title: 'Buyer protection', text: 'Verified shops, and our team reviews any return a shop will not settle.' },
                  { icon: Banknote, title: 'Cash on delivery', text: 'Pay the rider when your parcel arrives.' },
                  { icon: RotateCcw, title: '7-day returns', text: 'For items that arrive damaged, wrong or incomplete.' },
                ].map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3 px-5 py-3.5">
                    <Icon className="w-[18px] h-[18px] text-stone-500 shrink-0 mt-0.5" strokeWidth={1.8} />
                    <span><span className="block font-medium text-stone-900">{title}</span><span className="block text-[12px] text-stone-500 mt-0.5">{text}</span></span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/** How close a shop's items are to its own free-delivery minimum. */
function FreeDeliveryBar({ subtotal, freeFrom, short }: { subtotal: number; freeFrom: number; short: number }) {
  const pct = freeFrom > 0 ? Math.min(100, Math.round((subtotal / freeFrom) * 100)) : 100;
  return (
    <div className="px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100/80">
      <p className="text-[12px] text-emerald-900">
        {short > 0 ? <>Add <strong className="tabular-nums">{peso(short)}</strong> more from this shop for free delivery.</> : <>This shop delivers your order for free.</>}
      </p>
      <div className="mt-1.5 h-1 rounded-full bg-emerald-100 overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
