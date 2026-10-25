import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  Banknote,
  RotateCcw,
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
import { getProductsApi, getFeaturedShopsApi } from '../api/client';
import { pesoCompact, discountPercent } from '../utils/pricing';
import type { Product, FeaturedShop } from '../types';

// ─── 1. How buying here works: four facts that are true of every order, in one ruled band ─────────
const BUYING_FACTS = [
  { icon: Truck, title: 'Shipping by route and weight', sub: 'Shown in full before you pay' },
  { icon: Banknote, title: 'Cash on delivery', sub: 'Or GCash straight to the shop' },
  { icon: RotateCcw, title: '7-day returns', sub: 'For items damaged or not as described' },
  { icon: BadgeCheck, title: 'Checked shops', sub: 'Every seller is verified before selling' },
];

function BuyingFactsBand() {
  return (
    <section className="relative z-20 -mt-5 sm:-mt-6 max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12" aria-label="Buying on Loved-IT">
      {/* gap-px over a stone fill draws the hairlines between cells, in two columns or four */}
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stone-200/80 rounded-2xl border border-stone-200/80 overflow-hidden shadow-[0_10px_30px_-18px_rgba(28,25,23,0.35)]">
        {BUYING_FACTS.map(({ icon: Icon, title, sub }) => (
          <li key={title} className="bg-white flex items-start gap-3 px-4 sm:px-6 py-3.5 sm:py-4">
            <Icon className="w-5 h-5 text-brand-red shrink-0 mt-0.5" strokeWidth={1.6} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[12.5px] sm:text-[13.5px] font-semibold text-[#1E1B18] leading-snug">{title}</span>
              <span className="block mt-0.5 text-[11.5px] sm:text-[12px] text-stone-500 leading-snug">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
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
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar sm:grid sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 sm:gap-x-4 sm:gap-y-6 sm:overflow-visible sm:pb-0">
        {categories === null
          ? Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="min-w-[124px] sm:min-w-0 space-y-2">
              <div className="aspect-square rounded-2xl bg-stone-100 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-stone-100 animate-pulse" />
            </div>
          ))
          : categories.map((cat) => (
            <Link key={cat.id} to={`/category/${cat.slug}`} className="group min-w-[124px] sm:min-w-0 flex flex-col gap-2.5 select-none">
              <span className="relative block aspect-square rounded-2xl overflow-hidden bg-stone-100 ring-1 ring-stone-200/80 transition-shadow duration-300 group-hover:shadow-lg group-hover:ring-brand-red/30">
                <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.06]">
                  <CategoryArt category={cat} />
                </span>
                <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </span>
              <span className="px-0.5">
                <span className="block text-[13px] font-semibold text-[#2B2825] group-hover:text-brand-red transition-colors leading-snug line-clamp-2">{cat.name}</span>
                {cat.product_count > 0 && (
                  <span className="block text-[11px] text-stone-500 mt-0.5">{cat.product_count.toLocaleString()} item{cat.product_count === 1 ? '' : 's'}</span>
                )}
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

// ─── 4. Shops to know: the most-ordered shops, each shown through its own best sellers ─────────────
function ShopPhoto({ src, className = '' }: { src: string | null; className?: string }) {
  // A fixed frame: the photo fills it, whatever its own size, so every card lines up.
  return (
    <span className={`relative block min-h-0 overflow-hidden bg-stone-100 ${className}`}>
      {src
        ? <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
        : <span className="absolute inset-0 flex items-center justify-center text-stone-300"><Package className="w-6 h-6" /></span>}
    </span>
  );
}

function ShopCard({ shop }: { shop: FeaturedShop }) {
  const [main, second, third] = shop.products;
  const place = [shop.city, shop.province].filter(Boolean).join(', ');
  const initials = shop.shop_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <Link to={`/shop/${shop.shop_slug}`} className="group h-full flex flex-col rounded-2xl bg-white ring-1 ring-stone-200/80 overflow-hidden transition-shadow duration-300 hover:shadow-[0_18px_40px_-20px_rgba(28,25,23,0.35)] hover:ring-stone-300">
      {/* Three of its best sellers in a fixed 3:2 frame */}
      <span className="grid grid-cols-3 grid-rows-2 gap-0.5 h-48 sm:h-52 shrink-0">
        <ShopPhoto src={main?.image_url ?? null} className="col-span-2 row-span-2" />
        <ShopPhoto src={second?.image_url ?? null} />
        <ShopPhoto src={third?.image_url ?? null} />
      </span>

      <span className="flex items-center gap-3 px-4 pt-4">
        {shop.logo_url
          ? <img src={shop.logo_url} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-stone-200 shrink-0" />
          : <span className="w-10 h-10 rounded-full bg-[#1E1B18] text-[#FAF8F5] text-[13px] font-bold flex items-center justify-center shrink-0">{initials}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight text-[#1E1B18] truncate group-hover:text-brand-red transition-colors">{shop.shop_name}</span>
          <span className="block mt-0.5 text-[12px] text-stone-500 truncate">{place || 'Philippines'}</span>
        </span>
      </span>

      {/* Its top seller, by name and price */}
      {main && (
        <span className="mx-4 mt-3 flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="min-w-0 truncate text-stone-600"><span className="text-stone-400">Top pick · </span>{main.name}</span>
          <span className="shrink-0 font-semibold text-stone-900 tabular-nums">{pesoCompact(main.price)}</span>
        </span>
      )}

      <span className="mt-auto mx-4 mb-4 pt-3 border-t border-stone-100 flex items-center gap-x-3 text-[12px] text-stone-500">
        {shop.review_count > 0 && shop.avg_rating !== null && (
          <span className="inline-flex items-center gap-1 text-stone-700"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{shop.avg_rating.toFixed(1)}<span className="text-stone-400">({shop.review_count})</span></span>
        )}
        <span>{shop.product_count} products</span>
        {shop.units_sold > 0 && <span>{shop.units_sold.toLocaleString()} sold</span>}
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-red">Visit shop <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </span>
    </Link>
  );
}

function ShopsToKnow() {
  const [shops, setShops] = useState<FeaturedShop[] | null>(null);

  useEffect(() => {
    let alive = true;
    getFeaturedShopsApi(4).then((s) => { if (alive) setShops(s); }).catch(() => { if (alive) setShops([]); });
    return () => { alive = false; };
  }, []);

  if (shops !== null && shops.length === 0) return null;

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">Shops to know</h2>
          <p className="mt-1 text-[13px] text-stone-500">Local sellers on Loved-IT, shown through what they sell best.</p>
        </div>
        <Link to="/search" className="shrink-0 text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group">
          <span>Browse all products</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {shops === null
          ? Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-2xl ring-1 ring-stone-200/80 overflow-hidden">
              <div className="h-48 sm:h-52 bg-stone-100 animate-pulse" />
              <div className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-stone-100 animate-pulse" /><div className="flex-1 space-y-2"><div className="h-3 w-2/3 rounded bg-stone-100 animate-pulse" /><div className="h-3 w-1/3 rounded bg-stone-100 animate-pulse" /></div></div>
            </div>
          ))
          : shops.map((shop) => <ShopCard key={shop.seller_id} shop={shop} />)}
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
        <BuyingFactsBand />

        {/* Every main category, from the live catalog */}
        <CategoriesSection />

        {/* The most bought, best rated and discounted products */}
        <TrendingSection />

        {/* Shops with the most orders, each shown through its best sellers */}
        <ShopsToKnow />

        {/* The whole catalog, shuffled, 100 at a time */}
        <FeaturedProductsSection />
      </main>

      {/* ── Global Footer ── */}
      <Footer />
    </div>
  );
}
