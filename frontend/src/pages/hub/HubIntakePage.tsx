import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Info,
  MapPin,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import TrackingScanner from '../../components/logistics/TrackingScanner';
import {
  getHubExpectedParcelsApi,
  getHubReceivedTodayApi,
  lookupHubParcelApi,
  receiveHubParcelApi,
} from '../../api/client';
import type { HubParcelRecord } from '../../types';
import { PageHeader, StatCard } from './hubKit';
import { useLivePolling } from '../../hooks/useLivePolling';

type IntakeTab = 'scan' | 'expected' | 'received';
type ListKind = 'expected' | 'received';

interface FeedEntry {
  id: number;
  kind: 'success' | 'error';
  tracking: string;
  message: string;
  barangay?: string;
  at: Date;
}

interface ListState {
  items: HubParcelRecord[];
  total: number;
  page: number;
  lastPage: number;
  loading: boolean;
  error: string | null;
}

const FEED_LIMIT = 50;

const EMPTY_LIST: ListState = { items: [], total: 0, page: 1, lastPage: 1, loading: true, error: null };

function formatTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function apiErrorMessage(err: unknown, tracking: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'No connection. Check your network and scan again.';
    const data = err.response.data as { message?: string; scanned_in_at?: string | null } | undefined;
    const base = data?.message || `Could not process ${tracking}.`;
    return err.response.status === 409 && data?.scanned_in_at
      ? `${base} Scanned in at ${formatDateTime(data.scanned_in_at)}.`
      : base;
  }
  return `Could not process ${tracking}.`;
}

