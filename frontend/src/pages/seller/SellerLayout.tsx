import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Package, ShoppingCart,
  Wallet, BarChart2, MessageSquare, Star, Store, Settings,
  LogOut, Menu, X, ChevronRight, Bell, ShoppingBag, Plus,
  PanelLeft, ExternalLink, Search, CheckCircle2, AlertTriangle, AlertCircle,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LovedItLogo from '../../components/LovedItLogo';
import { getSellerDashboardAttentionApi, getUnreadMessagesCountApi } from '../../api/client';
import type { SellerAttentionItem } from '../../types';

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavAction { label: string; to: string; }
interface NavItem  { icon: React.ElementType; label: string; to: string; badge?: number; action?: NavAction; }
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
        {
          icon: Package,
          label: 'Products',
          to: '/seller/products',
          badge: badges.pendingReview,
          action: { label: 'Add', to: '/seller/products/new' },
        },
        { icon: ShoppingCart, label: 'Orders', to: '/seller/orders', badge: badges.newOrders },
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

// ─── Inline Search Bar (Navbar Dropdown) ──────────────────────────────────────

const SELLER_SEARCH_PAGES = [
  { label: 'Dashboard Overview', to: '/seller', group: 'Overview', icon: LayoutDashboard },
  { label: 'Products Catalog', to: '/seller/products', group: 'Selling', icon: Package },
  { label: 'Add New Product', to: '/seller/products/new', group: 'Selling', icon: Plus },
  { label: 'Orders & Fulfillment', to: '/seller/orders', group: 'Selling', icon: ShoppingCart },
  { label: 'Earnings & Payouts', to: '/seller/earnings', group: 'Finance', icon: Wallet },
  { label: 'Sales Reports & Analytics', to: '/seller/reports', group: 'Finance', icon: BarChart2 },
  { label: 'Customer Messages', to: '/seller/messages', group: 'Customer', icon: MessageSquare },
  { label: 'Reviews & Ratings', to: '/seller/reviews', group: 'Customer', icon: Star },
  { label: 'Shop Profile & Customization', to: '/seller/shop-profile', group: 'Settings', icon: Store },
  { label: 'Account & Security Settings', to: '/seller/account', group: 'Settings', icon: Settings },
];

function SellerSearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SELLER_SEARCH_PAGES;
    return SELLER_SEARCH_PAGES.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [query]);

  // Global shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (to: string) => {
    navigate(to);
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex].to);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm mx-auto hidden md:block">
      <div
        className={[
          'flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all border',
          isOpen
            ? 'border-brand-red/60 ring-2 ring-red-100 bg-white shadow-xs'
            : 'border-gray-200 bg-gray-50 hover:bg-gray-100/80',
        ].join(' ')}
      >
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, orders, finances..."
          className="flex-1 bg-transparent text-xs text-gray-800 placeholder-gray-400 outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <span className="text-[10px] text-gray-400 font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 shadow-2xs">
            ⌘K
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-gray-50">
            {filtered.length > 0 ? (
              filtered.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelect(item.to)}
                    className={[
                      'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors',
                      isSelected ? 'bg-red-50 text-brand-red' : 'hover:bg-gray-50 text-gray-700',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={[
                          'w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
                          isSelected ? 'bg-red-100 text-brand-red' : 'bg-gray-100 text-gray-500',
                        ].join(' ')}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-brand-red' : 'text-gray-800'}`}>
                          {item.label}
                        </p>
                        <p className="text-[10px] text-gray-400">{item.group}</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-brand-red' : 'text-gray-300'}`} />
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-gray-400">
                No matching pages found for "{query}"
              </div>
            )}
          </div>
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
            <span>Quick navigation</span>
            <div className="flex items-center gap-1.5 font-mono text-[9px]">
              <span className="bg-white border border-gray-200 rounded px-1">↑↓</span> navigate
              <span className="bg-white border border-gray-200 rounded px-1">↵</span> select
              <span className="bg-white border border-gray-200 rounded px-1">esc</span> close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav items component ──────────────────────────────────────────────────────

function NavItems({
  nav,
  collapsed = false,
  onNavigate,
}: {
  nav: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();

  const isActive = (to: string) => {
    if (to === '/seller') {
      return location.pathname === '/seller';
    }
    if (to === '/seller/products') {
      return location.pathname === '/seller/products' || location.pathname.startsWith('/seller/products/');
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <nav className="flex-1 px-2.5 py-3 space-y-3.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
      {nav.map((group) => (
        <div key={group.heading}>
          {!collapsed && (
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 px-2.5 mb-1">
              {group.heading}
            </p>
          )}
          {collapsed && <div className="my-1 mx-2 border-t border-gray-100" />}
          {group.items.map(({ icon: Icon, label, to, badge, action }) => {
            const active = isActive(to);
            return (
              <div
                key={to}
                className={[
                  'group flex items-center justify-between gap-1.5 rounded-xl text-[13px] font-medium transition-all duration-150 mb-0.5',
                  collapsed ? 'justify-center p-1.5' : 'px-2.5 py-1.5',
                  active
                    ? 'bg-red-50 text-brand-red font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                ].join(' ')}
              >
                <Link
                  to={to}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-2.5 flex-1 min-w-0 ${collapsed ? 'justify-center' : ''}`}
                >
                  <Icon className={`w-[17px] h-[17px] shrink-0 transition-colors ${active ? 'text-brand-red' : 'text-gray-500 group-hover:text-gray-700'}`} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>

                {!collapsed && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {badge !== undefined && badge > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center leading-none bg-brand-red text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    {action && (
                      <Link
                        to={action.to}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate?.();
                        }}
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-[10.5px] font-bold rounded-lg border transition-all ${
                          location.pathname === action.to
                            ? 'bg-brand-red text-white border-brand-red shadow-xs'
                            : 'bg-white text-brand-red border-red-200 hover:bg-brand-red hover:text-white hover:border-brand-red shadow-xs'
                        }`}
                        title="Add Product"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                        <span>{action.label}</span>
                      </Link>
                    )}
                  </div>
                )}

                {collapsed && badge !== undefined && badge > 0 && (
                  <span className="w-2 h-2 bg-brand-red rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  nav,
  collapsed = false,
  onNavigate,
}: {
  nav: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const shopName = user?.seller_profile?.shop_name ?? 'My Shop';
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 select-none">
      {/* Brand Header */}
      <div className={`border-b border-gray-100 shrink-0 ${collapsed ? 'px-0 py-3 flex justify-center' : 'px-4 py-3'}`}>
        <Link to="/seller" onClick={onNavigate} className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} group`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 flex items-center justify-center p-0.5 shadow-xs shrink-0 group-hover:scale-105 transition-transform">
            <LovedItLogo variant="light" type="icon" size="custom" showText={false} imgClassName="w-5 h-5 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-900 font-black text-[14px] tracking-tight leading-none">Loved-IT</span>
                <span className="text-[8.5px] font-black uppercase tracking-wider bg-brand-red text-white px-1.5 py-0.5 rounded">Seller</span>
              </div>
              <p className="text-gray-400 text-[9.5px] uppercase tracking-[0.08em] font-semibold mt-0.5">Merchant Portal</p>
            </div>
          )}
        </Link>
      </div>

      {/* Shop identity pill */}
      {!collapsed ? (
        <div className="px-3.5 py-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5 bg-gray-50/80 border border-gray-100 rounded-xl px-2.5 py-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{shopName}</p>
              <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-2 py-2 border-b border-gray-100 flex justify-center shrink-0">
          <div
            title={`${shopName} (${user?.email})`}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[10px] font-bold shadow-xs cursor-default"
          >
            {initials}
          </div>
        </div>
      )}

      <NavItems nav={nav} collapsed={collapsed} onNavigate={onNavigate} />

      {/* Footer controls */}
      <div className={`border-t border-gray-100 shrink-0 ${collapsed ? 'p-2 flex flex-col items-center gap-2' : 'px-3 py-2.5 flex flex-col gap-1'}`}>
        {!collapsed ? (
          <>
            <Link
              to="/"
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12px] font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Switch to Buyer View</span>
            </Link>
            <button
              onClick={() => { clearAuth(); navigate('/login'); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Log out</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/"
              title="Switch to Buyer View"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
            </Link>
            <button
              onClick={() => { clearAuth(); navigate('/login'); }}
              title="Log out"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/seller':              'Dashboard',
  '/seller/products':     'Products',
  '/seller/products/new': 'Add Product',
  '/seller/orders':       'Orders',
  '/seller/earnings':     'Earnings & Payouts',
  '/seller/reports':      'Sales Reports',
  '/seller/messages':     'Messages',
  '/seller/reviews':      'Reviews & Ratings',
  '/seller/shop-profile': 'Shop Profile',
  '/seller/account':      'Account Settings',
};

function usePageLabel() {
  const { pathname } = useLocation();
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const match = Object.keys(ROUTE_LABELS)
    .filter((k) => k !== '/seller' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : 'Seller Center';
}

function TopBar({
  onOpenMobile,
  onToggleSidebar,
  attentionItems = [],
  unreadMessages = 0,
}: {
  onOpenMobile: () => void;
  onToggleSidebar: () => void;
  attentionItems: SellerAttentionItem[];
  unreadMessages: number;
}) {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const label = usePageLabel();
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;
  const shopName = user?.seller_profile?.shop_name || 'My Shop';
  const shopSlug = user?.seller_profile?.shop_slug;

  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Dismiss dropdowns on outside click
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const totalAlerts = attentionItems.length;

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 sm:px-5 bg-white border-b border-gray-200 sticky top-0 z-20 shadow-2xs">
      {/* Toggle Sidebar Desktop */}
      <button
        onClick={onToggleSidebar}
        title="Toggle Sidebar"
        className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
      >
        <PanelLeft className="w-[18px] h-[18px]" />
      </button>

      {/* Mobile menu button */}
      <button
        onClick={onOpenMobile}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb + page title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 text-[13px] hidden sm:block">Loved-IT Seller</span>
        <ChevronRight className="w-3 h-3 text-gray-300 hidden sm:block shrink-0" />
        <span className="text-gray-900 font-bold text-[15px] sm:text-[16px] truncate">{label}</span>
      </div>

      {/* Global Quick Search (Inline Dropdown) */}
      <SellerSearchBar />

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Public store front preview */}
          {shopSlug && (
            <Link
              to={`/shop/${shopSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
              title="View Public Store"
            >
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              <span>View Shop</span>
            </Link>
          )}

          {/* Messages link */}
          <Link
            to="/seller/messages"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors relative"
            title="Messages"
          >
            <MessageSquare className="w-[17px] h-[17px]" />
            {unreadMessages > 0 && (
              <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </Link>

          {/* Notification Button & Popover */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                setUserMenuOpen(false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-[17px] h-[17px]" />
              {totalAlerts > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-red rounded-full ring-2 ring-white" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 sm:w-88 bg-white border border-gray-200 rounded-2xl shadow-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-900">Seller Alerts</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    totalAlerts > 0
                      ? 'bg-red-50 text-brand-red border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {totalAlerts > 0 ? `${totalAlerts} Pending Action${totalAlerts === 1 ? '' : 's'}` : 'All Clear'}
                  </span>
                </div>

                <div className="py-2 space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {attentionItems.length > 0 ? (
                    attentionItems.map((item, idx) => {
                      const isOrder = item.type === 'new_order';
                      const isStock = item.type === 'low_stock';
                      return (
                        <Link
                          key={`${item.id}-${idx}`}
                          to={item.link}
                          onClick={() => setNotifOpen(false)}
                          className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-gray-50 transition-colors group"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isOrder
                              ? 'bg-blue-50 text-blue-600'
                              : isStock
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-red-50 text-brand-red'
                          }`}>
                            {isOrder ? <ShoppingCart className="w-3.5 h-3.5" /> : isStock ? <AlertTriangle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 group-hover:text-brand-red transition-colors leading-tight">
                              {item.label}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="text-center py-6">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5 opacity-80" />
                      <p className="text-xs font-semibold text-gray-800">All caught up!</p>
                      <p className="text-[10px] text-gray-400">No urgent seller alerts right now.</p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-100 text-center">
                  <Link
                    to="/seller"
                    onClick={() => setNotifOpen(false)}
                    className="text-[11px] font-semibold text-brand-red hover:underline"
                  >
                    View Overview Dashboard →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User profile dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => {
                setUserMenuOpen((v) => !v);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-200 hover:opacity-90 transition-opacity"
            >
              <div className="text-right hidden sm:block">
                <p className="text-[12px] font-semibold text-gray-800 leading-tight truncate max-w-[130px]">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-[10px] text-gray-400 truncate max-w-[130px]">{shopName}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-red-100 shadow-2xs">
                {initials}
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-11 w-54 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-gray-100 mb-1">
                  <p className="text-xs font-bold text-gray-900 truncate">{shopName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded">
                    Active Merchant
                  </span>
                </div>

                <Link
                  to="/seller/shop-profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <Store className="w-3.5 h-3.5 text-gray-400" />
                  <span>Shop Profile</span>
                </Link>

                <Link
                  to="/seller/account"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-gray-400" />
                  <span>Account Settings</span>
                </Link>

                <Link
                  to="/"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                  <span>Switch to Buyer View</span>
                </Link>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    clearAuth();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors mt-1 border-t border-gray-100"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const SIDEBAR_W_EXPANDED  = 'w-56';
const SIDEBAR_W_COLLAPSED = 'w-16';
const ML_EXPANDED         = 'lg:ml-56';
const ML_COLLAPSED        = 'lg:ml-16';

export default function SellerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('seller_sidebar_collapsed') === 'true';
  });

  const [attentionItems, setAttentionItems] = useState<SellerAttentionItem[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const location = useLocation();

  const handleToggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('seller_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Fetch real seller alerts and unread message count
  useEffect(() => {
    let mounted = true;
    getSellerDashboardAttentionApi()
      .then((data) => {
        if (mounted && Array.isArray(data)) setAttentionItems(data);
      })
      .catch(() => {});

    getUnreadMessagesCountApi()
      .then((count) => {
        if (mounted && typeof count === 'number') setUnreadMessages(count);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  const newOrdersCount = attentionItems.filter((i) => i.type === 'new_order').length;
  const nav = buildSellerNav({
    pendingReview: 0,
    newOrders: newOrdersCount,
    unreadMessages: unreadMessages,
  });

  const sidebarW = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const mainML   = collapsed ? ML_COLLAPSED : ML_EXPANDED;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col ${sidebarW} shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-200`}>
        <Sidebar nav={nav} collapsed={collapsed} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <aside className={`relative ${SIDEBAR_W_EXPANDED} flex flex-col h-full z-50 bg-white shadow-2xl`}>
            <Sidebar nav={nav} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3.5 right-3 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 ${mainML} flex flex-col min-h-screen transition-all duration-200`}>
        <TopBar
          onOpenMobile={() => setMobileOpen(true)}
          onToggleSidebar={handleToggleSidebar}
          attentionItems={attentionItems}
          unreadMessages={unreadMessages}
        />
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
