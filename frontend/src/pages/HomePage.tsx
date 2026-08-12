import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import UserAvatar from '../components/ui/UserAvatar';
import { Search, Menu, X, ShoppingCart, ChevronDown, User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store, Settings, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import HeroCarousel from '../components/HeroCarousel';
import CartModal from '../components/CartModal';
import type { CartItem } from '../components/CartModal';

const CATEGORIES = [
  'Dresses & Skirts',
  'Tops & Blouses',
  'Activewear & Yoga Pants',
  'Lingerie & Sleepwear',
  'Jackets & Coats',
  'Shoes & Accessories',
];

const SHORTCUTS = ['New Arrivals', 'Best Sellers', 'Sale', 'Track Order'];

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

function UserDropdown({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { clearAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menuItems = [
    { icon: User, label: 'Manage Account', to: '/settings' },
    { icon: MapPin, label: 'Address Book', to: '/settings/addresses' },
    { icon: Package, label: 'My Orders', to: '/settings/orders' },
    { icon: RotateCcw, label: 'My Returns', to: '/settings/returns' },
    { icon: XCircle, label: 'My Cancellations', to: '/settings/cancellations' },
    { icon: Star, label: 'My Reviews', to: '/settings/reviews' },
    { icon: Heart, label: 'Wishlist & Followed Stores', to: '/settings/wishlist' },
    { icon: Store, label: 'Sell in Velure', to: '/register/seller', highlight: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors text-sm font-medium"
      >
        <UserAvatar
          firstName={user.first_name}
          lastName={user.last_name}
          avatarUrl={user.avatar_url}
          size="sm"
        />
        <span className="hidden sm:block max-w-[120px] truncate">{user.first_name} {user.last_name}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
          >
            {/* Profile header */}
            <div className="px-4 py-3.5 bg-gradient-to-br from-brand-red to-brand-red-dark">
              <p className="text-white font-semibold text-sm">{user.first_name} {user.last_name}</p>
              <p className="text-white/70 text-xs truncate mt-0.5">{user.email}</p>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {menuItems.map(({ icon: Icon, label, to, highlight }) => (
                <button
                  key={to}
                  onClick={() => { navigate(to); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    highlight
                      ? 'text-brand-red font-semibold hover:bg-red-50'
                      : 'text-brand-gray-mid hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-100 py-1.5">
              <button
                onClick={() => { clearAuth(); setOpen(false); navigate('/'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems] = useState<CartItem[]>([]);

  return (
    <div className="min-h-screen bg-brand-gray-soft flex flex-col">

      {/* ── Top utility bar ── */}
      <div className="bg-brand-black text-white text-xs hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 flex justify-end items-center h-8 gap-4">
          <span className="text-white/50">Help &amp; Support</span>
          {user ? (
            <span className="text-white/80">Hi, {user.first_name}</span>
          ) : (
            <>
              <Link to="/register" className="text-white/80 hover:text-white transition-colors">Sign Up</Link>
              <span className="text-white/20">|</span>
              <Link to="/login" className="text-white/80 hover:text-white transition-colors">Login</Link>
            </>
          )}
        </div>
      </div>

      {/* ── Main header ── */}
      <header className="bg-brand-red shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">

          {/* Logo + wordmark */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo1.png" alt="Velure logo" className="w-9 h-9 rounded-full object-cover logo-img-dark" />
            <span className="text-white font-bold text-xl tracking-tight">Velure</span>
          </Link>

          {/* Search bar — desktop */}
          <div className="hidden sm:flex flex-1 max-w-2xl mx-auto">
            <input
              type="search"
              placeholder="Search for dresses, tops, shoes…"
              className="flex-1 h-10 px-4 text-sm rounded-l-lg border-0 focus:outline-none text-brand-black"
            />
            <button className="h-10 px-5 bg-brand-red-dark text-white text-sm font-semibold rounded-r-lg hover:bg-[#791F1F] transition-colors flex items-center gap-1">
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Right icons */}
          <div className="flex items-center gap-3 ml-auto sm:ml-0">
            {/* User dropdown (desktop) */}
            {user && (
              <div className="hidden sm:block">
                <UserDropdown user={user} />
              </div>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center relative"
            >
              <ShoppingCart className="w-6 h-6" />
              {cartItems.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-white text-brand-red text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </button>
            <button
              className="sm:hidden text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Shortcut row — desktop */}
        <div className="hidden sm:block bg-brand-red-dark">
          <div className="max-w-7xl mx-auto px-4 flex gap-6 h-9 items-center">
            {SHORTCUTS.map((s) => (
              <button key={s} className="text-white/90 text-xs font-medium hover:text-white transition-colors whitespace-nowrap">
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden bg-brand-red-dark px-4 py-4 flex flex-col gap-3 border-t border-white/10">
            <div className="flex">
              <input
                type="search"
                placeholder="Search…"
                className="flex-1 h-10 px-4 text-sm rounded-l-lg border-0 focus:outline-none text-brand-black"
              />
              <button className="h-10 px-4 bg-brand-black text-white rounded-r-lg">
                <Search className="w-4 h-4" />
              </button>
            </div>
            {SHORTCUTS.map((s) => (
              <button key={s} className="text-white/90 text-sm text-left py-1">{s}</button>
            ))}
            <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
              {user ? (
                <>
                  <div className="flex items-center gap-2.5 px-1">
                    <UserAvatar
                      firstName={user.first_name}
                      lastName={user.last_name}
                      avatarUrl={user.avatar_url}
                      size="sm"
                    />
                    <div>
                      <p className="text-white text-sm font-semibold">{user.first_name} {user.last_name}</p>
                      <p className="text-white/60 text-xs">{user.email}</p>
                    </div>
                  </div>
                  <Link to="/settings" className="text-white/80 text-sm py-1" onClick={() => setMenuOpen(false)}>Settings</Link>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-white text-sm font-semibold" onClick={() => setMenuOpen(false)}>Login</Link>
                  <Link to="/register" className="text-white text-sm font-semibold" onClick={() => setMenuOpen(false)}>Sign Up</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Hero Carousel ── */}
      <HeroCarousel />

      {/* ── Categories ── */}
      <section className="max-w-7xl mx-auto w-full px-4 py-10">
        <FadeInSection>
          <h2 className="text-lg font-bold text-brand-black mb-5">Shop by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CATEGORIES.map((cat, i) => (
              <motion.button
                key={cat}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                className="bg-white rounded-xl p-4 text-center text-sm font-medium text-brand-black hover:border-brand-red hover:border border border-transparent shadow-sm transition-all min-h-[44px]"
              >
                {cat}
              </motion.button>
            ))}
          </div>
        </FadeInSection>
      </section>

      {/* ── Featured Products ── */}
      <section className="max-w-7xl mx-auto w-full px-4 pb-16">
        <FadeInSection delay={0.05}>
          <h2 className="text-lg font-bold text-brand-black mb-5">Featured Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100"
              >
                <div className="aspect-[3/4] bg-gray-100 animate-pulse" />
                <div className="p-3 flex flex-col gap-1">
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-1/3 mt-1" />
                </div>
              </motion.div>
            ))}
          </div>
        </FadeInSection>
      </section>

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
              Women's fashion delivered to your door. Modern, curated, and made for every occasion.
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
              {['New Arrivals', 'Best Sellers', 'Sale', 'All Categories'].map((l) => (
                <li key={l}><a href="#" className="text-white/50 text-sm hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest">Support</p>
            <ul className="flex flex-col gap-2.5">
              {['Help Center', 'Track My Order', 'Returns & Exchanges', 'Size Guide'].map((l) => (
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
            <p className="text-white/20 text-xs hidden sm:block">Wear Your Everyday Elegance</p>
          </div>
        </div>
      </footer>

      <CartModal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onRemove={() => {}}
      />

    </div>
  );
}
