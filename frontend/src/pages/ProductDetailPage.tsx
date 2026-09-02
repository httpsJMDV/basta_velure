import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Star, Heart, Share2,
  ShoppingCart, Zap, MapPin, Package, MessageCircle,
  Store, Shield, RotateCcw, Truck, X, Check,
} from 'lucide-react';
import {
  getProductApi,
  getProductReviewsApi,
  getRelatedProductsApi,
  toggleWishlistApi,
} from '../api/client';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { resolveShortLocation } from '../utils/psgc';
import SiteHeader from '../components/SiteHeader';
import { LEAF_MAP, LEAF_PARENT_MAP } from '../data/categories';
import { leafRequiresFda } from '../data/categories';
import type {
  ProductDetail,
  ProductReview,
  ProductReviewsResponse,
  Product,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3 h-3';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${cls} ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
        />
      ))}
    </div>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur-md text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-white/10 pointer-events-none"
    >
      <Check className="w-4 h-4 text-green-400 shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}

// ── Image Gallery ─────────────────────────────────────────────────────────────

function ImageGallery({ images, activeOverride }: { images: ProductDetail['images']; activeOverride?: number }) {
  const [active, setActive] = useState(0);

  // When a variant with a specific image is selected, jump to that image
  useEffect(() => {
    if (activeOverride != null) setActive(activeOverride);
  }, [activeOverride]);

  const prev = () => setActive((i) => (i - 1 + images.length) % images.length);
  const next = () => setActive((i) => (i + 1) % images.length);

  if (!images.length) {
    return (
      <div className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center">
        <Package className="w-16 h-16 text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden group">
        <AnimatePresence mode="wait">
          <motion.img
            key={active}
            src={images[active].url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full object-cover"
          />
        </AnimatePresence>
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === active ? 'bg-brand-red w-4' : 'bg-white/70'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActive(i)}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                i === active ? 'border-brand-red' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Buy Box ───────────────────────────────────────────────────────────────────

function BuyBox({
  product,
  onBuyNow,
  onWishlist,
  onGalleryIndex,
  onToast,
}: {
  product: ProductDetail;
  onBuyNow: (variantId: number, qty: number) => void;
  onWishlist: () => void;
  onGalleryIndex: (idx: number) => void;
  onToast: (msg: string) => void;
}) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [wishlisted, setWishlisted] = useState(product.is_wishlisted);
  const [showVariantPrompt, setShowVariantPrompt] = useState(false);
  const [adding, setAdding] = useState(false);

  const groups = product.variant_groups;
  const allSelected = groups.length === 0 || groups.every((g) => selected[g.name] != null);

  // For single-group products resolve the active option
  const activeOption = groups.length === 1
    ? groups[0].options.find((o) => o.id === selected[groups[0].name])
    : null;

  // For multi-group: find the variant whose label matches all selected option labels joined by ' / '
  const resolvedVariant = (() => {
    if (groups.length === 0) return product.variants?.[0] ?? null;
    if (groups.length === 1) return activeOption ?? null;
    // multi-group: match by label
    const labelParts = groups.map((g) => g.options.find((o) => o.id === selected[g.name])?.label ?? '');
    const label = labelParts.join(' / ');
    return product.variants?.find((v) => (v as { label?: string }).label === label) ?? null;
  })();

  const displayPrice = resolvedVariant?.price ?? product.base_price;
  const displayOriginal = resolvedVariant?.original_price ?? product.original_price;
  const isOnSale = displayOriginal != null && displayOriginal > displayPrice;
  const discount = displayOriginal ? Math.round(((displayOriginal - displayPrice) / displayOriginal) * 100) : 0;
  const totalStock = product.variants?.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0) ?? null;
  const stock = resolvedVariant?.stock_quantity ?? totalStock;

  // When a variant option is selected, jump gallery to its image if mapped
  function handleSelect(groupName: string, optId: number) {
    setSelected((s) => ({ ...s, [groupName]: optId }));
    setShowVariantPrompt(false);
    setQty(1);

    // Map selected option to corresponding image in the gallery
    if (product.images.length > 0) {
      const group = groups.find((g) => g.name === groupName);
      if (group) {
        const optIdx = group.options.findIndex((o) => o.id === optId);
        if (optIdx >= 0) {
          if (product.images.length === group.options.length) {
            onGalleryIndex(optIdx);
          } else if (product.images.length > group.options.length) {
            // First image is main/cover photo, remaining images match options
            onGalleryIndex(Math.min(optIdx + 1, product.images.length - 1));
          } else if (optIdx < product.images.length) {
            onGalleryIndex(optIdx);
          }
        }
      }
    }
  }

  async function handleCta(action: 'cart' | 'buy') {
    if (!allSelected) { setShowVariantPrompt(true); return; }
    setShowVariantPrompt(false);
    const variantId = resolvedVariant?.id ?? product.variants?.[0]?.id ?? 0;
    if (action === 'buy') { onBuyNow(variantId, qty); return; }
    setAdding(true);
    try {
      await addItem({
        variantId,
        productId: product.id,
        name: product.name,
        variant: resolvedVariant
          ? groups.map((g) => g.options.find((o) => o.id === selected[g.name])?.label ?? '').join(' / ')
          : '',
        price: displayPrice,
        image: product.images[0]?.url ?? '',
        quantity: qty,
      });
      onToast('Added to cart successfully!');
    } catch {
      onToast('Could not add to cart. Please try again.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Name */}
      <h1 className="text-xl font-black text-gray-900 leading-snug">{product.name}</h1>

      {/* Rating row */}
      <div className="flex items-center gap-3 flex-wrap">
        {product.avg_rating != null && (
          <>
            <span className="text-brand-red font-bold text-sm">{product.avg_rating.toFixed(1)}</span>
            <StarRow rating={product.avg_rating} size="md" />
          </>
        )}
        <span className="text-sm text-gray-400">{product.review_count} reviews</span>
        <span className="text-gray-200">|</span>
        <span className="text-sm text-gray-400">{product.units_sold.toLocaleString()} sold</span>
      </div>

      {/* Price */}
      <div className="bg-gray-50 rounded-2xl px-4 py-3 flex items-baseline gap-3 flex-wrap">
        <span className="text-3xl font-black text-brand-red">{fmt(displayPrice)}</span>
        {isOnSale && (
          <>
            <span className="text-base text-gray-400 line-through">{fmt(displayOriginal!)}</span>
            <span className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">-{discount}%</span>
          </>
        )}
      </div>

      {/* Variant groups */}
      {groups.length > 0 && groups.map((group) => (
        <div key={group.name} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              {group.name}
            </span>
            {selected[group.name] != null ? (
              <span className="text-xs font-semibold text-brand-red bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100 flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-red" />
                {group.options.find((o) => o.id === selected[group.name])?.label}
              </span>
            ) : (
              <span className="text-xs text-gray-400 font-medium">Select an option</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {group.options.map((opt, optIdx) => {
              const isSelected = selected[group.name] === opt.id;
              const outOfStock = opt.stock_quantity === 0;
              const optImg = product.images.length === group.options.length
                ? product.images[optIdx]
                : product.images.length > group.options.length
                ? product.images[optIdx + 1]
                : undefined;

              return (
                <button
                  key={opt.id}
                  disabled={outOfStock}
                  onClick={() => handleSelect(group.name, opt.id)}
                  className={[
                    'min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all flex items-center gap-2',
                    isSelected
                      ? 'border-brand-red bg-red-50 text-brand-red ring-1 ring-brand-red'
                      : outOfStock
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed line-through'
                      : 'border-gray-200 text-gray-700 hover:border-brand-red hover:text-brand-red bg-white',
                  ].join(' ')}
                >
                  {optImg && (
                    <img
                      src={optImg.url}
                      alt={opt.label}
                      className="w-6 h-6 rounded-md object-cover border border-gray-200 shrink-0"
                    />
                  )}
                  <span>{opt.label}</span>
                  {outOfStock && <span className="ml-1 text-[10px]">(Out)</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {showVariantPrompt && (
        <p className="text-xs text-brand-red font-semibold -mt-2">
          Please select {groups.filter((g) => selected[g.name] == null).map((g) => g.name).join(', ')} to continue.
        </p>
      )}

      {/* Quantity */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-gray-700 shrink-0">Quantity</span>
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg font-bold select-none"
          >−</button>
          <input
            type="number"
            min={1}
            max={stock ?? 999}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(stock ?? 999, Number(e.target.value) || 1)))}
            className="w-14 h-10 p-0 m-0 text-center text-sm font-bold text-gray-900 border-x border-gray-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(stock ?? 999, q + 1))}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors text-lg font-bold select-none"
          >+</button>
        </div>
        {stock != null && <span className="text-xs text-gray-400 font-medium">{stock} available</span>}
      </div>

      {/* CTA buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleCta('buy')}
          className="flex-1 min-h-[48px] rounded-xl border-2 border-brand-red text-brand-red font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
        >
          <Zap className="w-4 h-4" /> Buy Now
        </button>
        <button
          onClick={() => handleCta('cart')}
          disabled={adding}
          className="flex-1 min-h-[48px] rounded-xl bg-brand-red text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-brand-red-dark transition-colors shadow-sm disabled:opacity-70"
        >
          <ShoppingCart className="w-4 h-4" />
          {adding ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>

      {/* Share + Wishlist */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => {
            navigator.share?.({ title: product.name, url: window.location.href })
              .catch(() => navigator.clipboard?.writeText(window.location.href));
          }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-red transition-colors min-h-[44px] px-2"
        >
          <Share2 className="w-4 h-4" /> Share
        </button>
        <button
          onClick={() => { setWishlisted((w) => !w); onWishlist(); }}
          className={`flex items-center gap-1.5 text-xs transition-colors min-h-[44px] px-2 ${
            wishlisted ? 'text-brand-red' : 'text-gray-500 hover:text-brand-red'
          }`}
        >
          <Heart className={`w-4 h-4 ${wishlisted ? 'fill-brand-red' : ''}`} />
          {wishlisted ? 'Wishlisted' : 'Add to Wishlist'}
        </button>
      </div>
    </div>
  );
}

// ── Delivery Card ─────────────────────────────────────────────────────────────

function DeliveryCard({ product }: { product: ProductDetail }) {
  const { user } = useAuth();
  const [sellerLocation, setSellerLocation] = useState<string>('');
  const [destLocation, setDestLocation] = useState<string>('');

  useEffect(() => {
    resolveShortLocation(product.seller.province, product.seller.city)
      .then((loc) => setSellerLocation(loc || 'Philippines'));
  }, [product.seller.province, product.seller.city]);

  useEffect(() => {
    if (user?.default_address) {
      resolveShortLocation(user.default_address.province, user.default_address.city_municipality)
        .then((loc) => setDestLocation(loc));
    }
  }, [user?.default_address]);

  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + product.estimated_delivery_days_min);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + product.estimated_delivery_days_max);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
        <Truck className="w-4 h-4 text-brand-red" /> Delivery
      </h3>
      <div className="flex items-start gap-3">
        <MapPin className="w-4 h-4 text-brand-red mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400 font-medium">Deliver to</span>
            <Link to="/settings/addresses" className="text-xs text-brand-red font-semibold hover:underline">
              {user?.default_address ? 'Change' : 'Set address'}
            </Link>
          </div>
          <p className="text-sm font-semibold text-gray-800 truncate">
            {destLocation || user?.default_address?.barangay || 'Metro Manila, Philippines'}
          </p>
          {sellerLocation && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Ships from: <span className="text-gray-600 font-medium">{sellerLocation}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Estimated Delivery</span>
        <span className="font-semibold text-gray-800">
          {fmtDate(minDate)} – {fmtDate(maxDate)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Shipping Fee</span>
        <span className="font-semibold text-gray-800">
          {product.shipping_fee != null ? fmt(product.shipping_fee) : 'Calculated at checkout'}
        </span>
      </div>
      {(product.return_policy || product.warranty) && (
        <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
          <Shield className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500">
            {product.return_policy ?? product.warranty}
          </p>
        </div>
      )}
      {!product.return_policy && !product.warranty && (
        <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
          <RotateCcw className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500">7-day return policy</p>
        </div>
      )}
    </div>
  );
}

// ── Seller Card ───────────────────────────────────────────────────────────────

function SellerCard({ seller, product }: { seller: ProductDetail['seller']; product: ProductDetail }) {
  const { user } = useAuth();
  const { openChatWithSeller } = useChat();
  const navigate = useNavigate();
  const [sellerLocation, setSellerLocation] = useState<string>('');

  useEffect(() => {
    resolveShortLocation(seller.province, seller.city)
      .then((loc) => setSellerLocation(loc || 'Philippines'));
  }, [seller.province, seller.city]);

  const handleChat = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    openChatWithSeller(seller.id, {
      id: product.id,
      name: product.name,
      price: product.base_price,
      image: product.images[0]?.url,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
          {seller.avatar_url
            ? <img src={seller.avatar_url} alt={seller.shop_name} className="w-full h-full object-cover" />
            : <Store className="w-6 h-6 text-gray-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{seller.shop_name}</p>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0 text-gray-400" />
            {sellerLocation || 'Philippines'}
          </p>
        </div>
      </div>

      {/* Trust badges */}
      <div className="flex flex-wrap gap-2">
        {seller.rating_pct != null && (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {seller.rating_pct}% Positive
          </span>
        )}
        {seller.units_sold > 0 && (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-200">
            {seller.units_sold.toLocaleString()} Sold
          </span>
        )}
        {seller.repurchase_rate != null && (
          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-200">
            {seller.repurchase_rate}% Repurchase
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Link
          to={`/store/${seller.id}`}
          className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center gap-1.5 hover:border-brand-red hover:text-brand-red transition-colors"
        >
          <Store className="w-4 h-4" /> Go to Store
        </Link>
        <button
          type="button"
          onClick={handleChat}
          className="flex-1 min-h-[44px] rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold flex items-center justify-center gap-1.5 hover:border-brand-red hover:text-brand-red transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> Chat
        </button>
      </div>
    </div>
  );
}

// ── Reviews Tab ───────────────────────────────────────────────────────────────

function ReviewsTab({ productId, avgRating, reviewCount }: {
  productId: number;
  avgRating: number | null;
  reviewCount: number;
}) {
  const [data, setData] = useState<ProductReviewsResponse | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | undefined>();
  const [sort, setSort] = useState<'recent' | 'relevance'>('relevance');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProductReviewsApi(productId, { rating: ratingFilter, sort, page });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [productId, ratingFilter, sort, page]);

  useEffect(() => { load(); }, [load]);

  const ratingCounts = data?.meta.rating_counts ?? {};

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      {avgRating != null && (
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex flex-col items-center">
            <span className="text-5xl font-black text-brand-red">{avgRating.toFixed(1)}</span>
            <StarRow rating={avgRating} size="md" />
            <span className="text-xs text-gray-400 mt-1">{reviewCount} reviews</span>
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = ratingCounts[String(r)] ?? 0;
              const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
              return (
                <button
                  key={r}
                  onClick={() => { setRatingFilter(ratingFilter === r ? undefined : r); setPage(1); }}
                  className={`flex items-center gap-2 group ${ratingFilter === r ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                >
                  <span className="text-xs text-gray-500 w-4 text-right">{r}</span>
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold">Sort:</span>
        {(['relevance', 'recent'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setSort(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              sort === s ? 'bg-brand-red text-white border-brand-red' : 'border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red'
            }`}
          >
            {s === 'relevance' ? 'Most Relevant' : 'Most Recent'}
          </button>
        ))}
        {ratingFilter != null && (
          <button
            onClick={() => setRatingFilter(undefined)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-brand-red border border-brand-red/20"
          >
            {ratingFilter}★ only <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Review list */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-3 bg-gray-100 rounded w-1/4" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !data?.data.length ? (
        <div className="text-center py-10 text-gray-400 text-sm">No reviews yet.</div>
      ) : (
        <div className="flex flex-col gap-5">
          {data.data.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 font-semibold">{page} / {data.meta.last_page}</span>
          <button
            disabled={page >= data.meta.last_page}
            onClick={() => setPage((p) => p + 1)}
            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ review }: { review: ProductReview }) {
  const name = `${review.buyer.first_name} ${review.buyer.last_name[0]}.`;
  return (
    <div className="flex gap-3">
      <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
        {review.buyer.avatar_url
          ? <img src={review.buyer.avatar_url} alt={name} className="w-full h-full object-cover" />
          : name[0].toUpperCase()
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-800">{name}</span>
          {review.verified_purchase && (
            <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-semibold">Verified</span>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {new Date(review.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <StarRow rating={review.rating} />
        {review.comment && <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{review.comment}</p>}
        {review.images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {review.images.map((url, i) => (
              <img key={i} src={url} alt="" className="w-16 h-16 rounded-xl object-cover border border-gray-100" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Product Details Tab ───────────────────────────────────────────────────────

function SpecRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <tr className="border-b border-gray-50">
      <td className="py-2.5 pr-4 text-sm text-gray-500 font-medium w-40 align-top">{label}</td>
      <td className="py-2.5 text-sm text-gray-800">{value}</td>
    </tr>
  );
}

function ProductDetailsTab({ product }: { product: ProductDetail }) {
  const { specs, category_id } = product;
  const leaf = LEAF_MAP.get(category_id);
  const parent = LEAF_PARENT_MAP.get(category_id);

  const isFood = parent?.id === 'food-grocery';
  const isBeauty = parent?.id === 'health-beauty';
  const isElectronics = parent?.id === 'mobile-gadgets-computers';
  const isFashion = parent?.id === 'womens-fashion' || parent?.id === 'mens-fashion' || parent?.id === 'bags-accessories';

  // Detect whether description is HTML (from rich editor) or plain text
  const isHtml = specs.description.trimStart().startsWith('<');

  return (
    <div className="flex flex-col gap-6">
      {/* Description */}
      <div>
        <h4 className="text-sm font-bold text-gray-800 mb-2">Description</h4>
        {isHtml ? (
          <div
            className="prose prose-sm max-w-none text-gray-700 [&_img]:rounded-xl [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: specs.description }}
          />
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{specs.description}</p>
        )}
      </div>

      {/* Specs table */}
      <div>
        <h4 className="text-sm font-bold text-gray-800 mb-2">Specifications</h4>
        <table className="w-full">
          <tbody>
            <SpecRow label="SKU" value={specs.sku} />
            <SpecRow label="Weight" value={specs.weight_grams != null ? `${specs.weight_grams}g` : null} />
            <SpecRow label="Dimensions" value={specs.dimensions_cm ? `${specs.dimensions_cm} cm` : null} />
            <SpecRow label="Category" value={leaf?.label} />

            {/* Food & Grocery */}
            {isFood && <>
              <SpecRow label="Ingredients" value={specs.ingredients} />
              <SpecRow label="Net Weight/Volume" value={specs.net_weight_volume} />
              <SpecRow label="Storage" value={specs.storage_instructions} />
              <SpecRow label="Best Before" value={specs.expiry_best_before} />
              <SpecRow label="Allergens" value={specs.allergen_info} />
              <SpecRow label="FDA Reg. No." value={specs.fda_registration_number} />
            </>}

            {/* Health & Beauty */}
            {isBeauty && <>
              <SpecRow label="Key Ingredients" value={specs.key_ingredients ?? specs.ingredients} />
              <SpecRow label="Net Weight/Volume" value={specs.net_weight_volume} />
              <SpecRow label="Skin Type" value={specs.skin_type_suitability} />
            </>}

            {/* Electronics */}
            {isElectronics && <>
              <SpecRow label="Battery" value={specs.battery_info} />
              <SpecRow label="Ports" value={specs.ports_connectivity} />
              <SpecRow label="Compatibility" value={specs.compatibility} />
            </>}

            {/* Fashion */}
            {isFashion && <>
              <SpecRow label="Material" value={specs.material} />
              <SpecRow label="Care" value={specs.care_instructions} />
            </>}
          </tbody>
        </table>
      </div>

      {/* What's in the box */}
      {specs.whats_in_box && specs.whats_in_box.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-2">What's in the Box</h4>
          <ul className="flex flex-col gap-1">
            {specs.whats_in_box.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-red mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Size chart */}
      {isFashion && specs.size_chart_url && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-2">Size Chart</h4>
          <img src={specs.size_chart_url} alt="Size chart" className="max-w-full rounded-xl border border-gray-100" />
        </div>
      )}

      {/* FDA notice */}
      {isFood && leafRequiresFda(category_id) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            This product is regulated by the Food and Drug Administration (FDA). Seller is required to hold a valid CPR/CPN.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Recommendations Tab ───────────────────────────────────────────────────────

function RecommendationsTab({ productId }: { productId: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRelatedProductsApi(productId)
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-100" />
            <div className="p-3 flex flex-col gap-2">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!products.length) {
    return <div className="text-center py-10 text-gray-400 text-sm">No related products found.</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => {
        const isOnSale = p.original_price != null && p.original_price > p.base_price;
        const discount = isOnSale ? Math.round((1 - p.base_price / p.original_price!) * 100) : 0;
        return (
          <Link
            key={p.id}
            to={`/products/${p.id}`}
            className="group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            <div className="relative aspect-square bg-gray-100 overflow-hidden">
              {p.thumbnail_url
                ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-300" /></div>
              }
              {isOnSale && (
                <span className="absolute top-2 left-2 bg-brand-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">-{discount}%</span>
              )}
            </div>
            <div className="p-3 flex flex-col gap-1.5 flex-1">
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{p.name}</p>
              <div className="mt-auto flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-base font-black text-brand-red">{fmt(p.base_price)}</span>
                  {isOnSale && <span className="text-xs text-gray-400 line-through">{fmt(p.original_price!)}</span>}
                </div>
                {p.avg_rating != null && <StarRow rating={p.avg_rating} />}
                <span className="text-[11px] text-gray-400">{p.units_sold > 0 ? `${p.units_sold.toLocaleString()} sold` : 'New'}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Shipping & Returns Tab ───────────────────────────────────────────────────

function ShippingReturnsTab({ product }: { product: ProductDetail }) {
  const isFood = String(product.category_id || '').toLowerCase().includes('food');

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Velure Platform Baseline Return Policy */}
      <div className="p-5 bg-rose-50/60 border border-brand-red/20 rounded-2xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-red shrink-0" />
            <h4 className="text-sm font-bold text-gray-900">Velure 7-Day Guaranteed Return Policy</h4>
          </div>
          <span className="text-[10px] font-bold uppercase bg-brand-red text-white px-2.5 py-0.5 rounded-full">
            Platform Protection
          </span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          This product is protected under Velure's standard 7-day buyer guarantee from the date of confirmed delivery.
          If the received item is damaged, defective, materially different from the listing, or incomplete, you can file a Return &amp; Refund request directly from your orders dashboard.
        </p>

        {isFood && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <strong>Food &amp; Grocery Policy:</strong> Perishable food items are non-returnable once opened or delivered in good condition for health and hygiene safety, but remain eligible for full refund or resolution if damaged, spoiled, or expired upon arrival.
          </div>
        )}

        <div className="pt-2 border-t border-brand-red/10 flex items-center gap-2 text-xs font-semibold text-brand-red">
          <span>✓ Protected by Velure Dispute Mediation (48h automatic escalation if contested)</span>
        </div>
      </div>

      {/* Seller Additional Terms */}
      {product.seller.return_policy && (
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
          <h4 className="text-sm font-bold text-gray-900">Store Additional Return Terms</h4>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {product.seller.return_policy}
          </p>
        </div>
      )}

      {/* Shipping Details */}
      <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
        <h4 className="text-sm font-bold text-gray-900">Shipping &amp; Delivery Information</h4>
        <p className="text-xs text-gray-600 leading-relaxed">
          {product.seller.shipping_policy || 'Standard nationwide shipping with trusted logistics partners. Orders are securely packed and dispatched within 24–48 business hours.'}
        </p>
        {product.shipping_fee === 0 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold mt-2">
            <span>Free Delivery Available on This Item</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = 'reviews' | 'details' | 'shipping_returns' | 'recommendations';

const TABS: { id: TabId; label: string }[] = [
  { id: 'reviews', label: 'Reviews' },
  { id: 'details', label: 'Product Details' },
  { id: 'shipping_returns', label: 'Shipping & Returns' },
  { id: 'recommendations', label: 'You May Also Like' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('reviews');
  const [toast, setToast] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | undefined>();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    getProductApi(Number(id))
      .then(setProduct)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const { addItem } = useCart();

  const handleBuyNow = useCallback(async (variantId: number, qty: number) => {
    if (!product) return;
    try {
      const activeVar = product.variants?.find((v) => v.id === variantId);
      await addItem({
        variantId,
        productId: product.id,
        name: product.name,
        variant: activeVar?.label ?? '',
        price: activeVar?.price ?? product.base_price,
        image: product.images[0]?.url ?? '',
        quantity: qty,
      });
      navigate('/cart');
    } catch {
      setToast('Could not proceed. Please try again.');
    }
  }, [addItem, product, navigate]);

  const handleWishlist = useCallback(async () => {
    if (!product) return;
    try { await toggleWishlistApi(product.id); } catch { /* optimistic */ }
  }, [product]);

  const parentNode = product ? LEAF_PARENT_MAP.get(product.category_id) : null;
  const leafNode   = product ? LEAF_MAP.get(product.category_id) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-gray-soft">
        <SiteHeader />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="h-4 bg-gray-200 rounded w-64 mb-8 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-gray-200 rounded-2xl animate-pulse" />
            <div className="flex flex-col gap-4">
              <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
              <div className="h-12 bg-gray-200 rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-brand-gray-soft">
        <SiteHeader />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">Product not found.</p>
            <Link to="/" className="mt-3 inline-block text-sm text-brand-red font-semibold hover:underline">Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-gray-soft">
      <SiteHeader />

      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white border-b border-gray-100"
      >
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-1.5 text-sm overflow-x-auto scrollbar-hide">
          <Link to="/" className="text-gray-500 hover:text-brand-red transition-colors shrink-0">Home</Link>
          {parentNode && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <Link to={`/category/${parentNode.id}`} className="text-gray-500 hover:text-brand-red transition-colors shrink-0">
                {parentNode.label}
              </Link>
            </>
          )}
          {leafNode && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <Link
                to={`/category/${parentNode?.id}?cat=${leafNode.id}`}
                className="text-gray-500 hover:text-brand-red transition-colors shrink-0"
              >
                {leafNode.label}
              </Link>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          <span className="text-gray-800 font-medium truncate">{product.name}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6"
      >

        {/* ── Main two-column section ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 lg:gap-8 items-start">

          {/* Left: Gallery */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <ImageGallery images={product.images} activeOverride={galleryIndex} />
          </motion.div>

          {/* Right: Buy box + cards */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-col gap-4"
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <BuyBox
                product={product}
                onBuyNow={handleBuyNow}
                onWishlist={handleWishlist}
                onGalleryIndex={setGalleryIndex}
                onToast={setToast}
              />
            </div>
            <DeliveryCard product={product} />
            <SellerCard seller={product.seller} product={product} />
          </motion.div>
        </div>

        {/* ── Tabbed section ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'shrink-0 px-6 py-4 text-sm font-bold transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'border-brand-red text-brand-red'
                    : 'border-transparent text-gray-500 hover:text-gray-800',
                ].join(' ')}
              >
                {tab.label}
                {tab.id === 'reviews' && product.review_count > 0 && (
                  <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
                    {product.review_count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="p-5 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'reviews' && (
                  <ReviewsTab productId={product.id} avgRating={product.avg_rating} reviewCount={product.review_count} />
                )}
                {activeTab === 'details' && <ProductDetailsTab product={product} />}
                {activeTab === 'shipping_returns' && <ShippingReturnsTab product={product} />}
                {activeTab === 'recommendations' && <RecommendationsTab productId={product.id} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </AnimatePresence>

      <SiteFooter />
    </div>
  );
}

// ── Site Footer (shared with HomePage) ───────────────────────────────────────

function SiteFooter() {
  return (
    <footer className="bg-brand-black text-white mt-6">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="flex flex-col gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full object-cover logo-img-dark" />
            <span className="text-white font-bold text-lg tracking-tight">Velure</span>
          </Link>
          <p className="text-white/50 text-sm leading-relaxed">
            Your one-stop marketplace for everything you need, delivered to your door.
          </p>
          <div className="flex gap-3 mt-1">
            <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.975.975 1.246 2.242 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.975.975-2.242 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.975-.975-1.246-2.242-1.308-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.975-.975 2.242-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </a>
            <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
            </a>
            <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </a>
          </div>
        </div>

        {/* Shop */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest">Shop</p>
          <ul className="flex flex-col gap-2.5">
            {['New Arrivals', 'Best Sellers', 'Sale', 'All Products'].map((l) => (
              <li key={l}><a href="#" className="text-white/50 text-sm hover:text-white transition-colors">{l}</a></li>
            ))}
          </ul>
        </div>

        {/* Support */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest">Support</p>
          <ul className="flex flex-col gap-2.5">
            {['Help Center', 'Track My Order', 'Returns & Exchanges', 'Buyer Protection'].map((l) => (
              <li key={l}><a href="#" className="text-white/50 text-sm hover:text-white transition-colors">{l}</a></li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest">Legal</p>
          <ul className="flex flex-col gap-2.5">
            {[
              { label: 'Privacy Policy',   to: '/privacy-policy' },
              { label: 'Terms of Service', to: '/terms-of-service' },
              { label: 'Cookie Policy',    to: '/cookie-policy' },
            ].map(({ label, to }) => (
              <li key={label}>
                <Link to={to} className="text-white/50 text-sm hover:text-white transition-colors">{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <p className="text-white/30 text-xs">© {new Date().getFullYear()} Velure. All rights reserved.</p>
          <p className="text-white/20 text-xs hidden sm:block">Shop Everything, Delivered.</p>
        </div>
      </div>
    </footer>
  );
}
