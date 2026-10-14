import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  Layers,
  MapPinOff,
  Package,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  getHubSortingGroupParcelsApi,
  getHubSortingGroupsApi,
  sortHubParcelsApi,
} from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { HubSortingGroup, HubSortingParcel, HubSortingSort } from '../../types';

const POLL_MS = 30000;
const PARCEL_PAGE_SIZE = 100;
const MAX_SORT_BATCH = 200;

interface ParcelListState {
  items: HubSortingParcel[];
  total: number;
  page: number;
  lastPage: number;
  loading: boolean;
  error: string | null;
}

const EMPTY_PARCELS: ParcelListState = { items: [], total: 0, page: 1, lastPage: 1, loading: false, error: null };

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

export default function HubSortingPage() {
  const { showToast } = useToast();

  const [groups, setGroups] = useState<HubSortingGroup[]>([]);
  const [totals, setTotals] = useState({ groups: 0, parcels: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HubSortingSort>('waiting');

  const [expanded, setExpanded] = useState<string | null>(null);
  const [parcels, setParcels] = useState<ParcelListState>(EMPTY_PARCELS);
  const [selected, setSelected] = useState<string[]>([]);

  const [confirmGroup, setConfirmGroup] = useState<HubSortingGroup | null>(null);
  // Snapshot of the selection taken when the confirm dialog opens, so background polling cannot change it.
  const [frozen, setFrozen] = useState<string[]>([]);
  const [sorting, setSorting] = useState(false);
  const [sortErrors, setSortErrors] = useState<string[]>([]);

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

  const fetchGroups = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await getHubSortingGroupsApi({
        search: searchRef.current || undefined,
        sort: sortRef.current,
      });
      setGroups(res.data);
      setTotals({ groups: res.meta.total_groups, parcels: res.meta.total_parcels });
      setError(null);
      // A group that emptied out (or filtered away) cannot stay expanded.
      if (expandedRef.current && !res.data.some((g) => g.barangay_code === expandedRef.current)) {
        setExpanded(null);
        setSelected([]);
        setParcels(EMPTY_PARCELS);
      }
    } catch (err: unknown) {
      if (silent) return;
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load sorting groups.'
          : 'Could not load sorting groups.'
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadParcels = useCallback(async (code: string, page: number, mode: 'replace' | 'append' | 'silent') => {
    if (mode !== 'silent') setParcels((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getHubSortingGroupParcelsApi(code, { page, per_page: PARCEL_PAGE_SIZE });
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

  // Refetch when search or sort change.
  useEffect(() => {
    void fetchGroups(false);
  }, [search, sort, fetchGroups]);

  // Refetch on tab focus and poll while the page is visible, so new scan-ins appear.
  useEffect(() => {
    const refresh = () => {
      void fetchGroups(true);
      const code = expandedRef.current;
      if (code && parcelsRef.current.page === 1) void loadParcels(code, 1, 'silent');
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
  }, [fetchGroups, loadParcels]);

  // Escape closes the confirm dialog unless a request is running.
  useEffect(() => {
    if (!confirmGroup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sorting) closeConfirm();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmGroup, sorting]);

  const toggleGroup = (code: string) => {
    if (expanded === code) {
      setExpanded(null);
      setSelected([]);
      setParcels(EMPTY_PARCELS);
      return;
    }
    expandedRef.current = code;
    setExpanded(code);
    setSelected([]);
    setParcels({ ...EMPTY_PARCELS, loading: true });
    void loadParcels(code, 1, 'replace');
  };

  const toggleParcel = (tn: string) => {
    setSelected((prev) => (prev.includes(tn) ? prev.filter((x) => x !== tn) : [...prev, tn]));
  };

  const allLoadedSelected = parcels.items.length > 0 && parcels.items.every((p) => selected.includes(p.tracking_number));

  const toggleSelectAll = () => {
    setSelected(allLoadedSelected ? [] : parcels.items.map((p) => p.tracking_number));
  };

  const closeConfirm = () => {
    setConfirmGroup(null);
    setSortErrors([]);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleSort = async () => {
    if (!confirmGroup || sorting) return;
    setSorting(true);
    setSortErrors([]);
    try {
      const res = await sortHubParcelsApi(frozen);
      showToast(
        `${res.sorted_count} ${res.sorted_count === 1 ? 'parcel' : 'parcels'} sorted for ${res.barangay.name || res.barangay.code}.`,
        'success'
      );
      setSelected((prev) => prev.filter((tn) => !frozen.includes(tn)));
      setConfirmGroup(null);
      requestAnimationFrame(() => triggerRef.current?.focus());
      void fetchGroups(true);
      if (expandedRef.current) void loadParcels(expandedRef.current, 1, 'replace');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422 && err.response.data?.errors) {
        const errors = err.response.data.errors as Record<string, string[]>;
        setSortErrors(
          Object.entries(errors).map(([key, msgs]) => {
            const index = Number(key.split('.')[1]);
            const tn = Number.isInteger(index) ? frozen[index] : undefined;
            return tn ? `${tn}: ${msgs[0]}` : msgs[0];
          })
        );
        // Something changed under us (another scan, another dispatcher): refresh what we show.
        void fetchGroups(true);
        if (expandedRef.current) void loadParcels(expandedRef.current, 1, 'replace');
      } else {
        setSortErrors([
          axios.isAxiosError(err) && err.response?.data?.message
            ? err.response.data.message
            : 'Could not sort these parcels. Check your connection and try again.',
        ]);
      }
    } finally {
      setSorting(false);
    }
  };

  const tooMany = selected.length > MAX_SORT_BATCH;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Package Sorting</h1>
            <p className="text-xs text-gray-500">Group received parcels by destination barangay and mark them sorted.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchGroups(false)}
          disabled={loading}
          className="self-start sm:self-auto min-h-11 inline-flex items-center gap-2 px-4 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="sorting-search" className="block text-xs font-bold text-gray-700 mb-1">
            Search barangay or city
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="sorting-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="e.g. Poblacion or Makati"
              className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="sm:w-56">
          <label htmlFor="sorting-sort" className="block text-xs font-bold text-gray-700 mb-1">
            Sort by
          </label>
          <select
            id="sorting-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as HubSortingSort)}
            className="w-full min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="waiting">Longest waiting</option>
            <option value="count">Most parcels</option>
          </select>
        </div>
      </div>

      {!loading && !error && groups.length > 0 && (
        <p className="text-xs text-gray-500">
          {totals.groups} {totals.groups === 1 ? 'barangay' : 'barangays'} &bull; {totals.parcels}{' '}
          {totals.parcels === 1 ? 'parcel' : 'parcels'} waiting
        </p>
      )}

      {/* States */}
      {loading ? (
        <div className="space-y-3 animate-pulse" aria-label="Loading sorting groups">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200/80 border border-gray-200" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="bg-white border border-red-200 rounded-3xl p-8 text-center space-y-3 max-w-lg mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-gray-900">Could not load sorting groups</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button
            type="button"
            onClick={() => void fetchGroups(false)}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
            <Inbox className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-gray-900">
            {search ? 'No matching barangays' : 'Nothing waiting to be sorted'}
          </h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            {search
              ? 'Try a different barangay or city name.'
              : 'Parcels appear here after you scan them in on the Parcel Intake page.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const isOpen = expanded === group.barangay_code;
            const panelId = `sorting-panel-${group.barangay_code}`;
            return (
              <li key={group.barangay_code} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.barangay_code)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-black text-base text-gray-900">
                      {group.barangay_name || 'Unnamed barangay'}
                      {group.city && <span className="font-semibold text-gray-500">, {group.city}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Package className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        {group.parcel_count} {group.parcel_count === 1 ? 'parcel' : 'parcels'}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`Oldest scanned in ${formatDateTime(group.oldest_scanned_in_at)}`}
                      >
                        <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        oldest {waitingLabel(group.oldest_scanned_in_at)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" aria-hidden="true" />
                        {group.riders_covering} {group.riders_covering === 1 ? 'rider' : 'riders'} covering
                      </span>
                    </div>
                    {(group.riders_covering === 0 || !group.in_coverage) && (
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {group.riders_covering === 0 && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            No riders cover this barangay
                          </span>
                        )}
                        {!group.in_coverage && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-[11px] font-bold text-red-900">
                            <MapPinOff className="w-3.5 h-3.5" aria-hidden="true" />
                            Outside this hub&apos;s coverage
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 self-start sm:self-center">
                    {isOpen ? 'Hide parcels' : 'View parcels'}
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    )}
                  </span>
                </button>

                {group.riders_covering === 0 && (
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
                  <div id={panelId} className="border-t border-gray-100 bg-gray-50/60 p-4 sm:p-5 space-y-3">
                    {parcels.loading && parcels.items.length === 0 ? (
                      <div className="space-y-2 animate-pulse" aria-label="Loading parcels">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-12 rounded-xl bg-gray-200/80" />
                        ))}
                      </div>
                    ) : parcels.error ? (
                      <div role="alert" className="text-center space-y-2 py-4">
                        <p className="text-sm font-bold text-gray-900">Could not load parcels</p>
                        <p className="text-xs text-gray-500">{parcels.error}</p>
                        <button
                          type="button"
                          onClick={() => void loadParcels(group.barangay_code, 1, 'replace')}
                          className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold"
                        >
                          <RefreshCw className="w-4 h-4" aria-hidden="true" />
                          Try again
                        </button>
                      </div>
                    ) : parcels.items.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">No parcels waiting in this barangay.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer text-sm font-bold text-gray-800">
                            <input
                              type="checkbox"
                              checked={allLoadedSelected}
                              onChange={toggleSelectAll}
                              className="w-5 h-5 accent-blue-600"
                            />
                            Select all ({parcels.items.length})
                          </label>
                          <span className="text-xs text-gray-500">
                            {selected.length} selected of {parcels.total}
                          </span>
                        </div>

                        <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-96 overflow-y-auto">
                          {parcels.items.map((p) => {
                            const checked = selected.includes(p.tracking_number);
                            return (
                              <li key={p.tracking_number}>
                                <label className="flex items-center gap-3 px-3 py-2 min-h-12 cursor-pointer hover:bg-gray-50">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleParcel(p.tracking_number)}
                                    className="w-5 h-5 accent-blue-600 shrink-0"
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
                                    {formatDateTime(p.scanned_in_at)}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>

                        {parcels.page < parcels.lastPage && (
                          <button
                            type="button"
                            onClick={() => void loadParcels(group.barangay_code, parcels.page + 1, 'append')}
                            disabled={parcels.loading}
                            className="w-full min-h-11 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
                          >
                            Load more ({parcels.items.length} of {parcels.total})
                          </button>
                        )}

                        {tooMany && (
                          <p role="alert" className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                            Select at most {MAX_SORT_BATCH} parcels at a time.
                          </p>
                        )}

                        <button
                          type="button"
                          ref={triggerRef}
                          onClick={() => {
                            setFrozen(selected);
                            setConfirmGroup(group);
                          }}
                          disabled={selected.length === 0 || tooMany || sorting}
                          className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
                        >
                          <CheckSquare className="w-4 h-4" aria-hidden="true" />
                          Mark as sorted ({selected.length})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirm dialog */}
      {confirmGroup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sort-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="space-y-1">
              <h2 id="sort-confirm-title" className="text-base font-black text-gray-900">
                Mark {frozen.length} {frozen.length === 1 ? 'parcel' : 'parcels'} as sorted?
              </h2>
              <p className="text-sm text-gray-600">
                Destination: <span className="font-bold">{confirmGroup.barangay_name}</span>
                {confirmGroup.city && `, ${confirmGroup.city}`}
              </p>
            </div>
            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
              Sorted parcels move to the next step (rider assignment). This cannot be undone from this screen.
            </p>

            {sortErrors.length > 0 && (
              <div role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                <p className="font-bold">Nothing was changed.</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {sortErrors.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={sorting}
                className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {sortErrors.length > 0 ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void handleSort()}
                disabled={sorting || frozen.length === 0}
                className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50"
              >
                {sorting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>{sortErrors.length > 0 ? 'Try again' : 'Confirm and sort'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
