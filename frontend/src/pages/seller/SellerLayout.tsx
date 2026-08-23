import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Package, PackagePlus, ShoppingCart, Boxes,
  Wallet, BarChart2, MessageSquare, Star, Store, Settings,
  LogOut, Menu, X, ChevronRight, Bell, ShoppingBag,
} from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavItem  { icon: React.ElementType; label: string; to: string; badge?: number; }
interface NavGroup { heading: string; items: NavItem[]; }

function buildSellerNav(badges: { pendingReview: number; newOrders: number; unreadMessages: number }): NavGroup[] {
  return [
    {
      heading: 'Overview',
      items: [{ icon: LayoutDashboard, label: 'Dashboard', to: '/seller' }],
    },
    {
      heading: 'Selling',
      items: [
        { icon: Package,     label: 'Products',        to: '/seller/products',  badge: badges.pendingReview },
        { icon: PackagePlus, label: 'Add Product',      to: '/seller/products/new' },
        { icon: ShoppingCart,label: 'Orders',           to: '/seller/orders',   badge: badges.newOrders },
        { icon: Boxes,       label: 'Inventory / Stock',to: '/seller/inventory' },
      ],
    },
    {
      heading: 'Finance',
      items: [
        { icon: Wallet,    label: 'Earnings & Payouts', to: '/seller/earnings' },
        { icon: BarChart2, label: 'Sales Reports',      to: '/seller/reports' },
      ],
    },
    {
      heading: 'Customer',
      items: [
        { icon: MessageSquare, label: 'Messages', to: '/seller/messages', badge: badges.unreadMessages },
        { icon: Star,          label: 'Reviews & Ratings', to: '/seller/reviews' },
      ],
    },
    {
      heading: 'Settings',
      items: [
        { icon: Store,    label: 'Shop Profile',    to: '/seller/shop-profile' },
        { icon: Settings, label: 'Account Settings',to: '/seller/account' },
      ],
    },
  ];
}

// ─── Nav items component ──────────────────────────────────────────────────────

function NavItems({ nav, onNavigate }: { nav: NavGroup[]; onNavigate?: () => void }) {
  const location = useLocation();
  const isActive = (to: string) =>
    to === '/seller' ? location.pathname === '/seller' : location.pathname.startsWith(to);

  return (
    <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
      {nav.map((group) => (
        <div key={group.heading}>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 px-2 mb-1.5">
            {group.heading}
          </p>
          {group.items.map(({ icon: Icon, label, to, badge }) => {
            const active = isActive(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                className={[
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-150 mb-0.5',
                  active
                    ? 'bg-brand-red text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                ].join(' ')}
              >
                <Icon className="w-[17px] h-[17px] shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className={[
                    'min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center leading-none',
                    active ? 'bg-white text-brand-red' : 'bg-brand-red text-white',
                  ].join(' ')}>
                    {badge > 99 ? '99+' : badge}
                  </span>
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

function Sidebar({ nav, onNavigate }: { nav: NavGroup[]; onNavigate?: () => void }) {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const shopName = user?.seller_profile?.shop_name ?? 'My Shop';
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-100 shrink-0">
        <Link to="/seller" onClick={onNavigate} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-gray-200">
            <img src="/logo1.png" alt="Velure" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-gray-900 font-bold text-[15px] leading-none">Velure</p>
            <p className="text-gray-400 text-[10px] uppercase tracking-[0.1em] mt-0.5">Seller Center</p>
          </div>
        </Link>
      </div>

      {/* Shop identity pill */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{shopName}</p>
            <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      <NavItems nav={nav} onNavigate={onNavigate} />

      {/* Switch to buyer + Logout */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex flex-col gap-1">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-[12.5px] font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all"
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>Switch to Buyer View</span>
        </Link>
        <button
          onClick={() => { clearAuth(); navigate('/login'); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/seller':            'Dashboard',
  '/seller/products':   'Products',
  '/seller/products/new': 'Add Product',
  '/seller/orders':     'Orders',
  '/seller/inventory':  'Inventory / Stock',
  '/seller/earnings':   'Earnings & Payouts',
  '/seller/reports':    'Sales Reports',
  '/seller/messages':   'Messages',
  '/seller/reviews':    'Reviews & Ratings',
  '/seller/shop-profile': 'Shop Profile',
  '/seller/account':    'Account Settings',
};

function usePageLabel() {
  const { pathname } = useLocation();
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const match = Object.keys(ROUTE_LABELS)
    .filter((k) => k !== '/seller' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : 'Seller Center';
}

function TopBar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { user } = useAuth();
  const label = usePageLabel();
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
    <div className="h-14 shrink-0 flex items-center gap-3 px-5 bg-white border-b border-gray-200 sticky top-0 z-20">
      <button
        onClick={onOpenMobile}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 text-[13px] hidden sm:block">Seller Center</span>
        <ChevronRight className="w-3 h-3 text-gray-300 hidden sm:block shrink-0" />
        <span className="text-gray-900 font-bold text-[16px] truncate">{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors relative">
          <Bell className="w-[17px] h-[17px]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-red rounded-full" />
        </button>
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="text-right">
            <p className="text-[12px] font-semibold text-gray-800 leading-tight">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-[10px] text-gray-400">{user?.seller_profile?.shop_name}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold ring-2 ring-red-100">
            {initials}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function SellerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // TODO: fetch real badge counts from API
  const nav = buildSellerNav({ pendingReview: 0, newOrders: 0, unreadMessages: 0 });
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 fixed inset-y-0 left-0 z-30">
        <Sidebar nav={nav} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 flex flex-col h-full z-50">
            <Sidebar nav={nav} onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        <TopBar onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
