import { useOutletContext, Link } from 'react-router-dom';
import type { RiderOutletContext } from './RiderLayout';
import {
  Bike,
  Car,
  Truck,
  Warehouse,
  MapPin,
  Layers,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  PackagePlus,
  Send,
  Calendar,
} from 'lucide-react';

export default function RiderDashboardPage() {
  const { riderData, loading, error, refreshRider } = useOutletContext<RiderOutletContext>();

  const getVehicleIcon = (vehicleType?: string) => {
    switch (vehicleType) {
      case 'Car':
      case 'Van':
        return Car;
      case 'Truck':
        return Truck;
      default:
        return Bike;
    }
  };

  const VehicleIcon = getVehicleIcon(riderData?.vehicle_type);

  // Loading skeleton state
  if (loading && !riderData) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading courier dashboard">
        {/* Hero banner skeleton */}
        <div className="h-44 bg-gray-200 rounded-3xl" />
        {/* Metric cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-gray-200 rounded-2xl" />
          <div className="h-28 bg-gray-200 rounded-2xl" />
          <div className="h-28 bg-gray-200 rounded-2xl" />
          <div className="h-28 bg-gray-200 rounded-2xl" />
        </div>
        {/* Coverage section skeleton */}
        <div className="h-48 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  // Error state with retry
  if (error && !riderData) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-8 sm:p-12 text-center shadow-xs space-y-4 max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-gray-900">Failed to Load Dashboard</h2>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{error}</p>
        <button
          onClick={refreshRider}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Hero Welcome Banner ─────────────────────────────────────── */}
      <div
        className="rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-sm border border-neutral-800"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a8a 100%)' }}
      >
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Courier Station
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Status: {riderData?.status || 'ACTIVE'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            Welcome back, {riderData?.first_name || 'Courier'}!
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-xl">
            Your courier profile is active and ready for dispatch. Check your assigned delivery areas below and stand by for parcel collection and fulfillment orders.
          </p>
        </div>

        {/* Ambient background vehicle watermark */}
        <VehicleIcon className="absolute -right-6 -bottom-6 w-48 h-48 text-white/5 pointer-events-none transform -rotate-12" />
      </div>

      {/* ─── Courier Metrics / Key Information Cards ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hub Card */}
        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Assigned Hub
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Warehouse className="w-4 h-4" />
            </div>
          </div>
          <p className="text-base font-bold text-gray-900 truncate">
            {riderData?.hub?.hub_name || 'Unassigned Hub'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {riderData?.hub?.address_city
              ? `${riderData.hub.address_city}, ${riderData.hub.address_province}`
              : 'Philippines Operations'}
          </p>
        </div>

        {/* Vehicle Spec Card */}
        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Vehicle Type
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <VehicleIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-base font-bold text-gray-900">
            {riderData?.vehicle_type || 'Motorcycle'}
          </p>
          <p className="text-xs text-gray-500 font-mono">
            Plate: {riderData?.plate_number || 'N/A'}
          </p>
        </div>

        {/* Active Delivery Areas Card */}
        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Assigned Areas
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">
            {riderData?.active_areas_count || 0}
          </p>
          <p className="text-xs text-gray-500">
            {riderData?.active_areas_count === 1 ? '1 active sector' : `${riderData?.active_areas_count || 0} active sectors`}
          </p>
        </div>

        {/* Dispatch Readiness Card */}
        <div className="bg-white border border-gray-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Dispatch State
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-base font-bold text-gray-900">On Duty / Standby</p>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ready for assignments
          </p>
        </div>
      </div>

      {/* ─── Assigned Delivery Areas Section ─────────────────────────── */}
      <div className="bg-white border border-gray-200/90 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Delivery Area Coverage
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Barangay jurisdictions officially designated to you by your sorting center hub.
            </p>
          </div>
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
            {riderData?.active_areas_count || 0} Areas Active
          </span>
        </div>

        {riderData && riderData.active_areas && riderData.active_areas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riderData.active_areas.map((area) => (
              <div
                key={area.id}
                className="p-4 bg-gray-50/70 border border-gray-200 rounded-2xl space-y-2.5 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-900">{area.area_label}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Active
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {area.barangays_count} {area.barangays_count === 1 ? 'designated barangay' : 'designated barangays'}:
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {area.coverage_barangays.map((bgy) => (
                    <span
                      key={bgy}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-white text-blue-800 border border-blue-200/80 shadow-2xs"
                    >
                      PSGC {bgy}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 sm:p-12 text-center rounded-2xl bg-gray-50 border border-dashed border-gray-300 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-gray-800">No areas assigned yet</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
              Your sorting center hub administrator has not yet mapped your delivery sectors. As soon as your hub assigns barangays, they will appear here automatically.
            </p>
          </div>
        )}
      </div>

      {/* ─── Operational Quick Links (Coming in 2.4+) ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/rider/pickups"
          className="p-5 bg-white border border-gray-200 rounded-2xl shadow-2xs flex items-center gap-4 hover:border-blue-300 hover:shadow-xs transition-all group"
        >
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-900">Item Pickups</h3>
            <p className="text-xs text-gray-500 truncate">
              Merchant pickup routes & collection tasks
            </p>
          </div>
        </Link>

        <Link
          to="/rider/deliveries"
          className="p-5 bg-white border border-gray-200 rounded-2xl shadow-2xs flex items-center gap-4 hover:border-blue-300 hover:shadow-xs transition-all group"
        >
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Send className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-900">Active Deliveries</h3>
            <p className="text-xs text-gray-500 truncate">
              Dispatched parcels & recipient drop-offs
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
