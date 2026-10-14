import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  Layers,
  Bike,
  MapPin,
  Clock,
  Info,
  Truck,
} from 'lucide-react';
import type { HubDashboardMetrics } from '../../types';

interface HubMetricCardsProps {
  metrics: HubDashboardMetrics | null;
  loading: boolean;
}

export default function HubMetricCards({ metrics, loading }: HubMetricCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading hub metrics">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between animate-pulse min-h-[140px]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-gray-200" />
              <div className="w-20 h-4 rounded-full bg-gray-200" />
            </div>
            <div>
              <div className="w-16 h-8 rounded-lg bg-gray-200 mb-2" />
              <div className="w-28 h-4 rounded-md bg-gray-100 mb-1" />
              <div className="w-36 h-3 rounded-md bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const inboundToday = metrics?.inbound_today ?? 0;
  const inSorting = metrics?.in_sorting ?? 0;
  const activeRiders = metrics?.active_riders ?? 0;
  const coverageCount = metrics?.hub?.coverage_barangays_count ?? 0;
  const outForDelivery = metrics?.out_for_delivery ?? 0;
  const failedDeliveries = metrics?.failed_deliveries ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* ── Card 1: Inbound Today ── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
            <ArrowDownToLine className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> Manila Today
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {inboundToday.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">parcels</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">Inbound Today</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {inboundToday === 0
              ? 'No packages intake yet today'
              : 'Scanned in during Philippine calendar day'}
          </p>
        </div>
      </div>

      {/* ── Card 2: In Sorting ── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs">
            <Layers className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            Awaiting Sort
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {inSorting.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">parcels</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">In Sorting</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {inSorting === 0
              ? 'Sorting floor is currently all clear'
              : 'Parcels currently at sorting center'}
          </p>
        </div>
      </div>

      {/* ── Card 3: Active Riders ── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 shadow-2xs">
            <Bike className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Info className="w-2.5 h-2.5" /> Active Fleet
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {activeRiders.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">riders</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">Active Riders</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {activeRiders === 0
              ? 'No active couriers currently on duty'
              : 'Couriers dispatched on active delivery routes'}
          </p>
        </div>
      </div>

      {/* ── Card 4: Coverage Barangays ── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100 shadow-2xs">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full truncate max-w-[120px]">
            {metrics?.hub?.address_city || 'Jurisdiction'}
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {coverageCount.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">barangays</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">Assigned Coverage</p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            {metrics?.hub?.address_province ? `${metrics.hub.address_city}, ${metrics.hub.address_province}` : 'Hub delivery territory'}
          </p>
        </div>
      </div>

      {/* ── Card 5: Out for Delivery (links to the Deliveries page) ── */}
      <Link
        to="/hub/deliveries"
        className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`Out for delivery: ${outForDelivery} parcels. Open the Deliveries page.`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100 shadow-2xs">
            <Truck className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
            On the Road
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {outForDelivery.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">parcels</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">Out for Delivery</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {outForDelivery === 0 ? 'Nothing is out with riders right now' : 'With riders on their delivery runs'}
          </p>
        </div>
      </Link>

      {/* ── Card 6: Failed Deliveries (links to the Failed tab) ── */}
      <Link
        to="/hub/deliveries?tab=failed"
        className={`bg-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          failedDeliveries > 0 ? 'border-red-200 hover:border-red-300' : 'border-gray-200/80 hover:border-gray-300'
        }`}
        aria-label={`Failed deliveries: ${failedDeliveries} parcels. Open the Failed tab.`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100 shadow-2xs">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
            {failedDeliveries > 0 ? 'Needs Action' : 'All Clear'}
          </span>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
              {failedDeliveries.toLocaleString()}
            </p>
            <span className="text-xs font-semibold text-gray-400">parcels</span>
          </div>
          <p className="text-xs font-bold text-gray-800 mt-2">Failed Deliveries</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {failedDeliveries === 0 ? 'No failed deliveries waiting' : 'Reschedule or return to the seller'}
          </p>
        </div>
      </Link>
    </div>
  );
}
