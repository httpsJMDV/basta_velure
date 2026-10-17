import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Star, Heart, Share2, ShoppingCart, MapPin, Package, MessageCircle, Store, ShieldCheck,
  RotateCcw, Truck, X, Minus, Plus, Banknote, Check, Info,
} from 'lucide-react';
import { getProductApi, getProductReviewsApi, getRelatedProductsApi, getProductsApi, toggleWishlistApi } from '../api/client';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useToast } from '../components/ui/Toast';
import { resolveShortLocation } from '../utils/psgc';
import { pesoCompact as peso, discountPercent } from '../utils/pricing';
import { DELIVERY_FEE } from '../utils/shipping';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import ProductCard from '../components/ui/ProductCard';
import type { ProductDetail, ProductReview, ProductReviewsResponse, Product } from '../types';

// ── Small pieces ──────────────────────────────────────────────────────────────

function Stars({ rating, className = 'w-3.5 h-3.5' }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${className} ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200'}`} />
      ))}
    </span>
  );
}

function soldLabel(units: number) {
  if (units <= 0) return null;
  return units >= 1000 ? `${(units / 1000).toFixed(1).replace(/\.0$/, '')}K sold` : `${units} sold`;
}

/** "Eyebrow" heading used by every section below the fold. */
function SectionTitle({ id, children, aside }: { id?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div id={id} className="flex items-end justify-between gap-4 mb-5 scroll-mt-[180px]">
      <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-[#1E1B18]">{children}</h2>
      {aside}
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────

function Gallery({ images, active, onActive, name }: { images: ProductDetail['images']; active: number; onActive: (i: number) => void; name: string }) {
  const count = images.length;
  const go = (delta: number) => onActive((active + delta + count) % count);

  if (!count) {
    return (
      <div className="aspect-square max-w-[560px] rounded-3xl bg-white ring-1 ring-stone-200/70 flex items-center justify-center">
        <Package className="w-16 h-16 text-stone-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-3">
      {count > 1 && (
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto no-scrollbar lg:max-h-[472px] shrink-0">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onActive(i)}
              onMouseEnter={() => onActive(i)}
              aria-label={`Photo ${i + 1}`}
              className={`shrink-0 w-16 h-16 lg:w-[72px] lg:h-[72px] rounded-xl overflow-hidden bg-white transition-all ${i === active ? 'ring-2 ring-stone-900' : 'ring-1 ring-stone-200 opacity-70 hover:opacity-100'}`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1 aspect-square rounded-3xl bg-white ring-1 ring-stone-200/70 overflow-hidden group">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={images[active]?.id ?? active}
            src={images[active]?.url}
            alt={name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-full h-full object-contain"
          />
        </AnimatePresence>
        {count > 1 && (
          <>
            {([[-1, 'left-3', ChevronLeft, 'Previous photo'], [1, 'right-3', ChevronRight, 'Next photo']] as const).map(([delta, pos, Icon, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => go(delta)}
                aria-label={label}
                className={`absolute ${pos} top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 ring-1 ring-stone-200 flex items-center justify-center text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white`}
              >
                <Icon className="w-5 h-5" />
              </button>
            ))}
            <span className="absolute bottom-3 right-3 px-2.5 h-6 rounded-full bg-stone-900/75 text-white text-[11px] font-medium flex items-center tabular-nums">
              {active + 1} / {count}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Buy panel ─────────────────────────────────────────────────────────────────

function BuyPanel({ product, onGalleryIndex }: { product: ProductDetail; onGalleryIndex: (idx: number) => void }) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [wishlisted, setWishlisted] = useState(product.is_wishlisted);
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState<'cart' | 'buy' | null>(null);

  const groups = product.variant_groups;
  const allSelected = groups.length === 0 || groups.every((g) => selected[g.name] != null);
  const resolvedVariant = (() => {
    if (groups.length === 0) return product.variants?.[0] ?? null;
    if (groups.length === 1) return groups[0].options.find((o) => o.id === selected[groups[0].name]) ?? null;
    const label = groups.map((g) => g.options.find((o) => o.id === selected[g.name])?.label ?? '').join(' / ');
    return product.variants?.find((v) => v.label === label) ?? null;
  })();

  const price = resolvedVariant?.price ?? product.base_price;
  const original = resolvedVariant?.original_price ?? product.original_price;
  const off = discountPercent(price, original);
  const totalStock = product.variants?.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0) ?? null;
  const stock = resolvedVariant?.stock_quantity ?? totalStock;
  const soldOut = stock != null && stock <= 0;
  const sold = soldLabel(product.units_sold);

  function optionImage(groupIdx: number, optIdx: number, optionCount: number) {
    if (groupIdx !== 0) return undefined;
    if (product.images.length === optionCount) return product.images[optIdx];
    if (product.images.length > optionCount) return product.images[optIdx + 1];
    return undefined;
  }

  function choose(groupName: string, optId: number, groupIdx: number, optIdx: number, optionCount: number) {
    setSelected((s) => ({ ...s, [groupName]: optId }));
    setPrompt(false);
    setQty(1);
    if (groupIdx === 0 && product.images.length > 0) {
      if (product.images.length === optionCount) onGalleryIndex(optIdx);
      else if (product.images.length > optionCount) onGalleryIndex(Math.min(optIdx + 1, product.images.length - 1));
      else if (optIdx < product.images.length) onGalleryIndex(optIdx);
    }
  }

  async function act(action: 'cart' | 'buy') {
    if (!allSelected) { setPrompt(true); return; }
    const variantId = resolvedVariant?.id ?? product.variants?.[0]?.id ?? 0;
    setBusy(action);
    try {
      await addItem({
        variantId,
        productId: product.id,
        name: product.name,
        variant: groups.length ? groups.map((g) => g.options.find((o) => o.id === selected[g.name])?.label ?? '').join(' / ') : '',
        price,
        image: product.images[0]?.url ?? '',
        quantity: qty,
        sellerId: product.seller?.id,
        shopName: product.seller?.shop_name,
      });
      if (action === 'buy') navigate('/cart');
      else showToast('Added to your cart.', 'success');
    } catch {
      showToast('Could not add to cart. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleWishlist() {
    if (!user) { navigate('/login'); return; }
    setWishlisted((w) => !w);
    try { await toggleWishlistApi(product.id); } catch { setWishlisted((w) => !w); }
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: product.name, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => showToast('Link copied.', 'success'));
  }

  return (
    <div className="flex flex-col">
      <Link to={product.seller.shop_slug ? `/shop/${product.seller.shop_slug}` : `/store/${product.seller.id}`}
        className="self-start inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-500 hover:text-brand-red">
        {product.seller.shop_name}<ChevronRight className="w-3.5 h-3.5" />
      </Link>

      <h1 className="mt-2 text-[22px] sm:text-[26px] leading-[1.25] font-semibold tracking-tight text-stone-900">{product.name}</h1>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-500">
        {product.review_count > 0 && product.avg_rating != null ? (
          <a href="#reviews" className="inline-flex items-center gap-1.5 hover:text-stone-800">
            <span className="font-semibold text-stone-900">{product.avg_rating.toFixed(1)}</span>
            <Stars rating={product.avg_rating} />
            <span className="underline-offset-2 hover:underline">{product.review_count} review{product.review_count === 1 ? '' : 's'}</span>
          </a>
        ) : (
          <span>No reviews yet</span>
        )}
        {sold && <><span className="text-stone-300">•</span><span>{sold}</span></>}
      </div>

      {/* Price */}
      <div className="mt-5 pb-5 border-b border-stone-200">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[34px] leading-none font-bold tracking-tight text-brand-red">{peso(price)}</span>
          {off > 0 && (
            <>
              <span className="text-base text-stone-400 line-through">{peso(original!)}</span>
              <span className="px-1.5 h-6 rounded-md border border-brand-red/50 text-brand-red text-[12px] font-semibold flex items-center">-{off}%</span>
            </>
          )}
        </div>
        {off > 0 && <p className="mt-1.5 text-[12px] text-emerald-700">You save {peso(Math.round((original! - price) * 100) / 100)} with the shop&apos;s discount</p>}
      </div>

      {/* Options */}
      {groups.map((group, gi) => {
        const chosen = group.options.find((o) => o.id === selected[group.name]);
        return (
          <div key={group.name} className="pt-5">
            <p className="text-[13px] text-stone-600">
              <span className="font-semibold text-stone-900">{group.name}:</span>{' '}
              {chosen ? chosen.label : <span className={prompt ? 'text-brand-red font-medium' : 'text-stone-400'}>choose one</span>}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {group.options.map((opt, oi) => {
                const on = selected[group.name] === opt.id;
                const out = opt.stock_quantity === 0;
                const img = optionImage(gi, oi, group.options.length);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={out}
                    onClick={() => choose(group.name, opt.id, gi, oi, group.options.length)}
                    className={`min-h-[42px] rounded-xl border text-[13px] flex items-center gap-2 transition-all ${img ? 'pl-1.5 pr-3.5' : 'px-4'} ${
                      on ? 'border-stone-900 bg-stone-900 text-white'
                        : out ? 'border-stone-200 text-stone-300 line-through cursor-not-allowed'
                        : 'border-stone-300 bg-white text-stone-800 hover:border-stone-900'
                    }`}
                  >
                    {img && <img src={img.url} alt="" className="w-8 h-8 rounded-lg object-cover bg-white" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {prompt && (
        <p className="mt-3 text-[12px] font-medium text-brand-red">
          Choose {groups.filter((g) => selected[g.name] == null).map((g) => g.name.toLowerCase()).join(' and ')} first.
        </p>
      )}

      {/* Quantity */}
      <div className="pt-5 flex items-center gap-4">
        <div className="flex items-center h-11 rounded-full border border-stone-300 bg-white">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="w-11 h-full flex items-center justify-center text-stone-600 disabled:text-stone-300" aria-label="Fewer">
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number" min={1} max={stock ?? 999} value={qty} aria-label="Quantity"
            onChange={(e) => setQty(Math.max(1, Math.min(stock ?? 999, Number(e.target.value) || 1)))}
            className="w-10 h-full text-center text-sm font-semibold text-stone-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button type="button" onClick={() => setQty((q) => Math.min(stock ?? 999, q + 1))} disabled={stock != null && qty >= stock} className="w-11 h-full flex items-center justify-center text-stone-600 disabled:text-stone-300" aria-label="More">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {stock != null && (
          <span className={`text-[13px] ${soldOut ? 'text-brand-red font-semibold' : stock <= 5 ? 'text-amber-700 font-medium' : 'text-stone-500'}`}>
            {soldOut ? 'Sold out' : stock <= 5 ? `Only ${stock} left` : `${stock.toLocaleString()} in stock`}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="pt-5 flex gap-2.5">
        <button type="button" onClick={() => act('cart')} disabled={soldOut || busy !== null}
          className="flex-1 h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
          <ShoppingCart className="w-4 h-4" /> {busy === 'cart' ? 'Adding…' : 'Add to cart'}
        </button>
        <button type="button" onClick={() => act('buy')} disabled={soldOut || busy !== null}
          className="flex-1 h-12 rounded-full border-[1.5px] border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {busy === 'buy' ? 'One moment…' : 'Buy now'}
        </button>
        <button type="button" onClick={toggleWishlist} aria-pressed={wishlisted} aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          className={`w-12 h-12 shrink-0 rounded-full border flex items-center justify-center transition-colors ${wishlisted ? 'border-brand-red/40 bg-rose-50 text-brand-red' : 'border-stone-300 text-stone-600 hover:border-stone-900'}`}>
          <Heart className={`w-[18px] h-[18px] ${wishlisted ? 'fill-brand-red' : ''}`} />
        </button>
        <button type="button" onClick={share} aria-label="Share"
          className="w-12 h-12 shrink-0 rounded-full border border-stone-300 text-stone-600 hover:border-stone-900 flex items-center justify-center transition-colors">
          <Share2 className="w-[18px] h-[18px]" />
        </button>
      </div>

      <Assurances product={product} />
    </div>
  );
}

/** Delivery, payment and returns, as one compact list under the buttons. */
function Assurances({ product }: { product: ProductDetail }) {
  const { user } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [today] = useState(() => new Date());

  useEffect(() => {
    resolveShortLocation(product.seller.province, product.seller.city).then((loc) => setFrom(loc || ''));
  }, [product.seller.province, product.seller.city]);
  useEffect(() => {
    if (user?.default_address) resolveShortLocation(user.default_address.province, user.default_address.city_municipality).then((loc) => setTo(loc || ''));
  }, [user?.default_address]);

  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  const rows = [
    {
      icon: Truck,
      title: <>Arrives <span className="font-semibold text-stone-900">{day(product.estimated_delivery_days_min)} – {day(product.estimated_delivery_days_max)}</span>{to && <> to {to}</>}</>,
      detail: <>{peso(DELIVERY_FEE)} delivery per shop order{from && <> · ships from {from}</>}</>,
      action: <Link to="/settings/addresses" className="text-[12px] font-semibold text-brand-red hover:underline shrink-0">{user?.default_address ? 'Change' : 'Set address'}</Link>,
    },
    { icon: Banknote, title: 'Cash on delivery available', detail: 'Pay the rider when your order arrives, or pay online at checkout.' },
    { icon: RotateCcw, title: '7-day returns', detail: product.return_policy ?? 'Damaged, wrong or incomplete? Request a return within 7 days of delivery.' },
    { icon: ShieldCheck, title: 'Buyer protection', detail: 'The seller is paid only after you receive the order.' },
  ];

  return (
    <ul className="mt-6 rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100">
      {rows.map(({ icon: Icon, title, detail, action }, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <Icon className="w-[18px] h-[18px] mt-0.5 text-stone-500 shrink-0" strokeWidth={1.8} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-stone-700">{title}</p>
            <p className="text-[12px] text-stone-500 mt-0.5 line-clamp-2">{detail}</p>
          </div>
          {action}
        </li>
      ))}
    </ul>
  );
}

// ── Shop strip ────────────────────────────────────────────────────────────────

function ShopStrip({ product }: { product: ProductDetail }) {
  const { user } = useAuth();
  const { openChatWithSeller } = useChat();
  const navigate = useNavigate();
  const [location, setLocation] = useState('');
  const seller = product.seller;

  useEffect(() => {
    resolveShortLocation(seller.province, seller.city).then((loc) => setLocation(loc || ''));
  }, [seller.province, seller.city]);

  const chat = () => {
    if (!user) { navigate('/login'); return; }
    openChatWithSeller(seller.id, { id: product.id, name: product.name, price: product.base_price, image: product.images[0]?.url });
  };
  const shopLink = seller.shop_slug ? `/shop/${seller.shop_slug}` : `/store/${seller.id}`;
  const joined = seller.joined_at ? new Date(seller.joined_at).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null;
  const stats = [
    { label: 'Products', value: seller.product_count != null ? seller.product_count.toLocaleString() : '—' },
    { label: 'Rating', value: seller.avg_rating != null ? `${seller.avg_rating.toFixed(1)} / 5` : 'New' },
    { label: 'Sold', value: seller.units_sold > 0 ? seller.units_sold.toLocaleString() : '—' },
    { label: 'Joined', value: joined ?? '—' },
  ];

  return (
    <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
      <div className="flex items-center gap-4 min-w-0 lg:w-[34%]">
        <span className="w-16 h-16 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center text-xl font-bold text-stone-500 shrink-0">
          {seller.avatar_url ? <img src={seller.avatar_url} alt="" className="w-full h-full object-cover" /> : (seller.shop_name[0]?.toUpperCase() ?? <Store className="w-6 h-6" />)}
        </span>
        <div className="min-w-0">
          <Link to={shopLink} className="block text-lg font-semibold text-stone-900 truncate hover:text-brand-red">{seller.shop_name}</Link>
          {location && <p className="mt-0.5 flex items-center gap-1 text-[12px] text-stone-500"><MapPin className="w-3.5 h-3.5" />{location}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-4 flex-1 lg:border-l lg:border-stone-200 lg:pl-6">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-[0.08em] text-stone-400">{s.label}</dt>
            <dd className="mt-1 text-[15px] font-semibold text-stone-900 truncate">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2 shrink-0">
        <button type="button" onClick={chat} className="h-10 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4" /> Chat
        </button>
        <Link to={shopLink} className="h-10 px-4 rounded-full bg-stone-900 hover:bg-black text-white text-[13px] font-semibold flex items-center gap-1.5">
          <Store className="w-4 h-4" /> Visit shop
        </Link>
      </div>
    </section>
  );
}

// ── Details ───────────────────────────────────────────────────────────────────

function Details({ product }: { product: ProductDetail }) {
  const { specs } = product;
  const isHtml = specs.description.trimStart().startsWith('<');
  const isFood = product.category?.parent?.slug === 'food-grocery';
  const kg = specs.weight_grams != null ? (specs.weight_grams >= 1000 ? `${(specs.weight_grams / 1000).toLocaleString()} kg` : `${specs.weight_grams} g`) : null;

  const rows: [string, string | null | undefined][] = [
    ['Category', product.category ? [product.category.parent?.name, product.category.name].filter(Boolean).join(' › ') : null],
    ['Shop', product.seller.shop_name],
    ['SKU', specs.sku],
    ['Weight', kg],
    ['Dimensions', specs.dimensions_cm ? `${specs.dimensions_cm} cm` : null],
    ['Net weight / volume', specs.net_weight_volume],
    ['Best before', specs.expiry_best_before],
    ['Storage', specs.storage_instructions],
    ['Allergens', specs.allergen_info],
    ['Material', specs.material],
    ['Care', specs.care_instructions],
  ];

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-10">
      <div className="min-w-0 space-y-12">
        <section>
          <SectionTitle id="overview">About this item</SectionTitle>
          {specs.description ? (
            isHtml
              ? <div className="prose prose-stone prose-sm max-w-none text-stone-700 leading-relaxed [&_img]:rounded-xl [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: specs.description }} />
              : <p className="text-[15px] text-stone-700 leading-relaxed whitespace-pre-line max-w-3xl">{specs.description}</p>
          ) : <p className="text-sm text-stone-500">The seller has not added a description.</p>}
        </section>

        <section>
          <SectionTitle id="specifications">Specifications</SectionTitle>
          <dl className="grid sm:grid-cols-2 gap-x-10 border-t border-stone-200">
            {rows.filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <div key={label} className="flex gap-4 py-3 border-b border-stone-200">
                <dt className="w-36 shrink-0 text-[13px] text-stone-500">{label}</dt>
                <dd className="text-[13px] text-stone-900 min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          {isFood && specs.ingredients && (
            <div className="mt-6">
              <p className="text-[13px] font-semibold text-stone-900">Ingredients</p>
              <p className="mt-1.5 text-[13px] text-stone-600 leading-relaxed max-w-3xl">{specs.ingredients}</p>
            </div>
          )}
          {isFood && (
            <p className="mt-5 flex items-start gap-2 text-[12px] text-stone-500 max-w-3xl">
              <Info className="w-4 h-4 shrink-0 mt-px" />
              Food products are regulated by the FDA Philippines. The shop submitted its License to Operate and the product&apos;s registration to Loved-IT before listing.
            </p>
          )}
        </section>
      </div>

      <aside className="lg:pt-[52px]">
        <div className="rounded-2xl bg-white border border-stone-200 p-5">
          <p className="text-[13px] font-semibold text-stone-900">Shipping &amp; returns</p>
          <ul className="mt-3 space-y-3 text-[13px] text-stone-600">
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />{product.seller.shipping_policy ?? 'Packed within 1 to 2 days and handed to the courier you choose at checkout.'}</li>
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />7-day returns from delivery for items that arrive damaged, wrong or incomplete.</li>
            {isFood && <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />Opened food cannot be returned unless it arrived damaged, spoiled or expired.</li>}
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />Disputes are reviewed by Loved-IT if you and the shop cannot agree.</li>
          </ul>
          {product.seller.return_policy && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <p className="text-[12px] font-semibold text-stone-900">From the shop</p>
              <p className="mt-1 text-[12px] text-stone-600 leading-relaxed whitespace-pre-line">{product.seller.return_policy}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────────────

function Reviews({ product }: { product: ProductDetail }) {
  const [data, setData] = useState<ProductReviewsResponse | null>(null);
  const [rating, setRating] = useState<number | undefined>();
  const [sort, setSort] = useState<'recent' | 'relevance'>('relevance');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getProductReviewsApi(product.id, { rating, sort, page })
      .then((res) => { if (alive) setData(res); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [product.id, rating, sort, page]);

  const update = (fn: () => void) => { setLoading(true); fn(); };
  const counts = data?.meta.rating_counts ?? {};
  const total = product.review_count;

  return (
    <section>
      <SectionTitle id="reviews" aside={total > 0 ? (
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-stone-200/60 text-[12px]">
          {(['relevance', 'recent'] as const).map((s) => (
            <button key={s} type="button" onClick={() => update(() => { setSort(s); setPage(1); })}
              className={`h-7 px-3 rounded-full transition-colors ${sort === s ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-500'}`}>
              {s === 'relevance' ? 'Top' : 'Newest'}
            </button>
          ))}
        </div>
      ) : undefined}>
        Reviews
      </SectionTitle>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-stone-800">No reviews yet</p>
          <p className="mt-1 text-[13px] text-stone-500">Buyers can review this item after it is delivered.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-10">
          <div>
            <p className="text-5xl font-bold tracking-tight text-stone-900">{(product.avg_rating ?? 0).toFixed(1)}</p>
            <div className="mt-2"><Stars rating={product.avg_rating ?? 0} className="w-4 h-4" /></div>
            <p className="mt-1 text-[13px] text-stone-500">{total.toLocaleString()} review{total === 1 ? '' : 's'}</p>
            <div className="mt-5 space-y-1.5">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = counts[String(r)] ?? 0;
                const on = rating === r;
                return (
                  <button key={r} type="button" onClick={() => update(() => { setRating(on ? undefined : r); setPage(1); })}
                    className={`w-full flex items-center gap-2.5 px-2 py-1 rounded-lg text-[12px] transition-colors ${on ? 'bg-white ring-1 ring-stone-300' : 'hover:bg-white'}`}>
                    <span className="w-3 text-stone-600 tabular-nums">{r}</span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"><span className="block h-full bg-amber-400 rounded-full" style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></span>
                    <span className="w-6 text-right text-stone-400 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            {rating != null && (
              <button type="button" onClick={() => update(() => setRating(undefined))} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-red">
                Showing {rating}★ only <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="min-w-0">
            {loading ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-stone-200/50 animate-pulse" />)}
              </div>
            ) : !data?.data.length ? (
              <p className="py-10 text-center text-sm text-stone-500">No reviews with this rating.</p>
            ) : (
              <ul className="divide-y divide-stone-200 border-y border-stone-200">
                {data.data.map((r) => <ReviewRow key={r.id} review={r} />)}
              </ul>
            )}
            {data && data.meta.last_page > 1 && (
              <div className="flex items-center justify-center gap-3 pt-5">
                <button type="button" disabled={page <= 1} onClick={() => update(() => setPage((p) => p - 1))} className="w-9 h-9 rounded-full border border-stone-300 flex items-center justify-center disabled:opacity-30" aria-label="Previous">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[13px] text-stone-600 tabular-nums">{page} / {data.meta.last_page}</span>
                <button type="button" disabled={page >= data.meta.last_page} onClick={() => update(() => setPage((p) => p + 1))} className="w-9 h-9 rounded-full border border-stone-300 flex items-center justify-center disabled:opacity-30" aria-label="Next">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewRow({ review }: { review: ProductReview }) {
  const parts = (review.buyer?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const name = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || 'Buyer';
  return (
    <li className="py-5 flex gap-4">
      <span className="w-10 h-10 rounded-full bg-stone-200 overflow-hidden flex items-center justify-center text-[13px] font-semibold text-stone-600 shrink-0">
        {review.buyer?.avatar_url ? <img src={review.buyer.avatar_url} alt="" className="w-full h-full object-cover" /> : name[0].toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-stone-900">{name}</span>
          {review.verified_purchase && <span className="text-[11px] text-emerald-700">Verified purchase</span>}
          <span className="ml-auto text-[12px] text-stone-400">{new Date(review.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div className="mt-1"><Stars rating={review.rating} className="w-3 h-3" /></div>
        {review.comment && <p className="mt-2 text-[14px] text-stone-700 leading-relaxed">{review.comment}</p>}
        {(review.images?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {review.images!.map((url, i) => <img key={i} src={url} alt="" className="w-20 h-20 rounded-xl object-cover ring-1 ring-stone-200" />)}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Product rails ─────────────────────────────────────────────────────────────

function ProductRail({ id, title, products, more }: { id?: string; title: string; products: Product[] | null; more?: { to: string; label: string } }) {
  if (products !== null && products.length === 0) return null;
  return (
    <section>
      <SectionTitle id={id} aside={more && <Link to={more.to} className="text-[13px] font-semibold text-brand-red hover:underline flex items-center gap-1">{more.label}<ChevronRight className="w-4 h-4" /></Link>}>
        {title}
      </SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-7">
        {products === null
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="aspect-square rounded-xl bg-stone-200/50 animate-pulse" />)
          : products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'similar', label: 'Similar items' },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [similar, setSimilar] = useState<Product[] | null>(null);
  const [fromShop, setFromShop] = useState<Product[] | null>(null);

  const load = useCallback((productId: number, alive: () => boolean) => {
    getProductApi(productId)
      .then((p) => {
        if (!alive()) return;
        setProduct(p);
        setPhoto(0);
        getRelatedProductsApi(p.id).then((r) => alive() && setSimilar(r.data.slice(0, 10))).catch(() => alive() && setSimilar([]));
        getProductsApi({ seller_ids: [p.seller.id], per_page: 11, sort: 'best_selling' })
          .then((r) => alive() && setFromShop(r.data.filter((x) => x.id !== p.id).slice(0, 10)))
          .catch(() => alive() && setFromShop([]));
      })
      .catch(() => { if (alive()) setError(true); })
      .finally(() => { if (alive()) setLoading(false); });
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    load(Number(id), () => alive);
    window.scrollTo({ top: 0 });
    return () => { alive = false; };
  }, [id, load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5]">
        <SiteHeader />
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-10">
          <div className="aspect-square rounded-3xl bg-stone-200/60 animate-pulse" />
          <div className="space-y-4">
            <div className="h-4 w-32 rounded bg-stone-200/60 animate-pulse" />
            <div className="h-8 w-4/5 rounded bg-stone-200/60 animate-pulse" />
            <div className="h-10 w-40 rounded bg-stone-200/60 animate-pulse" />
            <div className="h-12 rounded-full bg-stone-200/60 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-[#FAF8F5]">
        <SiteHeader />
        <div className="flex flex-col items-center justify-center text-center py-32 px-4">
          <Package className="w-12 h-12 text-stone-300" />
          <p className="mt-3 text-base font-semibold text-stone-800">This product is not available</p>
          <p className="mt-1 text-sm text-stone-500">It may have been removed or sold out by the shop.</p>
          <Link to="/search" className="mt-5 h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold flex items-center">Keep shopping</Link>
        </div>
      </div>
    );
  }

  const cat = product.category;

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <SiteHeader />

      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 py-4 text-[12px] text-stone-500 overflow-x-auto no-scrollbar whitespace-nowrap" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-brand-red">Home</Link>
          {cat?.parent && (<><ChevronRight className="w-3 h-3 text-stone-300" /><Link to={`/category/${cat.parent.slug}`} className="hover:text-brand-red">{cat.parent.name}</Link></>)}
          {cat && (<><ChevronRight className="w-3 h-3 text-stone-300" /><Link to={cat.parent ? `/category/${cat.parent.slug}?cat=${cat.slug}` : `/category/${cat.slug}`} className="hover:text-brand-red">{cat.name}</Link></>)}
          <ChevronRight className="w-3 h-3 text-stone-300" />
          <span className="text-stone-800 truncate max-w-[40ch]">{product.name}</span>
        </nav>

        {/* Gallery + buy panel */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
          <div className="w-full max-w-[560px] mx-auto lg:mx-0 lg:sticky lg:top-[126px]">
            <Gallery images={product.images} active={Math.min(photo, Math.max(0, product.images.length - 1))} onActive={setPhoto} name={product.name} />
          </div>
          <BuyPanel product={product} onGalleryIndex={setPhoto} />
        </motion.div>

        <div className="mt-12"><ShopStrip product={product} /></div>
      </div>

      {/* Section nav */}
      <div className="mt-12 sticky top-16 sm:top-[110px] z-20 bg-[#FAF8F5]/95 backdrop-blur border-y border-stone-200">
        <nav className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 flex gap-6 overflow-x-auto no-scrollbar" aria-label="On this page">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 py-3.5 text-[13px] font-medium text-stone-500 hover:text-stone-900 border-b-2 border-transparent hover:border-brand-red -mb-px transition-colors">
              {s.label}{s.id === 'reviews' && product.review_count > 0 ? ` (${product.review_count})` : ''}
            </a>
          ))}
        </nav>
      </div>

      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-12 space-y-16">
        <Details product={product} />
        <Reviews product={product} />
        <ProductRail id="similar" title="Similar items" products={similar}
          more={cat ? { to: cat.parent ? `/category/${cat.parent.slug}?cat=${cat.slug}` : `/category/${cat.slug}`, label: `More in ${cat.name}` } : undefined} />
        <ProductRail title={`More from ${product.seller.shop_name}`} products={fromShop}
          more={{ to: product.seller.shop_slug ? `/shop/${product.seller.shop_slug}` : `/store/${product.seller.id}`, label: 'Visit shop' }} />
      </div>

      <Footer />
    </div>
  );
}
