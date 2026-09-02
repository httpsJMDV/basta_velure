import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getAdminStatsApi, getBuyerApplicationsApi } from '../../api/client';
import {
  Users, Store, ShoppingBag,
  ShieldAlert, Star, Flag, Settings, ScrollText,
  Menu, UserCheck, Bike, Tag, LogOut, MessageSquare, ChevronRight,
  Bell, CircleUser, PanelLeft, PackageCheck, Wallet, Gauge,
} from 'lucide-react';
import { useState, useEffect, createContext, useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Conversation } from '../../types';

// ─── Context ──────────────────────────────────────────────────────────────────

interface MessengerCtx { openThread: (c: Conversation) => void; }
const MessengerContext = createContext<MessengerCtx>({ openThread: () => {} });
export const useMessenger = () => useContext(MessengerContext);

// ─── Breadcrumb map ───────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/admin':                        'Dashboard',
  '/admin/messages':               'Messages',
  '/admin/buyer-applications':     'Buyer Applications',
  '/admin/seller-applications':    'Seller Applications',
  '/admin/rider-applications':     'Rider Applications',
  '/admin/sellers':                'Sellers',
  '/admin/buyers':                 'Buyers',
  '/admin/riders':                 'Riders',
  '/admin/categories':             'Categories',
  '/admin/products':               'Products',
  '/admin/orders':                 'Orders',
  '/admin/payments':               'Payments & Payouts',
  '/admin/disputes':               'Disputes / Returns',
  '/admin/reviews':                'Reviews',
  '/admin/reports':                'Reports',
  '/admin/settings':               'Platform Settings',
  '/admin/activity-log':           'Activity Log',
};

