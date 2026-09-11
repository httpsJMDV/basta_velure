import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Truck,
  Banknote,
  ShieldCheck,
  BadgeCheck,
  ChevronRight,
  ChevronLeft,
  Star,
  ShoppingCart,
  Check,
  ArrowRight,
} from 'lucide-react';

import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import HeroCarousel from '../components/HeroCarousel';
import ProductCard from '../components/ui/ProductCard';
import { useCart } from '../hooks/useCart';
import { getProductsApi } from '../api/client';
import type { Product } from '../types';

// Category Studio Cutout Images (Pure White / Transparent Backgrounds)
import techGadgetsImg from '../assets/categories/tech-gadgets.png';
import homeLivingImg from '../assets/categories/home-living.png';
import fashionImg from '../assets/categories/fashion.png';
import beautyImg from '../assets/categories/beauty-wellness.png';
import sportsImg from '../assets/categories/sports-outdoors.png';
import foodImg from '../assets/categories/food-grocery.png';

// Trending Products Studio Images
import headphonesImg from '../assets/products/trending/wireless-headphones.jpg';
import smartwatchImg from '../assets/products/trending/smartwatch.jpg';
import sneakersImg from '../assets/products/trending/casual-sneakers.jpg';
import serumImg from '../assets/products/trending/face-serum.jpg';

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

// ─── 2. Categories Data & Horizontal Scrollable Carousel ───────────────────────
const CATEGORIES = [
  {
    id: 'tech',
    name: 'Tech & Gadgets',
    image: techGadgetsImg,
    to: '/search?category=tech-gadgets',
  },
  {
    id: 'home',
    name: 'Home & Living',
    image: homeLivingImg,
    to: '/search?category=home-living',
  },
  {
    id: 'fashion',
    name: 'Fashion',
    image: fashionImg,
    to: '/search?category=fashion-apparel',
  },
  {
    id: 'beauty',
    name: 'Beauty & Wellness',
    image: beautyImg,
    to: '/search?category=beauty-wellness',
  },
  {
    id: 'sports',
    name: 'Sports & Outdoors',
    image: sportsImg,
    to: '/search?category=sports-outdoors',
  },
  {
    id: 'grocery',
    name: 'Food & Grocery',
    image: foodImg,
    to: '/search?category=food-grocery',
  },
];

function CategoriesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -320 : 320;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14">
      {/* Header with Title and View All */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
          Shop by Category
        </h2>
        <div className="flex items-center gap-3">
          <Link
            to="/search"
            className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group"
          >
            <span>View all categories</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          {/* Navigation arrow buttons */}
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <button
              onClick={() => scroll('left')}
              title="Scroll left"
              className="w-8 h-8 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 hover:text-brand-red flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              title="Scroll right"
              className="w-8 h-8 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 hover:text-brand-red flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Categories Row / Scrollable Carousel without scrollbar */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-4 sm:gap-5 overflow-x-auto pb-2 scrollbar-none no-scrollbar scroll-smooth"
      >
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            to={cat.to}
            className="group flex-1 min-w-[210px] sm:min-w-[230px] lg:min-w-0 bg-stone-50/70 hover:bg-white border border-stone-200 hover:border-brand-red/50 rounded-2xl p-3 sm:p-4 shadow-2xs hover:shadow-md transition-all duration-300 flex items-center gap-3.5"
          >
            {/* Image cleanly isolated on pure white with anti-drag protection */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center shrink-0 relative select-none">
              <img
                src={cat.image}
                alt={cat.name}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                className="w-full h-full object-contain select-none protected-image no-save group-hover:scale-110 transition-transform duration-300"
              />
              <div
                className="absolute inset-0 bg-transparent select-none z-10"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
            </div>
            {/* Category Title */}
            <span className="text-sm sm:text-[15px] font-semibold text-[#2B2825] group-hover:text-brand-red transition-colors leading-snug">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── 3. Trending Now (Horizontal Cards matching user's media attachment) ────────
interface TrendingProduct {
  id: string;
  name: string;
  badge: string;
  price: number;
  originalPrice: number;
  rating: number;
  image: string;
  productId: number;
  variantId: number;
}

const TRENDING_PRODUCTS: TrendingProduct[] = [
  {
    id: 'tp-1',
    name: 'boAt Rockerz 550 Wireless Headphones',
    badge: '20% OFF',
    price: 1599,
    originalPrice: 1999,
    rating: 4.6,
    image: headphonesImg,
    productId: 101,
    variantId: 1001,
  },
  {
    id: 'tp-2',
    name: 'Fire-Boltt Ninja Pro Max Smartwatch',
    badge: '15% OFF',
    price: 1699,
    originalPrice: 1999,
    rating: 4.5,
    image: smartwatchImg,
    productId: 102,
    variantId: 1002,
  },
  {
    id: 'tp-3',
    name: "Red Tape Men's Casual Sneakers",
    badge: '25% OFF',
    price: 1874,
    originalPrice: 2499,
    rating: 4.4,
    image: sneakersImg,
    productId: 103,
    variantId: 1003,
  },
  {
    id: 'tp-4',
    name: 'Minimalist 2% Salicylic Acid Face Serum',
    badge: '10% OFF',
    price: 359,
    originalPrice: 399,
    rating: 4.7,
    image: serumImg,
    productId: 104,
    variantId: 1004,
  },
];

function TrendingSection() {
  const { addItem } = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleAddToCart = (e: React.MouseEvent, item: TrendingProduct) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      variantId: item.variantId,
      productId: item.productId,
      name: item.name,
      variant: 'Standard',
      price: item.price,
      quantity: 1,
      image: item.image,
    });
    setAddedId(item.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (trackRef.current) {
      const amount = direction === 'left' ? -380 : 380;
      trackRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Combine products for continuous smooth marquee effect
  const displayProducts = [...TRENDING_PRODUCTS, ...TRENDING_PRODUCTS, ...TRENDING_PRODUCTS];

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
          Trending now
        </h2>
        <div className="flex items-center gap-3">
          <Link
            to="/search?sort=trending"
            className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group"
          >
            <span>View all</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          {/* Arrow navigation buttons */}
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <button
              onClick={() => scroll('left')}
              title="Scroll left"
              className="w-8 h-8 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 hover:text-brand-red flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              title="Scroll right"
              className="w-8 h-8 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 hover:text-brand-red flex items-center justify-center shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Outer wrapper with subtle relative arrows for direct edge clicks */}
      <div className="relative group/carousel">
        {/* Floating side arrows */}
        <button
          onClick={() => scroll('left')}
          title="Scroll previous"
          className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white hover:bg-stone-50 text-brand-red border border-stone-200/80 shadow-md items-center justify-center z-20 opacity-0 group-hover/carousel:opacity-100 transition-opacity active:scale-90 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-brand-red" />
        </button>
        <button
          onClick={() => scroll('right')}
          title="Scroll next"
          className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white hover:bg-stone-50 text-brand-red border border-stone-200/80 shadow-md items-center justify-center z-20 opacity-0 group-hover/carousel:opacity-100 transition-opacity active:scale-90 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5 text-brand-red" />
        </button>

        {/* Scroll Track with Auto-scroll Marquee animation (NO scrollbar visible!) */}
        <div
          ref={trackRef}
          className="flex gap-5 overflow-x-auto pb-2 scrollbar-none no-scrollbar scroll-smooth items-stretch"
        >
          <div className="flex gap-5 animate-marquee-slow hover:[animation-play-state:paused] shrink-0">
            {displayProducts.map((p, idx) => (
              <div
                key={`${p.id}-${idx}`}
                className="w-[340px] sm:w-[390px] bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-4 sm:p-5 shadow-xs hover:shadow-lg hover:border-brand-red/30 transition-all duration-300 relative shrink-0 flex items-center gap-4 group cursor-pointer select-none"
              >
                {/* Discount Badge */}
                <span className="absolute top-3 left-3 bg-[#B91C1C] text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-md shadow-2xs z-10">
                  {p.badge}
                </span>

                {/* Left: Product Image on Pure White Background with Anti-Drag */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 relative mt-2">
                  <img
                    src={p.image}
                    alt={p.name}
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    className="w-full h-full object-contain select-none protected-image no-save group-hover:scale-105 transition-transform duration-300"
                  />
                  <div
                    className="absolute inset-0 bg-transparent select-none z-10"
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                  />
                </div>

                {/* Right: Product Details */}
                <div className="flex-1 flex flex-col justify-between h-full min-w-0 pr-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-brand-red transition-colors">
                    {p.name}
                  </h3>

                  {/* Price Row */}
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-base sm:text-lg font-bold text-brand-red">
                      ₱{p.price.toLocaleString()}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-400 line-through">
                      ₱{p.originalPrice.toLocaleString()}
                    </span>
                  </div>

                  {/* Star Rating & Cart Button Row */}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-stone-100">
                    <div className="flex items-center gap-1">
                      <div className="flex items-center text-amber-400">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400"
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-500 font-medium ml-1">
                        ({p.rating})
                      </span>
                    </div>

                    {/* Red Cart Action Button */}
                    <button
                      onClick={(e) => handleAddToCart(e, p)}
                      title="Add to cart"
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-red hover:bg-[#801818] text-white flex items-center justify-center shadow-xs active:scale-90 transition-all cursor-pointer"
                    >
                      {addedId === p.id ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : (
                        <ShoppingCart className="w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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

// ─── 5. Featured Products Grid (Live database products) ─────────────────────────
function FeaturedProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getProductsApi()
      .then((res) => {
        if (mounted && res?.data) {
          setProducts(res.data.slice(0, 10));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 pb-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1B18] tracking-tight">
            Discover More Products
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Freshly added merchandise from accredited community stores
          </p>
        </div>
        <Link
          to="/search"
          className="text-xs sm:text-sm font-bold text-brand-red hover:underline flex items-center gap-1 group"
        >
          <span>Explore all</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
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
        {/* Trust Benefits Strip (Sleeker height, longer horizontal span) */}
        <TrustBenefitsStrip />

        {/* Shop by Category (Pure White Background, Navigation Arrows & Isolated Images) */}
        <CategoriesSection />

        {/* Trending Now (Bigger Cards with Discounts, Ratings, Cart Button, & Auto-Scroll without scrollbars) */}
        <TrendingSection />

        {/* Campaign Banner (With Random Star Diamonds and Sleeker Proportions) */}
        <CampaignCtaBanner />

        {/* Live Marketplace Products Grid */}
        <FeaturedProductsSection />
      </main>

      {/* ── Global Footer ── */}
      <Footer />
    </div>
  );
}
