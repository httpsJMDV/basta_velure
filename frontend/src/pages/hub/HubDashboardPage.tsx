import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  RotateCw,
  AlertCircle,
  PackagePlus,
  Layers,
  Send,
  Building2,
  MapPin,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getHubDashboardMetricsApi } from '../../api/client';
import type { HubDashboardMetrics } from '../../types';
import HubMetricCards from '../../components/logistics/HubMetricCards';

export default function HubDashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<HubDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const data = await getHubDashboardMetricsApi();
      setMetrics(data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load hub operational metrics. Please check your network connection.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Refetch when browser window/tab regains focus
  useEffect(() => {
    const handleFocus = () => {
      fetchMetrics(true); // Silent refetch on tab focus
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchMetrics]);

  const hub = metrics?.hub || user?.sorting_center;

  return (
    <div className="space-y-6">
      {/* ── Top Hero Banner ── */}
      <div
        className="rounded-2xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden relative shadow-sm border border-neutral-800 text-white"
        style={{ background: 'linear-gradient(135deg, #0e131f 0%, #1a2236 50%, #291b22 100%)' }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Command Center
              </span>
              <span className="text-[11px] text-gray-400">
                Timezone: Asia/Manila (PST)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-brand-red shrink-0" />
              {hub?.hub_name || 'Sorting Center Hub'}
            </h1>
            {hub?.address_city && (
              <p className="text-xs sm:text-sm text-gray-300/80 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                {hub.address_street ? `${hub.address_street}, ` : ''}
                {hub.address_barangay}, {hub.address_city}, {hub.address_province}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {lastRefreshed && (
              <span className="hidden sm:inline text-[11px] text-gray-400">
                Updated {lastRefreshed.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => fetchMetrics()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              title="Refresh live metrics"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Error Banner with Retry Action ── */}
      {error && (
        <div className="rounded-2xl p-4 sm:p-5 bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800">Operational Metrics Error</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={() => fetchMetrics()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0 transition-colors shadow-2xs"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* ── Summary Metric Cards ── */}
      <section aria-label="Operational Summary">
        <HubMetricCards metrics={metrics} loading={loading} />
      </section>

      {/* ── Operations Workstation Quick Launch ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">
            Hub Operations Workstations
          </h2>
          <span className="text-[11px] text-gray-500 font-medium">Standard sorting workflow</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Workstation 1: Parcel Intake */}
          <Link
            to="/hub/intake"
            className="group bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs hover:border-gray-300 hover:shadow-sm transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-emerald-100">
                <PackagePlus className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 group-hover:text-brand-red transition-colors">
                Parcel Intake
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Scan incoming deliveries from local sellers and external logistics drop-offs.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-emerald-600">
              <span>Open Intake Station</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Workstation 2: Package Sorting */}
          <Link
            to="/hub/sorting"
            className="group bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs hover:border-gray-300 hover:shadow-sm transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-blue-100">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 group-hover:text-brand-red transition-colors">
                Package Sorting
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Route parcels into geographic bins by city, cluster, and destination barangay.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-blue-600">
              <span>Open Sorting Station</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Workstation 3: Delivery Dispatch */}
          <Link
            to="/hub/dispatch"
            className="group bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs hover:border-gray-300 hover:shadow-sm transition-all flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-purple-100">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 group-hover:text-brand-red transition-colors">
                Delivery Dispatch
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Assign sorted packages to available couriers and track bag handovers.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-purple-600">
              <span>Open Dispatch Desk</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </section>

      {/* ── Hub Information & Service Overview ── */}
      <section className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Hub Authorization &amp; Territory</h3>
              <p className="text-[11px] text-gray-500">Official sorting center profile</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            Active Hub Operator
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hub Facility</span>
            <p className="font-bold text-gray-900 text-sm mt-1">{hub?.hub_name}</p>
            <p className="text-gray-500 mt-0.5">Authorized Loved-IT Logistics Node</p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Jurisdiction</span>
            <p className="font-bold text-gray-900 text-sm mt-1">
              {hub?.address_city || 'City'}, {hub?.address_province || 'Province'}
            </p>
            <p className="text-gray-500 mt-0.5">Barangay {hub?.address_barangay || ''}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Delivery Coverage</span>
            <p className="font-bold text-gray-900 text-sm mt-1">
              {metrics?.hub?.coverage_barangays_count ?? 0} Designated Barangays
            </p>
            <p className="text-gray-500 mt-0.5">Active local delivery zone</p>
          </div>
        </div>
      </section>
    </div>
  );
}