function useBreadcrumb() {
  const location = useLocation();
  // exact match first, then longest prefix
  if (ROUTE_LABELS[location.pathname]) return ROUTE_LABELS[location.pathname];
  const match = Object.keys(ROUTE_LABELS)
    .filter((k) => k !== '/admin' && location.pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : 'Admin';
}

// ─── Nav data ─────────────────────────────────────────────────────────────────

interface NavItem  { icon: React.ElementType; label: string; to: string; badge?: number; }
interface NavGroup { heading: string; items: NavItem[]; }

function buildNav(pendingSellers: number, pendingBuyers: number): NavGroup[] {
  return [
    {
      heading: 'Overview',
      items: [
        { icon: Gauge, label: 'Dashboard', to: '/admin' },
        { icon: MessageSquare, label: 'Messages', to: '/admin/messages' },
      ],
    },
    {
      heading: 'People',
      items: [
        { icon: UserCheck,   label: 'Buyer Applications',  to: '/admin/buyer-applications',  badge: pendingBuyers },
        { icon: UserCheck,   label: 'Seller Applications', to: '/admin/seller-applications', badge: pendingSellers },
        { icon: Bike,        label: 'Rider Applications',  to: '/admin/rider-applications' },
        { icon: Store,       label: 'Sellers',             to: '/admin/sellers' },
        { icon: Users,       label: 'Buyers',              to: '/admin/buyers' },
        { icon: CircleUser,  label: 'Riders',              to: '/admin/riders' },
      ],
    },
    {
      heading: 'Catalog',
      items: [
        { icon: Tag,          label: 'Categories', to: '/admin/categories' },
        { icon: ShoppingBag,  label: 'Products',   to: '/admin/products' },
      ],
    },
    {
      heading: 'Commerce',
      items: [
        { icon: PackageCheck, label: 'Orders',             to: '/admin/orders' },
        { icon: Wallet,       label: 'Payments & Payouts', to: '/admin/payments' },
        { icon: ShieldAlert,  label: 'Disputes / Returns', to: '/admin/disputes' },
        { icon: Flag,         label: 'Analytics & Reports',to: '/admin/reports' },
      ],
    },
    {
      heading: 'Trust & Safety',
      items: [
        { icon: Star, label: 'Reviews', to: '/admin/reviews' },
      ],
    },
    {
      heading: 'Settings',
      items: [
        { icon: Settings,   label: 'Platform Settings', to: '/admin/settings' },
        { icon: ScrollText, label: 'Activity Log',      to: '/admin/activity-log' },
      ],
    },
  ];
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────

function NavItems({
  nav,
  collapsed,
  onNavigate,
}: {
  nav: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const isActive = (to: string) =>
    to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(to);

  return (
    <nav
      className="flex-1 px-2 py-2 space-y-3 overflow-y-auto overflow-x-hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {nav.map((group) => (
        <div key={group.heading}>
          {!collapsed && (
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.1em] px-3 mb-1">
              {group.heading}
            </p>
          )}
          {collapsed && <div className="my-1 mx-2 border-t border-white/10" />}
          {group.items.map(({ icon: Icon, label, to, badge }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={[
                  'relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 group',
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                  active ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]',
                ].join(' ')}
              >
                <Icon className="w-[17px] h-[17px] shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && badge !== undefined && badge > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 bg-white text-brand-red text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {badge}
                  </span>
                )}
                {collapsed && badge !== undefined && badge > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const SIDEBAR_BG: React.CSSProperties = { background: '#111111' };

function Sidebar({
  nav,
  collapsed,
  onNavigate,
}: {
  nav: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const userInitials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
    <div className="flex flex-col h-full" style={SIDEBAR_BG}>
      {/* Brand */}
      <div className={`border-b border-white/10 shrink-0 ${collapsed ? 'px-0 py-5 flex justify-center' : 'px-5 py-5'}`}>
        <Link to="/admin" onClick={onNavigate} className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
            <img src="/logo1.png" alt="Velure" className="w-full h-full object-cover rounded-xl" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-white font-bold text-[15px] tracking-tight leading-none">Velure</p>
              <p className="text-white/35 text-[10px] uppercase tracking-[0.1em] mt-0.5">Admin Panel</p>
            </div>
          )}
        </Link>
      </div>

      <NavItems nav={nav} collapsed={collapsed} onNavigate={onNavigate} />

      {/* User card */}
      <div className={`border-t border-white/10 shrink-0 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold">
              {userInitials}
            </div>
            <button
              onClick={() => { clearAuth(); navigate('/login'); }}
              title="Log out"
              className="w-8 h-8 rounded-lg bg-red-500/15 text-white/60 hover:bg-red-500/35 hover:text-white transition-all flex items-center justify-center"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-semibold truncate leading-tight">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-white/40 text-[10px] truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { clearAuth(); navigate('/login'); }}
              title="Log out"
              className="w-7 h-7 rounded-lg bg-red-500/15 text-white/60 hover:bg-red-500/35 hover:text-white transition-all flex items-center justify-center shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

// ─── Top bar Search Modal ───────────────────────────────────────────────────

function AdminSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const searchItems = [
    { label: 'Dashboard Overview', to: '/admin', group: 'Navigation', icon: Gauge },
    { label: 'Messages & Inquiries', to: '/admin/messages', group: 'Navigation', icon: MessageSquare },
    { label: 'Buyer Verification Applications', to: '/admin/buyer-applications', group: 'People', icon: UserCheck },
    { label: 'Seller Store Applications', to: '/admin/seller-applications', group: 'People', icon: UserCheck },
    { label: 'Rider Applications', to: '/admin/rider-applications', group: 'People', icon: Bike },
    { label: 'Manage Sellers Directory', to: '/admin/sellers', group: 'People', icon: Store },
    { label: 'Manage Buyers Directory', to: '/admin/buyers', group: 'People', icon: Users },
    { label: 'Product Catalog & Reviews', to: '/admin/products', group: 'Catalog', icon: ShoppingBag },
    { label: 'Categories Management', to: '/admin/categories', group: 'Catalog', icon: Tag },
    { label: 'Orders & Fulfillment', to: '/admin/orders', group: 'Commerce', icon: PackageCheck },
    { label: 'Payments & Seller Payouts', to: '/admin/payments', group: 'Commerce', icon: Wallet },
    { label: 'Disputes & Return Mediation', to: '/admin/disputes', group: 'Trust & Safety', icon: ShieldAlert },
    { label: 'Customer Reviews Moderation', to: '/admin/reviews', group: 'Trust & Safety', icon: Star },
    { label: 'Platform & Return Policy Settings', to: '/admin/settings', group: 'Settings', icon: Settings },
    { label: 'System Activity Logs', to: '/admin/activity-log', group: 'Settings', icon: ScrollText },
  ];

  const filtered = query.trim()
    ? searchItems.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()) || i.group.toLowerCase().includes(query.toLowerCase()))
    : searchItems;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          <svg className="w-5 h-5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search pages, actions, tools (e.g. Products, Disputes, Settings)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
          />
          <button onClick={onClose} className="text-white/40 hover:text-white text-xs px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            ESC
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-xs text-white/40">No matching admin pages found</p>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  onClick={() => {
                    navigate(item.to);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/10 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/70 group-hover:bg-brand-red group-hover:text-white transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-white">{item.label}</p>
                      <p className="text-[10px] text-white/40">{item.group}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({
  collapsed: _collapsed,
  onToggleSidebar,
  onOpenMobile,
  pendingSellers,
  pendingBuyers,
}: {
  collapsed?: boolean;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  pendingSellers: number;
  pendingBuyers: number;
}) {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const pageLabel = useBreadcrumb();
  const userInitials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Keyboard shortcut for ⌘K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const totalAlerts = pendingSellers + pendingBuyers;

  return (
    <>
      <div
        className="h-14 shrink-0 flex items-center gap-3 px-5 border-b border-white/10 sticky top-0 z-20"
        style={SIDEBAR_BG}
      >
        {/* Hamburger */}
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <PanelLeft className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={onOpenMobile}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>

        {/* Breadcrumb + page title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/30 text-[13px] truncate hidden sm:block">Velure Admin</span>
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0 hidden sm:block" />
          <span className="text-white font-bold text-[16px] truncate">{pageLabel}</span>
        </div>

        {/* Center: search bar */}
        <div className="hidden md:flex flex-1 max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center justify-between bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] rounded-xl px-3.5 py-2 transition-colors text-left group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <span className="text-[13px] text-white/40 group-hover:text-white/60 transition-colors">
                Search users, orders, sellers...
              </span>
            </div>
            <span className="text-[10px] text-white/30 font-mono border border-white/10 rounded px-1.5 py-0.5 shrink-0">⌘K</span>
          </button>
        </div>

        {/* Right: bell + chat + admin info */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0 relative">
          {/* Notification Button */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setUserMenuOpen(false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-[17px] h-[17px]" />
              {totalAlerts > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full ring-2 ring-[#111111]" />
              )}
            </button>

            {/* Notification Popover */}
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <span className="text-xs font-bold text-white">Notifications</span>
                  <span className="text-[10px] bg-brand-red/20 text-red-300 font-bold px-2 py-0.5 rounded-full border border-brand-red/30">
                    {totalAlerts} Action{totalAlerts === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="py-2 space-y-2 max-h-64 overflow-y-auto">
                  {pendingSellers > 0 && (
                    <Link
                      to="/admin/seller-applications"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                        <Store className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white leading-tight">{pendingSellers} Seller Application{pendingSellers > 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-white/50">Pending document verification</p>
                      </div>
                    </Link>
                  )}
                  {pendingBuyers > 0 && (
                    <Link
                      to="/admin/buyer-applications"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white leading-tight">{pendingBuyers} Buyer Verification{pendingBuyers > 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-white/50">Awaiting ID review</p>
                      </div>
                    </Link>
                  )}
                  {totalAlerts === 0 && (
                    <p className="text-center py-6 text-xs text-white/40">No pending administrative alerts</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/admin/messages"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Messages"
          >
            <MessageSquare className="w-[17px] h-[17px]" />
          </Link>

          {/* Admin user dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setUserMenuOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2.5 ml-1 pl-3 border-l border-white/10 hover:opacity-90 transition-opacity"
            >
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-white/25 uppercase tracking-widest leading-none">Admin</p>
                <p className="text-[13px] font-semibold text-white/85 leading-tight mt-0.5 truncate max-w-[120px]">
                  {user?.first_name} {user?.last_name}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-white/10">
                {userInitials}
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-11 w-52 bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-white/10 mb-1">
                  <p className="text-xs font-bold text-white truncate">{user?.first_name} {user?.last_name}</p>
                  <p className="text-[10px] text-white/40 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/admin/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" /> Platform Settings
                </Link>
                <Link
                  to="/admin/activity-log"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                  <ScrollText className="w-3.5 h-3.5" /> Activity Log
                </Link>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    clearAuth();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors mt-1 border-t border-white/10"
                >
                  <LogOut className="w-3.5 h-3.5" /> Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AdminSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

// ─── Page transition ─────────────────────────────────────────────────────────

function PageTransition() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const SIDEBAR_W_EXPANDED = 'w-60';
const SIDEBAR_W_COLLAPSED = 'w-16';
const ML_EXPANDED         = 'lg:ml-60';
const ML_COLLAPSED        = 'lg:ml-16';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingSellers, setPendingSellers] = useState(0);
  const [pendingBuyers,  setPendingBuyers]  = useState(0);

  // Persist sidebar collapse state
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('admin_sidebar_collapsed') === 'true'; }
    catch { return false; }
  });

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('admin_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    getAdminStatsApi()
      .then((s) => setPendingSellers(s.pending_seller_applications))
      .catch(() => {});
    getBuyerApplicationsApi({ status: 'pending', per_page: 1 })
      .then((r) => setPendingBuyers(r.summary?.pending_total ?? 0))
      .catch(() => {});
  }, []);

  const nav = buildNav(pendingSellers, pendingBuyers);

  function openThread(c: Conversation) {
    navigate(`/admin/messages?seller=${c.seller_id}`);
  }

  const sidebarW  = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const mainML    = collapsed ? ML_COLLAPSED : ML_EXPANDED;

  return (
    <MessengerContext.Provider value={{ openThread }}>
      <div className="min-h-screen bg-gray-50 flex">

        {/* ── Desktop sidebar ── */}
        <aside
          className={`hidden lg:flex flex-col ${sidebarW} shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-200`}
          style={SIDEBAR_BG}
        >
          <Sidebar nav={nav} collapsed={collapsed} />
        </aside>

        {/* ── Mobile nav overlay ── */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className={`relative ${SIDEBAR_W_EXPANDED} flex flex-col h-full z-50`} style={SIDEBAR_BG}>
              <Sidebar nav={nav} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* ── Centre: top bar + main content ── */}
        <div className={`flex-1 ${mainML} flex flex-col min-h-screen transition-all duration-200`}>
          <TopBar
            collapsed={collapsed}
            onToggleSidebar={toggleCollapse}
            onOpenMobile={() => setMobileOpen(true)}
            pendingSellers={pendingSellers}
            pendingBuyers={pendingBuyers}
          />
          <main className="flex-1 p-4 lg:p-6">
            <PageTransition />
          </main>
        </div>

      </div>
    </MessengerContext.Provider>
  );
}
