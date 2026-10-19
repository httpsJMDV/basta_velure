import { useCallback, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ArrowDownToLine,
  Bike,
  Building2,
  Warehouse,
  CheckCircle2,
  Layers,
  MapPin,
  MessageSquare,
  PackagePlus,
  ScanLine,
  Send,
  Truck,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLivePolling } from '../../hooks/useLivePolling';
import { getHubDashboardMetricsApi, getHubReportSummaryApi } from '../../api/client';
import type { HubDashboardMetrics, HubReportDailyRow } from '../../types';
import { PageHeader, StatCard, StatCardSkeleton, CardTag, HEADER_BUTTON, HEADER_BUTTON_PRIMARY } from './hubKit';
import DailyChart from './reports/DailyChart';
import { addDays, manilaToday } from './reports/reportFormat';
import type { HubOutletContext } from './HubLayout';

const POLL_MS = 15000;

/** The four steps a parcel takes through the hub, with what is waiting at each. */
interface Station {
  to: string;
  icon: React.ElementType;
  title: string;
  blurb: string;
  figure: string | null;
  caption: string;
  tone: string;
}

export default function HubDashboardPage() {
  const { user } = useAuth();
  const { unreadMessages, pendingRiders } = useOutletContext<HubOutletContext>();
  const [metrics, setMetrics] = useState<HubDashboardMetrics | null>(null);
  const [week, setWeek] = useState<HubReportDailyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live: the numbers re-read themselves every few seconds while the tab is visible. There is no refresh button.
  const load = useCallback(async (silent: boolean) => {
    try {
      const today = manilaToday();
      const [m, report] = await Promise.all([
        getHubDashboardMetricsApi(),
        getHubReportSummaryApi({ from: addDays(today, -6), to: today }).catch(() => null),
      ]);
      setMetrics(m);
      if (report) setWeek(report.daily);
      setError(null);
    } catch (err: unknown) {
      if (silent) return;
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not load the hub numbers. Check your connection.'
      );
    }
  }, []);
  const { lastUpdated } = useLivePolling(load, POLL_MS);

  const loading = metrics === null && error === null;
  const hub = metrics?.hub || user?.sorting_center;
  const failed = metrics?.failed_deliveries ?? 0;
  const inSorting = metrics?.in_sorting ?? 0;

  const stations: Station[] = [
    { to: '/hub/intake', icon: PackagePlus, title: 'Parcel intake', blurb: 'Scan parcels in as riders drop them off.', figure: metrics ? String(metrics.inbound_today) : null, caption: 'received today', tone: 'bg-emerald-50 text-emerald-600' },
    { to: '/hub/sorting', icon: Layers, title: 'Sorting', blurb: 'Group parcels by destination barangay.', figure: metrics ? String(metrics.in_sorting) : null, caption: 'waiting to be sorted', tone: 'bg-blue-50 text-blue-600' },
    { to: '/hub/dispatch', icon: Send, title: 'Dispatch', blurb: 'Hand sorted parcels to the rider for that area.', figure: metrics ? String(metrics.active_riders) : null, caption: 'active riders', tone: 'bg-violet-50 text-violet-600' },
    { to: '/hub/deliveries', icon: Truck, title: 'Deliveries', blurb: 'Watch the road and triage failed deliveries.', figure: metrics ? String(metrics.out_for_delivery) : null, caption: 'on the road now', tone: 'bg-amber-50 text-amber-600' },
  ];

  const attention = [
    { show: pendingRiders > 0, icon: UserCheck, tone: 'bg-amber-50 text-amber-600', title: `${pendingRiders} rider application${pendingRiders === 1 ? '' : 's'}`, detail: 'Review the documents and approve or decline', to: '/hub/riders' },
    { show: failed > 0, icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600', title: `${failed} failed deliver${failed === 1 ? 'y' : 'ies'}`, detail: 'Reschedule with a rider or return to the seller', to: '/hub/deliveries' },
    { show: inSorting > 0, icon: Layers, tone: 'bg-blue-50 text-blue-600', title: `${inSorting} parcel${inSorting === 1 ? '' : 's'} waiting to be sorted`, detail: 'Sort them so they can be dispatched', to: '/hub/sorting' },
    { show: unreadMessages > 0, icon: MessageSquare, tone: 'bg-sky-50 text-sky-600', title: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`, detail: 'From your riders', to: '/hub/messages' },
  ].filter((a) => a.show);

  return (
    <div className="pb-8 space-y-3">
      <PageHeader
        accent="rose"
        updatedAt={lastUpdated}
        icon={Building2}
        title="Hub overview"
        subtitle={
          hub?.address_city ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              {hub.address_street ? `${hub.address_street}, ` : ''}
              {hub.address_barangay}, {hub.address_city}, {hub.address_province} · times in Asia/Manila
            </span>
          ) : (
            'Your parcels, people and daily operations in one place.'
          )
        }
      >
        <Link to="/hub/dispatch" className={HEADER_BUTTON}><Send className="w-4 h-4" aria-hidden="true" /> Dispatch</Link>
        <Link to="/hub/intake" className={HEADER_BUTTON_PRIMARY}><ScanLine className="w-4 h-4" aria-hidden="true" /> Scan parcels in</Link>
      </PageHeader>

      {error && (
        <div role="alert" className="flex items-start gap-3 px-4 py-3 text-red-900 border border-red-200 bg-red-50 rounded-xl">
          <AlertCircle className="w-5 h-5 mt-0.5 text-red-600 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-bold text-red-800">The hub numbers could not be loaded</p>
            <p className="mt-0.5 text-xs text-red-600">{error} This page keeps trying on its own.</p>
          </div>
        </div>
      )}

      <section className="hub-overview-banner" aria-label="Welcome to your hub">
        <div><div className="hub-eyebrow mb-2">Your operations, at a glance</div><h2>{hub?.hub_name || 'Sorting Center Hub'}</h2><p>Keep parcels moving. Manage your team. Stay on top of every delivery.</p></div>
        <div className="hub-banner-icon"><Warehouse size={28} strokeWidth={1.5} aria-hidden="true" /></div>
      </section>
      {/* Key figures: each one opens the station that works on it */}
      <section aria-label="Operational summary" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={ArrowDownToLine} label="Received today" value={metrics?.inbound_today} subtext="Scanned in, Manila day" iconBg="bg-emerald-50" iconColor="text-emerald-600"
              to="/hub/intake" actionLabel="Parcel intake" trendEl={<CardTag tone="emerald">Today</CardTag>} />
            <StatCard icon={Layers} label="In sorting" value={metrics?.in_sorting} subtext="At the hub, not yet sorted" iconBg="bg-blue-50" iconColor="text-blue-600"
              to="/hub/sorting" actionLabel="Sort parcels" trendEl={metrics && metrics.in_sorting > 0 ? <CardTag tone="blue">To sort</CardTag> : undefined} />
            <StatCard icon={Truck} label="Out for delivery" value={metrics?.out_for_delivery} subtext="On the road right now" iconBg="bg-amber-50" iconColor="text-amber-600"
              to="/hub/deliveries" actionLabel="Watch deliveries" trendEl={<CardTag tone="amber">Live</CardTag>} />
            <StatCard icon={AlertTriangle} label="Failed deliveries" value={metrics?.failed_deliveries} subtext="Waiting for your decision" iconBg="bg-rose-50" iconColor="text-rose-600"
              to="/hub/deliveries" actionLabel="Decide" trendEl={metrics && metrics.failed_deliveries > 0 ? <CardTag tone="rose">Needs you</CardTag> : undefined} />
            <StatCard icon={Bike} label="Active riders" value={metrics?.active_riders} subtext={`${pendingRiders} waiting for approval`} iconBg="bg-violet-50" iconColor="text-violet-600"
              to="/hub/riders" actionLabel="Riders" trendEl={pendingRiders > 0 ? <CardTag tone="violet">{pendingRiders} to review</CardTag> : undefined} />
          </>
        )}
      </section>

      <div className="hub-dashboard-columns">
        <div className="space-y-5 min-w-0">
          {/* The last seven days */}
          <section aria-labelledby="week-heading" className="hub-panel">
            <div className="hub-panel-heading">
              <div>
                <h2 id="week-heading" className="text-sm font-black text-gray-900">Parcel activity</h2>
                <p className="text-xs text-gray-500">A seven-day view of parcel movement.</p>
              </div>
              <Link to="/hub/reports" className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-red hover:text-brand-red-dark">
                Full reports <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            </div>
            {week === null ? (
              <div className="h-56 rounded-xl bg-gray-100 animate-pulse" aria-busy="true" />
            ) : (
              <DailyChart daily={week} bare height={260} />
            )}
          </section>
          <section aria-labelledby="flow-heading" className="hub-panel">
            <div className="hub-panel-heading"><div><h2 id="flow-heading">Operations pipeline</h2><p>Every parcel, from arrival to doorstep.</p></div><span className="text-[10px] text-gray-400">4 stations</span></div>
            <ol className="hub-stations">
              {stations.map((s, i) => {
                const Icon = s.icon;
                return <li key={s.to}><Link to={s.to} className="hub-station">
                  <div className="hub-station-top"><span className={['hub-stat-icon', s.tone].join(' ')}><Icon size={18} aria-hidden="true" /></span><span className="hub-station-number">0{i + 1}</span></div>
                  <h3>{s.title}</h3><p>{s.blurb}</p><strong>{s.figure ?? 'n/a'}</strong><span className="hub-station-caption">{s.caption}</span>
                  <span className="hub-station-open">Open station <ArrowRight size={12} aria-hidden="true" /></span>
                </Link></li>;
              })}
            </ol>
          </section>

        </div>

        <div className="hub-dashboard-aside space-y-5">
          {/* What needs the manager */}
          <section aria-labelledby="attention-heading" className="hub-panel">
            <h2 id="attention-heading" className="text-sm font-black text-gray-900">Action center</h2>
            <p className="text-xs text-gray-500 mb-3">Your next steps, in one place.</p>
            {loading ? (
              <div className="space-y-2 animate-pulse" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}</div>
            ) : attention.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-bold text-gray-900">All clear</p>
                <p className="max-w-[16rem] text-xs text-gray-500">No applications, failed deliveries, unsorted parcels or unread messages.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.map(({ icon: Icon, tone, title, detail, to }) => (
                  <li key={to + title}>
                    <Link to={to} className="group flex items-center gap-3 p-2.5 transition-colors border rounded-xl border-gray-100 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red">
                      <span className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${tone}`}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-gray-900 truncate">{title}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{detail}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-red transition-colors shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* The hub's territory */}
          <section aria-labelledby="territory-heading" className="hub-panel">
            <h2 id="territory-heading" className="text-sm font-black text-gray-900">Hub profile</h2>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Facility</dt>
                <dd className="mt-0.5 font-bold text-gray-900">{hub?.hub_name ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Jurisdiction</dt>
                <dd className="mt-0.5 font-bold text-gray-900">{hub?.address_city ?? 'n/a'}, {hub?.address_province ?? 'n/a'}</dd>
                <dd className="text-gray-500">Barangay {hub?.address_barangay ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Delivery coverage</dt>
                <dd className="mt-0.5 font-bold text-gray-900">
                  {metrics?.hub?.coverage_barangays_count !== undefined ? `${metrics.hub.coverage_barangays_count} barangays` : 'n/a'}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
