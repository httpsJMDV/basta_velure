import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, RefreshCw, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import CustomSelect from '../ui/CustomSelect';
import { Dialog, ReasonDialog } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { RecordPaymentDialog, peso } from './GcashKit';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import { apiErrorMessage } from '../../utils/apiError';
import { getRiderPayments, requestRiderPayment, sendRiderPayment, rejectRiderPayment, confirmRiderPayment, reportRiderPayment, viewRiderPaymentReceipt, claimRiderPayment, releaseRiderPayment } from '../../api/riderPayments';
import type { RiderPayment, RiderPaymentList, RiderPaymentRole, RiderPaymentSummary } from '../../api/riderPayments';

const labels = { pending: 'Awaiting payment', processing: 'Sent · awaiting rider', completed: 'Received', rejected: 'Declined' };
const tones = { pending: 'bg-amber-50 text-amber-800', processing: 'bg-blue-50 text-blue-800', completed: 'bg-emerald-50 text-emerald-800', rejected: 'bg-stone-100 text-stone-600' };
type Action = { kind: 'send' | 'confirm' | 'reject' | 'report' | 'release'; row: RiderPayment } | { kind: 'request'; summary: RiderPaymentSummary };

export default function RiderPaymentRequests({ role = 'rider' }: { role?: RiderPaymentRole }) {
  const rider = role === 'rider';
  const { showToast } = useToast();
  const [data, setData] = useState<RiderPaymentList | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const version = useRef(0);
  const load = useCallback(async () => {
    const run = ++version.current;
    try { const result = await getRiderPayments(role, page, status); if (run === version.current) { setData(result); setError(''); } }
    catch (e) { if (run === version.current) setError(apiErrorMessage(e, 'Payment requests could not be loaded.')); }
  }, [role, page, status]);
  useEffect(() => { void load(); return () => { version.current++; }; }, [load]);
  useLiveRefresh(() => void load(), 30_000, action !== null);

  const run = async (note = '') => {
    if (!action || busy) return;
    setBusy(true); setActionError(undefined);
    try {
      if (action.kind === 'request') await requestRiderPayment(action.summary);
      else if (action.kind === 'confirm') await confirmRiderPayment(action.row.id);
      else if (action.kind === 'reject') await rejectRiderPayment(role, action.row.id, note);
      else if (action.kind === 'report') await reportRiderPayment(action.row.id, note);
      else if (action.kind === 'release') await releaseRiderPayment(role, action.row.id);
      setAction(null); showToast('Payment request updated.'); await load();
    } catch (e) { setActionError(apiErrorMessage(e, 'The payment action could not be saved.')); }
    finally { setBusy(false); }
  };
  const open = (next: Action) => { setActionError(undefined); setAction(next); };
  const summary = data?.summary;
  const take = async (row: RiderPayment) => {
    if (busy) return;
    setBusy(true);
    try { const claimed = await claimRiderPayment(role, row.id); open({ kind: 'send', row: claimed }); await load(); }
    catch (e) { showToast(apiErrorMessage(e, 'This request could not be assigned to you.'), 'error'); await load(); }
    finally { setBusy(false); }
  };

  return <section aria-label="Rider payment requests" className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
    <div className="border-b border-stone-100 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-red"><Wallet className="w-4 h-4" /> Payments</p><h2 className="mt-1 text-xl font-bold text-stone-900">{rider ? 'Your earned pay, on request' : 'Rider payment requests'}</h2></div>
        <button type="button" onClick={() => void load()} aria-label="Refresh payment requests" className="rounded-full border border-stone-200 p-2 text-stone-500 hover:bg-stone-50"><RefreshCw className="w-4 h-4" /></button></div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500">{rider ? 'Request your available pickup, delivery and completed-trip earnings. Your hub or courier sends payment to your saved GCash.' : 'Hub and courier share this queue. Verify the reserved earnings and account, send the exact amount in GCash, then record proof. The rider confirms receipt.'}</p>
      {rider && summary && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-stone-50 p-4">
        <div><p className="text-xs text-stone-500">Available to request</p><p className="mt-1 text-3xl font-bold text-stone-900">{peso(Number(summary.available))}</p><p className="mt-1 text-xs text-stone-500">{summary.gcash_name ?? 'No GCash account saved'} {summary.gcash_number}</p></div>
        <div className="space-y-2"><button type="button" disabled={!summary.can_request || !!error || busy} onClick={() => open({ kind: 'request', summary })} className="h-10 rounded-full bg-brand-red px-5 text-sm font-bold text-white disabled:opacity-40">Request payment</button><Link to="/rider/account" className="block text-center text-xs font-semibold text-brand-red">Manage GCash</Link></div>
        {summary.has_open_request && <p className="w-full text-xs text-amber-800">Your current request must be paid and confirmed, or declined, before you request again. New earnings stay separate.</p>}
      </div>}
      {!rider && <div className="mt-4 max-w-xs"><CustomSelect label="Request status" value={status} onChange={value => { setStatus(value); setPage(1); setData(null); }} options={[{ value: 'open', label: 'Open requests' }, { value: 'pending', label: 'Awaiting payment' }, { value: 'processing', label: 'Sent / awaiting confirmation' }, { value: 'completed', label: 'Received' }, { value: 'rejected', label: 'Declined' }, { value: 'all', label: 'All requests' }]} /></div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
    {!data && !error ? <p role="status" className="p-6 text-sm text-stone-500">Loading payment requests…</p> : <div className="divide-y divide-stone-100">
      {data?.data.length === 0 && <p className="p-6 text-sm text-stone-500">No requests here yet.</p>}
      {data?.data.map(row => <article key={row.id} className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs text-stone-400">{row.reference_code}</p><p className="mt-1 text-xl font-bold text-stone-900">{peso(Number(row.amount))}</p>{!rider && <p className="mt-1 text-sm font-semibold text-stone-700">{row.rider_name} · {row.hub_name}</p>}</div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[row.status]}`}>{labels[row.status]}</span></div>
        <div className="mt-3 space-y-1 text-xs text-stone-500"><p>GCash: {row.gcash_name} · <span className="font-mono">{row.gcash_number}</span></p><p>{row.breakdown.earnings_count} pickup/delivery earnings ({peso(Number(row.breakdown.earnings_amount))}) · {row.breakdown.trips_count} completed trips ({peso(Number(row.breakdown.trips_amount))})</p><p>Requested {new Date(row.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>{row.transfer_reference && <p>Transfer reference: <span className="font-mono text-stone-800">{row.transfer_reference}</span></p>}{row.assigned_to && <p>Assigned to {row.processor_name}. Other staff must not send this payment.</p>}{row.note && <p>Decision: {row.note}</p>}{row.report_note && <p className="rounded-xl bg-red-50 p-3 text-red-800">Reported issue: {row.report_note}. {row.status === 'completed' ? 'The rider has since confirmed receipt.' : 'Check the actual transfer with the rider; this request stays open until receipt is confirmed.'}</p>}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.has_receipt && <button type="button" onClick={() => void viewRiderPaymentReceipt(row.id).catch(e => showToast(apiErrorMessage(e, 'Receipt could not be opened.'), 'error'))} className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold"><Receipt className="w-3.5 h-3.5" /> View receipt</button>}
          {!rider && row.status === 'pending' && row.can_process && <><button type="button" disabled={busy} onClick={() => void take(row)} className="rounded-full bg-brand-red px-4 py-2 text-xs font-bold text-white">{row.assigned_to ? 'Record transfer' : 'Take request'}</button>{row.assigned_to && <button type="button" onClick={() => open({ kind: 'release', row })} className="rounded-full border border-stone-200 px-4 py-2 text-xs font-semibold">Release assignment</button>}<button type="button" onClick={() => open({ kind: 'reject', row })} className="rounded-full border border-stone-200 px-4 py-2 text-xs font-semibold">Decline</button></>}
          {rider && row.status === 'processing' && <><button type="button" onClick={() => open({ kind: 'confirm', row })} className="rounded-full bg-stone-900 px-4 py-2 text-xs font-bold text-white">I received it</button>{!row.report_note && <button type="button" onClick={() => open({ kind: 'report', row })} className="rounded-full border border-stone-200 px-4 py-2 text-xs font-semibold">Payment not received</button>}</>}
        </div>
      </article>)}
    </div>}
    {data && data.meta.last_page > 1 && <div className="flex items-center justify-center gap-3 border-t border-stone-100 p-3 text-xs"><button aria-label="Previous requests" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></button>{page} / {data.meta.last_page}<button aria-label="Next requests" disabled={page >= data.meta.last_page} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></button></div>}
    {action?.kind === 'send' && <RecordPaymentDialog title="Record rider payment" intro={<>Send this exact amount to the account saved on the request. A transfer receipt is required. Recording here does not send money.</>} payee={{ name: action.row.gcash_name, number: action.row.gcash_number }} amount={Number(action.row.amount)} withReceipt onClose={() => { setAction(null); void load(); }} onConfirm={async (reference, receipt) => { if (!receipt) throw new Error('Attach the actual transfer receipt.'); await sendRiderPayment(role, action.row.id, reference, receipt); setAction(null); showToast('Transfer recorded. The rider can confirm receipt.'); await load(); }} />}
    {(action?.kind === 'request' || action?.kind === 'confirm' || action?.kind === 'release') && <Dialog open onClose={() => !busy && setAction(null)} title={action.kind === 'request' ? 'Request your earned payment?' : action.kind === 'release' ? 'Release this assignment?' : 'Did the payment arrive?'} footer={<><button type="button" disabled={busy} onClick={() => setAction(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button><button type="button" disabled={busy} onClick={() => void run()} className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white">{busy ? 'Saving…' : action.kind === 'request' ? 'Request payment' : action.kind === 'release' ? 'I have not sent funds' : 'Yes, I received it'}</button></>}>
      <p className="text-sm leading-relaxed text-stone-600">{action.kind === 'request' ? <>Request <b>{peso(Number(action.summary.available))}</b> to <b>{action.summary.gcash_name} ({action.summary.gcash_number})</b>. This reserves the available earnings listed above for your hub or courier to pay.</> : action.kind === 'release' ? <>Only release this assignment if you have not sent any money. Another staff member will then be able to take it.</> : <>Only confirm after <b>{peso(Number(action.row.amount))}</b> has arrived in your GCash. Reference: {action.row.transfer_reference}.</>}</p>{actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
    </Dialog>}
    <ReasonDialog open={action?.kind === 'reject' || action?.kind === 'report'} onClose={() => !busy && setAction(null)} onConfirm={note => run(note)} title={action?.kind === 'reject' ? 'Decline this request' : 'Report a missing payment'} label="Explain what happened" confirmLabel="Submit" min={10} max={1000} busy={busy} error={actionError} />
  </section>;
}
