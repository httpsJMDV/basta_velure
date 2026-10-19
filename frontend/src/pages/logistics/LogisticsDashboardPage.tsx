import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Network, Warehouse, UserCheck, Bike, PackageOpen, Layers, Truck, AlertTriangle, PackageCheck, Undo2, ArrowRight, Boxes, Coins, Navigation, ScanLine, Banknote } from 'lucide-react';
import { getLogisticsDashboardApi } from '../../api/client';
import type { LogisticsDashboard } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';
import { PageHero, StatCard, StatCardSkeleton, SectionHeader, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { HeroStats, Pipeline, RiderAvailabilityStrip, useRiderAvailability } from '../../components/logistics/CourierKit';
import { RailCard, SplitBar } from '../../components/admin/listKit';
import { useAuth } from '../../hooks/useAuth';
import type { LogisticsOutletContext } from './LogisticsLayout';

/** The courier's network at a glance: where its parcels are now, who can work, and what needs attention. */
export default function LogisticsDashboardPage() {
  const { user } = useAuth();
  const { dashboard: d } = useOutletContext<LogisticsOutletContext>();
  const company = user?.logistics_company;
  const { riders } = useRiderAvailability();
  const inNetwork = d ? d.parcels_now.awaiting_pickup + d.parcels_now.at_hubs + d.parcels_now.out_for_delivery + d.parcels_now.failed : null;

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero
        icon={Network}
        eyebrow={`Courier · ${company?.code ?? ''}`}
        title={company?.name ?? 'Courier network'}
        subtitle="Your hubs, riders and parcels across the Loved-IT network"
      >
        {d && (
          <HeroStats items={[
            { label: 'In your network', value: inNetwork ?? 0 },
            { label: 'Can take a job', value: riders ? `${riders.available.length}/${riders.available.length + riders.unavailable.length}` : '…', tone: riders && riders.available.length === 0 ? 'warn' : 'good' },
            { label: 'Active hubs', value: d.hubs.approved },
          ]} />
        )}
        <Link to="/logistics/dispatch" className={HERO_BUTTON}><Navigation className="w-4 h-4" aria-hidden="true" /> Dispatch</Link>
        <Link to="/logistics/hub-ops" className={HERO_BUTTON}><ScanLine className="w-4 h-4" aria-hidden="true" /> Hub scanning</Link>
      </PageHero>

      {d && d.hubs.pending > 0 && (
        <Link to="/logistics/hubs" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 hover:border-amber-300">
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1"><b>{d.hubs.pending} hub application{d.hubs.pending > 1 ? 's' : ''}</b> waiting for your review.</span>
          <span className="inline-flex items-center gap-1 font-bold">Review <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
        </Link>
      )}

      <section>
        <SectionHeader title="Parcels right now" to="/logistics/parcels" />
        <Pipeline steps={[
          { label: 'Awaiting pickup', value: d?.parcels_now.awaiting_pickup ?? null, hint: 'At shops or on the way in', icon: PackageOpen, tone: 'sky', to: '/logistics/dispatch' },
          { label: 'At your hubs', value: d?.parcels_now.at_hubs ?? null, hint: 'Received or sorted', icon: Layers, tone: 'violet', to: '/logistics/hub-ops' },
          { label: 'Out for delivery', value: d?.parcels_now.out_for_delivery ?? null, hint: 'With riders', icon: Truck, tone: 'emerald', to: '/logistics/parcels' },
          { label: 'Failed deliveries', value: d?.parcels_now.failed ?? null, hint: 'Waiting for the hub', icon: AlertTriangle, tone: 'red', to: '/logistics/parcels?problems=1' },
        ]} />
      </section>

      <RiderAvailabilityStrip riders={riders} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4 min-w-0">
          <div>
            <SectionHeader title="Network" to="/logistics/hubs" />
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {!d ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
                <>
                  <StatCard compact icon={Warehouse} label="Active hubs" value={d.hubs.approved} iconBg="bg-rose-50" iconColor="text-brand-red" to="/logistics/hubs" actionLabel="View hubs" />
                  <StatCard compact icon={UserCheck} label="Hub applications" value={d.hubs.pending} iconBg="bg-amber-50" iconColor="text-amber-600" to="/logistics/hubs" actionLabel="Review" />
                  <StatCard compact icon={Bike} label="Active riders" value={d.riders.active} iconBg="bg-emerald-50" iconColor="text-emerald-600" to="/logistics/riders" actionLabel="View riders" />
                  <StatCard compact icon={Bike} label="Riders in review" value={d.riders.pending} subtext="Approved by their hub" iconBg="bg-gray-100" iconColor="text-gray-600" to="/logistics/riders" actionLabel="Verify" />
                </>
              )}
            </div>
          </div>
          <PeriodSection />
        </section>

        <aside className="space-y-3">
          <RailCard title="Shortcuts">
            <ul className="-mx-1 space-y-0.5">
              {[
                { to: '/logistics/dispatch', icon: Navigation, label: 'Dispatch pickups', hint: 'Unassigned and offered pickups' },
                { to: '/logistics/hub-ops', icon: ScanLine, label: 'Hub scanning', hint: 'Inbound, sort, outbound' },
                { to: '/logistics/returns', icon: Undo2, label: 'Return to sender', hint: 'Parcels going back to shops' },
                { to: '/logistics/cod', icon: Coins, label: 'COD & exports', hint: 'Collections and remittances' },
                { to: '/logistics/money', icon: Banknote, label: 'Settlements & pay', hint: 'Shops, riders and hubs' },
              ].map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 group-hover:bg-rose-50 group-hover:text-brand-red flex items-center justify-center shrink-0"><l.icon className="w-4 h-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold text-gray-900">{l.label}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{l.hint}</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-red" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </RailCard>
          {d && (
            <RailCard title="Parcels in your network">
              <SplitBar parts={[
                { label: 'Awaiting pickup', value: d.parcels_now.awaiting_pickup, color: 'bg-sky-500' },
                { label: 'At hubs', value: d.parcels_now.at_hubs, color: 'bg-violet-500' },
                { label: 'Out for delivery', value: d.parcels_now.out_for_delivery, color: 'bg-emerald-500' },
                { label: 'Failed', value: d.parcels_now.failed, color: 'bg-red-500' },
              ]} />
            </RailCard>
          )}
          <RailCard title="How your network works">
            <ul className="space-y-2 text-[12px] leading-relaxed text-gray-600">
              <li><strong className="text-gray-800">Hubs</strong> apply to join you. You check their permit, coverage and owner ID.</li>
              <li><strong className="text-gray-800">Riders</strong> are added and verified by you. Each holds up to 3 jobs.</li>
              <li><strong className="text-gray-800">Pickups</strong> go to your nearest Online rider for 60 seconds; unclaimed ones wait in <Link to="/logistics/dispatch" className="font-semibold text-brand-red hover:underline">Dispatch</Link>.</li>
            </ul>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}

const manilaDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

const PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7 days', days: 6 },
  { key: '30d', label: '30 days', days: 29 },
] as const;