export default function HubIntakePage() {
  const [tab, setTab] = useState<IntakeTab>('scan');
  const [autoReceive, setAutoReceive] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [lookup, setLookup] = useState<HubParcelRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [expected, setExpected] = useState<ListState>(EMPTY_LIST);
  const [received, setReceived] = useState<ListState>(EMPTY_LIST);

  const busyRef = useRef(false);
  const feedIdRef = useRef(0);
  const pagesRef = useRef<Record<ListKind, number>>({ expected: 1, received: 1 });

  const pushFeed = useCallback((entry: Omit<FeedEntry, 'id' | 'at'>) => {
    feedIdRef.current += 1;
    const next: FeedEntry = { ...entry, id: feedIdRef.current, at: new Date() };
    setFeed((prev) => [next, ...prev].slice(0, FEED_LIMIT));
  }, []);

  const loadList = useCallback(async (kind: ListKind, page: number, silent = false) => {
    const setState = kind === 'expected' ? setExpected : setReceived;
    const fetcher = kind === 'expected' ? getHubExpectedParcelsApi : getHubReceivedTodayApi;
    pagesRef.current[kind] = page;

    if (!silent) setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      let res = await fetcher({ page, per_page: 20 });
      // The page we were on may no longer exist (e.g. its last parcel was just received).
      if (res.data.length === 0 && res.meta.total > 0 && res.meta.last_page < page) {
        pagesRef.current[kind] = res.meta.last_page;
        res = await fetcher({ page: res.meta.last_page, per_page: 20 });
      }
      setState({
        items: res.data,
        total: res.meta.total,
        page: res.meta.current_page,
        lastPage: res.meta.last_page,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      if (silent) return;
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Could not load parcels.'
        : 'Could not load parcels.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  // Live: both lists load on arrival and re-read themselves every few seconds, so a parcel a rider has just dropped off
  // (or one received on another screen) shows up here without a refresh button.
  const refreshAll = useCallback(
    async (silent: boolean) => {
      await Promise.all([
        loadList('expected', pagesRef.current.expected, silent),
        loadList('received', pagesRef.current.received, silent),
      ]);
    },
    [loadList]
  );
  const { lastUpdated } = useLivePolling(refreshAll, 15000);

  const refreshLists = useCallback(() => {
    void loadList('expected', pagesRef.current.expected, true);
    void loadList('received', pagesRef.current.received, true);
  }, [loadList]);

  const doReceive = useCallback(
    async (code: string) => {
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await receiveHubParcelApi(code);
        const parcel = res.data;
        pushFeed({
          kind: 'success',
          tracking: parcel.tracking_number,
          message: 'Received',
          barangay: parcel.destination_barangay.name ?? undefined,
        });
        setSessionCount((n) => n + 1);
        setLookup(null);
        refreshLists();
      } catch (err: unknown) {
        pushFeed({ kind: 'error', tracking: code, message: apiErrorMessage(err, code) });
        setLookup(null);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [pushFeed, refreshLists]
  );

  const doLookup = useCallback(
    async (code: string) => {
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await lookupHubParcelApi(code);
        setLookup(res.data);
      } catch (err: unknown) {
        setLookup(null);
        pushFeed({ kind: 'error', tracking: code, message: apiErrorMessage(err, code) });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [pushFeed]
  );

  const handleScan = useCallback(
    (code: string) => {
      if (busyRef.current) return;
      if (autoReceive) void doReceive(code);
      else void doLookup(code);
    },
    [autoReceive, doReceive, doLookup]
  );

  const latest = feed[0];

  return (
    <div className="space-y-5">
      <PageHeader
        accent="emerald"
        updatedAt={lastUpdated}
        icon={ScanLine}
        title="Parcel Intake"
        subtitle="Scan parcels in as riders drop them off at your hub."
       />

      <section aria-label="Intake summary" className="grid grid-cols-3 gap-2.5">
        <StatCard icon={Truck} label="On the way" value={expected.loading ? null : expected.total} subtext="Picked up, not scanned in" iconBg="bg-amber-50" iconColor="text-amber-600" onClick={() => setTab('expected')} active={tab === 'expected'} />
        <StatCard icon={PackageCheck} label="Received today" value={received.loading ? null : received.total} subtext="Scanned in, Manila day" iconBg="bg-emerald-50" iconColor="text-emerald-600" onClick={() => setTab('received')} active={tab === 'received'} />
        <StatCard icon={ScanLine} label="This session" value={sessionCount} subtext="Scanned on this screen" iconBg="bg-blue-50" iconColor="text-blue-600" onClick={() => setTab('scan')} active={tab === 'scan'} />
      </section>

      {/* Tabs */}
      <div role="tablist" aria-label="Intake views" className="inline-flex items-center gap-0.5 p-1 overflow-x-auto bg-gray-100/80 rounded-xl max-w-full">
        {(
          [
            { key: 'scan', label: 'Scan', count: null },
            { key: 'expected', label: 'Expected', count: expected.total },
            { key: 'received', label: 'Received today', count: received.total },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`intake-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`intake-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`min-h-10 px-4 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              tab === t.key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== null && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t.key ? 'bg-red-100 text-brand-red-dark' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'scan' && (
        <div
          role="tabpanel"
          id="intake-panel-scan"
          aria-labelledby="intake-tab-scan"
          className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5 items-start"
        >
          {/* Scanner column */}
          <section className="bg-white border border-gray-200/80 shadow-xs rounded-2xl p-4 sm:p-5 space-y-4" aria-label="Scanner">
            <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer">
              <span className="space-y-0.5">
                <span className="block text-sm font-bold text-gray-900">Auto-receive on scan</span>
                <span className="block text-xs text-gray-500">
                  {autoReceive
                    ? 'Each scan receives the parcel right away.'
                    : 'A scan only looks the parcel up. Press Receive to confirm.'}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={autoReceive}
                onChange={(e) => {
                  setAutoReceive(e.target.checked);
                  setLookup(null);
                }}
                disabled={busy}
                className="w-6 h-6 accent-brand-red shrink-0"
              />
            </label>

            <TrackingScanner onScan={handleScan} disabled={busy} autoFocus />

            {busy && (
              <p className="flex items-center gap-2 text-xs text-gray-500" role="status">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                {autoReceive ? 'Receiving parcel...' : 'Looking up parcel...'}
              </p>
            )}

            {/* Latest result, announced to screen readers */}
            <div aria-live="polite" className="min-h-0">
              {latest && !lookup && (
                <div
                  className={`flex items-start gap-3 rounded-2xl border p-4 ${
                    latest.kind === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {latest.kind === 'success' ? (
                    <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="w-6 h-6 shrink-0 text-red-600" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-black">
                      {latest.kind === 'success' ? 'Received' : 'Not received'}
                    </p>
                    <p className="font-mono text-xs break-all">{latest.tracking}</p>
                    <p className="text-xs mt-0.5">
                      {latest.kind === 'success'
                        ? latest.barangay
                          ? `Destination: ${latest.barangay}`
                          : 'Parcel scanned in.'
                        : latest.message}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Manual mode: lookup card */}
            {lookup && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="space-y-0.5">
                  <p className="font-mono text-sm font-black text-blue-950 break-all">{lookup.tracking_number}</p>
                  <p className="text-xs text-blue-900">
                    Order {lookup.order_number ?? 'n/a'} &bull; {lookup.shop_name}
                  </p>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-blue-950">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <dt className="font-bold">Destination</dt>
                      <dd>
                        {lookup.destination_barangay.name ?? 'n/a'}
                        {lookup.recipient &&
                          `, ${lookup.recipient.address.city}, ${lookup.recipient.address.province}`}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <dt className="font-bold">Dropped off by</dt>
                      <dd>
                        {lookup.pickup_rider
                          ? `${lookup.pickup_rider.name}${lookup.pickup_rider.plate_number ? ` (${lookup.pickup_rider.plate_number})` : ''}`
                          : 'Unknown rider'}
                      </dd>
                    </div>
                  </div>
                </dl>
                <p className="text-xs text-blue-900">
                  Status: <span className="font-bold">{lookup.status.replace(/_/g, ' ')}</span>
                  {lookup.scanned_in_at && ` - already scanned in at ${formatDateTime(lookup.scanned_in_at)}`}
                </p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLookup(null)}
                    disabled={busy}
                    className="min-h-12 px-4 rounded-xl text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScan(lookup.tracking_number)}
                    disabled={busy || lookup.scanned_in_at !== null}
                    className="min-h-12 inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50"
                  >
                    {busy && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {lookup.scanned_in_at ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Received at {formatDateTime(lookup.scanned_in_at)}</span>
                      </>
                    ) : (
                      <span>Receive</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Feed column */}
          <section className="bg-white border border-gray-200/80 shadow-xs rounded-2xl p-4 sm:p-5 space-y-3" aria-label="Session feed">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-gray-900">This session</h2>
              <span className="text-xs text-gray-500">Last {FEED_LIMIT} scans</span>
            </div>
            {feed.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                  <Inbox className="w-6 h-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-gray-800">No scans yet</p>
                <p className="text-xs text-gray-500">Scan or type a tracking number to start receiving parcels.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
                {feed.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 py-3">
                    {entry.kind === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-gray-900 break-all">{entry.tracking}</p>
                      <p className={`text-xs ${entry.kind === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                        <span className="font-bold">{entry.kind === 'success' ? 'Success' : 'Error'}:</span>{' '}
                        {entry.message}
                        {entry.kind === 'success' && entry.barangay ? ` - ${entry.barangay}` : ''}
                      </p>
                    </div>
                    <time className="text-[11px] text-gray-400 shrink-0" dateTime={entry.at.toISOString()}>
                      {formatTime(entry.at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'expected' && (
        <div role="tabpanel" id="intake-panel-expected" aria-labelledby="intake-tab-expected">
          <ParcelList
            state={expected}
            timeLabel="Picked up"
            timeOf={(p) => p.picked_up_at}
            emptyTitle="No parcels on the way"
            emptyText="Parcels your riders have collected from sellers will be listed here until you scan them in."
            onRetry={() => loadList('expected', pagesRef.current.expected)}
            onPage={(page) => loadList('expected', page)}
          />
        </div>
      )}

      {tab === 'received' && (
        <div role="tabpanel" id="intake-panel-received" aria-labelledby="intake-tab-received">
          <ParcelList
            state={received}
            timeLabel="Scanned in"
            timeOf={(p) => p.scanned_in_at}
            emptyTitle="Nothing received yet today"
            emptyText="Parcels you scan in today will appear here, newest first."
            onRetry={() => loadList('received', pagesRef.current.received)}
            onPage={(page) => loadList('received', page)}
          />
        </div>
      )}
    </div>
  );
}

interface ParcelListProps {
  state: ListState;
  timeLabel: string;
  timeOf: (parcel: HubParcelRecord) => string | null;
  emptyTitle: string;
  emptyText: string;
  onRetry: () => void;
  onPage: (page: number) => void;
}

function ParcelList({ state, timeLabel, timeOf, emptyTitle, emptyText, onRetry, onPage }: ParcelListProps) {
  if (state.loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-label="Loading parcels">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-200/80 border border-gray-200" />
        ))}
      </div>
    );
  }

  if (state.error) {
    return (
      <div role="alert" className="bg-white border border-red-200 rounded-3xl p-8 text-center space-y-3 max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" aria-hidden="true" />
        <p className="text-sm font-bold text-gray-900">Could not load parcels</p>
        <p className="text-xs text-gray-500">{state.error}</p>
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

  if (state.items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center space-y-3 max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
          <Info className="w-7 h-7" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-gray-900">{emptyTitle}</h3>
        <p className="text-xs text-gray-500 leading-relaxed">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {state.items.map((parcel) => (
          <li
            key={parcel.tracking_number}
            className="bg-white border border-gray-200/80 shadow-xs rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600"
          >
            <div className="space-y-0.5 min-w-0">
              <p className="font-mono text-sm font-black text-gray-900 break-all">{parcel.tracking_number}</p>
              <p>
                Order {parcel.order_number ?? 'n/a'} &bull; {parcel.shop_name}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{parcel.destination_barangay.name ?? 'Destination n/a'}</span>
            </div>
            <div className="space-y-0.5 sm:text-right">
              <p>
                {parcel.pickup_rider
                  ? `${parcel.pickup_rider.name}${parcel.pickup_rider.plate_number ? ` (${parcel.pickup_rider.plate_number})` : ''}`
                  : 'Unknown rider'}
              </p>
              <p className="text-gray-500">
                {timeLabel} {formatDateTime(timeOf(parcel))}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {state.lastPage > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onPage(state.page - 1)}
            disabled={state.page <= 1}
            className="min-h-11 inline-flex items-center gap-1.5 px-4 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {state.page} of {state.lastPage}
          </span>
          <button
            type="button"
            onClick={() => onPage(state.page + 1)}
            disabled={state.page >= state.lastPage}
            className="min-h-11 inline-flex items-center gap-1.5 px-4 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 disabled:opacity-50"
          >
            Next
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
