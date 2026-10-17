import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, X, ShoppingCart, ChevronDown, ChevronRight, User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store, LogOut, Headphones, MessageSquare, Phone, Flame, Tag, Truck, Warehouse, Bike } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useChat } from '../hooks/useChat';
import UserAvatar from './ui/UserAvatar';
import CartModal from './CartModal';
import type { CartItem as ModalCartItem } from './CartModal';
import LovedItLogo from './LovedItLogo';
import { useToast } from './ui/Toast';
import CategoriesMenu, { NAV_PILL } from './storefront/CategoriesMenu';
import { useStorefrontCategories } from '../hooks/useStorefrontCategories';

const SHORTCUTS = ['New Arrivals', 'Best Sellers', 'Sale', 'Track Order'];

type BusinessRow = { key: string; icon: React.ElementType; label: string; to: string; chip?: { text: string; tone: string } };

/** The roles this account can open from the menu, each with where it stands. */
function businessRows(user: NonNullable<ReturnType<typeof useAuth>['user']>): BusinessRow[] {
  const rows: BusinessRow[] = [];
  const seller = user.seller_profile?.application_status ?? 'none';
  const amber = 'bg-amber-50 text-amber-700';
  if (seller === 'approved') rows.push({ key: 'seller', icon: Store, label: 'Seller Center', to: '/seller' });
  else if (seller === 'pending') rows.push({ key: 'seller', icon: Store, label: 'Seller application', to: '/settings', chip: { text: 'In review', tone: amber } });
  else if (seller === 'rejected') rows.push({ key: 'seller', icon: Store, label: 'Seller application', to: '/register/seller', chip: { text: 'Reapply', tone: 'bg-red-50 text-brand-red' } });
  if (user.sorting_center?.status === 'APPROVED') rows.push({ key: 'hub', icon: Warehouse, label: 'Hub dashboard', to: '/hub/dashboard' });
  else if (user.sorting_center?.status === 'PENDING') rows.push({ key: 'hub', icon: Warehouse, label: 'Hub application', to: '/register/hub', chip: { text: 'In review', tone: amber } });
  if (user.logistics_company?.status === 'APPROVED') rows.push({ key: 'courier', icon: Truck, label: 'Courier portal', to: '/logistics' });
  else if (user.logistics_company?.status === 'PENDING') rows.push({ key: 'courier', icon: Truck, label: 'Courier application', to: '/register/courier', chip: { text: 'In review', tone: amber } });
  if (user.rider?.status === 'ACTIVE') rows.push({ key: 'rider', icon: Bike, label: 'Rider app', to: '/rider/dashboard' });
  else if (user.rider?.status === 'PENDING') rows.push({ key: 'rider', icon: Bike, label: 'Rider application', to: '/register/rider', chip: { text: 'In review', tone: amber } });
  return rows;
}

