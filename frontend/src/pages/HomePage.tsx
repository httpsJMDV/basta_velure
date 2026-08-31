import { Link, useNavigate } from 'react-router-dom';
import { Truck, Banknote, ShieldCheck, BadgeCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import HeroCarousel from '../components/HeroCarousel';
import SiteHeader from '../components/SiteHeader';
import ProductCard from '../components/ui/ProductCard';
import { CATEGORY_TREE } from '../data/categories';
import { getProductsApi } from '../api/client';
import type { Product } from '../types';

const TRUST_ITEMS = [
  { icon: Truck,       label: 'Free Shipping',     sub: 'On orders over ₱500' },
  { icon: Banknote,    label: 'Cash on Delivery',  sub: 'Pay when it arrives' },
  { icon: ShieldCheck, label: 'Buyer Protection',  sub: '100% secure checkout' },
  { icon: BadgeCheck,  label: 'Verified Sellers',  sub: 'Admin-approved only' },
];

function TrustStrip() {
  return (
    <section className="bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TRUST_ITEMS.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-brand-red" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-black">{label}</p>
              <p className="text-xs text-gray-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100"
    >
      <div className="aspect-square bg-gray-100 animate-pulse" />
      <div className="p-3 flex flex-col gap-1">
        <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-1/3 mt-1" />
      </div>
    </motion.div>
  );
}

function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProductsApi({ sort: 'best_selling' as never, per_page: 8, page: 1 })
      .then((res) => setProducts(res.data.slice(0, 8)))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="max-w-7xl mx-auto w-full px-4 pt-10 pb-4">
      <FadeInSection delay={0.05}>
        <h2 className="text-lg font-bold text-brand-black mb-5">Featured Products</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} index={i} />)
            : products.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                >
                  <ProductCard product={p} />
                </motion.div>
              ))
          }
        </div>
      </FadeInSection>
    </section>
  );
}

function DailyDiscoveries() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getProductsApi({ sort: 'random' as never, per_page: 48, page: 1 })
      .then((res) => { setProducts(res.data); setLastPage(res.meta.last_page); })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    getProductsApi({ sort: 'random' as never, per_page: 48, page: next })
      .then((res) => { setProducts((prev) => [...prev, ...res.data]); setPage(next); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  const atEnd = page >= lastPage;

  return (
    <section className="max-w-7xl mx-auto w-full px-4 pb-6">
      <FadeInSection delay={0.05}>
        <h2 className="text-lg font-bold text-brand-black mb-5">Daily Discoveries</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => <ProductSkeleton key={i} index={i} />)
            : products.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <ProductCard product={p} />
                </motion.div>
              ))
          }
          {loadingMore && Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={`more-${i}`} index={i} />)}
        </div>

        {!loading && !atEnd && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="min-h-[44px] px-8 bg-white border border-gray-200 text-brand-black text-sm font-semibold rounded-lg hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </FadeInSection>
    </section>
  );
}

function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-gray-soft flex flex-col">
      <SiteHeader />

      {/* ── Hero Carousel ── */}
      <HeroCarousel />

      {/* ── Categories ── */}
      <section className="max-w-7xl mx-auto w-full px-4 py-10">
        <FadeInSection>
          <h2 className="text-lg font-bold text-brand-black mb-5">Shop by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {CATEGORY_TREE.map((cat, i) => (
              <motion.button
                key={cat.id}
                onClick={() => navigate(`/category/${cat.id}`)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="bg-white rounded-2xl p-4 text-center text-sm font-medium text-brand-black hover:border-brand-red hover:border border border-gray-100 shadow-sm transition-all min-h-[44px] flex items-center justify-center"
              >
                <span className="leading-snug">{cat.label}</span>
              </motion.button>
            ))}
          </div>
        </FadeInSection>
      </section>

      {/* ── Trust Strip ── */}
      <TrustStrip />

      {/* ── Featured Products ── */}
      <FeaturedProducts />

      {/* ── Daily Discoveries ── */}
      <DailyDiscoveries />

      {/* ── Wanna See More ── */}
      <div className="max-w-7xl mx-auto w-full px-4 pb-16 text-center">
        <p className="text-base font-semibold text-brand-black">Wanna See More?</p>
        <p className="text-sm text-gray-400 mt-1">Explore thousands of products across all categories.</p>
        <button
          onClick={() => navigate('/search')}
          className="mt-4 min-h-[44px] px-8 bg-brand-red text-white text-sm font-semibold rounded-lg hover:bg-brand-red-dark transition-colors"
        >
          Browse All Products
        </button>
      </div>

      {/* ── Footer ── */}
      <footer className="bg-brand-black text-white mt-auto">
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

    </div>
  );
}
