import { useCallback, useEffect, useMemo, useState } from 'react';
import { Undo2, Bike, Store, Eye, CircleDollarSign, Wallet } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { StatusTabs, ListEmpty, ListError, Pill, relativeTime } from '../../components/admin/listKit';
import CustomSelect from '../../components/ui/CustomSelect';
import { useToast } from '../../components/ui/Toast';
import { getCourierReturnsApi, assignReturnApi, type ReturnRow } from '../../api/courierOps';
import CourierParcelPanel from '../../components/logistics/CourierParcelPanel';
import { HeroStats, Panel, RiderAvailabilityStrip, useRiderAvailability } from '../../components/logistics/CourierKit';
import { apiErrorMessage } from '../../utils/apiError';

type Tab = 'waiting' | 'moving' | 'all';

/**
 * Return to Sender (L7). A parcel the recipient refused, or one that failed its last attempt, lands here with every
 * failure reason. Give the trip to a rider; once it is back with the shop, the buyer's order is Cancelled (failed
 * delivery), a prepaid order is refunded, and the shop confirms receipt before its stock returns.
 */
export default function LogisticsReturnsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('waiting');
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { riders, reload: reloadRiders } = useRiderAvailability();

  const load = useCallback(() => {
    setFailed(false);
    getCourierReturnsApi().then(setRows).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (row: ReturnRow) => {
    const riderId = Number(pick[row.id]);
    if (!riderId) return;
    setBusy(row.id);
    try {
      showToast((await assignReturnApi(row.id, riderId)).message);
      setPick((p) => ({ ...p, [row.id]: '' }));
      load();
      reloadRiders();
    } catch (e) {
      showToast(apiErrorMessage(e, 'The return rider was not assigned.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const waiting = rows?.filter((r) => !r.rider).length ?? 0;
  const moving = (rows?.length ?? 0) - waiting;
  const shown = useMemo(() => (rows ?? []).filter((r) => tab === 'all' || (tab === 'waiting' ? !r.rider : !!r.rider)), [rows, tab]);
  const riderOptions = (r: ReturnRow) => [
    { value: '', label: riders?.available.length ? (r.rider ? 'Change the rider' : 'Choose a rider') : 'No rider can take a job' },
    ...(riders?.available ?? []).map((d) => ({ value: String(d.id), label: `${d.name} · ${d.active_jobs}/${riders?.max ?? 3} jobs` })),
  ];

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Undo2} eyebrow="Operations" title="Return to sender"
        subtitle="Refused parcels and parcels that failed 3 attempts. No more attempts: give each one to a rider to take back to the shop.">
        {rows && (
          <HeroStats items={[
            { label: 'Need a rider', value: waiting, tone: waiting ? 'warn' : 'default' },
            { label: 'On the way back', value: moving, tone: 'good' },
          ]} />
        )}
      </PageHero>

      <RiderAvailabilityStrip riders={riders} />

      {failed ? <ListError message="The returns could not be loaded." onRetry={load} /> : (
        <Panel icon={Undo2} title="Going back to the seller"
          subtitle="Once a parcel is back, the order is cancelled, a prepaid order is refunded, and the shop confirms receipt."
          actions={(
            <StatusTabs<Tab> label="Returns" value={tab} onChange={setTab} options={[
              { value: 'waiting', label: 'Need a rider', count: rows ? waiting : null },
              { value: 'moving', label: 'On the way', count: rows ? moving : null },
              { value: 'all', label: 'All', count: rows ? rows.length : null },
            ]} />
          )}
        >
          {!rows ? (
            <div className="p-4 space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
          ) : shown.length === 0 ? (
            <ListEmpty icon={Undo2} title={tab === 'waiting' ? 'Every return has a rider' : 'Nothing to return'}
              hint="Refused parcels and third failed attempts appear here." />
          ) : (
            <ul className="grid gap-3 p-4 xl:grid-cols-2">
              {shown.map((r) => (
                <li key={r.id} className={`flex flex-col rounded-2xl border bg-white ${r.rider ? 'border-gray-200/80' : 'border-amber-200 ring-1 ring-amber-100'}`}>
                  <div className="flex items-start justify-between gap-3 px-4 pt-4">
                    <div className="min-w-0">
                      <p className="font-mono text-[14px] font-bold text-gray-900">{r.tracking_number}</p>
                      <p className="text-[11.5px] text-gray-400 font-mono">{r.order_number ?? '—'} · {relativeTime(r.since)}</p>
                    </div>
                    {r.rider ? <Pill tone="amber">On the way back</Pill> : <Pill tone="red">Needs a rider</Pill>}
                  </div>

                  <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Store className="w-4 h-4" aria-hidden="true" /></span>
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Back to</p>
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{r.shop ?? 'Shop'}</p>
                        <p className="text-[11.5px] text-gray-500 truncate">{r.shop_area}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                        {r.payment_method === 'cod' ? <CircleDollarSign className="w-4 h-4" aria-hidden="true" /> : <Wallet className="w-4 h-4" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Payment</p>
                        <p className="text-[13px] font-semibold text-gray-900">{r.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'}</p>
                        <p className="text-[11.5px] text-gray-500">{r.payment_method === 'cod' ? 'Nothing to refund' : 'Refunded when it is back'}</p>
                      </div>
                    </div>
                  </div>

                  <ol className="mx-4 mb-3 space-y-1.5 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                    {r.failures.length === 0 && <li className="text-[12px] text-gray-500">No failed attempt was recorded.</li>}
                    {r.failures.map((f) => (
                      <li key={f.attempt} className="flex items-start gap-2 text-[12px] text-gray-700">
                        <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-[10.5px] font-black flex items-center justify-center shrink-0">{f.attempt}</span>
                        <span className="min-w-0">{f.reason}{f.note ? <span className="text-gray-500"> · {f.note}</span> : null}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-auto flex flex-wrap items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                    {r.rider && (
                      <span className="inline-flex items-center gap-1.5 mr-auto text-[12.5px] font-semibold text-gray-800">
                        <Bike className="w-4 h-4 text-emerald-600" aria-hidden="true" /> {r.rider.name}
                      </span>
                    )}
                    <CustomSelect className={r.rider ? 'w-48' : 'flex-1 min-w-[180px]'} value={pick[r.id] ?? ''} onChange={(v) => setPick((p) => ({ ...p, [r.id]: v }))} options={riderOptions(r)} />
                    <button type="button" onClick={() => void assign(r)} disabled={!pick[r.id] || busy === r.id}
                      className="h-10 px-3.5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12px] font-bold disabled:opacity-40">
                      {busy === r.id ? 'Assigning…' : r.rider ? 'Reassign' : 'Assign'}
                    </button>
                    <button type="button" onClick={() => setOpen(r.id)} aria-label={`Open ${r.tracking_number}`}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red">
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {open !== null && <CourierParcelPanel parcelId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
