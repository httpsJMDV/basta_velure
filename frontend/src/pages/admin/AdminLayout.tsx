import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getAdminStatsApi, getBuyerApplicationsApi } from '../../api/client';
import {
  LayoutDashboard, Users, Store, ShoppingBag, CreditCard,
  ShieldAlert, Star, Flag, Settings, ScrollText,
  Menu, UserCheck, Bike, Tag, LogOut, MessageSquare, X, ChevronRight,
  Bell, CircleUser, PanelLeft, PackageCheck, Wallet, Gauge,
} from 'lucide-react';
import { useState, useEffect, createContext, useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MessengerPanel from './components/MessengerPanel';
import type { Conversation } from '../../types';

// ─── Context ──────────────────────────────────────────────────────────────────

interface MessengerCtx { openThread: (c: Conversation) => void; }
const MessengerContext = createContext<MessengerCtx>({ openThread: () => {} });
export const useMessenger = () => useContext(MessengerContext);

// ─── Breadcrumb map ───────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/admin':                        'Dashboard',
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
    { heading: 'Overview',  items: [{ icon: Gauge, label: 'Dashboard', to: '/admin' }] },
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
      ],
    },
    {
      heading: 'Trust & Safety',
      items: [
        { icon: Star, label: 'Reviews', to: '/admin/reviews' },
        { icon: Flag, label: 'Reports', to: '/admin/reports' },
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

function TopBar({
  collapsed,
  onToggleSidebar,
  onOpenMobile,
  onOpenChat,
}: {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  onOpenChat: () => void;
}) {
  const { user } = useAuth();
  const pageLabel = useBreadcrumb();
  const userInitials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
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
        <div className="w-full flex items-center gap-2 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3.5 py-2">
          <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search users, orders, sellers..."
            className="bg-transparent text-[13px] text-white/50 placeholder-white/20 outline-none w-full"
            readOnly
          />
          <span className="text-[10px] text-white/20 font-mono border border-white/10 rounded px-1 py-0.5 shrink-0">⌘K</span>
        </div>
      </div>

      {/* Right: bell + chat + admin info */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors relative">
          <Bell className="w-[17px] h-[17px]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-red rounded-full" />
        </button>
        <button
          onClick={onOpenChat}
          className="xl:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <MessageSquare className="w-[17px] h-[17px]" />
        </button>
        <div className="hidden sm:flex items-center gap-2.5 ml-1 pl-3 border-l border-white/10">
          <div className="text-right">
            <p className="text-[10px] text-white/25 uppercase tracking-widest leading-none">Admin</p>
            <p className="text-[13px] font-semibold text-white/85 leading-tight mt-0.5">
              {user?.first_name} {user?.last_name}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-white/10">
            {userInitials}
          </div>
        </div>
      </div>
    </div>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpen, setChatOpen]     = useState(false);
  const [pendingSellers, setPendingSellers] = useState(0);
  const [pendingBuyers,  setPendingBuyers]  = useState(0);
  const [pendingConv, setPendingConv]       = useState<Conversation | null>(null);

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
    setPendingConv(c);
    setChatOpen(true);
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
        <div className={`flex-1 ${mainML} xl:mr-80 flex flex-col min-h-screen transition-all duration-200`}>
          <TopBar
            collapsed={collapsed}
            onToggleSidebar={toggleCollapse}
            onOpenMobile={() => setMobileOpen(true)}
            onOpenChat={() => setChatOpen((o) => !o)}
          />
          <main className="flex-1 p-4 lg:p-6">
            <PageTransition />
          </main>
        </div>

        {/* ── Right panel: messenger (desktop ≥ xl) ── */}
        <aside
          className="hidden xl:flex flex-col w-80 shrink-0 fixed inset-y-0 right-0 z-30 border-l border-white/10"
          style={SIDEBAR_BG}
        >
          <MessengerPanel
            openConversationId={pendingConv?.id}
            openConversation={pendingConv}
          />
        </aside>

        {/* ── Right panel: messenger (mobile/tablet slide-in) ── */}
        {chatOpen && (
          <div className="xl:hidden fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
            <aside
              className="relative w-72 max-w-[90vw] flex flex-col h-full z-50 border-l border-white/10"
              style={SIDEBAR_BG}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">Messages</p>
                <button
                  onClick={() => setChatOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden min-h-0">
                <MessengerPanel
                  openConversationId={pendingConv?.id}
                  openConversation={pendingConv}
                />
              </div>
            </aside>
          </div>
        )}

      </div>
    </MessengerContext.Provider>
  );
}
