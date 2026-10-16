import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Truck,
  Banknote,
  ShieldCheck,
  BadgeCheck,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Star,
  ShoppingCart,
  Check,
  ArrowRight,
  Loader2,
  Package,
} from 'lucide-react';

import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import HeroCarousel from '../components/HeroCarousel';
import ProductCard from '../components/ui/ProductCard';
import CategoryArt from '../components/storefront/CategoryArt';
import { useStorefrontCategories } from '../hooks/useStorefrontCategories';
import { useQuickAdd } from '../hooks/useQuickAdd';
import { getProductsApi } from '../api/client';
import { pesoCompact, discountPercent } from '../utils/pricing';
import type { Product } from '../types';

// ─── 1. Trust Benefits Strip (Smaller height, longer horizontal span) ──────────
const TRUST_BENEFITS = [
  {
    icon: Truck,
    title: 'Free Shipping',
    sub: 'On orders above ₱499',
    iconBg: 'bg-red-50 text-brand-red',
  },
  {
    icon: Banknote,
    title: 'Cash on Delivery',
    sub: 'Pay when you receive',
    iconBg: 'bg-amber-50 text-amber-600',
  },
  {
    icon: ShieldCheck,
    title: 'Buyer Protection',
    sub: 'Safe payments, easy returns',
    iconBg: 'bg-rose-50 text-rose-600',
  },
  {
    icon: BadgeCheck,
    title: 'Verified Sellers',
    sub: 'Trusted & top-rated sellers',
    iconBg: 'bg-emerald-50 text-emerald-600',
  },
];

