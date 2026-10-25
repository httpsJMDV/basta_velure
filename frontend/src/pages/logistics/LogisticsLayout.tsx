import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Gauge, Warehouse, Bike, Package, BarChart2, AlertTriangle, Building2, Network, ShoppingBag, Banknote, MapPinned, Navigation, ScanLine, Undo2, Coins, MessageSquare, Settings } from 'lucide-react';
import { getCourierChatUnreadApi } from '../../api/courierChat';
import { useAuth } from '../../hooks/useAuth';
import { getLogisticsDashboardApi } from '../../api/client';
import type { LogisticsDashboard } from '../../types';
import { ShellSidebar, ShellTopBar, SHELL_BG, type ShellAlert, type ShellNavGroup, type ShellSearchItem } from '../../components/shell/PortalChrome';

/** What the courier portal pages can read from the layout. */
export interface LogisticsOutletContext {
  dashboard: LogisticsDashboard | null;
  refresh: () => void;
  /** Updates the unread badge on Messages, right after a thread is read. */
  refreshChatUnread: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/logistics': 'Network Overview',
  '/logistics/hubs': 'Hubs & Applications',
  '/logistics/riders': 'Riders',
  '/logistics/parcels': 'Parcels',
  '/logistics/reports': 'Network Reports',
  '/logistics/money': 'Settlements & Pay',
  '/logistics/shipping': 'Zones & Rates',
  '/logistics/dispatch': 'Dispatch',
  '/logistics/hub-ops': 'Hub Scanning',
  '/logistics/returns': 'Return to Sender',
  '/logistics/cod': 'COD & Exports',
  '/logistics/messages': 'Messages',
  '/logistics/settings': 'Settings',
};

const POLL_MS = 60000;

