import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Minus,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { IconChip, StateCard } from './RiderUi';
import { BTN_PRIMARY } from './riderStyles';
import { getRiderEarningsDeliveriesApi, getRiderEarningsSummaryApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type {
  RiderEarnedDelivery,
  RiderEarningsBreakdownPoint,
  RiderEarningsPeriodType,
  RiderEarningsSummary,
} from '../../types';
import { addDays, errorMessage, formatPeso, formatTime, fromCents, manilaToday, periodLabel, toCents } from './earningsFormat';

const PERIODS: { key: RiderEarningsPeriodType; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const COMPARE_WORDS: Record<RiderEarningsPeriodType, { current: string; other: string }> = {
  day: { current: 'yesterday', other: 'the day before' },
  week: { current: 'last week', other: 'the week before' },
  month: { current: 'last month', other: 'the month before' },
};

const PERIOD_NOUN: Record<RiderEarningsPeriodType, string> = { day: 'today', week: 'this week', month: 'this month' };

function comparison(summary: RiderEarningsSummary) {
  const diff = toCents(summary.total_earned) - toCents(summary.previous.total_earned);
  const words = COMPARE_WORDS[summary.period.type];
  const when = summary.period.is_current ? words.current : words.other;
  if (diff > 0) return { Icon: TrendingUp, text: `${formatPeso(fromCents(diff))} more than ${when}`, tone: 'text-emerald-700' };
  if (diff < 0) return { Icon: TrendingDown, text: `${formatPeso(fromCents(-diff))} less than ${when}`, tone: 'text-red-700' };
  return { Icon: Minus, text: `Same as ${when}`, tone: 'text-gray-600' };
}

/** Which bars get an axis label, so 24 hourly or 31 daily bars stay readable on a phone. */
function showAxisLabel(type: RiderEarningsPeriodType, index: number): boolean {
  if (type === 'day') return index % 6 === 0;
  if (type === 'month') return index % 5 === 0;
  return true;
}

function EarningsBars({ type, points }: { type: RiderEarningsPeriodType; points: RiderEarningsBreakdownPoint[] }) {
  const maxCents = Math.max(...points.map((p) => toCents(p.total)), 0);
  const busy = points.filter((p) => p.count > 0);
  const summary = busy.length
    ? busy.map((p) => `${p.label}: ${formatPeso(p.total)} from ${p.count} ${p.count === 1 ? 'delivery' : 'deliveries'}`).join('; ')
    : 'No earnings in this period';

  return (
    <div>
      <div role="img" aria-label={`Earnings chart. ${summary}`} className="flex items-end gap-px sm:gap-1 h-32">
        {points.map((p) => {
          const cents = toCents(p.total);
          const height = cents > 0 && maxCents > 0 ? Math.max((cents / maxCents) * 100, 6) : 0;
          return (
            <div key={p.key} className="flex-1 h-full flex items-end" title={`${p.label}: ${formatPeso(p.total)} (${p.count})`}>
              <div
                className={`w-full rounded-t ${height > 0 ? 'bg-brand-red' : 'bg-gray-200'}`}
                style={{ height: height > 0 ? `${height}%` : '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-px sm:gap-1 mt-1.5" aria-hidden="true">
        {points.map((p, i) => (
          <div key={p.key} className="flex-1 text-center text-[10px] leading-tight text-gray-500">
            {showAxisLabel(type, i) ? (type === 'week' ? p.label.split(' ').map((s) => <div key={s}>{s}</div>) : p.label.replace(' ', ' ')) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EarningsTab() {
  const { showToast } = useToast();

  const [type, setType] = useState<RiderEarningsPeriodType>('day');
  const [anchor, setAnchor] = useState<string>(() => manilaToday());
  const [summary, setSummary] = useState<RiderEarningsSummary | null>(null);
  const [rows, setRows] = useState<RiderEarnedDelivery[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each fetch gets a number; an older response that arrives late is dropped.
  const requestRef = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'manual' | 'silent') => {
      const id = ++requestRef.current;
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      }
      if (mode === 'manual') setRefreshing(true);
      try {
        const [s, list] = await Promise.all([
          getRiderEarningsSummaryApi(type, anchor),
          getRiderEarningsDeliveriesApi(type, anchor, 1),
        ]);
        if (id !== requestRef.current) return;
        setSummary(s);
        setRows(list.data);
        setPage(list.meta.current_page);
        setLastPage(list.meta.last_page);
        setError(null);
      } catch (err: unknown) {
        if (id !== requestRef.current || mode === 'silent') return;
        const message = errorMessage(err, 'Could not load your earnings.');
        setError(message);
        if (mode === 'manual') showToast(message, 'error');
      } finally {
        if (id === requestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [type, anchor, showToast]
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Coming back to the app after delivering a parcel: refresh quietly.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load('silent');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || page >= lastPage) return;
    const id = requestRef.current;
    setLoadingMore(true);
    try {
      const list = await getRiderEarningsDeliveriesApi(type, anchor, page + 1);
      if (id !== requestRef.current) return;
      setRows((prev) => [...prev, ...list.data.filter((r) => !prev.some((p) => p.id === r.id))]);
      setPage(list.meta.current_page);
      setLastPage(list.meta.last_page);
    } catch (err: unknown) {
      showToast(errorMessage(err, 'Could not load more deliveries.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const cmp = summary ? comparison(summary) : null;

  return (
    <div className="space-y-4">
      {/* Period type */}
      <div role="group" aria-label="Earnings period" className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={type === p.key}
            onClick={() => setType(p.key)}
            className={`min-h-10 rounded-lg text-xs font-bold transition-colors ${
              type === p.key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Navigator */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => summary && setAnchor(summary.previous.start_date)}
          disabled={!summary || loading}
          aria-label={`Previous ${type}`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="text-center min-w-0">
          <p className="text-sm font-black text-gray-900 truncate" aria-live="polite">
            {summary ? periodLabel(summary.period) : ' '}
          </p>
          {summary && !summary.period.is_current && (
            <button
              type="button"
              onClick={() => setAnchor(manilaToday())}
              className="min-h-11 px-3 text-xs font-bold text-brand-red"
            >
              Back to {PERIOD_NOUN[type]}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load('manual')}
            disabled={refreshing || loading}
            aria-label="Refresh earnings"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-red' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => summary && setAnchor(addDays(summary.period.end_date, 1))}
            disabled={!summary || loading || summary.period.is_current}
            aria-label={`Next ${type}`}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse" aria-label="Loading earnings">
          <div className="h-40 rounded-2xl bg-white border border-gray-200/80" />
          <div className="h-44 rounded-2xl bg-white border border-gray-200/80" />
          <div className="h-20 rounded-2xl bg-white border border-gray-200/80" />
        </div>
      ) : error || !summary ? (
        <StateCard icon={AlertCircle} tone="red" alert title="Could not load your earnings" message={error ?? 'Try again in a moment.'}>
          <button type="button" onClick={() => void load('initial')} className={BTN_PRIMARY}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </StateCard>
      ) : (
        <>
          {/* Totals */}
          <section aria-label="Earnings total" className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800">Total earned</p>
                <p className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 leading-none mt-1.5">{formatPeso(summary.total_earned)}</p>
              </div>
              <IconChip icon={Wallet} tone="emerald" />
            </div>
            {cmp && (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5">
                <cmp.Icon className={`w-4 h-4 ${cmp.tone}`} aria-hidden="true" />
                <span className={cmp.tone}>{cmp.text}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-600">Pickups &amp; deliveries</p>
                <p className="font-black text-lg text-gray-900">{summary.deliveries_count}</p>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-gray-600">Average per job</p>
                <p className="font-black text-lg text-gray-900">{formatPeso(summary.average_per_delivery)}</p>
              </div>
            </div>
          </section>
          {/* Chart */}
          <section aria-label="Earnings chart" className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              {summary.period.type === 'day' ? 'By hour' : 'By day'}
            </h2>
            <EarningsBars type={summary.period.type} points={summary.breakdown} />
          </section>

          <p className="text-xs text-gray-500 text-center">
            All-time earnings: <span className="font-bold text-gray-800">{formatPeso(summary.lifetime_total)}</span>
          </p>

          {/* Deliveries in the period */}
          <section aria-label="Earnings in this period" className="space-y-2">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Pickups &amp; deliveries</h2>
            {rows.length === 0 ? (
              <StateCard
                icon={Package}
                title={`No earnings ${summary.period.is_current ? PERIOD_NOUN[type] : 'in this period'}`}
                message="A pickup earns you 20% of the delivery fee once the hub receives the parcel; a delivery earns 65% (85% if you also picked it up)."
              />
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-xs flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-black text-gray-900 font-mono truncate">{r.tracking_number}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${r.kind === 'pickup' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.kind === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                      </p>
                      <p className="flex items-center gap-1 text-xs text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {[r.destination.barangay_name, r.destination.city].filter(Boolean).join(', ') || 'Destination unavailable'}
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {summary.period.type === 'day' ? '' : `${new Date(r.delivered_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}, `}
                        {formatTime(r.delivered_at)}
                      </p>
                    </div>
                    <p className="text-sm font-black text-emerald-700 shrink-0">+{formatPeso(r.fee)}</p>
                  </li>
                ))}
              </ul>
            )}
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
        </>
      )}
    </div>
  );
}