function TrustBenefitsStrip() {
  return (
    <section className="relative z-20 -mt-5 sm:-mt-6 max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-stone-200/90 shadow-sm py-3.5 sm:py-4 px-4 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 divide-x divide-stone-100">
          {TRUST_BENEFITS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`flex items-center gap-3 sm:gap-3.5 ${idx > 0 ? 'pl-3 sm:pl-6 lg:pl-8' : ''}`}
              >
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${item.iconBg}`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-[13px] font-bold text-gray-900 tracking-tight leading-tight truncate">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight truncate">
                    {item.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


// ─── 2. Shop by Category: every main category, with its picture and how much is in it ─────────────
function CategoriesSection() {
  const categories = useStorefrontCategories();

  return (
    <section id="categories" className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14 scroll-mt-32">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
          Shop by Category
        </h2>
        <Link
          to="/search"
          className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group"
        >
          <span>Browse all products</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* A swipeable row on phones; every category in a grid from tablets up. */}
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 sm:gap-4 sm:overflow-visible sm:pb-0">
        {categories === null
          ? Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="min-w-[170px] sm:min-w-0 h-[76px] rounded-2xl bg-stone-100 animate-pulse" />
          ))
          : categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="group min-w-[170px] sm:min-w-0 bg-stone-50/70 hover:bg-white border border-stone-200 hover:border-brand-red/50 rounded-2xl p-2.5 shadow-2xs hover:shadow-md transition-all duration-300 flex items-center gap-3"
            >
              <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center select-none transition-transform duration-300 group-hover:scale-110">
                <CategoryArt category={cat} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#2B2825] group-hover:text-brand-red transition-colors leading-snug line-clamp-2">
                  {cat.name}
                </span>
                <span className="block text-[11px] text-gray-400 mt-0.5">
                  {cat.product_count > 0 ? `${cat.product_count.toLocaleString()} item${cat.product_count === 1 ? '' : 's'}` : 'Coming soon'}
                </span>
              </span>
            </Link>
          ))}
      </div>
    </section>
  );
}

// ─── 3. Trending Now: the most bought, best rated and discounted products right now ─────────────────
function TrendingCard({ product }: { product: Product }) {
  const { add, added, soldOut } = useQuickAdd(product);
  const off = discountPercent(product.base_price, product.original_price);
  const rating = product.avg_rating ?? 0;

  return (
    <Link
      to={`/products/${product.id}`}
      className="w-[300px] sm:w-[360px] bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-4 shadow-xs hover:shadow-lg hover:border-brand-red/30 transition-all duration-300 relative shrink-0 flex items-center gap-4 group select-none"
    >
      {off > 0 && (
        <span className="absolute top-3 left-3 bg-[#B91C1C] text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-md shadow-2xs z-10">
          {off}% OFF
        </span>
      )}
      <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-stone-50 mt-2">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} loading="lazy" draggable={false} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <h3 className="text-[13px] sm:text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-brand-red transition-colors">
          {product.name}
        </h3>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-base sm:text-lg font-bold text-brand-red">{pesoCompact(product.base_price)}</span>
          {off > 0 && <span className="text-xs text-gray-400 line-through">{pesoCompact(product.original_price!)}</span>}
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-100">
          {product.review_count > 0 ? (
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`} />
              ))}
              <span className="text-[11px] text-gray-500 ml-1">({rating.toFixed(1)})</span>
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 truncate">{product.seller.shop_name}</span>
          )}
          <button
            type="button"
            onClick={add}
            disabled={soldOut}
            title={soldOut ? 'Sold out' : 'Add to cart'}
            aria-label={`Add ${product.name} to cart`}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-white flex items-center justify-center shadow-xs active:scale-90 transition-all ${
              soldOut ? 'bg-gray-300 cursor-not-allowed' : added ? 'bg-emerald-500' : 'bg-brand-red hover:bg-[#801818]'
            }`}
          >
            {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </Link>
  );
}

function TrendingSection() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getProductsApi({ sort: 'trending', per_page: 12 })
      .then((res) => { if (alive) setProducts(res.data); })
      .catch(() => { if (alive) setProducts([]); });
    return () => { alive = false; };
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    trackRef.current?.scrollBy({ left: direction === 'left' ? -380 : 380, behavior: 'smooth' });
  };

  if (products !== null && products.length === 0) return null;

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
          Trending now
        </h2>
        <div className="flex items-center gap-3">
          <Link
            to="/search?sort=best_selling"
            className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group"
          >
            <span>View all</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            {(['left', 'right'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => scroll(dir)}
                title={dir === 'left' ? 'Scroll left' : 'Scroll right'}
                className="w-8 h-8 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 hover:text-brand-red flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                {dir === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={trackRef} className="flex gap-5 overflow-x-auto pb-2 no-scrollbar scroll-smooth items-stretch">
        {products === null ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="w-[300px] sm:w-[360px] h-[150px] shrink-0 rounded-3xl bg-stone-100 animate-pulse" />)
        ) : (
          // The list twice, so the marquee loops seamlessly (it slides by half its width); hovering pauses it.
          <div className="flex gap-5 animate-marquee-slow shrink-0 pr-5">
            {[...products, ...products].map((p, idx) => <TrendingCard key={`${p.id}-${idx}`} product={p} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 4. Campaign CTA Banner (With Random Star Diamond Sparkles) ──────────────
function CampaignCtaBanner() {
  const navigate = useNavigate();

  // Randomly scattered star diamond coordinates (✦ and ✧) across the banner
  const STAR_DIAMONDS = [
    { top: '12%', left: '5%', size: 'text-xs', opacity: 'opacity-70', char: '✦', delay: '0s', dur: '2.5s' },
    { top: '74%', left: '9%', size: 'text-[10px]', opacity: 'opacity-50', char: '✧', delay: '1.2s', dur: '3.1s' },
    { top: '25%', left: '22%', size: 'text-sm', opacity: 'opacity-85', char: '✦', delay: '0.4s', dur: '2.8s' },
    { top: '68%', left: '31%', size: 'text-xs', opacity: 'opacity-60', char: '✧', delay: '1.8s', dur: '3.5s' },
    { top: '14%', left: '44%', size: 'text-[11px]', opacity: 'opacity-75', char: '✦', delay: '0.7s', dur: '2.2s' },
    { top: '80%', left: '52%', size: 'text-sm', opacity: 'opacity-80', char: '✧', delay: '2.1s', dur: '3.0s' },
    { top: '20%', left: '63%', size: 'text-xs', opacity: 'opacity-70', char: '✦', delay: '1.5s', dur: '2.7s' },
    { top: '76%', left: '71%', size: 'text-[10px]', opacity: 'opacity-65', char: '✧', delay: '0.9s', dur: '3.3s' },
    { top: '16%', left: '82%', size: 'text-sm', opacity: 'opacity-80', char: '✦', delay: '2.4s', dur: '2.9s' },
    { top: '64%', left: '90%', size: 'text-xs', opacity: 'opacity-70', char: '✧', delay: '0.2s', dur: '3.4s' },
    { top: '40%', left: '16%', size: 'text-[9px]', opacity: 'opacity-40', char: '✦', delay: '1.7s', dur: '2.6s' },
    { top: '46%', left: '78%', size: 'text-[9px]', opacity: 'opacity-45', char: '✧', delay: '0.5s', dur: '3.2s' },
    { top: '84%', left: '42%', size: 'text-xs', opacity: 'opacity-60', char: '✦', delay: '2.0s', dur: '2.8s' },
    { top: '22%', left: '95%', size: 'text-[10px]', opacity: 'opacity-50', char: '✧', delay: '1.1s', dur: '3.0s' },
  ];

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-10">
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-[#991B1B] via-brand-red to-[#801818] text-white py-5 sm:py-6 px-6 sm:px-10 lg:px-12 shadow-lg flex flex-col md:flex-row items-center justify-between gap-5 border border-red-800/40 select-none">
        
        {/* Randomly scattered star diamond sparkles (Monochrome, NO full-color emojis/icons) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          {STAR_DIAMONDS.map((star, i) => (
            <span
              key={i}
              style={{
                top: star.top,
                left: star.left,
                animationDelay: star.delay,
                animationDuration: star.dur,
              }}
              className={`absolute text-amber-200/90 ${star.size} ${star.opacity} animate-pulse pointer-events-none select-none`}
            >
              {star.char}
            </span>
          ))}
        </div>

        {/* Text Content (Clean, No Icon Boxes) */}
        <div className="relative z-10 text-center md:text-left space-y-1">
          <h2 className="text-lg sm:text-xl lg:text-[23px] font-serif font-bold tracking-tight text-white leading-snug">
            Your next favorite find is waiting.
          </h2>
          <p className="text-white/85 text-xs sm:text-[13px] max-w-xl leading-relaxed font-normal">
            Explore thousands of verified Philippine merchants, exclusive discounts, and express nationwide delivery.
          </p>
        </div>

        {/* Action Button (Sleek, Compact) */}
        <button
          onClick={() => navigate('/search')}
          className="relative z-10 shrink-0 px-6 sm:px-7 py-2.5 rounded-full bg-white hover:bg-stone-50 text-brand-red font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 group active:scale-95 cursor-pointer"
        >
          <span>Start Shopping</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-brand-red" />
        </button>
      </div>
    </section>
  );
}


// ─── 5. Discover More Products: the whole catalog, shuffled, 100 at a time ─────────────────────────
const DISCOVER_PAGE = 100; // 20 rows of 5

function FeaturedProductsSection() {
  // One shuffle per visit: the seed keeps "View more" from repeating a product.
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetches one page of the shuffle and appends it (state is only set once the response is in).
  const fetchPage = useCallback((next: number, alive: () => boolean = () => true) =>
    getProductsApi({ sort: 'random', seed, per_page: DISCOVER_PAGE, page: next })
      .then((res) => {
        if (!alive()) return;
        setProducts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return next === 1 ? res.data : [...prev, ...res.data.filter((p) => !seen.has(p.id))];
        });
        setPage(res.meta.current_page);
        setLastPage(res.meta.last_page);
        setTotal(res.meta.total);
      })
      .catch(() => { if (alive()) setError(true); })
      .finally(() => { if (alive()) setLoading(false); }), [seed]);

  useEffect(() => {
    let alive = true;
    fetchPage(1, () => alive);
    return () => { alive = false; };
  }, [fetchPage]);

  const loadPage = (next: number) => {
    setLoading(true);
    setError(false);
    fetchPage(next);
  };

  if (!loading && !error && products.length === 0) return null;

  const firstLoad = loading && products.length === 0;
  const shownPct = total > 0 ? Math.min(100, Math.round((products.length / total) * 100)) : 0;

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pb-16">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
            Discover More Products
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            A fresh mix from every shop, every time you visit
          </p>
        </div>
        <Link
          to="/search"
          className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group shrink-0"
        >
          <span>Explore all</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 sm:gap-x-4 gap-y-6">
        {firstLoad
          ? Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-xl bg-stone-100 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-stone-100 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-stone-100 animate-pulse" />
            </div>
          ))
          : products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>

      {error && (
        <p className="mt-8 text-center text-sm text-gray-500">
          Could not load more products.{' '}
          <button type="button" onClick={() => loadPage(page + 1 || 1)} className="font-semibold text-brand-red hover:underline">Try again</button>
        </p>
      )}

      {!firstLoad && page < lastPage && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <p className="text-xs text-gray-500">
            You&apos;ve seen <span className="font-semibold text-gray-800">{products.length.toLocaleString()}</span> of {total.toLocaleString()} products
          </p>
          <div className="w-48 h-1 rounded-full bg-stone-200 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-red transition-all duration-500" style={{ width: `${shownPct}%` }} />
          </div>
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            disabled={loading}
            className="group mt-1 inline-flex items-center gap-2 h-11 pl-7 pr-6 rounded-full bg-white border border-stone-300 text-sm font-semibold text-gray-800 shadow-sm hover:border-brand-red hover:text-brand-red hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{loading ? 'Loading more' : 'View more'}</span>
            {!loading && <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-0.5" />}
          </button>
        </div>
      )}

      {!firstLoad && page >= lastPage && total > DISCOVER_PAGE && (
        <p className="mt-10 text-center text-xs text-gray-400">You&apos;ve seen all {total.toLocaleString()} products. <Link to="/search" className="font-semibold text-brand-red hover:underline">Search the catalog</Link></p>
      )}
    </section>
  );
}

// ─── Main HomePage Component ──────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans selection:bg-brand-red selection:text-white">
      {/* ── Global Site Header with Crimson Navbar & Black Utility Bar ── */}
      <SiteHeader />

      {/* ── Hero Carousel (Only section with warm gold fade banner styling) ── */}
      <HeroCarousel />

      {/* ── Main Middle Content Area (Clean Pure White Background) ── */}
      <main className="flex-1 bg-white">
        <TrustBenefitsStrip />

        {/* Every main category, from the live catalog */}
        <CategoriesSection />

        {/* The most bought, best rated and discounted products */}
        <TrendingSection />

        <CampaignCtaBanner />

        {/* The whole catalog, shuffled, 100 at a time */}
        <FeaturedProductsSection />
      </main>

      {/* ── Global Footer ── */}
      <Footer />
    </div>
  );
}
