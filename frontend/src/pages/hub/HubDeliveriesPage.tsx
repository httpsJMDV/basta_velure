import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  AlertCircle,
  Ban,
  Bike,
  CalendarClock,
  Clock,
  HelpCircle,
  Inbox,
  MapPin,
  MapPinOff,
  PhoneOff,
  RefreshCw,
  Search,
  Construction,
  Truck,
  Undo2,
  UserX,
  X,
} from 'lucide-react';
import type { ElementType } from 'react';
import {
  getHubDashboardMetricsApi,
  getHubDeliveriesFailedApi,
  getHubDeliveriesOutApi,
  getHubDispatchBatchRidersApi,
  rescheduleHubDeliveryApi,
  returnHubDeliveryToSellerApi,
} from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type {
  HubDeliveriesFailedResponse,
  HubDeliveriesOutResponse,
  HubDeliveryFailedRow,
  HubDeliveryOutRow,
  HubDispatchRider,
} from '../../types';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';

const POLL_MS = 30000;
const NOTE_MAX = 500;

type TabKey = 'out' | 'failed';

const REASON_ICONS: Record<string, ElementType> = {
  RECIPIENT_UNAVAILABLE: UserX,
  WRONG_ADDRESS: MapPinOff,
  REFUSED: Ban,
  CANNOT_CONTACT: PhoneOff,
  ADDRESS_INACCESSIBLE: Construction,
  OTHER: HelpCircle,
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatElapsed(minutes: number | null): string {
  if (minutes === null) return 'n/a';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

function validationLines(data: unknown): string[] {
  const errors = (data as { errors?: Record<string, string[]> } | undefined)?.errors;
  return errors ? Object.values(errors).flat() : [];
}

interface OutState {
  data: HubDeliveriesOutResponse | null;
  loading: boolean;
  error: string | null;
}
interface FailedState {
  data: HubDeliveriesFailedResponse | null;
  loading: boolean;
  error: string | null;
}

type Dialog =
  | { kind: 'reschedule'; parcel: HubDeliveryFailedRow }
  | { kind: 'return'; parcel: HubDeliveryFailedRow };

export default function HubDeliveriesPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey = searchParams.get('tab') === 'failed' ? 'failed' : 'out';

  const [counts, setCounts] = useState({ out: 0, failed: 0 });

  const [out, setOut] = useState<OutState>({ data: null, loading: true, error: null });
  const [outSearchInput, setOutSearchInput] = useState('');
  const [outSearch, setOutSearch] = useState('');
  const [riderFilter, setRiderFilter] = useState('');

  const [failed, setFailed] = useState<FailedState>({ data: null, loading: true, error: null });
  const [failedSearchInput, setFailedSearchInput] = useState('');
  const [failedSearch, setFailedSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [failedPage, setFailedPage] = useState(1);

  const [dialog, setDialog] = useState<Dialog | null>(null);

  const tabRef = useRef<TabKey>(tab);
  const outFilters = useRef({ search: '', rider: '' });
  const failedFilters = useRef({ search: '', reason: '', page: 1 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    tabRef.current = tab;
    outFilters.current = { search: outSearch, rider: riderFilter };
    failedFilters.current = { search: failedSearch, reason: reasonFilter, page: failedPage };
  }, [tab, outSearch, riderFilter, failedSearch, reasonFilter, failedPage]);

  // Debounce the two search boxes.
  useEffect(() => {
    const t = setTimeout(() => setOutSearch(outSearchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [outSearchInput]);
  useEffect(() => {
    const t = setTimeout(() => {
      setFailedSearch(failedSearchInput.trim());
      setFailedPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [failedSearchInput]);

  const fetchCounts = useCallback(async () => {
    try {
      const m = await getHubDashboardMetricsApi();
      setCounts({ out: m.out_for_delivery, failed: m.failed_deliveries });
    } catch {
      // The tab labels simply keep their last counts.
    }
  }, []);

  const fetchOut = useCallback(async (silent = false) => {
    if (!silent) setOut((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const f = outFilters.current;
      const data = await getHubDeliveriesOutApi({
        search: f.search || undefined,
        rider_id: f.rider ? Number(f.rider) : undefined,
      });
      setOut({ data, loading: false, error: null });
    } catch (err: unknown) {
      if (silent) return;
      setOut((prev) => ({
        ...prev,
        loading: false,
        error: axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load deliveries on the road.'
          : 'Could not load deliveries on the road.',
      }));
    }
  }, []);

  const fetchFailed = useCallback(async (silent = false) => {
    if (!silent) setFailed((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const f = failedFilters.current;
      const data = await getHubDeliveriesFailedApi({
        search: f.search || undefined,
        reason: f.reason || undefined,
        page: f.page,
        per_page: 20,
      });
      // The page we were on may no longer exist after an action emptied it.
      if (data.data.length === 0 && data.meta.total > 0 && data.meta.last_page < f.page) {
        setFailedPage(data.meta.last_page);
        return;
      }
      setFailed({ data, loading: false, error: null });
    } catch (err: unknown) {
      if (silent) return;
      setFailed((prev) => ({
        ...prev,
        loading: false,
        error: axios.isAxiosError(err)
          ? err.response?.data?.message || 'Could not load failed deliveries.'
          : 'Could not load failed deliveries.',
      }));
    }
  }, []);

  // Load the active tab when it or its filters change.
  useEffect(() => {
    if (tab === 'out') void fetchOut(false);
  }, [tab, outSearch, riderFilter, fetchOut]);
  useEffect(() => {
    if (tab === 'failed') void fetchFailed(false);
  }, [tab, failedSearch, reasonFilter, failedPage, fetchFailed]);
  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  // Live: refetch on tab focus and poll every 30 seconds while the page is visible.
  useEffect(() => {
    const refresh = () => {
      void fetchCounts();
      if (tabRef.current === 'out') void fetchOut(true);
      else void fetchFailed(true);
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
  }, [fetchCounts, fetchOut, fetchFailed]);

  const switchTab = (next: TabKey) => {
    if (next === tab) return;
    tabRef.current = next;
    setSearchParams(next === 'failed' ? { tab: 'failed' } : {}, { replace: true });
  };

  const openDialog = (next: Dialog, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setDialog(next);
  };

  // Focus goes back to the button that opened the dialog, or to the page heading if that button is gone.
  const closeDialog = useCallback(() => {
    setDialog(null);
    requestAnimationFrame(() => {
      const el = triggerRef.current;
      if (el && document.contains(el)) el.focus();
      else headingRef.current?.focus();
    });
  }, []);

  const afterAction = (message: string) => {
    showToast(message, 'success');
    closeDialog();
    void fetchCounts();
    void fetchFailed(true);
    void fetchOut(true);
  };

  // 404 / 409: the parcel is not (or no longer) failed. Say so and resync.
  const onConflict = (message: string) => {
    showToast(message, 'error');
    closeDialog();
    void fetchCounts();
    void fetchFailed(true);
  };

  // Group the live board by rider.
  const outGroups = (() => {
    const map = new Map<string, { key: string; name: string; plate: string | null; rows: HubDeliveryOutRow[] }>();
    for (const row of out.data?.data ?? []) {
      const key = String(row.rider?.id ?? 'none');
      if (!map.has(key)) {
        map.set(key, { key, name: row.rider?.name || 'Unassigned', plate: row.rider?.plate_number ?? null, rows: [] });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  })();

  return (
    <div className="space-y-5">
      <PageHero
        icon={Truck}
        eyebrow="Operations"
        title="Deliveries"
        headingRef={headingRef}
        subtitle="Watch parcels on the road and decide what happens to failed deliveries."
      >
        <button
          type="button"
          onClick={() => {
            void fetchCounts();
            if (tab === 'out') void fetchOut(false);
            else void fetchFailed(false);
          }}
          className={HERO_BUTTON}
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </PageHero>

      {/* Tabs */}
      <div role="tablist" aria-label="Delivery views" className="flex items-center border-b border-gray-200">
        {(
          [
            { key: 'out', label: 'Out for delivery', count: counts.out },
            { key: 'failed', label: 'Failed', count: counts.failed },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`deliveries-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="deliveries-panel"
            onClick={() => switchTab(t.key)}
            className={`min-h-11 px-4 text-xs font-bold flex items-center gap-2 transition-colors ${
              tab === t.key ? 'text-brand-red border-b-2 border-brand-red' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                tab === t.key ? 'bg-red-100 text-brand-red-dark' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div id="deliveries-panel" role="tabpanel" aria-labelledby={`deliveries-tab-${tab}`} className="space-y-4">
        {tab === 'out' ? (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="out-search" className="block text-xs font-bold text-gray-700 mb-1">
                  Search parcels
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="out-search"
                    type="search"
                    value={outSearchInput}
                    onChange={(e) => setOutSearchInput(e.target.value)}
                    placeholder="Tracking, order, recipient, barangay or rider"
                    className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                </div>
              </div>
              <div className="sm:w-64">
                <label htmlFor="out-rider" className="block text-xs font-bold text-gray-700 mb-1">
                  Rider
                </label>
                <select
                  id="out-rider"
                  value={riderFilter}
                  onChange={(e) => setRiderFilter(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">All riders</option>
                  {(out.data?.meta.riders ?? []).map((r) => (
                    <option key={r.rider_id ?? 'none'} value={r.rider_id ?? ''} disabled={r.rider_id === null}>
                      {r.name || 'Unassigned'} ({r.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {out.loading && !out.data ? (
              <div className="space-y-3 animate-pulse" aria-label="Loading deliveries on the road">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-gray-200/80 border border-gray-200" />
                ))}
              </div>
            ) : out.error ? (
              <ErrorPanel title="Could not load deliveries on the road" message={out.error} onRetry={() => void fetchOut(false)} />
            ) : outGroups.length === 0 ? (
              <EmptyPanel
                title={outSearch || riderFilter ? 'No matching parcels' : 'Nothing is out for delivery'}
                text={
                  outSearch || riderFilter
                    ? 'Try a different search or rider.'
                    : 'Parcels appear here as soon as a rider starts a delivery run.'
                }
              />
            ) : (
              <>
                {out.data?.meta.truncated && (
                  <p role="status" className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Showing the first 500 parcels. Use search or the rider filter to narrow the board.
                  </p>
                )}
                {outGroups.map((group) => (
                  <section key={group.key} aria-label={group.name} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <header className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <p className="flex items-center gap-2 text-sm font-black text-gray-900 min-w-0">
                        <Bike className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                        <span className="truncate">{group.name}</span>
                        {group.plate && <span className="text-xs font-semibold text-gray-500">{group.plate}</span>}
                      </p>
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5 shrink-0">
                        {plural(group.rows.length, 'parcel', 'parcels')}
                      </span>
                    </header>
                    <ul className="divide-y divide-gray-100">
                      {group.rows.map((row) => (
                        <li key={row.tracking_number} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1 sm:gap-4 sm:items-center">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-gray-900 break-all">{row.tracking_number}</p>
                            <p className="text-[11px] text-gray-500">
                              Order {row.order_number ?? 'n/a'} &bull; {row.recipient_name}
                            </p>
                          </div>
                          <p className="flex items-start gap-1.5 text-xs text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              {row.destination.barangay_name}
                              {row.destination.city && `, ${row.destination.city}`}
                            </span>
                          </p>
                          <p
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 sm:justify-end"
                            title={`Out since ${formatDateTime(row.out_for_delivery_at)}`}
                          >
                            <Clock className="w-4 h-4 text-gray-400" aria-hidden="true" />
                            {formatElapsed(row.elapsed_minutes)} on the road
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="failed-search" className="block text-xs font-bold text-gray-700 mb-1">
                  Search parcels
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="failed-search"
                    type="search"
                    value={failedSearchInput}
                    onChange={(e) => setFailedSearchInput(e.target.value)}
                    placeholder="Tracking, order, recipient, barangay or rider"
                    className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                </div>
              </div>
              <div className="sm:w-72">
                <label htmlFor="failed-reason" className="block text-xs font-bold text-gray-700 mb-1">
                  Reason
                </label>
                <select
                  id="failed-reason"
                  value={reasonFilter}
                  onChange={(e) => {
                    setReasonFilter(e.target.value);
                    setFailedPage(1);
                  }}
                  className="w-full min-h-11 px-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">All reasons</option>
                  {(failed.data?.meta.reasons ?? []).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {failed.loading && !failed.data ? (
              <div className="space-y-3 animate-pulse" aria-label="Loading failed deliveries">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 rounded-2xl bg-gray-200/80 border border-gray-200" />
                ))}
              </div>
            ) : failed.error ? (
              <ErrorPanel title="Could not load failed deliveries" message={failed.error} onRetry={() => void fetchFailed(false)} />
            ) : (failed.data?.data.length ?? 0) === 0 ? (
              <EmptyPanel
                title={failedSearch || reasonFilter ? 'No matching failed deliveries' : 'No failed deliveries'}
                text={
                  failedSearch || reasonFilter
                    ? 'Try a different search or reason.'
                    : 'When a rider cannot deliver a parcel, it shows up here for you to reschedule or return.'
                }
              />
            ) : (
              <>
                <ul className="space-y-3">
                  {failed.data!.data.map((p) => {
                    const Icon = REASON_ICONS[p.failure_reason?.code ?? 'OTHER'] ?? HelpCircle;
                    const hintId = `reschedule-hint-${p.tracking_number}`;
                    return (
                      <li key={p.tracking_number} className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-black text-gray-900 break-all">{p.tracking_number}</p>
                            <p className="text-xs text-gray-500">
                              Order {p.order_number ?? 'n/a'} &bull; {p.recipient_name}
                            </p>
                          </div>
                          <span
                            className={`self-start inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              p.can_reschedule
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : 'bg-red-50 text-red-900 border-red-200'
                            }`}
                          >
                            Attempt {p.delivery_attempts} of {p.max_attempts}
                          </span>
                        </div>

                        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
                          <Icon className="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />
                          <div className="min-w-0 text-sm">
                            <p className="font-black text-red-950">{p.failure_reason?.label ?? 'Reason not recorded'}</p>
                            {p.failure_note && <p className="text-xs text-red-900 mt-0.5">Rider&apos;s note: {p.failure_note}</p>}
                          </div>
                        </div>

                        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700">
                          <div className="flex items-start gap-1.5">
                            <Bike className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                              <dt className="font-bold">Rider</dt>
                              <dd>
                                {p.rider ? `${p.rider.name}${p.rider.plate_number ? ` (${p.rider.plate_number})` : ''}` : 'Unknown'}
                              </dd>
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                              <dt className="font-bold">Destination</dt>
                              <dd>
                                {p.destination.barangay_name}
                                {p.destination.city && `, ${p.destination.city}`}
                              </dd>
                            </div>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                              <dt className="font-bold">Failed</dt>
                              <dd>{formatDateTime(p.failed_at)}</dd>
                            </div>
                          </div>
                        </dl>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <button
                            type="button"
                            onClick={(e) => openDialog({ kind: 'reschedule', parcel: p }, e.currentTarget)}
                            disabled={!p.can_reschedule || dialog !== null}
                            aria-describedby={!p.can_reschedule ? hintId : undefined}
                            className="min-h-12 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
                          >
                            <CalendarClock className="w-4 h-4" aria-hidden="true" />
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={(e) => openDialog({ kind: 'return', parcel: p }, e.currentTarget)}
                            disabled={dialog !== null}
                            className="min-h-12 inline-flex items-center justify-center gap-2 px-5 rounded-xl border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-bold disabled:opacity-50"
                          >
                            <Undo2 className="w-4 h-4" aria-hidden="true" />
                            Return to seller
                          </button>
                        </div>
                        {!p.can_reschedule && (
                          <p id={hintId} className="text-xs font-semibold text-red-900">
                            Attempt limit reached ({p.delivery_attempts} of {p.max_attempts}). This parcel can only be
                            returned to the seller.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {failed.data!.meta.last_page > 1 && (
                  <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setFailedPage((p) => Math.max(p - 1, 1))}
                      disabled={failedPage <= 1}
                      className="min-h-11 px-4 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500">
                      Page {failed.data!.meta.current_page} of {failed.data!.meta.last_page}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFailedPage((p) => p + 1)}
                      disabled={failedPage >= failed.data!.meta.last_page}
                      className="min-h-11 px-4 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </div>

      {dialog?.kind === 'reschedule' && (
        <RescheduleDialog
          parcel={dialog.parcel}
          onClose={closeDialog}
          onDone={(res) => afterAction(`Rescheduled with ${res.rider.name || 'the rider'}. They have been emailed.`)}
          onConflict={onConflict}
        />
      )}
      {dialog?.kind === 'return' && (
        <ReturnDialog
          parcel={dialog.parcel}
          onClose={closeDialog}
          onDone={() => afterAction('Parcel returned to the seller. They have been emailed.')}
          onConflict={onConflict}
        />
      )}
    </div>
  );
}

function ErrorPanel({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="bg-white border border-red-200 rounded-3xl p-8 text-center space-y-3 max-w-lg mx-auto">
      <AlertCircle className="w-8 h-8 text-red-500 mx-auto" aria-hidden="true" />
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold"
      >
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
        <Inbox className="w-7 h-7" aria-hidden="true" />
      </div>
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
    </div>
  );
}

interface DialogBase {
  parcel: HubDeliveryFailedRow;
  onClose: () => void;
  onConflict: (message: string) => void;
}

/** Shell shared by both dialogs: modal overlay, Escape to close when idle, focus on the heading. */
function DialogShell({
  titleId,
  title,
  busy,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-gray-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-base font-black text-gray-900 focus:outline-none">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="min-h-11 min-w-11 -mt-2 -mr-2 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RescheduleDialog({ parcel, onClose, onConflict, onDone }: DialogBase & { onDone: (res: { rider: { name: string } }) => void }) {
  // The parcel is a snapshot taken when the dialog opened, so the 30-second poll cannot change it underneath.
  const [riders, setRiders] = useState<HubDispatchRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const busyRef = useRef(false);

  const code = parcel.destination.barangay_code ?? '';

  const loadRiders = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getHubDispatchBatchRidersApi(code);
      setRiders(res.data);
      // Default to the rider who just failed it, when they are still eligible.
      const previous = parcel.rider?.id;
      setRiderId(previous !== undefined && res.data.some((r) => r.id === previous) ? previous : null);
    } catch (err: unknown) {
      setLoadError(
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : 'Could not load the eligible riders. Check your connection.'
      );
    } finally {
      setLoading(false);
    }
  }, [code, parcel.rider?.id]);

  useEffect(() => {
    void loadRiders();
  }, [loadRiders]);

  const chosen = riders.find((r) => r.id === riderId) ?? null;

  const submit = async () => {
    if (!chosen || busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setErrors([]);
    try {
      const res = await rescheduleHubDeliveryApi(parcel.tracking_number, chosen.id);
      onDone(res);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const { status, data } = err.response;
        if (status === 404 || status === 409) {
          onConflict(data?.message || 'This parcel can no longer be rescheduled.');
          return;
        }
        const lines = validationLines(data);
        setErrors(lines.length > 0 ? lines : [data?.message || 'The parcel could not be rescheduled.']);
        return;
      }
      setErrors(['No connection. Check your network and try again.']);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <DialogShell titleId="reschedule-title" title="Reschedule delivery" busy={submitting} onClose={onClose}>
      <p className="text-sm text-gray-700">
        <span className="font-mono font-bold">{parcel.tracking_number}</span> for {parcel.recipient_name} in{' '}
        <span className="font-bold">{parcel.destination.barangay_name}</span>. Attempt {parcel.delivery_attempts + 1} of{' '}
        {parcel.max_attempts}.
      </p>
      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
        The rider collects the parcel at the hub again and is emailed. This assumes the failed parcel is back at the hub.
      </p>

      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Loading eligible riders">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-200/80" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="text-center space-y-2 py-2">
          <p className="text-xs text-gray-600">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadRiders()}
            className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-brand-red text-white text-xs font-bold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : riders.length === 0 ? (
        <div role="status" className="flex flex-col gap-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <span>No eligible riders cover this barangay.</span>
          <Link to="/hub/riders" className="inline-flex items-center min-h-11 font-bold text-blue-700 hover:underline">
            Assign a rider to this area
          </Link>
        </div>
      ) : (
        <fieldset disabled={submitting} className="space-y-2">
          <legend className="text-sm font-bold text-gray-900 mb-1">Choose a rider</legend>
          {riders.map((rider) => {
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
                  name="reschedule-rider"
                  checked={checked}
                  onChange={() => setRiderId(rider.id)}
                  className="w-5 h-5 mt-0.5 accent-brand-red shrink-0"
                />
                <span className="flex-1 min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                    <Bike className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    {rider.name}
                    {rider.id === parcel.rider?.id && (
                      <span className="text-[10px] font-bold text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">Previous rider</span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-600">
                    {rider.vehicle_type}
                    {rider.plate_number && ` - ${rider.plate_number}`}
                  </span>
                  {rider.area_labels.length > 0 && (
                    <span className="block text-[11px] text-gray-500">Area: {rider.area_labels.join(', ')}</span>
                  )}
                  <span className="block text-[11px] font-semibold text-gray-700">
                    {rider.current_load === 0 ? 'No parcels in flight' : `Carrying ${plural(rider.current_load, 'parcel', 'parcels')}`}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {errors.length > 0 && (
        <div role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
          <p className="font-bold">Nothing was changed.</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!chosen || submitting}
          className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
        >
          {submitting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{chosen ? `Reschedule with ${chosen.name}` : 'Choose a rider'}</span>
        </button>
      </div>
    </DialogShell>
  );
}

function ReturnDialog({ parcel, onClose, onConflict, onDone }: DialogBase & { onDone: () => void }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const busyRef = useRef(false);

  const submit = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setErrors([]);
    try {
      const trimmed = note.trim();
      await returnHubDeliveryToSellerApi(parcel.tracking_number, trimmed !== '' ? trimmed : null);
      onDone();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const { status, data } = err.response;
        if (status === 404 || status === 409) {
          onConflict(data?.message || 'This parcel can no longer be returned.');
          return;
        }
        const lines = validationLines(data);
        setErrors(lines.length > 0 ? lines : [data?.message || 'The parcel could not be returned.']);
        return;
      }
      setErrors(['No connection. Check your network and try again.']);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <DialogShell titleId="return-title" title="Return to seller?" busy={submitting} onClose={onClose}>
      <dl className="text-sm text-gray-700 space-y-1">
        <div className="flex gap-2">
          <dt className="font-bold">Parcel:</dt>
          <dd className="font-mono break-all">{parcel.tracking_number}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-bold">Order:</dt>
          <dd>{parcel.order_number ?? 'n/a'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-bold">Failed because:</dt>
          <dd>{parcel.failure_reason?.label ?? 'Reason not recorded'}</dd>
        </div>
      </dl>

      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-xl p-3">
        The order is marked Returned and the seller is emailed. This cannot be undone here. Refunds are not handled by
        this action.
      </p>

      <div className="space-y-1">
        <label htmlFor="return-note" className="block text-sm font-bold text-gray-900">
          Note <span className="font-normal text-gray-500">(optional, kept on the parcel)</span>
        </label>
        <textarea
          id="return-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          rows={3}
          disabled={submitting}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-60"
        />
        <p className="text-right text-[11px] text-gray-500">
          {note.length}/{NOTE_MAX}
        </p>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
          <p className="font-bold">Nothing was changed.</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="min-h-12 px-5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
        >
          {submitting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>Return to seller</span>
        </button>
      </div>
    </DialogShell>
  );
}
