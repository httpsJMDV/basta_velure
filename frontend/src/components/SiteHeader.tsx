import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Menu, X, ShoppingCart, ChevronDown, User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store, LogOut, Headphones, MessageSquare, Phone, Flame, Tag, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useChat } from '../hooks/useChat';
import UserAvatar from './ui/UserAvatar';
import CartModal from './CartModal';
import type { CartItem as ModalCartItem } from './CartModal';
import LovedItLogo from './LovedItLogo';
import { useToast } from './ui/Toast';

const SHORTCUTS = ['New Arrivals', 'Best Sellers', 'Sale', 'Track Order'];

function UserDropdown({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const sellerStatus = user.seller_profile?.application_status ?? 'none';

  const staticItems = [
    { icon: User,      label: 'Manage Account',             to: '/settings' },
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
            className="absolute right-0 z-50 mt-2 overflow-hidden bg-white border border-gray-100 shadow-2xl top-full w-60 rounded-2xl"
          >
            <div className="px-4 py-3.5 bg-gradient-to-br from-brand-red to-brand-red-dark">
              <p className="text-sm font-semibold text-white">{user.first_name} {user.last_name}</p>
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
                  <Store className="w-4 h-4 shrink-0" /> Sell on Loved-IT
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
                onClick={() => { showToast('You have been logged out.', 'success'); clearAuth(); setOpen(false); navigate('/'); }}
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
  const { items, cartOpen, openCart, closeCart, removeItem, updateQty, clearCart } = useCart();
  const { openChat, openChatWithSupport } = useChat();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    image: i.image,
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
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {user ? (
              <div className="hidden sm:block">
                <UserDropdown user={user} />
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden sm:flex items-center gap-2 text-white hover:text-white/90 transition-colors group"
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
              className="flex items-center gap-2 text-white hover:text-white/90 transition-colors py-1 px-1.5 rounded-xl group"
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
