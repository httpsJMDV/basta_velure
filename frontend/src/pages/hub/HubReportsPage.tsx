import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, BarChart2, ChevronDown, Download, Info, Printer, RefreshCw } from 'lucide-react';
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

interface Applied {
  from: string;
  to: string;
}

type FieldErrors = { from?: string; to?: string };

interface KpiProps {
  label: string;
  value: string;
  hint: string;
}

function Kpi({ label, value, hint }: KpiProps) {
  const unavailable = value === 'n/a';
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 print:break-inside-avoid">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${unavailable ? 'text-gray-400' : 'text-gray-900'}`}>{value}</p>
      <p className="mt-1 text-[11px] text-gray-500 leading-snug">{hint}</p>
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
  const [fromInput, setFromInput] = useState(initial.from);
  const [toInput, setToInput] = useState(initial.to);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
    async (range: Applied, nextSort: HubReportRiderSort, nextDirection: HubReportSortDirection) => {
      const id = ++requestRef.current;
      setLoading(true);
      setError(null);
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
      } catch (err: unknown) {
        if (id !== requestRef.current) return;
        const { fields, message } = explain(err);
        if (Object.values(fields).some(Boolean)) {
          setFieldErrors(fields);
          setError((current) => current ?? 'Check the dates and try again.');
        } else {
          setError(message);
        }
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [explain]
  );

  // The first load only; later loads come from Apply, Retry and sorting.
  useEffect(() => {
    void load(initial, 'delivered', 'desc');
  }, [load, initial]);

  const choosePreset = (next: RangePreset) => {
    setPreset(next);
    setFieldErrors({});
    if (next !== 'custom') {
      const range = presetRange(next, manilaToday());
      setFromInput(range.from);
      setToInput(range.to);
    }
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateRange(fromInput, toInput);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void load({ from: fromInput, to: toInput }, sort, direction);
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
    <div className="space-y-5">
      {/* Print-only heading: the controls are hidden on paper */}
      <div className="hidden print:block">
        <h1 className="text-xl font-black">{user?.sorting_center?.hub_name ?? 'Hub'} performance report</h1>
        <p className="text-sm text-gray-600">{rangeLabel} (Asia/Manila)</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-gray-400" aria-hidden="true" />
            Hub reports
          </h1>
          <p className="text-xs text-gray-500">Throughput, on-time delivery and rider efficiency for {rangeLabel}.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Print
        </button>
      </div>

      {/* Date range */}
      <form onSubmit={apply} noValidate className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 print:hidden">
        <div role="group" aria-label="Date range presets" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => choosePreset(p.key)}
              aria-pressed={preset === p.key}
              className={`min-h-10 px-3.5 rounded-xl text-xs font-bold border ${
                preset === p.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <div className="space-y-1">
            <label htmlFor="report-from" className="block text-xs font-bold text-gray-700">From</label>
            <input
              id="report-from"
              type="date"
              value={fromInput}
              disabled={preset !== 'custom'}
              onChange={(e) => setFromInput(e.target.value)}
              aria-invalid={fieldErrors.from ? true : undefined}
              aria-describedby={fieldErrors.from ? 'report-from-error' : undefined}
              className="min-h-11 rounded-xl border border-gray-300 px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {fieldErrors.from && <p id="report-from-error" role="alert" className="text-xs font-semibold text-red-700 max-w-56">{fieldErrors.from}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="report-to" className="block text-xs font-bold text-gray-700">To</label>
            <input
              id="report-to"
              type="date"
              value={toInput}
              disabled={preset !== 'custom'}
              onChange={(e) => setToInput(e.target.value)}
              aria-invalid={fieldErrors.to ? true : undefined}
              aria-describedby={fieldErrors.to ? 'report-to-error' : undefined}
              className="min-h-11 rounded-xl border border-gray-300 px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {fieldErrors.to && <p id="report-to-error" role="alert" className="text-xs font-semibold text-red-700 max-w-56">{fieldErrors.to}</p>}
          </div>
          <div className="pt-[22px]">
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 px-6 inline-flex items-center gap-2 rounded-xl bg-brand-red hover:opacity-90 text-white text-sm font-bold disabled:opacity-50"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Apply
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500">Days are Asia/Manila calendar days, both ends included. Up to 366 days.</p>
      </form>

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
          <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi label="Received" value={String(totals.received)} hint={`Scanned in at the hub. ${totals.sorted} sorted, ${totals.dispatched} dispatched.`} />
            <Kpi
              label="Delivered"
              value={String(totals.delivered)}
              hint={totals.avg_delivery_hours === null ? 'No delivery time to average.' : `Average ${formatHours(totals.avg_delivery_hours)} out for delivery.`}
            />
            <Kpi
              label="On-time rate"
              value={formatPercent(totals.on_time_rate)}
              hint={totals.delivered === 0 ? 'No deliveries in this period.' : `${totals.on_time_deliveries} of ${totals.delivered} delivered within ${sla} h of arriving.`}
            />
            <Kpi
              label="Success rate"
              value={formatPercent(totals.success_rate)}
              hint={totals.success_rate === null ? 'No delivery attempts in this period.' : `${totals.delivered} delivered, ${totals.failed_attempts} failed attempts.`}
            />
            <Kpi label="Avg hub dwell" value={formatHours(totals.avg_hub_dwell_hours)} hint="From received to out for delivery." />
            <Kpi label="Returned" value={String(totals.returned)} hint="Sent back to the seller by the hub." />
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
          <details className="group bg-white border border-gray-200 rounded-2xl print:hidden">
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
          <section aria-labelledby="riders-heading" className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4">
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
