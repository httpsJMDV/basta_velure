import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  Bike,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import {
  assignHubParcelsApi,
  getHubDispatchBatchParcelsApi,
  getHubDispatchBatchRidersApi,
  getHubDispatchBatchesApi,
} from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { HubDispatchBatch, HubDispatchParcel, HubDispatchRider, HubSortingSort } from '../../types';
import { PageHero, StatCard, LiveStamp } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import AwaitingPickupPanel from './AwaitingPickupPanel';

const POLL_MS = 30000;
const PARCEL_PAGE_SIZE = 100;
const MAX_ASSIGN_BATCH = 200;

interface ParcelListState {
  items: HubDispatchParcel[];
  total: number;
  page: number;
  lastPage: number;
  loading: boolean;
  error: string | null;
}

interface RiderListState {
  items: HubDispatchRider[];
  loading: boolean;
  error: string | null;
}

/** What the confirm dialog shows. Captured when it opens so background polling cannot change it. */
interface Confirmation {
  batch: HubDispatchBatch;
  trackingNumbers: string[];
  rider: HubDispatchRider;
}

const EMPTY_PARCELS: ParcelListState = { items: [], total: 0, page: 1, lastPage: 1, loading: false, error: null };
const EMPTY_RIDERS: RiderListState = { items: [], loading: false, error: null };

