import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, History, MapPin, RefreshCw, RotateCcw, Search, XCircle } from 'lucide-react';
import { StateCard } from './RiderUi';
import { BTN_PRIMARY, BTN_SECONDARY } from './riderStyles';
import { getRiderHistoryApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import type { RiderHistoryEntry, RiderHistoryFilter, RiderHistoryOutcome } from '../../types';
import { errorMessage, formatDateTime, formatPeso } from './earningsFormat';

const FILTERS: { key: RiderHistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'failed', label: 'Failed' },
  { key: 'returned', label: 'Returned' },
];

// Each outcome has an icon and a word as well as a color, so status is never shown by color alone.
const OUTCOME_STYLE: Record<
  RiderHistoryOutcome,
  { label: string; Icon: typeof CheckCircle2; badge: string }
> = {
  delivered: { label: 'Delivered', Icon: CheckCircle2, badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  failed: { label: 'Failed attempt', Icon: XCircle, badge: 'bg-red-50 text-red-800 border-red-200' },
  returned: { label: 'Returned to seller', Icon: RotateCcw, badge: 'bg-amber-50 text-amber-900 border-amber-200' },
};

const SEARCH_DEBOUNCE_MS = 400;

function entryKey(e: RiderHistoryEntry): string {
  return `${e.outcome}|${e.tracking_number}|${e.occurred_at}`;
}

export default function HistoryTab() {
  const { showToast } = useToast();

  const [outcome, setOutcome] = useState<RiderHistoryFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [entries, setEntries] = useState<RiderHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef(0);
  const pageRef = useRef(1);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const rangeInvalid = Boolean(from && to && to < from);
  const filtered = outcome !== 'all' || Boolean(from || to || search);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (mode: 'initial' | 'silent') => {
      // A quiet refresh never throws away pages the rider loaded with Load more.
      if (mode === 'silent' && (rangeInvalid || pageRef.current > 1)) return;
      const id = ++requestRef.current;
      if (rangeInvalid) {
        setLoading(false);
        setEntries([]);
        setTotal(0);
        setPage(1);
        setLastPage(1);
        setError(null);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await getRiderHistoryApi({ outcome, from, to, search, page: 1 });
        if (id !== requestRef.current) return;
        setEntries(res.data);
        setPage(res.meta.current_page);
        setLastPage(res.meta.last_page);
        setTotal(res.meta.total);
        setError(null);
      } catch (err: unknown) {
        if (id !== requestRef.current || mode === 'silent') return;
        setError(errorMessage(err, 'Could not load your history.'));
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [outcome, from, to, search, rangeInvalid]
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Live: a parcel the rider just delivered, failed or returned shows up on its own.
  useLiveRefresh(() => void load('silent'), 60_000, loadingMore);

  const loadMore = async () => {
    if (loadingMore || page >= lastPage) return;
    const id = requestRef.current;
    setLoadingMore(true);
    try {
      const res = await getRiderHistoryApi({ outcome, from, to, search, page: page + 1 });
      if (id !== requestRef.current) return;
      setEntries((prev) => {
        const seen = new Set(prev.map(entryKey));
        return [...prev, ...res.data.filter((e) => !seen.has(entryKey(e)))];
      });
      setPage(res.meta.current_page);
      setLastPage(res.meta.last_page);
    } catch (err: unknown) {
      showToast(errorMessage(err, 'Could not load more history.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    setOutcome('all');
    setFrom('');
    setTo('');
    setSearchInput('');
    setSearch('');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div role="group" aria-label="Filter by outcome" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={outcome === f.key}
            onClick={() => setOutcome(f.key)}
            className={`min-h-11 px-4 rounded-full text-xs font-bold border transition-colors ${
              outcome === f.key
                ? 'bg-brand-red border-brand-red text-white'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-gray-700">
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-700">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10"
          />
        </label>
      </div>
      {rangeInvalid && (
        <p role="alert" className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
          The end date must be on or after the start date.
        </p>
      )}

      <label className="relative block">
        <span className="sr-only">Search by tracking number or order number</span>
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Tracking or order number"
          maxLength={100}
          className="w-full min-h-11 rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10"
        />
      </label>

      {/* Results */}
      {loading ? (
        <div className="space-y-3 animate-pulse" aria-label="Loading history">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-gray-200/80" />
          ))}
        </div>
      ) : error ? (
        <StateCard icon={AlertCircle} tone="red" alert title="Could not load your history" message={error}>
          <button type="button" onClick={() => void load('initial')} className={BTN_PRIMARY}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </StateCard>
      ) : entries.length === 0 ? (
        <StateCard
          icon={History}
          title={filtered ? 'Nothing matches these filters' : 'No history yet'}
          message={
            filtered
              ? 'Try a different outcome, a wider date range or another search.'
              : 'Your delivered, failed and returned parcels appear here.'
          }
        >
          {filtered && (
            <button type="button" onClick={clearFilters} className={BTN_SECONDARY}>
              Clear filters
            </button>
          )}
        </StateCard>
      ) : (
        <section aria-label="Delivery history" className="space-y-2">
          <p className="text-xs text-gray-500" aria-live="polite">
            {total} {total === 1 ? 'entry' : 'entries'}
          </p>
          <ul className="space-y-2">
            {entries.map((e) => {
              const style = OUTCOME_STYLE[e.outcome];
              const place = [e.destination.barangay_name, e.destination.city].filter(Boolean).join(', ');
              return (
                <li key={entryKey(e)} className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${style.badge}`}>
                      <style.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {style.label}
                    </span>
                    <time dateTime={e.occurred_at} className="text-[11px] text-gray-500 text-right">
                      {formatDateTime(e.occurred_at)}
                    </time>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-black text-gray-900 font-mono break-all">{e.tracking_number}</p>
                    {e.order_number && <p className="text-[11px] text-gray-500">Order #{e.order_number}</p>}
                    <p className="flex items-center gap-1 text-xs text-gray-600">
                      <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                      <span>{place || 'Destination unavailable'}</span>
                    </p>
                  </div>
                  {e.outcome === 'failed' && e.failure_reason && (
                    <p className="text-xs text-red-800">Reason: {e.failure_reason.label}</p>
                  )}
                  {e.outcome === 'delivered' && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {e.fee && <span className="font-black text-emerald-700">Earned +{formatPeso(e.fee)}</span>}
                      {e.cod_collected && (
                        <span className="inline-flex items-center gap-1 text-gray-700">
                          <Banknote className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
                          Cash collected {formatPeso(e.cod_collected)}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {page < lastPage && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingMore && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
