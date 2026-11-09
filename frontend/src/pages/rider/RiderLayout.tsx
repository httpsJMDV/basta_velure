import { useEffect, useState, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  PackagePlus,
  BarChart2,
  Truck,
  Wallet,
  User as UserIcon,
  LogOut,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Warehouse,
  Container,
  History,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useRiderChatUnread, type RiderChatUnread } from '../../hooks/useRiderChatUnread';
import { useRiderLocationBeacon } from '../../hooks/useRiderLocationBeacon';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import { RiderLocationGate } from './RiderLocationGate';
import { getRiderMeApi, logoutApi } from '../../api/client';
import { getRiderNavCountsApi } from '../../api/navCounts';
import { useNavCounts } from '../../hooks/useNavCounts';
import type { RiderProfileData } from '../../types';
import LovedItLogo from '../../components/LovedItLogo';
import { useToast } from '../../components/ui/Toast';
import { ShellTopBar } from '../../components/shell/PortalChrome';

export interface RiderOutletContext {
  riderData: RiderProfileData | null;
  loading: boolean;
  error: string | null;
  refreshRider: () => void;
  /** Unread delivery-chat messages, polled once here and shared with the pages. */
  chat: RiderChatUnread;
  logout: () => Promise<void>;
  loggingOut: boolean;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  to: string;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { heading: 'Overview', items: [{ icon: LayoutDashboard, label: 'Dashboard', to: '/rider/dashboard' }] },
  {
    heading: 'Work',
    items: [
      { icon: PackagePlus, label: 'Pickups', to: '/rider/pickups' },
      { icon: Truck, label: 'Deliveries', to: '/rider/deliveries' },
    ],
  },
  { heading: 'Finance', items: [{ icon: Wallet, label: 'Earnings', to: '/rider/earnings' }, { icon: BarChart2, label: 'Reports', to: '/rider/reports' }] },
  { heading: 'Settings', items: [{ icon: History, label: 'Activity', to: '/rider/activity' }, { icon: UserIcon, label: 'Account', to: '/rider/account' }] },
];

// A truck driver carries parcels between hubs: no pickups or deliveries.
const TRUCK_NAV: NavGroup[] = [
  { heading: 'Work', items: [{ icon: Container, label: 'Trips', to: '/rider/trips' }] },
  { heading: 'Finance', items: [{ icon: BarChart2, label: 'Reports', to: '/rider/reports' }] },
  { heading: 'Settings', items: [{ icon: History, label: 'Activity', to: '/rider/activity' }, { icon: UserIcon, label: 'Account', to: '/rider/account' }] },
];

/** Pages a truck driver has no use for; they open Trips instead. */
const DELIVERY_ONLY = ['/rider/dashboard', '/rider/pickups', '/rider/deliveries', '/rider/earnings'];

/** What a menu badge counts, for screen readers. */
const BADGE_LABEL: Record<string, string> = {
  '/rider/pickups': 'pickup stops waiting',
  '/rider/deliveries': 'parcels to deliver',
  '/rider/trips': 'trip on the road',
  '/rider/account': 'unread messages',
};

const PAGE_LABELS: Record<string, string> = {
  '/rider/dashboard': 'Dashboard',
  '/rider/pickups': 'Pickups',
  '/rider/deliveries': 'Deliveries',
  '/rider/earnings': 'Earnings',
  '/rider/reports': 'Reports',
  '/rider/account': 'Account',
  '/rider/trips': 'Trips',
  '/rider/activity': 'Activity',
};

function UnreadBadge({ count, floating = false, label = 'unread messages' }: { count: number; floating?: boolean; label?: string }) {
  return (
    <span
      className={`min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold leading-none flex items-center justify-center ${
        floating ? 'absolute -top-1.5 -right-2.5 ring-2 ring-white' : ''
      }`}
    >
      <span aria-hidden="true">{count > 9 ? '9+' : count}</span>
      <span className="sr-only">{count} {label}</span>
    </span>
  );
}

