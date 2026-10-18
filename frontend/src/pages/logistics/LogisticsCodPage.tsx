import { Fragment, useCallback, useEffect, useState } from 'react';
import { Coins, Download, Check, AlertTriangle, ChevronDown } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListCard, ListEmpty, ListError, Pill, TH, TD } from '../../components/admin/listKit';
import { useToast } from '../../components/ui/Toast';
import { getCodDayApi, confirmRemittanceApi, downloadCourierExport, type CodDay } from '../../api/courierOps';
import { apiErrorMessage } from '../../utils/apiError';

const peso = (v: string | number) => {
  const n = Number(v);
  return `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/**
 * Cash on delivery (L9): for one day, what each rider collected and remitted and the difference, with shortfalls
 * flagged; the remittances waiting for the company to confirm (only the company can); and the deliveries and COD
 * exports as CSV or XLSX for any range.
 */
export default function LogisticsCodPage() {
  const { showToast } = useToast();
  const [date, setDate] = useState(manilaToday());
  const [day, setDay] = useState<CodDay | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRider, setOpenRider] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setDay(null);
    getCodDayApi(date).then(setDay).catch(() => setFailed(true));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const confirm = async (id: number) => {
    setConfirming(id);
    try {
      showToast((await confirmRemittanceApi(id)).message);
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'The remittance was not confirmed.'), 'error');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Coins} eyebrow="Money" title="COD & exports"
        subtitle="What riders collected and handed over, day by day. A remittance counts only once you confirm it.">
        <label className="flex items-center gap-2 text-[11px] text-white/70">
          Day
          <input type="date" value={date} max={manilaToday()} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-9 px-2 rounded-lg bg-white/10 border border-white/15 text-white text-[12px] [color-scheme:dark]" />
        </label>
      </PageHero>

      {failed && <ListError message="The day could not be loaded." onRetry={load} />}

      {day && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Collected" value={peso(day.totals.collected)} />
          <Figure label="Remitted" value={peso(day.totals.remitted)} />
          <Figure label="Difference" value={peso(day.totals.difference)} tone={Number(day.totals.difference) < 0 ? 'red' : 'gray'} />
        </div>
      )}

      {day && day.pending.length > 0 && (
        <ListCard title="Waiting for your confirmation" count={day.pending.length}>
          <ul className="divide-y divide-gray-100">
            {day.pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-gray-900">{r.rider ?? 'Rider'} · {peso(r.amount)}</p>
                  <p className="text-[11.5px] text-gray-500">
                    {r.reference} · balance when sent {peso(r.balance_at_submission)}
                    {r.submitted_at ? ` · ${new Date(r.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                </div>
                {Number(r.shortfall) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-[12px] font-bold text-red-800">
                    <AlertTriangle className="w-3.5 h-3.5" /> Short by {peso(r.shortfall)}
                  </span>
                )}
                <button type="button" onClick={() => void confirm(r.id)} disabled={confirming !== null}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[12px] font-bold disabled:opacity-40">
                  <Check className="w-4 h-4" /> {confirming === r.id ? 'Confirming…' : 'Confirm received'}
                </button>
              </li>
            ))}
          </ul>
        </ListCard>
      )}

      <ListCard title={`Riders on ${date}`} count={day?.riders.length} busy={!day}>
        {!day ? <div className="h-32 m-4 rounded-xl bg-gray-100 animate-pulse" /> : day.riders.length === 0 ? (
          <ListEmpty icon={Coins} title="No cash on delivery this day" hint="Collections and remittances of the day show here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={TH}>Rider</th><th className={`${TH} text-right`}>Collected</th><th className={`${TH} text-right`}>Remitted</th>
                <th className={`${TH} text-right`}>Difference</th><th className={`${TH} text-right hidden md:table-cell`}>Balance now</th><th className={TH}><span className="sr-only">Orders</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {day.riders.map((r) => (
                  <Fragment key={r.rider_id}>
                    <tr className={r.shortfall ? 'bg-red-50/40' : ''}>
                      <td className={`${TD} font-semibold text-gray-900`}>{r.rider}</td>
                      <td className={`${TD} text-right tabular-nums`}>{peso(r.collected)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{peso(r.remitted)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {r.shortfall ? <Pill tone="red">{peso(r.difference)}</Pill> : <span className="text-gray-700">{peso(r.difference)}</span>}
                      </td>
                      <td className={`${TD} text-right tabular-nums hidden md:table-cell text-gray-600`}>{peso(r.balance)}</td>
                      <td className={`${TD} text-right`}>
                        <button type="button" onClick={() => setOpenRider(openRider === r.rider_id ? null : r.rider_id)} aria-expanded={openRider === r.rider_id}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-brand-red">
                          {r.orders.length} order{r.orders.length === 1 ? '' : 's'} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openRider === r.rider_id ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {openRider === r.rider_id && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50/60 px-4 py-2">
                          <ul className="grid gap-1 sm:grid-cols-2 text-[12px]">
                            {r.orders.map((o) => (
                              <li key={o.tracking_number} className="flex items-center justify-between rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                                <span className="font-mono text-gray-600">{o.order_number ?? o.tracking_number}</span>
                                <span className="font-semibold tabular-nums text-gray-900">{peso(o.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListCard>

      <ExportCard />
    </div>
  );
}

function Figure({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'red' }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-xs ${tone === 'red' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200/80'}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-xl font-black tabular-nums ${tone === 'red' ? 'text-red-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

/** Deliveries or COD for a range, as CSV or XLSX. An empty range downloads a file with the header row only. */
function ExportCard() {
  const { showToast } = useToast();
  const today = manilaToday();
  const [type, setType] = useState<'deliveries' | 'cod'>('deliveries');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null);
  const rangeError = from && to && to < from ? 'The end date cannot be before the start date.' : '';

  const run = async (format: 'csv' | 'xlsx') => {
    if (rangeError || !from || !to) return;
    setBusy(format);
    try {
      await downloadCourierExport(type, format, from, to);
    } catch (e) {
      showToast(apiErrorMessage(e, 'The export did not download.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const input = 'h-10 px-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red';

  return (
    <ListCard title="Export">
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div role="radiogroup" aria-label="What to export" className="flex gap-1.5">
          {([['deliveries', 'Deliveries'], ['cod', 'COD collected']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)}
              className={`h-10 px-3.5 rounded-xl border text-[12.5px] font-semibold ${type === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="text-[11.5px] font-semibold text-gray-500">From<input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className={`${input} block mt-1`} /></label>
        <label className="text-[11.5px] font-semibold text-gray-500">To<input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className={`${input} block mt-1 ${rangeError ? 'border-red-400' : ''}`} aria-invalid={!!rangeError} /></label>
        <div className="flex gap-2">
          {(['csv', 'xlsx'] as const).map((f) => (
            <button key={f} type="button" onClick={() => void run(f)} disabled={!!rangeError || busy !== null}
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[12.5px] font-bold text-gray-800 hover:border-brand-red hover:text-brand-red disabled:opacity-40">
              <Download className="w-4 h-4" /> {busy === f ? 'Preparing…' : f.toUpperCase()}
            </button>
          ))}
        </div>
        {rangeError && <p className="basis-full text-[12px] font-semibold text-red-700">{rangeError}</p>}
      </div>
    </ListCard>
  );
}
