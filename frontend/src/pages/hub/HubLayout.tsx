import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PackagePlus,
  Layers,
  Send,
  Truck,
  Bike,
  BarChart2,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Warehouse,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import LovedItLogo from '../../components/LovedItLogo';

interface NavItem {
  icon: React.ElementType;
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/hub/dashboard' },
  { icon: PackagePlus, label: 'Parcel Intake', to: '/hub/intake' },
  { icon: Layers, label: 'Sorting', to: '/hub/sorting' },
  { icon: Send, label: 'Dispatch', to: '/hub/dispatch' },
  { icon: Truck, label: 'Deliveries', to: '/hub/deliveries' },
  { icon: Bike, label: 'Riders', to: '/hub/riders' },
  { icon: BarChart2, label: 'Reports', to: '/hub/reports' },
];

const ROUTE_TITLES: Record<string, string> = {
  '/hub/dashboard': 'Command Dashboard',
  '/hub/intake': 'Parcel Intake',
  '/hub/sorting': 'Package Sorting',
  '/hub/dispatch': 'Delivery Dispatch',
  '/hub/deliveries': 'Delivery Monitoring',
  '/hub/riders': 'Riders & Fleet',
  '/hub/reports': 'Performance Reports',
};

export default function HubLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const hub = user?.sorting_center;
  const currentTitle = ROUTE_TITLES[location.pathname] || 'Hub Logistics';

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const isNavActive = (to: string) => {
    if (to === '/hub/dashboard') {
      return location.pathname === '/hub/dashboard' || location.pathname === '/hub';
    }
    return location.pathname.startsWith(to);
  };

  const renderNavLinks = () => (
    <nav className="space-y-1 px-3 py-4">
      <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        Operations Workstation
      </div>
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
              active
                ? 'bg-brand-red text-white shadow-xs'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50/70 flex flex-col lg:flex-row font-sans text-gray-900 antialiased">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex print:!hidden lg:flex-col lg:w-64 bg-[#0B0F19] border-r border-gray-800 shrink-0 select-none">
        {/* Hub Header & Branding */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-800/80">
          <Link to="/hub/dashboard" className="flex items-center gap-2.5">
            <LovedItLogo />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-red/15 text-brand-red border border-brand-red/30">
              Logistics
            </span>
          </Link>
        </div>

        {/* Hub Profile Badge */}
        <div className="p-4 mx-3 my-3 rounded-xl bg-gray-900/90 border border-gray-800/90">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <Warehouse className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {hub?.hub_name || 'Sorting Center Hub'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                  Approved Hub
                </span>
              </div>
            </div>
          </div>
          {hub?.address_city && (
            <p className="text-[11px] text-gray-400 mt-2 truncate">
              {hub.address_city}, {hub.address_province}
            </p>
          )}
        </div>

        {/* Navigation links */}
        <div className="flex-1 overflow-y-auto">
          {renderNavLinks()}
        </div>

        {/* Sidebar Footer with user & logout */}
        <div className="p-4 border-t border-gray-800/80 bg-[#0B0F19]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300 shrink-0 font-semibold text-xs">
                {user?.first_name?.[0] || 'H'}
              </div>
              <div className="min-w-0 truncate">
                <p className="text-xs font-semibold text-white truncate">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Header & Drawer ── */}
      <div className="lg:hidden print:hidden bg-[#0B0F19] border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none"
            aria-label="Open sidebar menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <LovedItLogo />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Approved
          </span>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs lg:hidden flex"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] bg-[#0B0F19] h-full flex flex-col border-r border-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800">
              <LovedItLogo />
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-800/80 bg-gray-900/60">
              <p className="text-xs font-bold text-white truncate">{hub?.hub_name || 'Sorting Center Hub'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{hub?.address_city}, {hub?.address_province}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderNavLinks()}
            </div>

            <div className="p-4 border-t border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <UserIcon className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-white truncate">{user?.first_name} {user?.last_name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-red-400 hover:text-red-300 font-semibold"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar on desktop */}
        <header className="hidden lg:flex print:!hidden items-center justify-between h-16 px-8 bg-white border-b border-gray-200/80 sticky top-0 z-30">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span className="text-gray-400">Logistics Hub</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-900 font-bold">{currentTitle}</span>
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-gray-800 truncate max-w-[200px]">
                {hub?.hub_name || 'Valenzuela Hub'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