function initialsOf(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || 'R';
}

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
  const chat = useRiderChatUnread(!statusRevokedMessage);
  // While the rider has a parcel to collect or carry, their phone reports its position for the map.
  const beacon = useRiderLocationBeacon(!statusRevokedMessage);

  // `silent` is the live refresh: no loading state, and a failed attempt keeps what is shown.
  const fetchRiderProfile = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setRiderData(await getRiderMeApi());
      setError(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          // The hub changed this rider's status while they were signed in.
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
      if (!silent) setError('Unable to load courier profile details. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clearAuth, navigate, showToast]);

  const refreshRider = useCallback(() => void fetchRiderProfile(), [fetchRiderProfile]);

  useEffect(() => {
    void fetchRiderProfile();
  }, [fetchRiderProfile]);

  const isTruck = (riderData?.duty ?? user?.rider?.duty) === 'truck';
  const nav = isTruck ? TRUCK_NAV : NAV;
  // Activity stays in the menu and the account list: five tabs fit a phone.
  const bottomNav = nav.flatMap((g) => g.items).filter((i) => i.to !== '/rider/activity');

  // The numbers on the menu: pickup stops, parcels to deliver, the truck trip on the road, unread messages.
  const { counts } = useNavCounts(getRiderNavCountsApi, !statusRevokedMessage);
  const badgeFor = (to: string): number => {
    switch (to) {
      case '/rider/pickups': return counts?.pickups ?? 0;
      case '/rider/deliveries': return counts?.deliveries ?? 0;
      case '/rider/trips': return counts?.trips ?? 0;
      case '/rider/account': return chat.total;
      default: return 0;
    }
  };
  useEffect(() => {
    if (isTruck && DELIVERY_ONLY.includes(location.pathname)) navigate('/rider/trips', { replace: true });
    if (!isTruck && riderData && location.pathname === '/rider/trips') navigate('/rider/dashboard', { replace: true });
  }, [isTruck, riderData, location.pathname, navigate]);

  // The status, hub and delivery areas change when the company or hub acts: picked up live, no Refresh button.
  useLiveRefresh(() => void fetchRiderProfile(true), 60_000, statusRevokedMessage !== null);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutApi();
    } catch {
      // Clear the local session even if the network call fails.
    } finally {
      clearAuth();
      showToast('Logged out of Courier Station successfully.', 'success');
      navigate('/rider/login', { replace: true });
    }
  }

  const isActive = (to: string) =>
    to === '/rider/dashboard'
      ? location.pathname === '/rider/dashboard' || location.pathname === '/rider'
      : location.pathname.startsWith(to);

  const pageLabel = PAGE_LABELS[Object.keys(PAGE_LABELS).find((k) => location.pathname.startsWith(k)) ?? ''] ?? 'Courier';
  const fullName = riderData?.full_name || `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();
  const initials = initialsOf(riderData?.first_name ?? user?.first_name, riderData?.last_name ?? user?.last_name);
  const hubName = riderData?.hub?.hub_name;

  // Earnings, reports and the account stay open so a rider can always sign out or check their pay.
  const locationExempt = ['/rider/earnings', '/rider/reports', '/rider/account'].some((p) => location.pathname.startsWith(p));
  const locationLocked = beacon.required && beacon.state !== 'sharing' && !locationExempt;

  if (statusRevokedMessage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 bg-white border border-gray-200/80 shadow-xs rounded-2xl text-center space-y-4">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-brand-red border border-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-black text-gray-900">Authorization status changed</h2>
          <p role="alert" className="text-xs text-gray-600 leading-relaxed">
            {statusRevokedMessage}
          </p>
          <button
            onClick={() => {
              clearAuth();
              navigate('/rider/login', { replace: true });
            }}
            className="w-full min-h-11 px-4 bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold rounded-xl transition-colors"
          >
            Return to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ─── Desktop sidebar ───────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200 select-none">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <Link to="/rider/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 flex items-center justify-center p-0.5 shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <LovedItLogo variant="light" type="icon" size="custom" showText={false} imgClassName="w-5 h-5 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-900 font-black text-[14px] tracking-tight leading-none">Loved-IT</span>
                <span className="text-[8.5px] font-black uppercase tracking-wider bg-brand-red text-white px-1.5 py-0.5 rounded">Courier</span>
              </div>
              <p className="text-gray-500 text-[9.5px] uppercase tracking-[0.08em] font-semibold mt-0.5">Courier Station</p>
            </div>
          </Link>
        </div>

        <div className="px-3.5 py-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5 bg-gray-50/80 border border-gray-100 rounded-xl px-2.5 py-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{fullName || 'Courier'}</p>
              <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                <Warehouse className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{hubName ?? 'No hub on file'}</span>
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="Courier" className="flex-1 px-2.5 py-3 space-y-3.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {nav.map((group) => (
            <div key={group.heading}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500 px-2.5 mb-1">{group.heading}</p>
              {group.items.map(({ icon: Icon, label, to }) => {
                const active = isActive(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-[13px] font-medium mb-0.5 transition-all duration-150 ${
                      active ? 'bg-red-50 text-brand-red font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-[17px] h-[17px] shrink-0 ${active ? 'text-brand-red' : 'text-gray-500 group-hover:text-gray-700'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{label}</span>
                    </span>
                    {badgeFor(to) > 0 && <UnreadBadge count={badgeFor(to)} label={BADGE_LABEL[to] ?? 'waiting'} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 shrink-0 px-3 py-2.5">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
          >
            {loggingOut ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main column ───────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen min-w-0">
        <ShellTopBar
          theme="light"
          rootLabel="Loved-IT Courier"
          pageLabel={pageLabel}
          roleLabel={hubName ?? 'Courier'}
          user={{ name: fullName || 'Courier', email: user?.email, initials }}
          alertsTitle="Courier Alerts"
          searchPlaceholder="Search courier pages..."
          searchItems={isTruck ? [
            { label: 'Trips', to: '/rider/trips', group: 'Work', icon: Container },
            { label: 'Reports', to: '/rider/reports', group: 'Money', icon: BarChart2 },
            { label: 'My account', to: '/rider/account', group: 'Account', icon: UserIcon },
          ] : [
            { label: 'Dashboard', to: '/rider/dashboard', group: 'Overview', icon: LayoutDashboard },
            { label: 'Pickups', to: '/rider/pickups', group: 'Work', icon: PackagePlus },
            { label: 'Deliveries', to: '/rider/deliveries', group: 'Work', icon: Truck },
            { label: 'Earnings', to: '/rider/earnings', group: 'Money', icon: Wallet },
            { label: 'Reports', to: '/rider/reports', group: 'Money', icon: BarChart2 },
            { label: 'My account', to: '/rider/account', group: 'Account', icon: UserIcon },
          ]}
          alerts={
            chat.total > 0
              ? [{
                  icon: MessageSquare,
                  tone: 'bg-blue-50 text-blue-600',
                  title: `${chat.total} unread message${chat.total > 1 ? 's' : ''}`,
                  detail: 'About your parcels',
                  to: '/rider/account',
                }]
              : []
          }
          messages={{ to: '/rider/account', unread: chat.total }}
          menuLinks={[
            { icon: UserIcon, label: 'My account', to: '/rider/account' },
            ...(isTruck ? [] : [{ icon: Wallet, label: 'Earnings', to: '/rider/earnings' }]),
            { icon: History, label: 'Activity', to: '/rider/activity' },
          ]}
          leading={
            <Link to="/rider/dashboard" className="lg:hidden shrink-0" aria-label="Courier dashboard">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 flex items-center justify-center p-0.5 shadow-xs">
                <LovedItLogo variant="light" type="icon" size="custom" showText={false} imgClassName="w-5 h-5 object-contain" />
              </div>
            </Link>
          }
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">
          {locationLocked ? (
            <RiderLocationGate state={beacon.state} activeParcels={beacon.activeParcels} onAsk={beacon.ask} />
          ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Outlet
                context={
                  { riderData, loading, error, refreshRider, chat, logout: handleLogout, loggingOut } satisfies RiderOutletContext
                }
              />
            </motion.div>
          </AnimatePresence>
          )}
        </main>
      </div>

      {/* ─── Phone bottom navigation ───────────────────────────────────── */}
      <nav
        aria-label="Courier mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] flex items-stretch justify-around"
      >
        {bottomNav.map(({ icon: Icon, label, to }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                active ? 'text-brand-red font-bold' : 'text-gray-500 hover:text-gray-800 font-medium'
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-red" aria-hidden="true" />}
              <span className="relative">
                <Icon className="w-5 h-5" aria-hidden="true" />
                {badgeFor(to) > 0 && <UnreadBadge count={badgeFor(to)} label={BADGE_LABEL[to] ?? 'waiting'} floating />}
              </span>
              <span className="text-[10px] tracking-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