/** Shipments in a period (L1): a preset or a custom range, both days included. */
function PeriodSection() {
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | 'custom'>('30d');
  const [from, setFrom] = useState(manilaDay(-29));
  const [to, setTo] = useState(manilaDay());
  const [data, setData] = useState<LogisticsDashboard['period'] | null>(null);
  const [error, setError] = useState('');
  const rangeError = to < from ? 'The end date cannot be before the start date.' : '';

  useEffect(() => {
    if (rangeError) return;
    let alive = true;
    setData(null);
    setError('');
    getLogisticsDashboardApi({ from, to })
      .then((d) => { if (alive) setData(d.period ?? null); })
      .catch((e) => { if (alive) setError(apiErrorMessage(e, 'The period could not be loaded.')); });
    return () => { alive = false; };
  }, [from, to, rangeError]);

  const choose = (key: (typeof PRESETS)[number]['key']) => {
    const p = PRESETS.find((x) => x.key === key)!;
    setPreset(key);
    setFrom(manilaDay(-p.days));
    setTo(manilaDay());
  };

  const input = 'h-9 px-2 text-[12px] border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-red';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <SectionHeader title="Shipments" to="/logistics/reports" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => choose(p.key)} aria-pressed={preset === p.key}
              className={`h-8 px-3 rounded-full text-[11.5px] font-bold border ${preset === p.key ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {p.label}
            </button>
          ))}
          <input type="date" aria-label="From" value={from} max={manilaDay()} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className={input} />
          <span className="text-gray-400 text-[12px]">to</span>
          <input type="date" aria-label="To" value={to} max={manilaDay()} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }}
            className={`${input} ${rangeError ? 'border-red-400' : ''}`} aria-invalid={!!rangeError} />
        </div>
      </div>
      {(rangeError || error) && <p className="mb-2 text-[12px] font-semibold text-red-700">{rangeError || error}</p>}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {!data ? [1, 2, 3, 4, 5, 6].map((i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard compact icon={Boxes} label="Shipments" value={data.shipments} subtext="Ready for pickup in the period" iconBg="bg-sky-50" iconColor="text-sky-600" />
            <StatCard compact icon={Bike} label="Picked up" value={data.picked_up} iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard compact icon={PackageCheck} label="Delivered" value={data.delivered} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <StatCard compact icon={AlertTriangle} label="Failed attempts" value={data.failed} iconBg="bg-red-50" iconColor="text-red-600" />
            <StatCard compact icon={Undo2} label="Returned to sellers" value={data.returned} iconBg="bg-amber-50" iconColor="text-amber-600" />
            <StatCard compact icon={Coins} label="COD collected" value={data.cod_collected} money iconBg="bg-rose-50" iconColor="text-brand-red" to="/logistics/cod" actionLabel="Reconcile" />
          </>
        )}
      </div>
    </div>
  );
}
