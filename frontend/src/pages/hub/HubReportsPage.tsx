import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle, BarChart2, ChevronDown, Download, Info, Printer, RefreshCw,
  PackageCheck, Truck, Timer, Target, Hourglass, Undo2,
} from 'lucide-react';
import {
  downloadHubReportApi,
  getHubReportRidersApi,
  getHubReportSummaryApi,
} from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toast';
import type {
  HubReportKind,
  HubReportRiderRow,
  HubReportRiderSort,
  HubReportSortDirection,
  HubReportSummary,
} from '../../types';
import DailyChart from './reports/DailyChart';
import RidersTable from './reports/RidersTable';
import {
  PRESETS,
  formatHours,
  formatPercent,
  formatRange,
  manilaToday,
  presetRange,
  validateRange,
  type RangePreset,
} from './reports/reportFormat';
import { PageHeader, HEADER_BUTTON } from './hubKit';
import DateRangeBar from '../../components/admin/DateRangeBar';

interface Applied {
  from: string;
  to: string;
}

type FieldErrors = { from?: string; to?: string };

interface KpiProps {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  /** Tailwind classes for the icon tile, such as "bg-blue-50 text-blue-600". */
  tone: string;
}

function Kpi({ label, value, hint, icon: Icon, tone }: KpiProps) {
  const unavailable = value === 'n/a';
  return (
    <div className="flex flex-col p-3.5 bg-white border shadow-xs border-gray-200/80 rounded-xl print:break-inside-avoid">
      <div className="flex items-center gap-2">
        <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${tone}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        <p className="text-xs font-bold text-gray-700">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-black tabular-nums leading-none ${unavailable ? 'text-gray-400' : 'text-gray-900'}`}>{value}</p>
      <p className="mt-1.5 text-[11px] text-gray-500 leading-snug">{hint}</p>
    </div>
  );
}

function defaultDirection(sort: HubReportRiderSort): HubReportSortDirection {
  return sort === 'name' ? 'asc' : 'desc';
}

/**
 * Hub performance over a date range: throughput, on-time rate and per-rider efficiency, with CSV export.
 * Every event is counted on the day it happened (Asia/Manila). The definitions are on the page itself.
 */
export default function HubReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [initial] = useState(() => presetRange('last30', manilaToday()));

  const [preset, setPreset] = useState<RangePreset>('last30');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [applied, setApplied] = useState<Applied>(initial);

  const [summary, setSummary] = useState<HubReportSummary | null>(null);
  const [riders, setRiders] = useState<HubReportRiderRow[]>([]);
  const [unattributed, setUnattributed] = useState(0);
  const [sort, setSort] = useState<HubReportRiderSort>('delivered');
  const [direction, setDirection] = useState<HubReportSortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [ridersBusy, setRidersBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<HubReportKind | null>(null);

  const requestRef = useRef(0);

  /** Maps a failed request to field errors (422) or a message the page can show. */
  const explain = useCallback((err: unknown): { fields: FieldErrors; message: string | null } => {
    if (axios.isAxiosError(err) && err.response?.status === 422) {
      const errors = (err.response.data as { errors?: Record<string, string[]> }).errors ?? {};
      return { fields: { from: errors.from?.[0], to: errors.to?.[0] }, message: null };
    }
    if (axios.isAxiosError(err) && err.response?.data && typeof (err.response.data as { message?: string }).message === 'string') {
      return { fields: {}, message: (err.response.data as { message: string }).message };
    }
    return { fields: {}, message: 'Could not load the report. Check your connection and try again.' };
  }, []);

  const load = useCallback(
    async (range: Applied, nextSort: HubReportRiderSort, nextDirection: HubReportSortDirection, silent = false) => {
      const id = ++requestRef.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const [s, r] = await Promise.all([
          getHubReportSummaryApi(range),
          getHubReportRidersApi({ ...range, sort: nextSort, direction: nextDirection }),
        ]);
        if (id !== requestRef.current) return; // a newer request replaced this one
        setSummary(s);
        setRiders(r.riders);
        setUnattributed(r.unattributed_deliveries);
        setApplied(range);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        if (id !== requestRef.current || silent) return; // a quiet refresh that fails just tries again next time
        const { fields, message } = explain(err);
        if (Object.values(fields).some(Boolean)) {
          setRangeError(fields.from ?? fields.to ?? 'Check the dates and try again.');
        } else {
          setError(message);
        }
      } finally {
        if (id === requestRef.current && !silent) setLoading(false);
      }
    },
    [explain]
  );

  // The first load; later loads come from the date bar, Retry and sorting.
  useEffect(() => {
    void load(initial, 'delivered', 'desc');
  }, [load, initial]);

  // Live: the figures follow the hub's day, so a range that reaches today re-reads itself every minute while visible.
  const liveRef = useRef({ applied: initial, sort: 'delivered' as HubReportRiderSort, direction: 'desc' as HubReportSortDirection });
  useEffect(() => {
    liveRef.current = { applied, sort, direction };
  }, [applied, sort, direction]);
  useEffect(() => {
    const tick = () => {
      const { applied: range, sort: s, direction: d } = liveRef.current;
      if (document.visibilityState === 'visible' && range.to >= manilaToday()) void load(range, s, d, true);
    };
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const choosePreset = (next: RangePreset) => {
    if (next === 'custom') return;
    setPreset(next);
    setRangeError(null);
    void load(presetRange(next, manilaToday()), sort, direction);
  };

  /** A date picked in the date bar: the report follows at once when the range is valid. */
  const pickRange = (from: string, to: string) => {
    const errors = validateRange(from, to);
    if (Object.keys(errors).length > 0) {
      setRangeError(errors.from ?? errors.to ?? 'Check the dates and try again.');
      return;
    }
    setRangeError(null);
    setPreset('custom');
    void load({ from, to }, sort, direction);
  };
  const changeSort = async (key: HubReportRiderSort) => {
    const nextDirection = key === sort ? (direction === 'asc' ? 'desc' : 'asc') : defaultDirection(key);
    setSort(key);
    setDirection(nextDirection);

    const id = ++requestRef.current;
    setRidersBusy(true);
    try {
      const r = await getHubReportRidersApi({ ...applied, sort: key, direction: nextDirection });
      if (id === requestRef.current) {
        setRiders(r.riders);
        setUnattributed(r.unattributed_deliveries);
      }
    } catch (err: unknown) {
      if (id === requestRef.current) showToast(explain(err).message ?? 'Could not sort the riders.', 'error');
    } finally {
      if (id === requestRef.current) setRidersBusy(false);
    }
  };

  const exportCsv = async (report: HubReportKind) => {
    if (exporting) return;
    setExporting(report);
    try {
      await downloadHubReportApi({ report, ...applied, sort, direction });
      showToast(`${report === 'daily' ? 'Daily' : 'Rider'} report downloaded.`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'The export could not be created.', 'error');
    } finally {
      setExporting(null);
    }
  };

  const totals = summary?.totals;
  const hasActivity =
    !!totals &&
    totals.received + totals.sorted + totals.dispatched + totals.delivered + totals.failed_attempts + totals.returned > 0;
  const sla = summary?.sla_hours;
  const rangeLabel = formatRange(applied.from, applied.to);

  return (
    <div className="flex flex-col gap-5">
      {/* Print-only heading: the controls are hidden on paper */}
      <div className="hidden print:block">
        <h1 className="text-xl font-black">{user?.sorting_center?.hub_name ?? 'Hub'} performance report</h1>
        <p className="text-sm text-gray-600">{rangeLabel} (Asia/Manila)</p>
      </div>

      <div className="print:hidden space-y-3">
        <PageHeader
          accent="blue"
          updatedAt={lastUpdated}
          icon={BarChart2}
          title="Hub reports"
          subtitle={<>Throughput, on-time delivery and rider efficiency for {rangeLabel}.</>}
        >
          <button type="button" onClick={() => window.print()} className={HEADER_BUTTON}>
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print
          </button>
        </PageHeader>

        <DateRangeBar
          presets={PRESETS.filter((p) => p.key !== 'custom').map((p) => ({ value: p.key, label: p.label }))}
          preset={preset === 'custom' ? '' : preset}
          from={applied.from}
          to={applied.to}
          today={manilaToday()}
          onPreset={(value) => choosePreset(value as RangePreset)}
          onRange={pickRange}
          trailing={loading && summary ? <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" aria-label="Updating" /> : undefined}
        />
        {rangeError && <p role="alert" className="px-1 text-xs font-semibold text-red-700">{rangeError}</p>}
        <p className="px-1 text-[11px] text-gray-500">Days are Asia/Manila calendar days, both ends included. Up to 366 days.</p>
      </div>
      {loading && !summary ? (
        <div className="space-y-4 animate-pulse" aria-label="Loading report" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-gray-200" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-gray-200" />
        </div>
      ) : error && !summary ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3">
          <AlertCircle className="w-7 h-7 text-red-500 mx-auto" aria-hidden="true" />
          <p role="alert" className="text-sm text-gray-700">{error}</p>
          <button
            type="button"
            onClick={() => void load(applied, sort, direction)}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : summary && totals ? (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {error && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
              <span>{error}</span>
              <button type="button" onClick={() => void load(applied, sort, direction)} className="min-h-9 px-3 rounded-lg bg-white border border-red-200 font-bold">
                Retry
              </button>
            </div>
          )}

          {/* KPI cards */}
          <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
            <Kpi icon={PackageCheck} tone="bg-blue-50 text-blue-600" label="Received" value={String(totals.received)} hint={`Scanned in at the hub. ${totals.sorted} sorted, ${totals.dispatched} dispatched.`} />
            <Kpi
              icon={Truck}
              tone="bg-emerald-50 text-emerald-600"
              label="Delivered"
              value={String(totals.delivered)}
              hint={totals.avg_delivery_hours === null ? 'No delivery time to average.' : `Average ${formatHours(totals.avg_delivery_hours)} out for delivery.`}
            />
            <Kpi
              icon={Timer}
              tone="bg-violet-50 text-violet-600"
              label="On-time rate"
              value={formatPercent(totals.on_time_rate)}
              hint={totals.delivered === 0 ? 'No deliveries in this period.' : `${totals.on_time_deliveries} of ${totals.delivered} delivered within ${sla} h of arriving.`}
            />
            <Kpi
              icon={Target}
              tone="bg-amber-50 text-amber-600"
              label="Success rate"
              value={formatPercent(totals.success_rate)}
              hint={totals.success_rate === null ? 'No delivery attempts in this period.' : `${totals.delivered} delivered, ${totals.failed_attempts} failed attempts.`}
            />
            <Kpi icon={Hourglass} tone="bg-sky-50 text-sky-600" label="Avg hub dwell" value={formatHours(totals.avg_hub_dwell_hours)} hint="From received to out for delivery." />
            <Kpi icon={Undo2} tone="bg-rose-50 text-rose-600" label="Returned" value={String(totals.returned)} hint="Sent back to the seller by the hub." />
          </section>

          {summary.excluded.delivered_without_time > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {summary.excluded.delivered_without_time} {summary.excluded.delivered_without_time === 1 ? 'parcel was' : 'parcels were'} recorded as delivered without a delivery time
                (older records), so {summary.excluded.delivered_without_time === 1 ? 'it is' : 'they are'} not in any figure here.
              </span>
            </p>
          )}

          {/* How the numbers are calculated */}
          <details className="group bg-white border border-gray-200/80 shadow-xs rounded-2xl print:hidden">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none px-4 py-3 min-h-11 text-sm font-bold text-gray-900 rounded-2xl">
              <span className="inline-flex items-center gap-2">
                <Info className="w-4 h-4 text-gray-400" aria-hidden="true" />
                How these numbers are calculated
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <dl className="px-4 pb-4 space-y-3 text-sm text-gray-700">
              <div>
                <dt className="font-bold text-gray-900">Days</dt>
                <dd>Asia/Manila calendar days, both ends included. Each event is counted on the day it happened, so a parcel received in one week and delivered in the next appears in both.</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Received, sorted, dispatched, returned</dt>
                <dd>Parcels scanned in at the hub, sorted by destination, assigned to a rider, and returned to the seller by the hub, each by the time it happened.</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Delivered and failed attempts</dt>
                <dd>Delivered parcels, by delivery time. A failed attempt is one reported delivery failure; a parcel that fails twice counts twice.</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">On-time rate</dt>
                <dd>
                  A delivery is on time when it happens within <strong>{sla} hours</strong> of the hub receiving the parcel (exactly {sla} hours counts). The rate is on-time deliveries divided by all deliveries in the period; with no deliveries it shows n/a.
                </dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Success rate</dt>
                <dd>Delivered divided by delivered plus failed attempts.</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Average hub dwell and delivery time</dt>
                <dd>Dwell is received to out for delivery. Delivery time is out for delivery to delivered. For a rescheduled parcel they use its latest dispatch.</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Riders</dt>
                <dd>
                  A delivery or a failed attempt belongs to the rider who reported it. If one rider fails a parcel and another delivers it later, the first gets the failed attempt and the second gets the delivery. Idle riders are listed with zeros.
                </dd>
              </div>
            </dl>
          </details>

          {/* Daily chart, or the empty state */}
          {hasActivity ? (
            <DailyChart daily={summary.daily} />
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center space-y-2">
              <BarChart2 className="w-8 h-8 text-gray-300 mx-auto" aria-hidden="true" />
              <p className="text-sm font-bold text-gray-800">No parcel activity in this period</p>
              <p className="text-xs text-gray-500">Nothing was received, sorted, dispatched, delivered, failed or returned between {rangeLabel}. Try a longer range.</p>
            </div>
          )}

          {/* Riders */}
          <section aria-labelledby="riders-heading" className="bg-white border border-gray-200/80 shadow-xs rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="riders-heading" className="text-sm font-black text-gray-900">Rider efficiency</h2>
                <p className="text-xs text-gray-500">Click a column to sort. n/a means there was nothing to measure.</p>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => void exportCsv('daily')}
                  disabled={exporting !== null || loading}
                  className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {exporting === 'daily' ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                  Export daily CSV
                </button>
                <button
                  type="button"
                  onClick={() => void exportCsv('riders')}
                  disabled={exporting !== null || loading}
                  className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {exporting === 'riders' ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                  Export riders CSV
                </button>
              </div>
            </div>

            {riders.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No active riders in this hub yet.</p>
            ) : (
              <RidersTable riders={riders} sort={sort} direction={direction} onSort={(key) => void changeSort(key)} busy={ridersBusy} />
            )}

            {unattributed > 0 && (
              <p className="text-xs text-gray-600">
                {unattributed} {unattributed === 1 ? 'delivery was' : 'deliveries were'} marked delivered by an administrator, so {unattributed === 1 ? 'it is' : 'they are'} counted above but not credited to any rider.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
