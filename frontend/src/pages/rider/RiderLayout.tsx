import { useEffect, useState, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  LayoutDashboard,
  PackagePlus,
  Truck,
  Wallet,
  User as UserIcon,
  LogOut,
  Bike,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Warehouse,
  Car,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getRiderMeApi, logoutApi } from '../../api/client';
import type { RiderProfileData } from '../../types';
import LovedItLogo from '../../components/LovedItLogo';
import { useToast } from '../../components/ui/Toast';

export interface RiderOutletContext {
  riderData: RiderProfileData | null;
  loading: boolean;
  error: string | null;
  refreshRider: () => void;
}

interface NavTab {
  icon: React.ElementType;
  label: string;
  to: string;
}

const NAV_TABS: NavTab[] = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/rider/dashboard' },
  { icon: PackagePlus, label: 'Pickups', to: '/rider/pickups' },
  { icon: Truck, label: 'Deliveries', to: '/rider/deliveries' },
  { icon: Wallet, label: 'Earnings', to: '/rider/earnings' },
  { icon: UserIcon, label: 'Account', to: '/rider/account' },
];

export default function RiderLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [riderData, setRiderData] = useState<RiderProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [statusRevokedMessage, setStatusRevokedMessage] = useState<string | null>(null);

  // Fetch /rider/me
  const fetchRiderProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRiderMeApi();
      setRiderData(data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          // Rider status revoked or mid-session change
          const msg =
            err.response.data?.message ||
            'Your courier authorization status has changed. Please sign in again or contact support.';
          setStatusRevokedMessage(msg);
          showToast(msg, 'error');
          clearAuth();
          setTimeout(() => {
            navigate('/rider/login', { replace: true });
          }, 2000);
          return;
        } else if (err.response?.status === 401) {
          clearAuth();
          navigate('/rider/login', { replace: true });
          return;
        }
      }
      setError('Unable to load courier profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [clearAuth, navigate, showToast]);

  useEffect(() => {
    fetchRiderProfile();
  }, [fetchRiderProfile]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutApi();
    } catch {
      // Ignored: proceed with local state clearing even if network fails
    } finally {
      clearAuth();
      showToast('Logged out of Courier Station successfully.', 'success');
      navigate('/rider/login', { replace: true });
    }
  }

  const isTabActive = (to: string) => {
    if (to === '/rider/dashboard') {
      return location.pathname === '/rider/dashboard' || location.pathname === '/rider';
    }
    return location.pathname.startsWith(to);
  };

  const getVehicleIcon = (vehicleType?: string) => {
    switch (vehicleType) {
      case 'Car':
      case 'Van':
        return Car;
      default:
        return Bike;
    }
  };

  const VehicleIcon = getVehicleIcon(riderData?.vehicle_type);

  // Modal alert when status has been revoked mid-session
  if (statusRevokedMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 bg-white border border-red-200 shadow-xl rounded-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Authorization Status Changed</h2>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            {statusRevokedMessage}
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                clearAuth();
                navigate('/rider/login', { replace: true });
              }}
              className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row font-sans text-gray-900 antialiased pb-20 lg:pb-0">
      {/* ─── Desktop Sidebar (lg:flex) ─────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-[#0B0F19] border-r border-gray-800 shrink-0 select-none">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-800/80">
          <Link to="/rider/dashboard" className="flex items-center gap-2.5">
            <LovedItLogo />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30">
              Courier
            </span>
          </Link>
        </div>

        {/* Courier Profile Card */}
        <div className="p-4 mx-3 my-3 rounded-xl bg-gray-900/90 border border-gray-800/90">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
              <VehicleIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {riderData?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                  Active Courier
                </span>
              </div>
            </div>
          </div>
          {riderData?.hub && (
            <div className="mt-2.5 pt-2 border-t border-gray-800 text-[11px] text-gray-400 flex items-center gap-1.5 truncate">
              <Warehouse className="w-3 h-3 text-gray-500 shrink-0" />
              <span className="truncate">{riderData.hub.hub_name}</span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Courier Workstation
          </div>
          {NAV_TABS.map((tab) => {
            const active = isTabActive(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer with Logout */}
        <div className="p-4 border-t border-gray-800/80 bg-[#0B0F19]">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-gray-800 transition-colors"
          >
            {loggingOut ? (
              <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
            ) : (
              <LogOut className="w-4 h-4 text-gray-400" />
            )}
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content Area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-gray-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Branding Logo */}
            <div className="lg:hidden flex items-center gap-2">
              <Link to="/rider/dashboard">
                <LovedItLogo size="sm" />
              </Link>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                Courier
              </span>
            </div>

            {/* Desktop Hub & Courier details */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-gray-600">
              <span className="font-bold text-gray-900">
                {riderData?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`}
              </span>
              {riderData?.hub && (
                <>
                  <span className="text-gray-300">&bull;</span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                    {riderData.hub.hub_name}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Top Bar Actions */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verified Dispatch</span>
              <span className="sm:hidden">Active</span>
            </span>

            {/* Logout on mobile topbar */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out of station"
              className="lg:hidden p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {loggingOut ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet context={{ riderData, loading, error, refreshRider: fetchRiderProfile }} />
        </main>
      </div>

      {/* ─── Phone Bottom Navigation Bar (lg:hidden) ──────────────────── */}
      <nav
        aria-label="Courier Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200/90 shadow-lg px-2 py-1 flex items-center justify-around safe-area-inset-bottom"
      >
        {NAV_TABS.map((tab) => {
          const active = isTabActive(tab.to);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-colors ${
                active
                  ? 'text-blue-600 font-bold'
                  : 'text-gray-400 hover:text-gray-700 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110 text-blue-600' : 'text-gray-400'}`} />
              <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
