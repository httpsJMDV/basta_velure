import { Link, useOutletContext } from 'react-router-dom';
import { Network, Warehouse, UserCheck, Bike, PackageOpen, Layers, Truck, AlertTriangle, PackageCheck, Undo2, ArrowRight } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton, SectionHeader } from '../../components/admin/dashboardKit';
import { RailCard, SplitBar } from '../../components/admin/listKit';
import { useAuth } from '../../hooks/useAuth';
import type { LogisticsOutletContext } from './LogisticsLayout';

/** The courier's network at a glance: hubs, riders and where its parcels are right now. */
export default function LogisticsDashboardPage() {
  const { user } = useAuth();
  const { dashboard: d } = useOutletContext<LogisticsOutletContext>();
  const company = user?.logistics_company;

  return (
    <div className="pb-8 space-y-4">
      <PageHero
        icon={Network}
        eyebrow={`Courier · ${company?.code ?? ''}`}
        title={company?.name ?? 'Courier network'}
        subtitle="Your hubs, riders and parcels across the Loved-IT network"
      >
        {d && d.hubs.pending > 0 && (
          <Link to="/logistics/hubs" className="min-h-11 inline-flex items-center gap-2 px-3.5 rounded-xl bg-amber-400 text-gray-900 text-xs font-bold hover:bg-amber-300 transition-colors">
            {d.hubs.pending} hub application{d.hubs.pending > 1 ? 's' : ''} to review <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </PageHero>

      <section>
        <SectionHeader title="Right now" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {!d ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
            <>
              <StatCard icon={PackageOpen} label="Awaiting pickup" value={d.parcels_now.awaiting_pickup} subtext="Ready at sellers or on the way in" iconBg="bg-sky-50" iconColor="text-sky-600" />
              <StatCard icon={Layers} label="At your hubs" value={d.parcels_now.at_hubs} subtext="Received or sorted" iconBg="bg-violet-50" iconColor="text-violet-600" />
              <StatCard icon={Truck} label="Out for delivery" value={d.parcels_now.out_for_delivery} subtext="With riders" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              <StatCard icon={AlertTriangle} label="Failed deliveries" value={d.parcels_now.failed} subtext="Waiting for the hub" iconBg="bg-red-50" iconColor="text-red-600"
                to="/logistics/parcels?problems=1" actionLabel="Review" />
            </>
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <div>
            <SectionHeader title="Network" to="/logistics/hubs" />
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {!d ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
                <>
                  <StatCard compact icon={Warehouse} label="Active hubs" value={d.hubs.approved} iconBg="bg-rose-50" iconColor="text-brand-red" to="/logistics/hubs" actionLabel="View hubs" />
                  <StatCard compact icon={UserCheck} label="Hub applications" value={d.hubs.pending} iconBg="bg-amber-50" iconColor="text-amber-600" to="/logistics/hubs" actionLabel="Review" />
                  <StatCard compact icon={Bike} label="Active riders" value={d.riders.active} iconBg="bg-emerald-50" iconColor="text-emerald-600" to="/logistics/riders" actionLabel="View riders" />
                  <StatCard compact icon={Bike} label="Riders in review" value={d.riders.pending} subtext="Approved by their hub" iconBg="bg-gray-100" iconColor="text-gray-600" />
                </>
              )}
            </div>
          </div>
          <div>
            <SectionHeader title="Last 30 days" to="/logistics/reports" />
            <div className="grid grid-cols-2 gap-2.5">
              {!d ? [1, 2].map((i) => <StatCardSkeleton key={i} />) : (
                <>
                  <StatCard icon={PackageCheck} label="Delivered" value={d.last_30_days.delivered} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                  <StatCard icon={Undo2} label="Returned to sellers" value={d.last_30_days.returned} iconBg="bg-amber-50" iconColor="text-amber-600" />
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-3">
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
              <li><strong className="text-gray-800">Riders</strong> are approved by the hub they apply to.</li>
              <li><strong className="text-gray-800">Buyers</strong> pick you at checkout; only your riders are offered those pickups.</li>
            </ul>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}