/** The courier company's console: the same chrome as the admin and hub consoles. */
export default function LogisticsLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboard, setDashboard] = useState<LogisticsDashboard | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('logistics_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const load = useCallback(() => {
    getLogisticsDashboardApi().then(setDashboard).catch(() => {});
  }, []);
  const [chatUnread, setChatUnread] = useState(0);
  const loadChatUnread = useCallback(() => {
    getCourierChatUnreadApi().then(setChatUnread).catch(() => {});
  }, []);

  useEffect(() => { load(); loadChatUnread(); }, [load, loadChatUnread, location.pathname]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') { load(); loadChatUnread(); } }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, loadChatUnread]);

  function toggleCollapse() {
    setCollapsed((c) => {
      try { localStorage.setItem('logistics_sidebar_collapsed', String(!c)); } catch { /* storage unavailable */ }
      return !c;
    });
  }

  const company = user?.logistics_company;
  const pendingHubs = dashboard?.hubs.pending ?? 0;
  const failed = dashboard?.parcels_now.failed ?? 0;

  const nav: ShellNavGroup[] = useMemo(() => [
    { heading: 'Overview', items: [{ icon: Gauge, label: 'Dashboard', to: '/logistics' }] },
    {
      heading: 'Network',
      items: [
        { icon: Warehouse, label: 'Hubs', to: '/logistics/hubs', badge: pendingHubs },
        { icon: Bike, label: 'Riders', to: '/logistics/riders' },
        { icon: MapPinned, label: 'Zones & rates', to: '/logistics/shipping' },
        { icon: MessageSquare, label: 'Messages', to: '/logistics/messages', badge: chatUnread },
      ],
    },
    {
      heading: 'Operations',
      items: [
        { icon: Navigation, label: 'Dispatch', to: '/logistics/dispatch' },
        { icon: ScanLine, label: 'Hub scanning', to: '/logistics/hub-ops' },
        { icon: Package, label: 'Parcels', to: '/logistics/parcels', badge: failed },
        { icon: Undo2, label: 'Return to sender', to: '/logistics/returns' },
      ],
    },
    { heading: 'Insights', items: [{ icon: BarChart2, label: 'Reports', to: '/logistics/reports' }] },
    {
      heading: 'Money',
      items: [
        { icon: Coins, label: 'COD & exports', to: '/logistics/cod' },
        { icon: Banknote, label: 'Settlements & pay', to: '/logistics/money' },
      ],
    },
    { heading: 'Account', items: [{ icon: Settings, label: 'Settings', to: '/logistics/settings' }] },
  ], [pendingHubs, failed, chatUnread]);

  const searchItems: ShellSearchItem[] = [
    { label: 'Network overview', to: '/logistics', group: 'Overview', icon: Gauge },
    { label: 'Hubs and hub applications', to: '/logistics/hubs', group: 'Network', icon: Warehouse },
    { label: 'Riders across the network', to: '/logistics/riders', group: 'Network', icon: Bike },
    { label: 'Find a parcel', to: '/logistics/parcels', group: 'Network', icon: Package },
    { label: 'Delivery zones and shipping rates', to: '/logistics/shipping', group: 'Network', icon: MapPinned },
    { label: 'Dispatch: unassigned pickups, auto-assign', to: '/logistics/dispatch', group: 'Operations', icon: Navigation },
    { label: 'Hub scanning: inbound, sort, outbound', to: '/logistics/hub-ops', group: 'Operations', icon: ScanLine },
    { label: 'Return to sender queue', to: '/logistics/returns', group: 'Operations', icon: Undo2 },
    { label: 'COD reconciliation, remittances and exports', to: '/logistics/cod', group: 'Money', icon: Coins },
    { label: 'Network reports', to: '/logistics/reports', group: 'Insights', icon: BarChart2 },
    { label: 'Shop statements, rider and hub pay', to: '/logistics/money', group: 'Money', icon: Banknote },
    { label: 'Messages with your hubs', to: '/logistics/messages', group: 'Network', icon: MessageSquare },
    { label: 'Settings: account, company and GCash', to: '/logistics/settings', group: 'Account', icon: Settings },
  ];

  const alerts: ShellAlert[] = [];
  if (pendingHubs > 0) alerts.push({ icon: Warehouse, tone: 'bg-amber-500/20 text-amber-300', title: `${pendingHubs} hub application${pendingHubs > 1 ? 's' : ''}`, detail: 'Waiting for your review', to: '/logistics/hubs' });
  if (failed > 0) alerts.push({ icon: AlertTriangle, tone: 'bg-rose-500/20 text-rose-300', title: `${failed} failed deliver${failed > 1 ? 'ies' : 'y'}`, detail: 'Across your hubs', to: '/logistics/parcels?problems=1' });

  const isActive = (to: string) => (to === '/logistics' ? location.pathname === '/logistics' : location.pathname.startsWith(to));
  const handleLogout = () => { clearAuth(); navigate('/login'); };
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Courier team';
  const shellUser = { name: fullName, email: user?.email, initials: `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() || 'C' };

  const profile = (
    <div className="mx-3 mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 overflow-hidden text-amber-400 border rounded-lg bg-amber-500/10 border-amber-500/20 shrink-0">
          {company?.logo_url ? <img src={company.logo_url} alt="" className="object-cover w-full h-full" /> : <Building2 className="w-4 h-4" aria-hidden="true" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate" title={company?.name}>{company?.name ?? 'Courier company'}</p>
          <p className="text-[11px] text-white/45 mt-0.5 font-mono">{company?.code}</p>
        </div>
      </div>
    </div>
  );

  const sidebarProps = {
    brandTo: '/logistics',
    roleBadge: 'Courier',
    tagline: 'Courier Network Console',
    nav,
    isActive,
    profile,
    user: shellUser,
    onLogout: handleLogout,
    navLabel: 'Courier portal',
  };

  return (
    <div className="flex min-h-screen font-sans antialiased text-gray-900 bg-gray-50">
      <aside className={`hidden lg:flex print:!hidden flex-col ${collapsed ? 'w-16' : 'w-60'} shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-200 select-none`} style={SHELL_BG}>
        <ShellSidebar {...sidebarProps} collapsed={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Courier menu">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-60 max-w-[85vw] flex flex-col h-full z-50" style={SHELL_BG}>
            <ShellSidebar {...sidebarProps} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className={`flex-1 min-w-0 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'} print:!ml-0 flex flex-col min-h-screen transition-all duration-200`}>
        <ShellTopBar
          rootLabel={company?.name ?? 'Courier'}
          pageLabel={ROUTE_TITLES[location.pathname] ?? 'Courier Portal'}
          roleLabel="Courier admin"
          user={shellUser}
          searchItems={searchItems}
          searchPlaceholder="Search courier console..."
          alerts={alerts}
          menuLinks={[
            { icon: Network, label: 'Network overview', to: '/logistics' },
            { icon: ShoppingBag, label: 'Back to shopping', to: '/' },
          ]}
          onToggleSidebar={toggleCollapse}
          onOpenMobile={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />
        <main className="flex-1 p-4 lg:p-6 print:p-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}>
              <Outlet context={{ dashboard, refresh: load, refreshChatUnread: loadChatUnread } satisfies LogisticsOutletContext} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
