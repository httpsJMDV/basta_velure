import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Menu, X, ShoppingCart, ChevronDown, ChevronRight, User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store, LogOut, Headphones, MessageSquare, Phone, Truck, Warehouse, Bike } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useChat } from '../hooks/useChat';
import UserAvatar from './ui/UserAvatar';
import CartModal from './CartModal';
import LovedItLogo from './LovedItLogo';
import { useToast } from './ui/Toast';
import CategoriesMenu, { NAV_PILL } from './storefront/CategoriesMenu';
import { useStorefrontCategories } from '../hooks/useStorefrontCategories';
import NotificationBell from './notifications/NotificationBell';

/** The white row under the red bar (and the phone menu). */
const NAV_LINKS: { label: string; to: string; accent?: boolean }[] = [
  { label: 'New Arrivals', to: '/search?sort=newest' },
  { label: 'Best Sellers', to: '/search?sort=best_selling' },
  { label: 'Sale', to: '/search?on_sale=true', accent: true },
  { label: 'Track Order', to: '/settings/orders' },
];

/** The ways to work with Loved-IT, in the dark strip at the very top. */
const PARTNER_LINKS = [
  { label: 'Sell on Loved-IT', to: '/register/seller' },
  { label: 'Become a rider', to: '/register/rider' },
  { label: 'Partner with us', to: '/partner' },
];

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
  if (user.rider?.status === 'ACTIVE' || user.rider?.status === 'SUSPENDED') rows.push({ key: 'rider', icon: Bike, label: 'Rider app', to: '/rider/dashboard' });
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
  const { count: totalCount, cartOpen, openCart, closeCart } = useCart();
  const { openChat, openChatWithSupport } = useChat();
  const navigate = useNavigate();
  const location = useLocation();
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



  const here = location.pathname + location.search;
  const quickCategories = (mobileCategories ?? []).filter((c) => c.slug !== 'others').slice(0, 4);

  return (
    <>
      {/* ── Top strip: help on the left, ways to work with Loved-IT on the right ── */}
      <div className="hidden sm:block bg-[#1E1B18] text-stone-300 text-[12px]">
        <div className="flex items-center justify-between h-8 px-4 sm:px-8 lg:px-12 max-w-[1536px] mx-auto">
          <div className="flex items-center gap-5">
            <Link to="/help/safety" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
              <Headphones className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
              Help center
            </Link>
            <button type="button" onClick={handleSupportChat} className="inline-flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer">
              <MessageSquare className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
              Chat with us
            </button>
            <span className="hidden md:inline-flex items-center gap-1.5 text-stone-400 tabular-nums select-none" title="Customer care hotline">
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
              +63 2 8123 5678
            </span>
          </div>
          <nav aria-label="Work with Loved-IT" className="flex items-center divide-x divide-white/10">
            {PARTNER_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="px-3 last:pr-0 hover:text-white transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </div>

      {/* ── The red bar: logo, categories, search, account and cart ── */}
      <header className="sticky top-0 z-40 bg-brand-red shadow-[0_1px_0_rgba(0,0,0,0.08)]">
        <div className="flex items-center h-16 sm:h-[68px] gap-3 sm:gap-5 px-4 sm:px-8 lg:px-12 max-w-[1536px] mx-auto">
          <Link to="/" className="flex items-center shrink-0 py-1" title="Loved-IT">
            <LovedItLogo
              variant="dark"
              type="full"
              size="custom"
              imgClassName="h-9 sm:h-11 object-contain hover:opacity-95 transition-opacity"
            />
          </Link>

          <CategoriesMenu />

          <form onSubmit={handleSearch} role="search" className="flex-1 min-w-0 max-w-[720px] mx-auto">
            <div className="flex items-center h-10 sm:h-11 rounded-full bg-white pl-4 pr-1 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.55)] focus-within:ring-2 focus-within:ring-white/70 transition-shadow">
              <Search className="hidden sm:block w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for products, brands and more"
                aria-label="Search Loved-IT"
                className="flex-1 min-w-0 h-full px-0 sm:px-3 bg-transparent text-[13px] sm:text-sm text-stone-800 placeholder-stone-400 focus:outline-none"
              />
              <button
                type="submit"
                title="Search"
                className="h-8 sm:h-9 px-3 sm:px-5 rounded-full bg-[#1E1B18] hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Search className="w-4 h-4 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>
          </form>

          {/* Account and cart */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {user && <NotificationBell variant="storefront" />}
            <span className="hidden sm:block w-px h-7 mx-1 bg-white/20" aria-hidden="true" />
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

        {/* ── The white row: shortcuts, then a few categories on wide screens ── */}
        <nav aria-label="Shop" className="hidden sm:block bg-white border-b border-stone-200/80">
          <div className="flex items-center h-11 gap-1 px-4 sm:px-8 lg:px-12 mx-auto max-w-[1536px] overflow-hidden whitespace-nowrap">
            {NAV_LINKS.map((l) => {
              const active = here === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? 'page' : undefined}
                  className={`relative h-full inline-flex items-center px-3 first:pl-0 text-[13px] font-medium transition-colors after:absolute after:left-3 first:after:left-0 after:right-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-red after:transition-opacity ${
                    active ? 'after:opacity-100 text-stone-900' : 'after:opacity-0 hover:after:opacity-100'
                  } ${l.accent ? 'text-brand-red' : active ? '' : 'text-stone-600 hover:text-stone-900'}`}
                >
                  {l.label}
                </Link>
              );
            })}
            {quickCategories.length > 0 && (
              <>
                <span className="hidden xl:block w-px h-4 mx-3 bg-stone-200" aria-hidden="true" />
                {quickCategories.map((c) => (
                  <Link key={c.id} to={`/category/${c.slug}`} className="hidden xl:inline-flex h-full items-center px-3 text-[13px] text-stone-500 hover:text-stone-900 transition-colors">
                    {c.name}
                  </Link>
                ))}
              </>
            )}
          </div>
        </nav>

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
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="py-1 text-sm text-white/90" onClick={() => setMenuOpen(false)}>{l.label}</Link>
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Work with Loved-IT</p>
              {PARTNER_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="py-1 text-sm text-white/90" onClick={() => setMenuOpen(false)}>{l.label}</Link>
              ))}
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

      <CartModal open={cartOpen} onClose={closeCart} />
    </>
  );
}