function waitingLabel(iso: string | null): string {
  if (!iso) return 'n/a';
  const minutes = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60000), 0);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function HubDispatchPage() {
  const { showToast } = useToast();

  const [batches, setBatches] = useState<HubDispatchBatch[]>([]);
  const [totals, setTotals] = useState({ batches: 0, parcels: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HubSortingSort>('waiting');

  const [expanded, setExpanded] = useState<string | null>(null);
  const [parcels, setParcels] = useState<ParcelListState>(EMPTY_PARCELS);
  const [riders, setRiders] = useState<RiderListState>(EMPTY_RIDERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [riderId, setRiderId] = useState<number | null>(null);

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignErrors, setAssignErrors] = useState<string[]>([]);

  const expandedRef = useRef<string | null>(null);
  const searchRef = useRef('');
  const sortRef = useRef<HubSortingSort>('waiting');
  const parcelsRef = useRef<ParcelListState>(EMPTY_PARCELS);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    expandedRef.current = expanded;
    searchRef.current = search;
    sortRef.current = sort;
    parcelsRef.current = parcels;
  }, [expanded, search, sort, parcels]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchBatches = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await getHubDispatchBatchesApi({ search: searchRef.current || undefined, sort: sortRef.current });
      setBatches(res.data);
      setTotals({ batches: res.meta.total_batches, parcels: res.meta.total_parcels });
      setError(null);
      setLastUpdated(new Date());
      // A batch that emptied out (or filtered away) cannot stay open.
      if (expandedRef.current && !res.data.some((b) => b.barangay_code === expandedRef.current)) {
        setExpanded(null);
        setSelected([]);
        setRiderId(null);
        setParcels(EMPTY_PARCELS);
        setRiders(EMPTY_RIDERS);
      }
    } catch (err: unknown) {
      if (silent) return;
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load dispatch batches.'
          : 'Could not load dispatch batches.'
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadParcels = useCallback(async (code: string, page: number, mode: 'replace' | 'append' | 'silent') => {
    if (mode !== 'silent') setParcels((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getHubDispatchBatchParcelsApi(code, { page, per_page: PARCEL_PAGE_SIZE });
      if (expandedRef.current !== code) return; // user moved on while we were loading
      setParcels((prev) => ({
        items: mode === 'append' ? [...prev.items, ...res.data] : res.data,
        total: res.meta.total,
        page: res.meta.current_page,
        lastPage: res.meta.last_page,
        loading: false,
        error: null,
      }));
      if (mode !== 'append' && res.meta.last_page === 1) {
        const present = new Set(res.data.map((p) => p.tracking_number));
        setSelected((prev) => prev.filter((tn) => present.has(tn)));
      }
    } catch (err: unknown) {
      if (mode === 'silent') return;
      setParcels((prev) => ({
        ...prev,
        loading: false,
        error: axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load parcels.'
          : 'Could not load parcels.',
      }));
    }
  }, []);

  const loadRiders = useCallback(async (code: string, silent = false) => {
    if (!silent) setRiders((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getHubDispatchBatchRidersApi(code);
      if (expandedRef.current !== code) return;
      setRiders({ items: res.data, loading: false, error: null });
      // A rider who is no longer eligible cannot stay chosen.
      setRiderId((prev) => (prev !== null && res.data.some((r) => r.id === prev) ? prev : null));
    } catch (err: unknown) {
      if (silent) return;
      setRiders((prev) => ({
        ...prev,
        loading: false,
        error: axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load riders.'
          : 'Could not load riders.',
      }));
    }
  }, []);

  // Refetch when search or sort change.
  useEffect(() => {
    void fetchBatches(false);
  }, [search, sort, fetchBatches]);

  // Refetch on tab focus and poll while the page is visible, so newly sorted parcels appear.
  useEffect(() => {
    const refresh = () => {
      void fetchBatches(true);
      const code = expandedRef.current;
      if (code) {
        if (parcelsRef.current.page === 1) void loadParcels(code, 1, 'silent');
        void loadRiders(code, true);
      }
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [fetchBatches, loadParcels, loadRiders]);

  const closeConfirm = useCallback(() => {
    setConfirmation(null);
    setAssignErrors([]);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Escape closes the confirm dialog unless a request is running.
  useEffect(() => {
    if (!confirmation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !assigning) closeConfirm();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmation, assigning, closeConfirm]);

  const toggleBatch = (code: string) => {
    if (expanded === code) {
      setExpanded(null);
      setSelected([]);
      setRiderId(null);
      setParcels(EMPTY_PARCELS);
      setRiders(EMPTY_RIDERS);
      return;
    }
    expandedRef.current = code;
    setExpanded(code);
    setSelected([]);
    setRiderId(null);
    setParcels({ ...EMPTY_PARCELS, loading: true });
    setRiders({ ...EMPTY_RIDERS, loading: true });
    void loadParcels(code, 1, 'replace');
    void loadRiders(code);
  };

  const toggleParcel = (tn: string) => {
    setSelected((prev) => (prev.includes(tn) ? prev.filter((x) => x !== tn) : [...prev, tn]));
  };

  const allLoadedSelected = parcels.items.length > 0 && parcels.items.every((p) => selected.includes(p.tracking_number));

  const toggleSelectAll = () => {
    setSelected(allLoadedSelected ? [] : parcels.items.map((p) => p.tracking_number));
  };

  const chosenRider = riders.items.find((r) => r.id === riderId) ?? null;
  const tooMany = selected.length > MAX_ASSIGN_BATCH;

  const openConfirm = (batch: HubDispatchBatch) => {
    if (!chosenRider) return;
    setConfirmation({ batch, trackingNumbers: selected, rider: chosenRider });
  };

  const handleAssign = async () => {
    if (!confirmation || assigning) return;
    setAssigning(true);
    setAssignErrors([]);
    try {
      const res = await assignHubParcelsApi(confirmation.rider.id, confirmation.trackingNumbers);
      showToast(
        `${plural(res.assigned_count, 'parcel', 'parcels')} assigned to ${res.rider.name || 'the rider'} for ${res.barangay.name || res.barangay.code}.`,
        'success'
      );
      setSelected((prev) => prev.filter((tn) => !confirmation.trackingNumbers.includes(tn)));
      setConfirmation(null);
      requestAnimationFrame(() => triggerRef.current?.focus());
      void fetchBatches(true);
      if (expandedRef.current) {
        void loadParcels(expandedRef.current, 1, 'replace');
        void loadRiders(expandedRef.current, true);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422 && err.response.data?.errors) {
        const errors = err.response.data.errors as Record<string, string[]>;
        setAssignErrors(
          Object.entries(errors).map(([key, msgs]) => {
            if (key === 'rider_id') return `Rider: ${msgs[0]}`;
            const index = Number(key.split('.')[1]);
            const tn = Number.isInteger(index) ? confirmation.trackingNumbers[index] : undefined;
            return tn ? `${tn}: ${msgs[0]}` : msgs[0];
          })
        );
        // Something changed under us (another dispatcher, a rider's areas): refresh what we show.
        void fetchBatches(true);
        if (expandedRef.current) {
          void loadParcels(expandedRef.current, 1, 'replace');
          void loadRiders(expandedRef.current, true);
        }
      } else {
        setAssignErrors([
          axios.isAxiosError(err) && err.response?.data?.message
            ? err.response.data.message
            : 'Could not assign these parcels. Check your connection and try again.',
        ]);
      }
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHero
        icon={Send}
        eyebrow="Operations"
        title="Delivery Dispatch"
        subtitle="Assign sorted parcels to a rider who covers the destination barangay."
      >
        <LiveStamp updatedAt={lastUpdated} />
      </PageHero>

      <section aria-label="Dispatch summary" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard compact icon={MapPin} label="Barangays" value={loading ? null : totals.batches} subtext="Ready for dispatch" iconBg="bg-violet-50" iconColor="text-violet-600" />
        <StatCard compact icon={Package} label="Sorted parcels" value={loading ? null : totals.parcels} subtext="Waiting for a rider" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard compact icon={Clock} label="Longest wait" value={loading || batches.length === 0 ? null : waitingLabel(batches.map((b) => b.oldest_sorted_at).filter((v): v is string => !!v).sort()[0] ?? null)} subtext="Since the oldest was sorted" iconBg="bg-amber-50" iconColor="text-amber-600" />
        <StatCard compact icon={Users} label="No eligible rider" value={loading ? null : batches.filter((b) => b.eligible_riders === 0).length} subtext="Barangays nobody can take" iconBg="bg-rose-50" iconColor="text-rose-600" />
      </section>
      <AwaitingPickupPanel />
      {/* Controls */}
      <div className="flex flex-col gap-2 p-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="dispatch-search" className="sr-only">Search barangay or city</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            id="dispatch-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search barangay or city, such as Poblacion"
            className="w-full min-h-[44px] pl-10 pr-3 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent"
          />
        </div>
        <CustomSelect
          className="sm:w-56"
          value={sort}
          onChange={(v) => setSort(v as HubSortingSort)}
          options={[
            { value: 'waiting', label: 'Longest waiting' },
            { value: 'count', label: 'Most parcels' },
          ]}
        />
      </div>
      {/* States */}
      {loading ? (
        <div className="space-y-3 animate-pulse" aria-label="Loading dispatch batches">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200/80 border border-gray-200" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="bg-white border border-red-200 rounded-3xl p-8 text-center space-y-3 max-w-lg mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-gray-900">Could not load dispatch batches</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button
            type="button"
            onClick={() => void fetchBatches(false)}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
            <Inbox className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-gray-900">
            {search ? 'No matching barangays' : 'Nothing sorted and waiting for dispatch'}
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            {search
              ? 'Try a different barangay or city name.'
              : 'Parcels appear here after you mark them as sorted on the Package Sorting page.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {batches.map((batch) => {
            const isOpen = expanded === batch.barangay_code;
            const panelId = `dispatch-panel-${batch.barangay_code}`;
            return (
              <li key={batch.barangay_code} className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleBatch(batch.barangay_code)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-black text-base text-gray-900">
                      {batch.barangay_name || 'Unnamed barangay'}
                      {batch.city && <span className="font-semibold text-gray-500">, {batch.city}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Package className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        {plural(batch.parcel_count, 'parcel', 'parcels')}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`Sorted ${formatDateTime(batch.oldest_sorted_at)}`}
                      >
                        <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        waiting {waitingLabel(batch.oldest_sorted_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        {plural(batch.eligible_riders, 'eligible rider', 'eligible riders')}
                      </span>
                    </div>
                    {batch.eligible_riders === 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        No eligible riders cover this barangay
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 self-start sm:self-center">
                    {isOpen ? 'Hide' : 'Select'}
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </span>
                </button>

                {batch.eligible_riders === 0 && (
                  <div className="px-4 sm:px-5 pb-3 -mt-1">
                    <Link
                      to="/hub/riders"
                      className="inline-flex items-center min-h-11 text-xs font-bold text-blue-700 hover:underline"
                    >
                      Assign a rider to this area
                    </Link>
                  </div>
                )}

                {isOpen && (
                  <div id={panelId} className="border-t border-gray-100 bg-gray-50/60 p-4 sm:p-5 space-y-5">
                    {/* Riders */}
                    <section aria-label="Eligible riders" className="space-y-2">
                      <h3 className="text-sm font-black text-gray-900">1. Choose a rider</h3>
                      {riders.loading && riders.items.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse" aria-label="Loading riders">
                          {[1, 2].map((i) => (
                            <div key={i} className="h-24 rounded-xl bg-gray-200/80" />
                          ))}
                        </div>
                      ) : riders.error ? (
                        <div role="alert" className="text-center space-y-2 py-3">
                          <p className="text-xs text-gray-600">{riders.error}</p>
                          <button
                            type="button"
                            onClick={() => void loadRiders(batch.barangay_code)}
                            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-brand-red text-white text-xs font-bold"
                          >
                            <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            Try again
                          </button>
                        </div>
                      ) : riders.items.length === 0 ? (
                        <div role="status" className="flex items-start gap-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>
                            No eligible riders cover this barangay. An active rider of this hub needs an active area that
                            includes it.
                          </span>
                        </div>
                      ) : (
                        <div role="radiogroup" aria-label="Eligible riders" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {riders.items.map((rider) => {
                            const checked = riderId === rider.id;
                            return (
                              <label
                                key={rider.id}
                                className={`flex items-start gap-3 p-3 min-h-12 rounded-xl border cursor-pointer bg-white ${
                                  checked ? 'border-brand-red ring-2 ring-red-200' : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`rider-${batch.barangay_code}`}
                                  checked={checked}
                                  onChange={() => setRiderId(rider.id)}
                                  className="w-5 h-5 mt-0.5 accent-brand-red shrink-0"
                                />
                                <span className="flex-1 min-w-0 space-y-0.5">
                                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                                    <Bike className="w-4 h-4 text-gray-400" aria-hidden="true" />
                                    {rider.name}
                                  </span>
                                  <span className="block text-xs text-gray-600">
                                    {rider.vehicle_type}
                                    {rider.plate_number && ` - ${rider.plate_number}`}
                                  </span>
                                  {rider.area_labels.length > 0 && (
                                    <span className="block text-[11px] text-gray-500">
                                      Area: {rider.area_labels.join(', ')}
                                    </span>
                                  )}
                                  <span className="block text-[11px] font-semibold text-gray-700">
                                    {rider.current_load === 0
                                      ? 'No parcels in flight'
                                      : `Carrying ${plural(rider.current_load, 'parcel', 'parcels')}`}
                                  </span>
                                </span>
                                {checked && (
                                  <span className="text-[11px] font-bold text-blue-700 shrink-0">Selected</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* Parcels */}
                    <section aria-label="Parcels to assign" className="space-y-3">
                      <h3 className="text-sm font-black text-gray-900">2. Choose parcels</h3>
                      {parcels.loading && parcels.items.length === 0 ? (
                        <div className="space-y-2 animate-pulse" aria-label="Loading parcels">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="h-12 rounded-xl bg-gray-200/80" />
                          ))}
                        </div>
                      ) : parcels.error ? (
                        <div role="alert" className="text-center space-y-2 py-3">
                          <p className="text-xs text-gray-600">{parcels.error}</p>
                          <button
                            type="button"
                            onClick={() => void loadParcels(batch.barangay_code, 1, 'replace')}
                            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-brand-red text-white text-xs font-bold"
                          >
                            <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            Try again
                          </button>
                        </div>
                      ) : parcels.items.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-3">No parcels waiting in this barangay.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer text-sm font-bold text-gray-800">
                              <input
                                type="checkbox"
                                checked={allLoadedSelected}
                                onChange={toggleSelectAll}
                                className="w-5 h-5 accent-brand-red"
                              />
                              Select all ({parcels.items.length})
                            </label>
                            <span className="text-xs text-gray-500">
                              {selected.length} selected of {parcels.total}
                            </span>
                          </div>

                          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-96 overflow-y-auto">
                            {parcels.items.map((p) => (
                              <li key={p.tracking_number}>
                                <label className="flex items-center gap-3 px-3 py-2 min-h-12 cursor-pointer hover:bg-gray-50">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(p.tracking_number)}
                                    onChange={() => toggleParcel(p.tracking_number)}
                                    className="w-5 h-5 accent-brand-red shrink-0"
                                  />
                                  <span className="flex-1 min-w-0">
                                    <span className="block font-mono text-xs font-bold text-gray-900 break-all">
                                      {p.tracking_number}
                                    </span>
                                    <span className="block text-[11px] text-gray-500">
                                      Order {p.order_number ?? 'n/a'}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-gray-500 shrink-0 text-right">
                                    Sorted {formatDateTime(p.sorted_at)}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>

                          {parcels.page < parcels.lastPage && (
                            <button
                              type="button"
                              onClick={() => void loadParcels(batch.barangay_code, parcels.page + 1, 'append')}
                              disabled={parcels.loading}
                              className="w-full min-h-11 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
                            >
                              Load more ({parcels.items.length} of {parcels.total})
                            </button>
                          )}
                        </>
                      )}
                    </section>

                    {tooMany && (
                      <p role="alert" className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        Select at most {MAX_ASSIGN_BATCH} parcels at a time.
                      </p>
                    )}

                    {parcels.items.length > 0 && riders.items.length > 0 && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          ref={triggerRef}
                          onClick={() => openConfirm(batch)}
                          disabled={selected.length === 0 || !chosenRider || tooMany || assigning}
                          className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" aria-hidden="true" />
                          {chosenRider
                            ? `Assign (${plural(selected.length, 'parcel', 'parcels')} to ${chosenRider.name})`
                            : `Assign (${plural(selected.length, 'parcel', 'parcels')})`}
                        </button>
                        {!chosenRider && (
                          <p className="text-center text-xs text-gray-500">Choose a rider to continue.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirm dialog */}
      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="space-y-2">
              <h2 id="assign-confirm-title" className="text-base font-black text-gray-900">
                Assign {plural(confirmation.trackingNumbers.length, 'parcel', 'parcels')} to {confirmation.rider.name}?
              </h2>
              <dl className="text-sm text-gray-700 space-y-1">
                <div className="flex gap-2">
                  <dt className="font-bold">Barangay:</dt>
                  <dd>
                    {confirmation.batch.barangay_name}
                    {confirmation.batch.city && `, ${confirmation.batch.city}`}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold">Rider:</dt>
                  <dd>
                    {confirmation.rider.name} ({confirmation.rider.vehicle_type}
                    {confirmation.rider.plate_number && `, ${confirmation.rider.plate_number}`})
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
              The rider is emailed once about this assignment. Assigned parcels cannot be moved back to sorted from this
              screen.
            </p>

            {assignErrors.length > 0 && (
              <div role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                <p className="font-bold">Nothing was changed.</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {assignErrors.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={assigning}
                className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {assignErrors.length > 0 ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void handleAssign()}
                disabled={assigning}
                className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
              >
                {assigning && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>{assignErrors.length > 0 ? 'Try again' : 'Confirm and assign'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
