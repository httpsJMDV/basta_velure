import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Gauge,
  PackagePlus,
  Layers,
  Send,
  Truck,
  Bike,
  BarChart2,
  MessageSquare,
  Warehouse,
  UserCheck,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useHubChatUnread } from '../../hooks/useHubChatUnread';
import { getHubDashboardMetricsApi, getHubRidersApi } from '../../api/client';
import {
  ShellSidebar,
  ShellTopBar,
  SHELL_BG,
  type ShellAlert,
  type ShellNavGroup,
  type ShellSearchItem,
} from '../../components/shell/PortalChrome';

/** What the hub pages can ask of the layout. */
export interface HubOutletContext {
  /** Re-read the unread badge on the Messages nav item. */
  refreshChatUnread: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/hub/dashboard': 'Command Dashboard',
  '/hub/intake': 'Parcel Intake',
  '/hub/sorting': 'Package Sorting',
  '/hub/dispatch': 'Delivery Dispatch',
  '/hub/deliveries': 'Delivery Monitoring',
  '/hub/riders': 'Riders & Fleet',
  '/hub/messages': 'Rider Messages',
  '/hub/reports': 'Performance Reports',
};

const SIDEBAR_W_EXPANDED = 'w-60';
const SIDEBAR_W_COLLAPSED = 'w-16';
const ML_EXPANDED = 'lg:ml-60';
const ML_COLLAPSED = 'lg:ml-16';
const ALERTS_POLL_MS = 60000;

