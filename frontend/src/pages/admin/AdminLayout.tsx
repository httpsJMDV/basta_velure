import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getAdminStatsApi } from '../../api/client';
import {
  LayoutDashboard, Users, Store, ShoppingBag, CreditCard,
  MessageSquareWarning, Star, Flag, Settings, ScrollText,
  Menu, UserCheck, Bike, Tag, LogOut,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavItem  { icon: React.ElementType; label: string; to: string; badge?: number; }
interface NavGroup { heading: string; items: NavItem[]; }

function buildNav(pendingSellers: number): NavGroup[] {
  return [
    {
      heading: 'Overview',
      items: [{ icon: LayoutDashboard, label: 'Dashboard', to: '/admin' }],
    },
    {
      heading: 'People',
      items: [
        { icon: UserCheck, label: 'Seller Applications', to: '/admin/seller-applications', badge: pendingSellers },
        { icon: Bike,      label: 'Rider Applications',  to: '/admin/rider-applications' },
        { icon: Store,     label: 'Sellers',             to: '/admin/sellers' },
        { icon: Users,     label: 'Buyers',              to: '/admin/buyers' },
        { icon: Bike,      label: 'Riders',              to: '/admin/riders' },
      ],
    },
    {
      heading: 'Catalog',
      items: [
        { icon: Tag,         label: 'Categories', to: '/admin/categories' },
        { icon: ShoppingBag, label: 'Products',   to: '/admin/products' },
      ],
    },
    {
      heading: 'Commerce',
      items: [
        { icon: ShoppingBag,          label: 'Orders',             to: '/admin/orders' },
        { icon: CreditCard,           label: 'Payments & Payouts', to: '/admin/payments' },
        { icon: MessageSquareWarning, label: 'Disputes / Returns', to: '/admin/disputes' },
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

function SidebarContent({ nav, onNavigate }: { nav: NavGroup[]; onNavigate?: () => void }) {
  const location = useLocation();
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();

  const isActive = (to: string) =>
    to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(to);

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`;

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-white/8 shrink-0">
        <Link to="/admin" onClick={onNavigate} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/12 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
            <img src="/logo1.png" alt="Velure" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <p className="text-white font-bold text-[15px] tracking-tight leading-none">Velure</p>
            <p className="text-white/35 text-[9px] uppercase tracking-[0.12em] mt-1">Admin Panel</p>
          </div>
        </Link>
      </div>

      {/* Nav — hidden scrollbar */}
      <nav
        className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <style>{`nav::-webkit-scrollbar { display: none; }`}</style>

        {nav.map((group) => (
          <div key={group.heading}>
            <p className="text-white/25 text-[9px] font-bold uppercase tracking-[0.12em] px-2.5 mb-1">
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
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-200 mb-0.5 group',
                    active
                      ? 'text-white shadow-lg'
                      : 'text-white/55 hover:text-white hover:bg-white/8',
                  ].join(' ')}
                  style={active ? {
                    background: 'linear-gradient(135deg, #A32D2D 0%, #791F1F 100%)',
                    boxShadow: '0 4px 15px rgba(163,45,45,0.35)',
                  } : undefined}
                >
                  <Icon className="w-[15px] h-[15px] shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-white text-brand-red text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="px-2.5 py-3 border-t border-white/8 shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2.5 bg-black/20 rounded-xl border border-white/6">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[12px] font-semibold truncate leading-tight">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-white/40 text-[10px] truncate mt-0.5">{user?.email}</p>
          </div>
          <button
            onClick={() => { clearAuth(); navigate('/login'); }}
            title="Log out"
            className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/25 text-white/60 hover:bg-red-500/35 hover:text-white transition-all flex items-center justify-center shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [pendingSellers, setPendingSellers] = useState(0);

  useEffect(() => {
    getAdminStatsApi()
      .then((s) => setPendingSellers(s.pending_seller_applications))
      .catch(() => {});
  }, []);

  const nav = buildNav(pendingSellers);

  const sidebarStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1a0a0a 0%, #120606 60%, #0d0404 100%)',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-56 shrink-0 fixed inset-y-0 left-0 z-30"
        style={sidebarStyle}
      >
        <SidebarContent nav={nav} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-56 flex flex-col h-full z-50" style={sidebarStyle}>
            <SidebarContent nav={nav} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <div
          className="lg:hidden px-4 h-14 flex items-center justify-between sticky top-0 z-20 border-b border-white/8"
          style={sidebarStyle}
        >
          <Link to="/admin" className="flex items-center gap-2.5">
            <img src="/logo1.png" alt="Velure" className="w-7 h-7 rounded-lg" />
            <span className="text-white font-bold tracking-tight text-[15px]">Velure Admin</span>
          </Link>
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 p-4 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
