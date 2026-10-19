import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Gauge,
  PackagePlus,
  Layers,
  Send,
  Truck,
  Bike,
  BarChart2,
  MessageSquare,
  UserCheck,
  AlertTriangle,
  Wallet,
  Settings,
} from 'lucide-react';
import HubSidebar from './HubSidebar';
import './hub.css';
import { useAuth } from '../../hooks/useAuth';
import { useHubChatUnread } from '../../hooks/useHubChatUnread';
import { getHubDashboardMetricsApi, getHubRidersApi } from '../../api/client';
import {
  ShellTopBar,
  type ShellAlert,
  type ShellNavGroup,
  type ShellSearchItem,
} from '../../components/shell/PortalChrome';

/** What the hub pages can ask of the layout. */
export interface HubOutletContext {
  /** Re-read the unread badge on the Messages nav item. */
  refreshChatUnread: () => void;
  /** Waiting for the hub, read by the layout for its badges, so a page need not ask again. */
  unreadMessages: number;
  pendingRiders: number;
  failedDeliveries: number;
}

const ROUTE_TITLES: Record<string, string> = {
  '/hub/dashboard': 'Overview',
  '/hub/intake': 'Parcel Intake',
  '/hub/sorting': 'Package Sorting',
  '/hub/dispatch': 'Delivery Dispatch',
  '/hub/deliveries': 'Delivery Monitoring',
  '/hub/riders': 'Riders & Fleet',
  '/hub/messages': 'Rider Messages',
  '/hub/reports': 'Performance Reports',
  '/hub/earnings': 'Earnings',
  '/hub/settings': 'Settings',
};

const SIDEBAR_W_EXPANDED = 'w-[264px]';
const SIDEBAR_W_COLLAPSED = 'w-[84px]';
const ML_EXPANDED = 'lg:ml-[264px]';
const ML_COLLAPSED = 'lg:ml-[84px]';
const ALERTS_POLL_MS = 60000;

export default function HubLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const reducedMotion = useReducedMotion();
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
    {
      heading: 'Insights',
      items: [
        { icon: BarChart2, label: 'Reports', to: '/hub/reports' },
        { icon: Wallet, label: 'Earnings', to: '/hub/earnings' },
      ],
    },
    { heading: 'Settings', items: [{ icon: Settings, label: 'Settings', to: '/hub/settings' }] },
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
    { label: 'Earnings: your share of delivery fees', to: '/hub/earnings', group: 'Insights', icon: Wallet },
    { label: 'Settings: account, password, hub and GCash', to: '/hub/settings', group: 'Settings', icon: Settings },
  ];

  const alerts: ShellAlert[] = [];
  if (pendingRiders > 0) {
    alerts.push({ icon: UserCheck, tone: 'bg-amber-50 text-amber-600', title: `${pendingRiders} rider application${pendingRiders > 1 ? 's' : ''}`, detail: 'Waiting for your approval', to: '/hub/riders' });
  }
  if (failedDeliveries > 0) {
    alerts.push({ icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600', title: `${failedDeliveries} failed deliver${failedDeliveries > 1 ? 'ies' : 'y'}`, detail: 'Reschedule or return to the seller', to: '/hub/deliveries' });
  }
  if (chat.total > 0) {
    alerts.push({ icon: MessageSquare, tone: 'bg-blue-50 text-blue-600', title: `${chat.total} unread message${chat.total > 1 ? 's' : ''}`, detail: 'From your riders', to: '/hub/messages' });
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

  const sidebarW = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const mainML = collapsed ? ML_COLLAPSED : ML_EXPANDED;

  const sidebarProps = {
    nav, isActive, user: shellUser, onLogout: handleLogout,
    hubName: hub?.hub_name || 'Sorting Center Hub', city: hub?.address_city,
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector<HTMLElement>('[aria-label="Hub menu"]');
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    document.addEventListener('keydown', onKey);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  return (
    <div className="hub-workspace min-h-screen flex font-sans text-gray-900 antialiased">
      <a href="#hub-main" className="hub-skip-link">Skip to content</a>
      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden lg:flex print:!hidden flex-col ${sidebarW} shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-200 select-none`}
      >
        <HubSidebar {...sidebarProps} collapsed={collapsed} />
      </aside>

      {/* ── Mobile nav overlay ── */}
      {mobileOpen && (
        <div className="lg:hidden print:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Hub menu">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className={`relative ${SIDEBAR_W_EXPANDED} max-w-[85vw] flex flex-col h-full z-50 bg-white shadow-2xl`}>
            <HubSidebar {...sidebarProps} collapsed={false} onClose={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Top bar + content ── */}
      <div className={`flex-1 min-w-0 ${mainML} print:!ml-0 flex flex-col min-h-screen transition-all duration-200`}>
        <ShellTopBar
          theme="light"
          rootLabel="Loved-IT Hub"
          pageLabel={pageLabel}
          roleLabel="Hub manager"
          user={shellUser}
          searchItems={searchItems}
          searchPlaceholder="Search hub console..."
          alerts={alerts}
          messages={{ to: '/hub/messages', unread: chat.total }}
          menuLinks={[
            { icon: Settings, label: 'Settings', to: '/hub/settings' },
            { icon: Bike, label: 'Riders & Fleet', to: '/hub/riders' },
            { icon: BarChart2, label: 'Performance Reports', to: '/hub/reports' },
          ]}
          onToggleSidebar={toggleCollapse}
          onOpenMobile={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main id="hub-main" className="hub-main flex-1 print:p-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="hub-page-content"
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.15, ease: 'easeOut' }}
            >
              <Outlet context={{ refreshChatUnread: chat.refresh, unreadMessages: chat.total, pendingRiders, failedDeliveries } satisfies HubOutletContext} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
