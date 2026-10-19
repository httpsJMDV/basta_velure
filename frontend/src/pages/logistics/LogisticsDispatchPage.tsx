import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navigation, Wand2, Bike, Check, RefreshCw, Store, MapPin, Package, WifiOff } from 'lucide-react';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { StatusTabs, ListCard, ListEmpty, ListError, Pill, SkeletonRows, TH, TD, relativeTime } from '../../components/admin/listKit';
import { Dialog, BUTTON } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import {
  getDispatchApi, getDispatchRidersApi, autoAssignApi, assignParcelsApi,
  type DispatchRow, type DispatchRider, type DispatchState,
} from '../../api/courierOps';
import { apiErrorMessage } from '../../utils/apiError';
import { HeroStats, RiderAvailabilityStrip, useRiderAvailability } from '../../components/logistics/CourierKit';

type Tab = DispatchState | 'all';

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

/** Seconds left on an open offer, ticking. */
function OfferClock({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  return <span className="tabular-nums">{left}s</span>;
}

/**
 * Who picks each parcel up (L4). New pickups go to the nearest Online rider for 60 seconds each, up to 3 riders;
 * then they wait here in Unassigned. Assign by hand, several at once (as many as a rider can hold), or reassign until
 * the parcel is picked up.
 */
export default function LogisticsDispatchPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['unassigned', 'offering', 'assigned', 'all'] as Tab[]).find((t) => t === params.get('state')) ?? 'unassigned';
  const { showToast } = useToast();

  const [rows, setRows] = useState<DispatchRow[] | null>(null);
  const [counts, setCounts] = useState<Record<DispatchState, number> | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [assigning, setAssigning] = useState<DispatchRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const { riders: availability, reload: reloadRiders } = useRiderAvailability();

  const load = useCallback((quiet = false) => {
    if (!quiet) setFailed(false);
    getDispatchApi(tab)
      .then((res) => { setRows(res.data); setCounts(res.counts); setSelected((s) => s.filter((id) => res.data.some((r) => r.id === id))); })
      .catch(() => { if (!quiet) setFailed(true); });
  }, [tab]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 10000);
    return () => window.clearInterval(t);
  }, [load]);

  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  const allChecked = rows !== null && rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const runAuto = async () => {
    setRunning(true);
    try {
      const res = await autoAssignApi(selected.length ? selected : undefined);
      showToast(res.message, res.data.offered > 0 ? 'success' : 'error');
      load(true);
      reloadRiders();
    } catch (e) {
      showToast(apiErrorMessage(e, 'Auto-assign did not run.'), 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Navigation} eyebrow="Operations" title="Dispatch"
        subtitle="New pickups go to the nearest Online rider for 60 seconds, up to 3 riders. The rest wait here for you.">
        {counts && (
          <HeroStats items={[
            { label: 'Unassigned', value: counts.unassigned, tone: counts.unassigned ? 'warn' : 'default' },
            { label: 'Being offered', value: counts.offering },
            { label: 'Assigned', value: counts.assigned, tone: 'good' },
            { label: 'Can take a job', value: availability ? `${availability.available.length}/${availability.available.length + availability.unavailable.length}` : '…', tone: availability && availability.available.length === 0 ? 'warn' : 'good' },
          ]} />
        )}
        <button type="button" className={HERO_BUTTON} onClick={() => void runAuto()} disabled={running}>
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {selected.length ? `Auto-assign ${selected.length}` : 'Run auto-assign'}
        </button>
      </PageHero>

      <RiderAvailabilityStrip riders={availability} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200/80 rounded-2xl px-3 py-2.5 shadow-xs">
        <StatusTabs<Tab>
          label="Pickup jobs"
          value={tab}
          onChange={(t) => { setSelected([]); setParams(t === 'unassigned' ? {} : { state: t }, { replace: true }); }}
          options={[
            { value: 'unassigned', label: 'Unassigned', count: counts ? counts.unassigned : null },
            { value: 'offering', label: 'Being offered', count: counts ? counts.offering : null },
            { value: 'assigned', label: 'Assigned, not picked up', count: counts ? counts.assigned : null },
            { value: 'all', label: 'All' },
          ]}
        />
        {selected.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 text-white px-3 py-2 text-xs font-semibold">
            <span>{selected.length} selected</span>
            <button type="button" className="px-3 py-1.5 rounded-lg bg-brand-red hover:bg-brand-red-dark font-bold"
              onClick={() => setAssigning(selected.map((id) => byId.get(id)).filter((r): r is DispatchRow => !!r))}>
              Assign to a rider
            </button>
            <button type="button" className="px-2 py-1.5 rounded-lg text-white/70 hover:text-white" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}
      </div>

      {failed ? <ListError message="The dispatch board could not be loaded." onRetry={() => load()} /> : (
        <ListCard title="Pickup jobs" count={rows?.length} busy={!rows}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={`${TH} w-10`}>
                    <input type="checkbox" aria-label="Select all" className="accent-brand-red" checked={allChecked}
                      onChange={(e) => setSelected(e.target.checked ? (rows ?? []).map((r) => r.id) : [])} />
                  </th>
                  <th scope="col" className={TH}>Parcel</th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>Pickup → drop-off</th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>Ready</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} text-right`}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!rows && <SkeletonRows cols={6} />}
                {rows && rows.length === 0 && (
                  <tr><td colSpan={6}><ListEmpty icon={Navigation} title={tab === 'unassigned' ? 'Nothing waiting' : 'No pickups here'}
                    hint={tab === 'unassigned' ? 'Every ready parcel has a rider or an open offer.' : 'Pickups appear when shops mark orders ready.'} /></td></tr>
                )}
                {rows?.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50/60 ${selected.includes(r.id) ? 'bg-red-50/40' : ''}`}>
                    <td className={TD}>
                      <input type="checkbox" aria-label={`Select ${r.tracking_number}`} className="accent-brand-red" checked={selected.includes(r.id)}
                        onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id))} />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center shrink-0"><Package className="w-4 h-4" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <p className="font-mono font-semibold text-brand-black">{r.tracking_number}</p>
                          <p className="text-[11px] text-gray-500 truncate max-w-[220px]">{r.order_number ?? ''}{r.cod_amount !== null ? ` · COD ${peso(r.cod_amount)}` : ' · Prepaid'}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} hidden md:table-cell`}>
                      <p className="flex items-center gap-1.5 text-[12.5px] text-gray-800"><Store className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" /><span className="truncate max-w-[220px]">{r.shop_name ?? 'Shop'}{r.pickup_area ? `, ${r.pickup_area}` : ''}</span></p>
                      <p className="flex items-center gap-1.5 text-[12px] text-gray-500"><MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" /><span className="truncate max-w-[220px]">{r.dropoff_area ?? '—'}</span></p>
                    </td>
                    <td className={`${TD} hidden lg:table-cell text-gray-500 whitespace-nowrap`}>{relativeTime(r.ready_at)}</td>
                    <td className={TD}>
                      {r.state === 'assigned' && r.rider ? (
                        <span className="inline-flex items-center gap-1.5 text-gray-800"><Bike className="w-3.5 h-3.5 text-emerald-600" /> {r.rider.name}</span>
                      ) : r.state === 'offering' && r.offer ? (
                        <div>
                          <Pill tone="amber">Offered</Pill>
                          <p className="mt-1 text-[11px] text-gray-500">{r.offer.rider} · <OfferClock expiresAt={r.offer.expires_at} /> left · try {r.attempts + 1} of {r.max_attempts}</p>
                        </div>
                      ) : (
                        <div>
                          <Pill tone="red">Unassigned</Pill>
                          {r.history.length > 0 && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              {r.history.filter((h) => h.status === 'declined').length} declined · {r.history.filter((h) => h.status === 'expired').length} timed out
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <button type="button" onClick={() => setAssigning([r])}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:border-brand-red hover:text-brand-red">
                        {r.state === 'assigned' ? 'Reassign' : 'Assign'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListCard>
      )}

      {assigning && (
        <AssignDialog
          parcels={assigning}
          onClose={() => setAssigning(null)}
          onDone={(message) => { setAssigning(null); setSelected([]); showToast(message); load(true); }}
        />
      )}
    </div>
  );
}

function AssignDialog({ parcels, onClose, onDone }: { parcels: DispatchRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const [riders, setRiders] = useState<{ data: DispatchRider[]; unavailable: DispatchRider[]; max: number } | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ assigned: string[]; skipped: { tracking_number: string | null; reason: string }[] } | null>(null);
  const single = parcels.length === 1 ? parcels[0] : null;

  useEffect(() => {
    getDispatchRidersApi(parcels[0]?.id).then((r) => setRiders({ data: r.data, unavailable: r.unavailable, max: r.max_active_jobs })).catch(() => setError('The riders could not be loaded.'));
  }, [parcels]);

  const assign = async () => {
    if (pick === null) return;
    setBusy(true);
    setError('');
    try {
      const res = await assignParcelsApi(parcels.map((p) => p.id), pick);
      if (res.data.skipped.length > 0) setResult(res.data); else onDone(res.message);
    } catch (e) {
      setError(apiErrorMessage(e, 'The assignment did not go through.'));
    } finally {
      setBusy(false);
    }
  };

  const title = single ? `${single.state === 'assigned' ? 'Reassign' : 'Assign'} ${single.tracking_number}` : `Assign ${parcels.length} pickups`;

  return (
    <Dialog open onClose={onClose} title={title} size="max-w-lg"
      footer={result ? (
        <button type="button" className={BUTTON.primary} onClick={() => onDone(`${result.assigned.length} assigned, ${result.skipped.length} skipped.`)}>Done</button>
      ) : (
        <>
          <button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={BUTTON.primary} onClick={() => void assign()} disabled={pick === null || busy}>{busy ? 'Assigning…' : 'Assign'}</button>
        </>
      )}>
      {result ? (
        <div className="space-y-3 text-[13px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-800"><Check className="w-4 h-4" /> {result.assigned.length} assigned</p>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="font-semibold text-amber-900">{result.skipped.length} skipped and still unassigned</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-amber-900">
              {result.skipped.map((s, i) => <li key={i}><span className="font-mono">{s.tracking_number ?? '—'}</span>: {s.reason}</li>)}
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-stone-600">
            Only Active, Online riders with fewer than {riders?.max ?? 3} jobs can take a pickup. {parcels.length > 1 ? 'A rider gets as many as they can hold; the rest are skipped.' : 'Nearest first.'}
          </p>
          {!riders && !error && <div className="h-32 rounded-xl bg-stone-100 animate-pulse" />}
          {riders && riders.data.length === 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12.5px] text-amber-900">
              <WifiOff className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
              No rider can take a job right now. A rider must be Active, Online in the rider app, and under {riders.max} jobs.
            </p>
          )}
          {riders && riders.data.length > 0 && (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto" role="radiogroup" aria-label="Rider">
              {riders.data.map((r) => (
                <li key={r.id}>
                  <button type="button" role="radio" aria-checked={pick === r.id} onClick={() => setPick(r.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${pick === r.id ? 'border-brand-red bg-red-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-stone-900 truncate">{r.name}</span>
                      <span className="block text-[11.5px] text-stone-500">{r.distance ?? 'Online'}</span>
                    </span>
                    <span className="text-[11.5px] font-semibold text-stone-600 tabular-nums">{r.active_jobs}/{riders.max} jobs</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {riders && riders.unavailable.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400">Not available now ({riders.unavailable.length})</p>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {riders.unavailable.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 opacity-80">
                    <span className="w-2 h-2 rounded-full bg-stone-300 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-stone-700 truncate">{r.name}</span>
                    <span className="text-[11.5px] text-stone-500">{r.problem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="text-[12px] font-medium text-red-700">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