export default function HubLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const chat = useHubChatUnread(true);

  // What is waiting for the hub: riders to approve and failed deliveries to triage. Read on every page change and
  // once a minute, so the badges stay close to the truth without a page asking for them.
  const [pendingRiders, setPendingRiders] = useState(0);
  const [failedDeliveries, setFailedDeliveries] = useState(0);

  const loadAlerts = useCallback(async () => {
    const [riders, metrics] = await Promise.allSettled([getHubRidersApi({ status: 'PENDING', per_page: 1 }), getHubDashboardMetricsApi()]);
    if (riders.status === 'fulfilled') setPendingRiders(riders.value.counts.pending);
    if (metrics.status === 'fulfilled') setFailedDeliveries(metrics.value.failed_deliveries);
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts, location.pathname]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadAlerts();
    }, ALERTS_POLL_MS);
    return () => clearInterval(timer);
  }, [loadAlerts]);

  // Persist the sidebar collapse state, as the admin console does.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('hub_sidebar_collapsed') === 'true'; }
    catch { return false; }
  });

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('hub_sidebar_collapsed', String(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  }

  const hub = user?.sorting_center;
  const pageLabel = ROUTE_TITLES[location.pathname] ?? 'Hub Logistics';

  const nav: ShellNavGroup[] = useMemo(() => [
    { heading: 'Overview', items: [{ icon: Gauge, label: 'Dashboard', to: '/hub/dashboard' }] },
    {
      heading: 'Operations',
      items: [
        { icon: PackagePlus, label: 'Parcel Intake', to: '/hub/intake' },
        { icon: Layers, label: 'Sorting', to: '/hub/sorting' },
        { icon: Send, label: 'Dispatch', to: '/hub/dispatch' },
        { icon: Truck, label: 'Deliveries', to: '/hub/deliveries', badge: failedDeliveries },
      ],
    },
    {
      heading: 'People',
      items: [
        { icon: Bike, label: 'Riders', to: '/hub/riders', badge: pendingRiders },
        { icon: MessageSquare, label: 'Messages', to: '/hub/messages', badge: chat.total },
      ],
    },
    { heading: 'Insights', items: [{ icon: BarChart2, label: 'Reports', to: '/hub/reports' }] },
  ], [failedDeliveries, pendingRiders, chat.total]);

  const searchItems: ShellSearchItem[] = [
    { label: 'Command Dashboard', to: '/hub/dashboard', group: 'Overview', icon: Gauge },
    { label: 'Parcel Intake: scan parcels in', to: '/hub/intake', group: 'Operations', icon: PackagePlus },
    { label: 'Package Sorting', to: '/hub/sorting', group: 'Operations', icon: Layers },
    { label: 'Delivery Dispatch: assign riders', to: '/hub/dispatch', group: 'Operations', icon: Send },
    { label: 'Delivery Monitoring and failed deliveries', to: '/hub/deliveries', group: 'Operations', icon: Truck },
    { label: 'Riders and applications', to: '/hub/riders', group: 'People', icon: Bike },
    { label: 'Rider Messages', to: '/hub/messages', group: 'People', icon: MessageSquare },
    { label: 'Performance Reports', to: '/hub/reports', group: 'Insights', icon: BarChart2 },
  ];

  const alerts: ShellAlert[] = [];
  if (pendingRiders > 0) {
    alerts.push({ icon: UserCheck, tone: 'bg-amber-500/20 text-amber-300', title: `${pendingRiders} rider application${pendingRiders > 1 ? 's' : ''}`, detail: 'Waiting for your approval', to: '/hub/riders' });
  }
  if (failedDeliveries > 0) {
    alerts.push({ icon: AlertTriangle, tone: 'bg-rose-500/20 text-rose-300', title: `${failedDeliveries} failed deliver${failedDeliveries > 1 ? 'ies' : 'y'}`, detail: 'Reschedule or return to the seller', to: '/hub/deliveries' });
  }
  if (chat.total > 0) {
    alerts.push({ icon: MessageSquare, tone: 'bg-blue-500/20 text-blue-300', title: `${chat.total} unread message${chat.total > 1 ? 's' : ''}`, detail: 'From your riders', to: '/hub/messages' });
  }

  const isActive = (to: string) =>
    to === '/hub/dashboard'
      ? location.pathname === '/hub/dashboard' || location.pathname === '/hub'
      : location.pathname.startsWith(to);

  const handleLogout = () => {
    clearAuth();
    navigate('/hub/login');
  };

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Hub manager';
  const shellUser = {
    name: fullName,
    email: user?.email,
    initials: `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() || 'H',
  };

  const profile = (
    <div className="mx-3 mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
          <Warehouse className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{hub?.hub_name || 'Sorting Center Hub'}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Approved hub</span>
          </div>
        </div>
      </div>
      {hub?.address_city && (
        <p className="text-[11px] text-white/45 mt-2 flex items-center gap-1 truncate">
          <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{hub.address_city}, {hub.address_province}</span>
        </p>
      )}
    </div>
  );

  const sidebarW = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const mainML = collapsed ? ML_COLLAPSED : ML_EXPANDED;

  const sidebarProps = {
    brandTo: '/hub/dashboard',
    roleBadge: 'Logistics',
    tagline: 'Hub Command Center',
    nav,
    isActive,
    profile,
    user: shellUser,
    onLogout: handleLogout,
    navLabel: 'Logistics hub',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900 antialiased">
      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden lg:flex print:!hidden flex-col ${sidebarW} shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-200 select-none`}
        style={SHELL_BG}
      >
        <ShellSidebar {...sidebarProps} collapsed={collapsed} />
      </aside>

      {/* ── Mobile nav overlay ── */}
      {mobileOpen && (
        <div className="lg:hidden print:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Hub menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className={`relative ${SIDEBAR_W_EXPANDED} max-w-[85vw] flex flex-col h-full z-50`} style={SHELL_BG}>
            <ShellSidebar {...sidebarProps} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Top bar + content ── */}
      <div className={`flex-1 min-w-0 ${mainML} print:!ml-0 flex flex-col min-h-screen transition-all duration-200`}>
        <ShellTopBar
          rootLabel="Loved-IT Logistics"
          pageLabel={pageLabel}
          roleLabel="Hub manager"
          user={shellUser}
          searchItems={searchItems}
          searchPlaceholder="Search hub console..."
          alerts={alerts}
          messages={{ to: '/hub/messages', unread: chat.total }}
          menuLinks={[
            { icon: Bike, label: 'Riders & Fleet', to: '/hub/riders' },
            { icon: BarChart2, label: 'Performance Reports', to: '/hub/reports' },
          ]}
          onToggleSidebar={toggleCollapse}
          onOpenMobile={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 lg:p-6 print:p-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Outlet context={{ refreshChatUnread: chat.refresh } satisfies HubOutletContext} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
