import { useCallback, useEffect, useState } from 'react';
import { Undo2, Bike } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListCard, ListEmpty, ListError, Pill, relativeTime } from '../../components/admin/listKit';
import CustomSelect from '../../components/ui/CustomSelect';
import { useToast } from '../../components/ui/Toast';
import { getCourierReturnsApi, assignReturnApi, getDispatchRidersApi, type ReturnRow, type DispatchRider } from '../../api/courierOps';
import CourierParcelPanel from '../../components/logistics/CourierParcelPanel';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * Return to Sender (L7). A parcel the recipient refused, or one that failed its last attempt, lands here with every
 * failure reason. Give the trip to a rider; once it is back with the shop, the buyer's order is Cancelled (failed
 * delivery), a prepaid order is refunded, and the shop confirms receipt before its stock returns.
 */
export default function LogisticsReturnsPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [riders, setRiders] = useState<DispatchRider[]>([]);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getCourierReturnsApi().then(setRows).catch(() => setFailed(true));
    getDispatchRidersApi().then((r) => setRiders(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async (row: ReturnRow) => {
    const riderId = Number(pick[row.id]);
    if (!riderId) return;
    setBusy(row.id);
    try {
      showToast((await assignReturnApi(row.id, riderId)).message);
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'The return rider was not assigned.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const waiting = rows?.filter((r) => !r.rider).length ?? 0;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Undo2} eyebrow="Network" title="Return to sender"
        subtitle="Refused parcels and parcels that failed 3 attempts. No more attempts: give each one to a rider to take back to the shop.">
        {rows && <span className="text-[11px] text-white/70 tabular-nums"><b className="text-white">{waiting}</b> need a rider · {rows.length - waiting} on the way</span>}
      </PageHero>

      {failed ? <ListError message="The returns could not be loaded." onRetry={load} /> : (
        <ListCard title="Going back to the seller" count={rows?.length} busy={!rows}>
          {!rows ? <div className="h-40 m-4 rounded-xl bg-gray-100 animate-pulse" /> : rows.length === 0 ? (
            <ListEmpty icon={Undo2} title="Nothing to return" hint="Refused parcels and third failed attempts appear here." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <li key={r.id} className="grid gap-3 px-4 py-3.5 lg:grid-cols-[1.2fr_1.4fr_1fr] lg:items-start">
                  <button type="button" onClick={() => setOpen(r.id)} className="text-left min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-brand-black hover:text-brand-red">{r.tracking_number}</p>
                    <p className="text-[12px] text-gray-700 truncate">{r.shop ?? 'Shop'} · {r.shop_area}</p>
                    <p className="text-[11px] text-gray-400">
                      {r.order_number} · {r.payment_method === 'cod' ? 'COD, nothing to refund' : 'Prepaid, refunded on return'} · {relativeTime(r.since)}
                    </p>
                  </button>
                  <ol className="space-y-0.5 text-[12px] text-gray-700">
                    {r.failures.map((f) => (
                      <li key={f.attempt}><span className="font-semibold text-gray-900">Attempt {f.attempt}:</span> {f.reason}{f.note ? ` · ${f.note}` : ''}</li>
                    ))}
                  </ol>
                  <div className="flex flex-col gap-1.5">
                    {r.rider ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-800">
                        <Bike className="w-4 h-4 text-emerald-600" /> {r.rider.name}
                        <Pill tone="amber">On the way back</Pill>
                      </span>
                    ) : <Pill tone="red">Needs a rider</Pill>}
                    <div className="flex gap-2">
                      <CustomSelect className="flex-1" value={pick[r.id] ?? ''} onChange={(v) => setPick((p) => ({ ...p, [r.id]: v }))}
                        options={[{ value: '', label: riders.length ? (r.rider ? 'Change the rider' : 'Choose a rider') : 'No rider can take a job' }, ...riders.map((d) => ({ value: String(d.id), label: `${d.name} · ${d.active_jobs} jobs` }))]} />
                      <button type="button" onClick={() => void assign(r)} disabled={!pick[r.id] || busy === r.id}
                        className="h-10 px-3 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12px] font-bold disabled:opacity-40">
                        {busy === r.id ? '…' : 'Assign'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      )}

      {open !== null && <CourierParcelPanel parcelId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