function UserDropdown({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (to: string) => { setOpen(false); navigate(to); };
  const sellerStatus = user.seller_profile?.application_status ?? 'none';
  const business = businessRows(user);

  const shortcuts = [
    { icon: Package, label: 'Orders', to: '/settings/orders' },
    { icon: RotateCcw, label: 'Returns', to: '/settings/returns' },
    { icon: Star, label: 'Reviews', to: '/settings/reviews' },
    { icon: Heart, label: 'Saved', to: '/settings/wishlist' },
  ];
  const links = [
    { icon: User, label: 'Profile and security', to: '/settings' },
    { icon: MapPin, label: 'Address book', to: '/settings/addresses' },
    { icon: XCircle, label: 'Cancellations', to: '/settings/cancellations' },
    { icon: MessageSquare, label: 'Messages', to: '/settings/messages' },
    { icon: Headphones, label: 'Help and safety', to: '/help/safety' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${NAV_PILL} flex items-center gap-2 text-white ${open ? 'before:opacity-100 before:scale-100' : ''}`}
      >
        <UserAvatar firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} size="sm" className="ring-2 ring-white/25" />
        <span className="hidden text-left lg:block text-xs leading-tight">
          <span className="block text-[10.5px] text-white/70 max-w-[120px] truncate">Hi, {user.first_name}</span>
          <span className="block font-bold">Account &amp; Orders</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/80 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 z-50 mt-2.5 top-full w-[320px] overflow-hidden rounded-2xl bg-white border border-stone-200 shadow-[0_24px_60px_-18px_rgba(28,25,23,0.4)]"
          >
            {/* Who is signed in */}
            <button type="button" role="menuitem" onClick={() => go('/settings')} className="flex items-center w-full gap-3 px-4 pt-4 pb-3.5 text-left group">
              <UserAvatar firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} size="md" />
              <span className="flex-1 min-w-0">
                <span className="block font-serif text-[16px] font-bold leading-tight text-[#1E1B18] truncate">{user.first_name} {user.last_name}</span>
                <span className="block text-[12px] text-stone-500 truncate">{user.email}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-600" />
            </button>

            {/* Orders at a glance */}
            <div className="grid grid-cols-4 border-y border-stone-100">
              {shortcuts.map(({ icon: Icon, label, to }) => (
                <button key={to} type="button" role="menuitem" onClick={() => go(to)} className="flex flex-col items-center gap-1.5 py-3 text-stone-600 hover:bg-stone-50 hover:text-brand-red transition-colors">
                  <Icon className="w-5 h-5" strokeWidth={1.6} />
                  <span className="text-[11.5px] font-medium">{label}</span>
                </button>
              ))}
            </div>

            <div className="py-1.5">
              {links.map(({ icon: Icon, label, to }) => (
                <button key={to} type="button" role="menuitem" onClick={() => go(to)} className="flex items-center w-full gap-3 px-4 py-2 text-[13px] text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-colors">
                  <Icon className="w-4 h-4 text-stone-400" strokeWidth={1.8} />
                  {label}
                </button>
              ))}
            </div>

            {/* Businesses this account runs, or the way to start selling */}
            {business.length > 0 ? (
              <div className="py-1.5 border-t border-stone-100">
                <p className="px-4 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] uppercase text-stone-400">Your business</p>
                {business.map(({ key, icon: Icon, label, to, chip }) => (
                  <button key={key} type="button" role="menuitem" onClick={() => go(to)} className="flex items-center w-full gap-3 px-4 py-2 text-[13px] font-medium text-stone-800 hover:bg-stone-50 transition-colors">
                    <Icon className="w-4 h-4 text-brand-red" strokeWidth={1.8} />
                    <span className="flex-1 text-left">{label}</span>
                    {chip ? <span className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${chip.tone}`}>{chip.text}</span> : <ChevronRight className="w-3.5 h-3.5 text-stone-300" />}
                  </button>
                ))}
              </div>
            ) : sellerStatus === 'none' && (
              <button type="button" role="menuitem" onClick={() => go('/register/seller')} className="flex items-center w-full gap-3 px-4 py-3 text-left border-t border-stone-100 bg-[#FAF8F5] hover:bg-stone-100 transition-colors">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-red text-white shrink-0"><Store className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-stone-900">Sell on Loved-IT</span>
                  <span className="block text-[11.5px] text-stone-500">Open a shop with your buyer account</span>
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
            )}

            <div className="border-t border-stone-100">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); clearAuth(); showToast('You are signed out. See you again soon.'); navigate('/'); }}
                className="flex items-center w-full gap-3 px-4 py-3 text-[13px] text-stone-500 hover:text-brand-red hover:bg-red-50/50 transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.8} /> Sign out
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
  const { items, cartOpen, openCart, closeCart, removeItem, updateQty, clearCart } = useCart();
  const { openChat, openChatWithSupport } = useChat();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mobileCategories = useStorefrontCategories();

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  const handleSupportChat = () => {
    if (openChatWithSupport) {
      openChatWithSupport();
    } else if (openChat) {
      openChat();
    }
  };

  // Map cart items to CartModal shape
  const modalItems: ModalCartItem[] = items.map((i) => ({
    id: i.variantId,
    productId: i.productId,
    name: i.name,
    variant: i.variant,
    price: i.price,
    quantity: i.quantity,
    sellerId: i.sellerId,
    image: i.image,
    shopName: i.shopName,
  }));

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {/* ── Top Utility Bar ── */}
      <div className="hidden sm:block text-xs bg-[#121212] border-b border-neutral-800 text-neutral-300">
        <div className="flex items-center justify-between h-8 px-4 sm:px-8 lg:px-12 max-w-[1536px] mx-auto">
          <div className="flex items-center gap-4">
            <Link
              to="/help/safety"
              className="flex items-center gap-1.5 text-neutral-300 hover:text-white transition-colors group"
              title="Trust & Safety Center"
            >
              <Headphones className="w-3.5 h-3.5 text-brand-red group-hover:scale-110 transition-transform" />
              <span className="group-hover:underline">Help &amp; Support</span>
            </Link>
            <span className="text-neutral-700">|</span>
            <nav aria-label="Partner with us" className="flex items-center gap-3">
              <Link to="/partner" className="font-semibold text-neutral-200 hover:text-white hover:underline transition-colors">
                Partner with us
              </Link>
              <Link to="/register/rider" className="hover:text-white hover:underline transition-colors">Become a rider</Link>
              <Link to="/register/hub" className="hover:text-white hover:underline transition-colors">Logistics partner</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={handleSupportChat}
              className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer group"
              title="Open Live Chat"
            >
              <MessageSquare className="w-3.5 h-3.5 text-neutral-400 group-hover:text-brand-red transition-colors" />
              <span className="group-hover:underline">Need help? Chat with us</span>
            </button>
            <span className="text-neutral-700">|</span>
            <div className="flex items-center gap-1.5 text-neutral-400 font-medium select-none" title="Official Customer Care Hotline">
              <Phone className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-neutral-300">+63 2 8123 5678</span>
            </div>
            <span className="text-neutral-700">|</span>
            {user ? (
              <span className="font-semibold text-white">Hi, {user.first_name}</span>
            ) : (
              <div className="flex items-center gap-1.5 font-medium">
                <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
                <span className="text-neutral-700">/</span>
                <Link to="/register" className="hover:text-white transition-colors">Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Primary Navigation (Crimson Header) ── */}
      <header className="sticky top-0 z-40 shadow-sm bg-brand-red">
        <div className="flex items-center h-16 sm:h-[70px] gap-3 sm:gap-6 px-4 sm:px-8 lg:px-12 max-w-[1536px] mx-auto">
          <Link to="/" className="flex items-center shrink-0 py-1" title="Loved-IT">
            <LovedItLogo
              variant="dark"
              type="full"
              size="custom"
              imgClassName="h-9 sm:h-11 object-contain hover:opacity-95 transition-opacity"
            />
          </Link>

          <CategoriesMenu />

          {/* Large Pill Search Field */}
          <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-auto relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for products, brands and more"
              className="w-full h-10 sm:h-11 pl-5 pr-11 text-xs sm:text-sm rounded-full bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-xs"
            />
            <button
              type="submit"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-brand-red hover:bg-gray-100 transition-colors"
              title="Search"
            >
              <Search className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </form>

          {/* Right utility items */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <div className="hidden sm:block">
                <UserDropdown user={user} />
              </div>
            ) : (
              <Link
                to="/login"
                className={`${NAV_PILL} hidden sm:flex items-center gap-2 text-white hover:text-white/90 transition-colors group`}
              >
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="text-left text-xs leading-tight">
                  <span className="block font-bold">My Account</span>
                  <span className="block text-[10.5px] text-white/70">Sign In / Register</span>
                </div>
              </Link>
            )}

            {/* Cart Button */}
            <button
              onClick={openCart}
              className={`${NAV_PILL} flex items-center gap-2 text-white hover:text-white/90 transition-colors group`}
              title="View Cart"
            >
              <div className="relative">
                <ShoppingCart className="w-6 h-6 group-hover:scale-105 transition-transform" />
                {totalCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-amber-400 text-brand-black text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                    {totalCount > 99 ? '99+' : totalCount}
                  </span>
                )}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <span className="block font-bold">My Cart</span>
                <span className="block text-[10.5px] text-amber-300 font-semibold">{totalCount} item{totalCount === 1 ? '' : 's'}</span>
              </div>
            </button>

            {/* Mobile hamburger */}
            <button
              className="sm:hidden text-white p-1 min-h-[40px] min-w-[40px] flex items-center justify-center"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* ── Secondary Navigation (Clean White Row) ── */}
        <div className="hidden sm:block bg-white border-b border-gray-100 shadow-2xs">
          <div className="flex items-center justify-center gap-8 md:gap-14 px-4 sm:px-8 lg:px-12 mx-auto max-w-[1536px] h-10">
            <Link
              to="/search?sort=newest"
              className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-brand-red transition-colors group"
            >
              <Star className="w-3.5 h-3.5 text-brand-red group-hover:scale-110 transition-transform" />
              <span>New Arrivals</span>
            </Link>
            <Link
              to="/search?sort=best_selling"
              className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-brand-red transition-colors group"
            >
              <Flame className="w-3.5 h-3.5 text-brand-red group-hover:scale-110 transition-transform" />
              <span>Best Sellers</span>
            </Link>
            <Link
              to="/search?on_sale=true"
              className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-brand-red transition-colors group"
            >
              <Tag className="w-3.5 h-3.5 text-brand-red group-hover:scale-110 transition-transform" />
              <span>Sale</span>
            </Link>
            <Link
              to="/settings/orders"
              className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:text-brand-red transition-colors group"
            >
              <Truck className="w-3.5 h-3.5 text-brand-red group-hover:scale-110 transition-transform" />
              <span>Track Order</span>
            </Link>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="flex flex-col gap-3 px-4 py-4 border-t sm:hidden bg-brand-red-dark border-white/10">
            <div className="flex">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products…"
                className="flex-1 h-10 px-4 text-sm border-0 rounded-l-lg focus:outline-none text-brand-black"
              />
              <button onClick={() => handleSearch()} className="h-10 px-4 text-white rounded-r-lg bg-brand-black">
                <Search className="w-4 h-4" />
              </button>
            </div>
            {SHORTCUTS.map((s) => (
              <button key={s} className="py-1 text-sm text-left text-white/90">{s}</button>
            ))}
            {mobileCategories && mobileCategories.length > 0 && (
              <div className="flex flex-col gap-1 pt-3 border-t border-white/10">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Categories</p>
                <div className="grid grid-cols-2 gap-x-3">
                  {mobileCategories.map((c) => (
                    <Link key={c.id} to={`/category/${c.slug}`} className="py-1 text-sm text-white/90 truncate" onClick={() => setMenuOpen(false)}>{c.name}</Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 pt-3 border-t border-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Partner with us</p>
              <Link to="/partner" className="py-1 text-sm font-semibold text-white" onClick={() => setMenuOpen(false)}>Partner with us</Link>
              <Link to="/register/rider" className="py-1 text-sm text-white/90" onClick={() => setMenuOpen(false)}>Become a rider</Link>
              <Link to="/register/hub" className="py-1 text-sm text-white/90" onClick={() => setMenuOpen(false)}>Logistics partner</Link>
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t border-white/10">
              {user ? (
                <>
                  <div className="flex items-center gap-2.5 px-1">
                    <UserAvatar firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-white">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-white/60">{user.email}</p>
                    </div>
                  </div>
                  <Link to="/settings" className="py-1 text-sm text-white/80" onClick={() => setMenuOpen(false)}>Settings</Link>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-semibold text-white" onClick={() => setMenuOpen(false)}>Login</Link>
                  <Link to="/register" className="text-sm font-semibold text-white" onClick={() => setMenuOpen(false)}>Sign Up</Link>
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
        onUpdateQty={updateQty}
        onClear={clearCart}
      />
    </>
  );
}
