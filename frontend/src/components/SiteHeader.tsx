import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, X, ShoppingCart, ChevronDown, User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import UserAvatar from './ui/UserAvatar';
import CartModal from './CartModal';
import type { CartItem as ModalCartItem } from './CartModal';

const SHORTCUTS = ['New Arrivals', 'Best Sellers', 'Sale', 'Track Order'];

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

  const sellerStatus = user.seller_profile?.application_status ?? 'none';

  const staticItems = [
    { icon: User,      label: 'Manage Account',            to: '/settings' },
    { icon: MapPin,    label: 'Address Book',               to: '/settings/addresses' },
    { icon: Package,   label: 'My Orders',                  to: '/settings/orders' },
    { icon: RotateCcw, label: 'My Returns',                 to: '/settings/returns' },
    { icon: XCircle,   label: 'My Cancellations',           to: '/settings/cancellations' },
    { icon: Star,      label: 'My Reviews',                 to: '/settings/reviews' },
    { icon: Heart,     label: 'Wishlist & Followed Stores', to: '/settings/wishlist' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors text-sm font-medium"
      >
        <UserAvatar firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} size="sm" />
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
            <div className="px-4 py-3.5 bg-gradient-to-br from-brand-red to-brand-red-dark">
              <p className="text-white font-semibold text-sm">{user.first_name} {user.last_name}</p>
              <p className="text-white/70 text-xs truncate mt-0.5">{user.email}</p>
            </div>
            <div className="py-1.5">
              {staticItems.map(({ icon: Icon, label, to }) => (
                <button
                  key={to}
                  onClick={() => { navigate(to); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-gray-mid hover:bg-gray-50 transition-colors"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
              {sellerStatus === 'none' && (
                <button onClick={() => { navigate('/register/seller'); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-red font-semibold hover:bg-red-50 transition-colors">
                  <Store className="w-4 h-4 shrink-0" /> Sell in Velure
                </button>
              )}
              {sellerStatus === 'pending' && (
                <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed select-none">
                  <Store className="w-4 h-4 shrink-0" /> Seller Application Pending
                </div>
              )}
              {sellerStatus === 'rejected' && (
                <button onClick={() => { navigate('/register/seller'); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-red font-semibold hover:bg-red-50 transition-colors">
                  <Store className="w-4 h-4 shrink-0" /> Reapply as Seller
                </button>
              )}
              {sellerStatus === 'approved' && (
                <button onClick={() => { navigate('/seller'); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-red font-semibold hover:bg-red-50 transition-colors">
                  <Store className="w-4 h-4 shrink-0" /> Check Your Sales
                </button>
              )}
            </div>
            <div className="border-t border-gray-100 py-1.5">
              <button
                onClick={() => { clearAuth(); setOpen(false); navigate('/'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Log Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SiteHeader() {
  const { user } = useAuth();
  const { items, cartOpen, openCart, closeCart, removeItem } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  // Map cart items to CartModal shape
  const modalItems: ModalCartItem[] = items.map((i) => ({
    id: i.variantId,
    productId: i.productId,
    name: i.name,
    variant: i.variant,
    price: i.price,
    quantity: i.quantity,
    image: i.image,
  }));

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {/* Top utility bar */}
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

      {/* Main header */}
      <header className="bg-brand-red shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo1.png" alt="Velure logo" className="w-9 h-9 rounded-full object-cover logo-img-dark" />
            <span className="text-white font-bold text-xl tracking-tight">Velure</span>
          </Link>

          {/* Search — desktop */}
          <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-2xl mx-auto">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, brands, categories…"
              className="flex-1 h-10 px-4 text-sm rounded-l-lg border-0 focus:outline-none text-brand-black"
            />
            <button type="submit" className="h-10 px-5 bg-brand-red-dark text-white text-sm font-semibold rounded-r-lg hover:bg-[#791F1F] transition-colors flex items-center gap-1">
              <Search className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center gap-3 ml-auto sm:ml-0">
            {user && <div className="hidden sm:block"><UserDropdown user={user} /></div>}
            {!user && (
              <div className="hidden sm:flex items-center gap-2">
                <Link to="/login" className="text-white/90 hover:text-white text-sm font-medium transition-colors">Login</Link>
                <span className="text-white/30">|</span>
                <Link to="/register" className="text-white/90 hover:text-white text-sm font-medium transition-colors">Sign Up</Link>
              </div>
            )}
            <button
              onClick={openCart}
              className="text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center relative"
            >
              <ShoppingCart className="w-6 h-6" />
              {totalCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-white text-brand-red text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalCount > 99 ? '99+' : totalCount}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products…"
                className="flex-1 h-10 px-4 text-sm rounded-l-lg border-0 focus:outline-none text-brand-black"
              />
              <button onClick={() => handleSearch()} className="h-10 px-4 bg-brand-black text-white rounded-r-lg">
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
                    <UserAvatar firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} size="sm" />
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

      <CartModal
        open={cartOpen}
        onClose={closeCart}
        items={modalItems}
        onRemove={removeItem}
      />
    </>
  );
}
