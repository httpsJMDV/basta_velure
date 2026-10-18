import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Trash2, Plus, Minus, Store, ArrowRight, ShieldCheck, Banknote, RotateCcw, ChevronRight, Tag, AlertCircle, Zap, Gift,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { useCart } from '../hooks/useCart';
import { pesoCompact as peso } from '../utils/pricing';
import type { CartLine, CartStore } from '../api/commerce';

/**
 * The cart (B6). Items are grouped by shop, because each shop ships its own parcel. Prices, stock and availability
 * are read live: a price change shows the old price, a sold-out or removed item is marked and cannot be selected,
 * and only the selected items go to checkout. Shipping and vouchers are worked out at checkout from the address.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const { view, items, signedIn, loading, removeItem, updateQty, setSelected, selectAll } = useCart();

  const stores = view?.stores ?? [];
  const summary = view?.summary;
  const selectable = stores.flatMap((s) => s.lines).filter((l) => l.status === 'available');
  const allSelected = selectable.length > 0 && selectable.every((l) => l.selected);
  const empty = signedIn ? stores.length === 0 : items.length === 0;

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
            {!empty && summary && (
              <p className="text-[13px] text-stone-500 pb-1 tabular-nums">{summary.units} item{summary.units === 1 ? '' : 's'} from {stores.length} shop{stores.length === 1 ? '' : 's'}</p>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-8 py-8">
        {loading && !view && signedIn ? (
          <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-44 rounded-3xl bg-stone-200/50 animate-pulse" />)}</div>
        ) : empty ? (
          <EmptyCart onShop={() => navigate('/')} />
        ) : !signedIn ? (
          <GuestCart />
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-stone-200 px-5 py-3">
                <label className="inline-flex items-center gap-2.5 text-[13px] font-medium text-stone-800 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-brand-red" checked={allSelected} disabled={selectable.length === 0}
                    onChange={(e) => selectAll(e.target.checked)} />
                  Select all ({selectable.length})
                </label>
                {summary?.has_unavailable && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5" /> Some items cannot be checked out right now.
                  </span>
                )}
              </div>

              {stores.map((store) => (
                <StoreCard key={store.seller.id} store={store} onSelectStore={(on) => selectAll(on, store.seller.id)}
                  onRemove={removeItem} onQty={updateQty} onSelect={setSelected} />
              ))}

              <Link to="/search" className="inline-block text-[13px] font-semibold text-stone-700 hover:text-brand-red">← Keep shopping</Link>
            </div>

            <aside className="lg:sticky lg:top-[126px] space-y-3">
              <div className="rounded-3xl bg-white border border-stone-200 p-6">
                <h2 className="text-lg font-semibold text-stone-900">Order summary</h2>
                <dl className="mt-4 space-y-2.5 text-[14px]">
                  <div className="flex justify-between text-stone-600">
                    <dt>Selected ({summary?.selected_units ?? 0} item{summary?.selected_units === 1 ? '' : 's'})</dt>
                    <dd className="text-stone-900 tabular-nums">{peso(summary?.merchandise ?? 0)}</dd>
                  </div>
                  {(summary?.promo_discount ?? 0) > 0 && (
                    <div className="flex justify-between text-emerald-700"><dt>Shop promotions</dt><dd className="tabular-nums">−{peso(summary!.promo_discount)}</dd></div>
                  )}
                  <div className="flex justify-between text-stone-500 text-[13px]"><dt>Shipping and vouchers</dt><dd>At checkout</dd></div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-stone-200">
                    <dt className="text-[15px] font-semibold text-stone-900">Subtotal</dt>
                    <dd className="text-[26px] font-bold tracking-tight text-brand-red tabular-nums">{peso(summary?.total ?? 0)}</dd>
                  </div>
                </dl>
                <button type="button" onClick={() => navigate('/checkout')} disabled={!summary?.selected_lines}
                  className="mt-5 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {summary?.selected_lines ? <>Check out {summary.selected_units} item{summary.selected_units === 1 ? '' : 's'} <ArrowRight className="w-4 h-4" /></> : 'Select items to check out'}
                </button>
                <p className="mt-3 text-center text-[12px] text-stone-500">Cash on delivery, GCash, e-wallet or card</p>
              </div>
              <Assurances />
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function StoreCard({ store, onSelectStore, onRemove, onQty, onSelect }: {
  store: CartStore;
  onSelectStore: (on: boolean) => void;
  onRemove: (variantId: number) => Promise<void>;
  onQty: (variantId: number, qty: number | string) => Promise<string | undefined>;
  onSelect: (variantId: number, on: boolean) => Promise<string | undefined>;
}) {
  const selectable = store.lines.filter((l) => l.status === 'available');
  const all = selectable.length > 0 && selectable.every((l) => l.selected);

  return (
    <section className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100">
        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-brand-red" checked={all} disabled={selectable.length === 0}
            onChange={(e) => onSelectStore(e.target.checked)} aria-label={`Select all items from ${store.seller.shop_name}`} />
          <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center shrink-0"><Store className="w-4 h-4" /></span>
          {store.seller.shop_slug
            ? <Link to={`/shop/${store.seller.shop_slug}`} className="text-[14px] font-semibold text-stone-900 truncate hover:text-brand-red">{store.seller.shop_name}</Link>
            : <span className="text-[14px] font-semibold text-stone-900 truncate">{store.seller.shop_name}</span>}
        </label>
        {store.seller.on_vacation
          ? <span className="text-[12px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">On vacation</span>
          : <span className="text-[12px] text-stone-500 shrink-0">Ships as one parcel</span>}
      </header>
      {store.promotions.length > 0 && (
        <div className="px-5 py-2 bg-emerald-50/60 border-b border-emerald-100 text-[12px] text-emerald-900 flex flex-wrap gap-x-4 gap-y-1">
          {store.promotions.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> {p.name}: <strong className="tabular-nums">−{peso(p.discount)}</strong></span>
          ))}
        </div>
      )}
      <ul className="divide-y divide-stone-100">
        {store.lines.map((line) => <LineRow key={line.id} line={line} onRemove={onRemove} onQty={onQty} onSelect={onSelect} />)}
      </ul>
      {store.selected_subtotal > 0 && (
        <footer className="flex justify-between px-5 py-3 bg-stone-50/70 border-t border-stone-100 text-[13px]">
          <span className="text-stone-500">Selected from this shop</span>
          <span className="font-semibold text-stone-900 tabular-nums">{peso(store.selected_subtotal - store.promo_discount)}</span>
        </footer>
      )}
    </section>
  );
}

function LineRow({ line, onRemove, onQty, onSelect }: {
  line: CartLine;
  onRemove: (variantId: number) => Promise<void>;
  onQty: (variantId: number, qty: number | string) => Promise<string | undefined>;
  onSelect: (variantId: number, on: boolean) => Promise<string | undefined>;
}) {
  const [qtyText, setQtyText] = useState(String(line.quantity));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = line.status !== 'available' && line.status !== 'insufficient_stock' && line.status !== 'limit_exceeded';
  const flash = line.segments.some((s) => s.price_source === 'flash');

  const commit = async (value: number | string) => {
    setBusy(true);
    const problem = await onQty(line.variant_id, value);
    setBusy(false);
    setError(problem ?? '');
    if (problem) setQtyText(String(line.quantity));
  };
  const step = (delta: number) => {
    const next = line.quantity + delta;
    if (next < 1) return;
    setQtyText(String(next));
    void commit(next);
  };

  return (
    <li className={`flex gap-3 sm:gap-4 p-4 sm:p-5 ${blocked ? 'bg-stone-50/70' : ''}`}>
      <input
        type="checkbox" className="mt-9 w-4 h-4 accent-brand-red shrink-0" checked={line.selected} disabled={line.status !== 'available'}
        onChange={async (e) => { const p = await onSelect(line.variant_id, e.target.checked); setError(p ?? ''); }}
        aria-label={`Select ${line.name}`}
      />
      <Link to={`/products/${line.product_id}`} className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-stone-50 ring-1 ring-stone-200 shrink-0 ${blocked ? 'opacity-50' : ''}`}>
        {line.image_url ? <img src={line.image_url} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-7 h-7 m-7 text-stone-300" />}
      </Link>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <Link to={`/products/${line.product_id}`} className={`text-[15px] leading-snug line-clamp-2 hover:text-brand-red ${blocked ? 'text-stone-500' : 'text-stone-900'}`}>{line.name}</Link>
            {line.variant_label && <p className="mt-0.5 text-[12px] text-stone-500">{line.variant_label}</p>}
            <p className="mt-1 text-[12px] text-stone-600 tabular-nums">
              {line.segments.length > 1
                ? line.segments.map((s, i) => <span key={i} className="mr-2">{s.quantity} × {peso(s.unit_price)}{s.price_source === 'flash' ? ' flash' : ''}</span>)
                : <>{peso(line.unit_price)} each{line.regular_price > line.unit_price && <span className="ml-1.5 text-stone-400 line-through">{peso(line.regular_price)}</span>}</>}
              {flash && <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-stone-800"><Zap className="w-3 h-3 text-amber-500 fill-amber-500" />Flash</span>}
            </p>
            {line.price_changed && line.price_seen != null && (
              <p className={`mt-1 text-[12px] font-medium ${line.price_changed === 'down' ? 'text-emerald-700' : 'text-amber-800'}`}>
                Price {line.price_changed === 'down' ? 'dropped' : 'went up'} from {peso(line.price_seen)}
              </p>
            )}
            {line.free_quantity > 0 && <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Gift className="w-3.5 h-3.5" /> {line.free_quantity} free with a shop promotion</p>}
          </div>
          <p className={`text-[16px] font-bold tabular-nums ${blocked ? 'text-stone-400' : 'text-stone-900'}`}>{peso(line.subtotal - line.promo_share)}</p>
        </div>
        {line.message && (
          <p role="status" className={`mt-2 text-[12px] font-medium ${blocked ? 'text-stone-600' : 'text-amber-800'}`}>{line.message}</p>
        )}
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-3">
          {!blocked ? (
            <div className="flex items-center gap-2">
              <div className={`flex items-center h-10 rounded-full border bg-white ${error ? 'border-brand-red' : 'border-stone-300'}`}>
                <button type="button" onClick={() => step(-1)} disabled={busy || line.quantity <= 1} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-stone-900 disabled:text-stone-300" aria-label="Fewer">
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="text" inputMode="numeric" value={qtyText} aria-label={`Quantity of ${line.name}`}
                  onChange={(e) => { setQtyText(e.target.value); setError(''); }}
                  onBlur={() => { if (qtyText !== String(line.quantity)) void commit(qtyText); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-10 text-center text-sm font-semibold tabular-nums outline-none bg-transparent"
                />
                <button type="button" onClick={() => step(1)} disabled={busy || line.quantity >= line.max_quantity} className="w-10 h-full flex items-center justify-center text-stone-600 hover:text-stone-900 disabled:text-stone-300" aria-label="More">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {line.stock <= 5 && line.stock > 0 && <span className="text-[12px] text-amber-700">Only {line.stock} left</span>}
            </div>
          ) : <span />}
          <button type="button" onClick={() => onRemove(line.variant_id)} className="h-9 px-3 rounded-full text-[13px] font-medium text-stone-500 hover:text-brand-red hover:bg-rose-50 flex items-center gap-1.5 transition-colors">
            <Trash2 className="w-4 h-4" /> Remove
          </button>
        </div>
        {error && <p role="alert" className="mt-1.5 text-[12px] font-medium text-brand-red">{error}</p>}
      </div>
    </li>
  );
}

/** A guest's cart: kept in this browser until they log in. */
function GuestCart() {
  const { items, removeItem, updateQty } = useCart();
  const navigate = useNavigate();
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
      <section className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
        <ul className="divide-y divide-stone-100">
          {items.map((item) => (
            <li key={item.variantId} className="flex gap-4 p-5">
              <Link to={`/products/${item.productId}`} className="w-20 h-20 rounded-2xl overflow-hidden bg-stone-50 ring-1 ring-stone-200 shrink-0">
                {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-7 h-7 m-6 text-stone-300" />}
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-stone-900 line-clamp-2">{item.name}</p>
                {item.variant && <p className="text-[12px] text-stone-500">{item.variant}</p>}
                <p className="text-[12px] text-stone-500 tabular-nums">{item.shopName}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center h-9 rounded-full border border-stone-300">
                    <button type="button" onClick={() => item.quantity > 1 && updateQty(item.variantId, item.quantity - 1)} className="w-9 h-full flex items-center justify-center" aria-label="Fewer"><Minus className="w-4 h-4" /></button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                    <button type="button" onClick={() => updateQty(item.variantId, item.quantity + 1)} className="w-9 h-full flex items-center justify-center" aria-label="More"><Plus className="w-4 h-4" /></button>
                  </div>
                  <button type="button" onClick={() => removeItem(item.variantId)} className="text-[13px] text-stone-500 hover:text-brand-red">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="rounded-3xl bg-white border border-stone-200 p-6">
        <p className="text-[14px] text-stone-600">Estimated subtotal</p>
        <p className="text-[26px] font-bold text-brand-red tabular-nums">{peso(subtotal)}</p>
        <p className="mt-2 text-[13px] text-stone-500">Log in to see live prices and stock, and to check out. Your cart moves into your account.</p>
        <button type="button" onClick={() => navigate('/login')} className="mt-5 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold">Log in to check out</button>
      </aside>
    </div>
  );
}

function EmptyCart({ onShop }: { onShop: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <span className="mx-auto w-20 h-20 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400">
        <ShoppingBag className="w-9 h-9" strokeWidth={1.5} />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-stone-900">Your cart is empty</h2>
      <p className="mt-1.5 text-sm text-stone-500">Find something you love. Everything you add shows up here, grouped by shop.</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
        <button type="button" onClick={onShop} className="h-11 px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
          Start shopping <ArrowRight className="w-4 h-4" />
        </button>
        <Link to="/search" className="h-11 px-6 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 hover:border-stone-900 flex items-center justify-center">Browse everything</Link>
      </div>
    </div>
  );
}

function Assurances() {
  return (
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
  );
}
