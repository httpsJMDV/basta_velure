import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bike,
  Car,
  Inbox,
  Layers,
  MapPin,
  MessageSquare,
  PackagePlus,
  RefreshCw,
  Truck,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { getRiderDeliveriesApi, getRiderEarningsSummaryApi, getRiderPickupsApi } from '../../api/client';
import type { RiderOutletContext } from './RiderLayout';
import { IconChip, KpiSkeleton, KpiTile, PageHero, SectionCard, StateCard, type Tone } from './RiderUi';
import { BTN_PRIMARY } from './riderStyles';
import { AvailabilityToggle, JobOffers } from '../../components/rider/RiderWork';
import { useLiveRefresh } from '../../hooks/useLiveNotices';

interface Workload {
  pickupsAccepted: number;
  pickupsAvailable: number;
  pickedUp: number;
  toCollect: number;
  outForDelivery: number;
  earnedToday: string;
  deliveredToday: number;
}

const peso = (amount: string | number) =>
  '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TodoRow {
  icon: React.ElementType;
  tone: Tone;
  label: string;
  hint: string;
  count: number;
  to: string;
}

export default function RiderDashboardPage() {
  const { riderData, loading, error, refreshRider, chat } = useOutletContext<RiderOutletContext>();

  const [work, setWork] = useState<Workload | null>(null);
  const [workLoading, setWorkLoading] = useState(true);
  const [workError, setWorkError] = useState(false);

  // `silent` is the live refresh: no skeleton, and a failed attempt keeps today's numbers on screen.
  const loadWork = useCallback(async (silent = false) => {
    if (!silent) {
      setWorkLoading(true);
      setWorkError(false);
    }
    try {
      const [mine, deliveries, earnings] = await Promise.all([
        getRiderPickupsApi('mine'),
        getRiderDeliveriesApi('assigned'),
        getRiderEarningsSummaryApi('day'),
      ]);
      setWork({
        pickupsAccepted: mine.meta.mine_count,
        pickupsAvailable: mine.meta.available_count,
        pickedUp: mine.meta.picked_up_count,
        toCollect: deliveries.meta.assigned_count,
        outForDelivery: deliveries.meta.out_for_delivery_count,
        earnedToday: earnings.total_earned,
        deliveredToday: earnings.deliveries_count,
      });
      setWorkError(false);
    } catch {
      if (!silent) setWorkError(true);
    } finally {
      if (!silent) setWorkLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWork();
  }, [loadWork]);

  useLiveRefresh(() => void loadWork(true), 30_000);

  const VehicleIcon = riderData?.vehicle_type === 'Car' || riderData?.vehicle_type === 'Van' ? Car : Bike;

  if (loading && !riderData) {
    return (
      <div className="space-y-4" aria-label="Loading courier dashboard">
        <div className="h-16 bg-white border border-gray-200/80 rounded-2xl animate-pulse" />
        <KpiSkeleton />
        <div className="h-48 bg-white border border-gray-200/80 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error && !riderData) {
    return (
      <StateCard icon={AlertCircle} tone="red" title="Could not load your dashboard" message={error}>
        <button onClick={refreshRider} className={BTN_PRIMARY}>
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      </StateCard>
    );
  }

  const todo: TodoRow[] = work
    ? [
        { icon: PackagePlus, tone: 'red', label: 'Pickups waiting in your areas', hint: 'Sellers with parcels ready', count: work.pickupsAvailable, to: '/rider/pickups' },
        { icon: Warehouse, tone: 'amber', label: 'Parcels to drop at the hub', hint: 'Collected, not yet scanned in', count: work.pickedUp, to: '/rider/pickups' },
        { icon: MessageSquare, tone: 'gray', label: 'Unread messages', hint: 'Sellers, buyers and your hub', count: chat.total, to: '/rider/account' },
      ]
    : [];

  return (
    <div className="pb-4 space-y-4 w-full">
      <PageHero
        icon={VehicleIcon}
        title={`Courier Station · ${riderData?.full_name ?? 'Courier'}`}
        subtitle={`${riderData?.hub?.hub_name ?? 'No hub on file'} · ${riderData?.vehicle_type ?? 'Vehicle'}${riderData?.plate_number ? ` ${riderData.plate_number}` : ''}`}
        actions={
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {riderData?.status === 'ACTIVE' ? 'Active' : (riderData?.status ?? 'Active')}
            </span>
            <Link to="/rider/deliveries" className={`${BTN_PRIMARY} !min-h-9 !px-3.5`}>
              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
              Deliveries
            </Link>
          </>
        }
      />

      <AvailabilityToggle />
      <JobOffers onAccepted={() => void loadWork(true)} />

      {workLoading && !work ? (
        <KpiSkeleton />
      ) : workError || !work ? (
        <div role="alert" className="bg-white border border-gray-200/80 rounded-xl px-4 py-3 shadow-xs">
          <p className="text-xs text-gray-700">Could not load today&apos;s numbers. Check your connection; they load on their own once it is back.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile icon={PackagePlus} tone="red" label="Pickups to do" value={String(work.pickupsAccepted)} hint="Accepted, not yet collected" tag="Pickups" />
          <KpiTile icon={Warehouse} tone="amber" label="To collect at hub" value={String(work.toCollect)} hint="Assigned to you" tag="Hub" />
          <KpiTile icon={Truck} tone="red" label="Out for delivery" value={String(work.outForDelivery)} hint="On your route now" tag="Route" />
          <KpiTile
            icon={Wallet}
            tone="emerald"
            label="Earned today"
            value={peso(work.earnedToday)}
            hint={`${work.deliveredToday} ${work.deliveredToday === 1 ? 'delivery' : 'deliveries'} today`}
            tag="Today"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        <SectionCard id="todo-heading" title="Needs your attention" subtitle="Where to go next" className="lg:col-span-7">
          {workLoading && !work ? (
            <div className="space-y-2 animate-pulse" aria-hidden="true">
              <div className="h-14 bg-gray-100 rounded-xl" />
              <div className="h-14 bg-gray-100 rounded-xl" />
            </div>
          ) : todo.length === 0 ? (
            <p className="text-xs text-gray-600 py-4 text-center">Open Pickups or Deliveries to see your work.</p>
          ) : (
            <ul className="divide-y divide-gray-100 -my-1">
              {todo.map((row) => (
                <li key={row.label}>
                  <Link to={row.to} className="flex items-center gap-3 min-h-14 py-2.5 rounded-xl group">
                    <IconChip icon={row.icon} tone={row.tone} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900 group-hover:text-brand-red transition-colors">{row.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{row.hint}</p>
                    </div>
                    <span
                      className={`min-w-7 h-7 px-2 rounded-full text-xs font-black inline-flex items-center justify-center ${
                        row.count > 0 ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {row.count}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red transition-colors" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          id="profile-heading"
          title="Your hub and vehicle"
          className="lg:col-span-5"
          action={
            <Link to="/rider/account" className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 shrink-0">
              Edit <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          }
        >
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <IconChip icon={Warehouse} tone="gray" size="sm" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold text-gray-500">Assigned hub</dt>
                <dd className="font-bold text-gray-900 truncate">{riderData?.hub?.hub_name ?? 'No hub on file'}</dd>
                <dd className="text-xs text-gray-600 truncate">
                  {riderData?.hub?.address_city ? `${riderData.hub.address_city}, ${riderData.hub.address_province}` : 'Location not set'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <IconChip icon={VehicleIcon} tone="gray" size="sm" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold text-gray-500">Vehicle</dt>
                <dd className="font-bold text-gray-900">{riderData?.vehicle_type ?? 'Not set'}</dd>
                <dd className="text-xs text-gray-600 font-mono">{riderData?.plate_number ?? 'No plate'}</dd>
              </div>
            </div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        id="areas-heading"
        title="Delivery area coverage"
        subtitle="Barangays your hub assigned to you. Pickups and deliveries come from these."
        action={
          <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 shrink-0">
            {riderData?.active_areas_count ?? 0} {riderData?.active_areas_count === 1 ? 'area' : 'areas'}
          </span>
        }
      >
        {riderData && riderData.active_areas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {riderData.active_areas.map((area) => (
              <div key={area.id} className="p-3.5 bg-gray-50/70 border border-gray-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-brand-red shrink-0" aria-hidden="true" />
                    <span className="truncate">{area.area_label}</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Active</span>
                </div>
                <p className="text-xs text-gray-600">
                  {area.barangays_count} {area.barangays_count === 1 ? 'barangay' : 'barangays'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {area.coverage_barangays.map((code) => (
                    <span key={code} className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-white text-gray-700 border border-gray-200">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <StateCard
            icon={Layers}
            title="No areas assigned yet"
            message="Your hub has not mapped your delivery areas. They appear here as soon as it does, and pickups in those barangays will show up on the Pickups page."
          />
        )}
      </SectionCard>

      {!workLoading && work && work.pickupsAccepted + work.toCollect + work.outForDelivery === 0 && (
        <p className="text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
          <Inbox className="w-3.5 h-3.5" aria-hidden="true" />
          Nothing on your route right now.
        </p>
      )}
    </div>
  );
}
