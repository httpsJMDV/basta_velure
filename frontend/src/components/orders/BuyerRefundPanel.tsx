import { useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle, Receipt } from 'lucide-react';
import type { Order } from '../../types';
import type { RefundView } from '../../api/commerce';
import { confirmRefundApi, refundReceiptUrlApi, reportRefundApi, setRefundAccountApi } from '../../api/commerce';
import { BUTTON, ReasonDialog } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { pesoCompact as peso } from '../../utils/pricing';

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/**
 * A refund the shop sends by hand (docs/api/refunds.md): the buyer paid the shop directly (GCash, or cash to the
 * rider), so they say which GCash gets the money, then confirm it arrived or report that it did not.
 */
export default function BuyerRefundPanel({ order, refund, onUpdated }: { order: Order; refund: RefundView; onUpdated: (o: Order) => void }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(refund.status === 'awaiting_account');
  const [busy, setBusy] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportError, setReportError] = useState<string | undefined>();

  const confirm = async () => {
    setBusy('confirm');
    try {
      const res = await confirmRefundApi<Order>(order.id);
      onUpdated(res.data);
      showToast(res.message, 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Could not save that. Try again.'), 'error');
    } finally { setBusy(null); }
  };

  const report = async (note: string) => {
    setBusy('report');
    setReportError(undefined);
    try {
      const res = await reportRefundApi<Order>(order.id, note);
      onUpdated(res.data);
      setReportOpen(false);
      showToast(res.message, 'success');
    } catch (e) {
      const p = apiProblem(e, 'The report was not sent. Try again.');
      setReportError(p.fields.note ?? p.message);
    } finally { setBusy(null); }
  };

  const openReceipt = async () => {
    setBusy('receipt');
    try {
      const url = await refundReceiptUrlApi(refund.id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      showToast(apiErrorMessage(e, 'The receipt could not be opened.'), 'error');
    } finally { setBusy(null); }
  };

  const done = refund.status === 'received';
  const tone = done ? 'bg-emerald-50 text-emerald-900' : refund.status === 'not_received' ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900';

  return (
    <section aria-label="Refund" className={`rounded-xl px-3 py-2.5 text-[12.5px] ${tone}`}>
      <p className="font-semibold inline-flex items-center gap-1.5">
        {done ? <CheckCircle2 className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
        Refund {peso(refund.amount)} · {LABEL[refund.status]}
      </p>

      {refund.status === 'awaiting_account' && !editing && (
        <p className="mt-1">You paid the shop directly, so the shop sends your refund to a GCash account.</p>
      )}
      {refund.status === 'awaiting_shop' && (
        <p className="mt-1">
          The shop sends it to <span className="font-semibold">{refund.gcash_number}</span> ({refund.gcash_name})
          {refund.send_by ? ` by ${when(refund.send_by)}` : ''}.{refund.overdue ? ' It is late, and Loved-IT has been told.' : ''}
        </p>
      )}
      {refund.status === 'sent' && (
        <p className="mt-1">
          The shop sent it to {refund.gcash_number} on {when(refund.sent_at)}, reference <span className="font-mono">{refund.reference}</span>.
          Check your GCash. If you do not report a problem by {when(refund.confirm_by)}, it counts as received.
        </p>
      )}
      {refund.status === 'not_received' && <p className="mt-1">You said it did not arrive. Loved-IT is checking the shop's receipt and will tell you what happens next.</p>}
      {done && <p className="mt-1">{refund.auto_confirmed ? 'Counted as received: no problem was reported in time.' : `Received ${when(refund.received_at)}.`}</p>}
      {refund.resolution_note && !done && <p className="mt-1"><span className="font-semibold">From Loved-IT:</span> {refund.resolution_note}</p>}

      {editing && refund.can_set_account ? (
        <AccountForm order={order} refund={refund} onSaved={(o) => { onUpdated(o); setEditing(false); }} onCancel={refund.gcash_number ? () => setEditing(false) : undefined} />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {refund.status === 'awaiting_account' && (
            <button type="button" className={`${BUTTON.dark} !min-h-8 !text-[12px]`} onClick={() => setEditing(true)}>Add GCash account</button>
          )}
          {refund.status === 'awaiting_shop' && refund.can_set_account && (
            <button type="button" className={`${BUTTON.ghost} !min-h-8 !text-[12px]`} onClick={() => setEditing(true)}>Change account</button>
          )}
          {refund.can_confirm && (
            <button type="button" className={`${BUTTON.dark} !min-h-8 !text-[12px]`} onClick={confirm} disabled={busy !== null}>
              {busy === 'confirm' ? 'Saving…' : 'I received it'}
            </button>
          )}
          {refund.can_report && (
            <button type="button" className={`${BUTTON.ghost} !min-h-8 !text-[12px] inline-flex items-center gap-1.5`} onClick={() => setReportOpen(true)} disabled={busy !== null}>
              <AlertTriangle className="w-3.5 h-3.5" /> It did not arrive
            </button>
          )}
          {refund.has_receipt && (
            <button type="button" className={`${BUTTON.quiet} !min-h-8 !text-[12px] inline-flex items-center gap-1.5`} onClick={openReceipt} disabled={busy === 'receipt'}>
              <Receipt className="w-3.5 h-3.5" /> {busy === 'receipt' ? 'Opening…' : 'Shop’s receipt'}
            </button>
          )}
        </div>
      )}

      <ReasonDialog open={reportOpen} onClose={() => !busy && setReportOpen(false)} onConfirm={report} busy={busy === 'report'} error={reportError}
        title="The refund did not arrive" label="What happened?" confirmLabel="Send to Loved-IT" tone="dark" max={500}
        intro={<>Loved-IT compares the shop's receipt (reference <span className="font-mono">{refund.reference}</span>) with your GCash. Say what you see in your GCash history.</>}
        quickPicks={['Nothing from the shop is in my GCash history.', 'A smaller amount arrived than the refund.']} />
    </section>
  );
}

const LABEL: Record<RefundView['status'], string> = {
  awaiting_account: 'add your GCash',
  awaiting_shop: 'the shop is sending it',
  sent: 'sent, please check',
  not_received: 'Loved-IT is checking',
  received: 'done',
};

function AccountForm({ order, refund, onSaved, onCancel }: { order: Order; refund: RefundView; onSaved: (o: Order) => void; onCancel?: () => void }) {
  const { showToast } = useToast();
  const [number, setNumber] = useState(refund.gcash_number ?? '');
  const [name, setName] = useState(refund.gcash_name ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^(\+?63|0)?\s*9[\d\s-]{9,12}$/.test(number.trim())) e.gcash_number = 'Enter the 11-digit GCash number, like 0917 123 4567.';
    if (name.trim().length < 2) e.gcash_name = 'Enter the name on the GCash account.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await setRefundAccountApi<Order>(order.id, number.trim(), name.trim());
      onSaved(res.data);
      showToast(res.message, 'success');
    } catch (err) {
      const p = apiProblem(err, 'The account was not saved. Try again.');
      setErrors(Object.keys(p.fields).length ? p.fields : { form: p.message });
    } finally { setBusy(false); }
  };

  const field = 'mt-1 w-full h-10 px-3 rounded-xl border bg-white text-[13px] text-stone-900 outline-none focus:ring-2 focus:ring-brand-red/10';
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="block text-[12px] font-semibold">
        GCash number
        <input inputMode="tel" autoComplete="tel" value={number} onChange={(ev) => setNumber(ev.target.value)} placeholder="0917 123 4567"
          aria-invalid={!!errors.gcash_number} className={`${field} ${errors.gcash_number ? 'border-brand-red' : 'border-stone-300 focus:border-brand-red'}`} />
        {errors.gcash_number && <span role="alert" className="mt-0.5 block font-medium text-brand-red">{errors.gcash_number}</span>}
      </label>
      <label className="block text-[12px] font-semibold">
        Name on the account
        <input autoComplete="name" value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Juan Dela Cruz"
          aria-invalid={!!errors.gcash_name} className={`${field} ${errors.gcash_name ? 'border-brand-red' : 'border-stone-300 focus:border-brand-red'}`} />
        {errors.gcash_name && <span role="alert" className="mt-0.5 block font-medium text-brand-red">{errors.gcash_name}</span>}
      </label>
      {errors.form && <p role="alert" className="sm:col-span-2 font-medium text-brand-red">{errors.form}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button type="button" className={`${BUTTON.dark} !min-h-9 !text-[12.5px]`} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button>
        {onCancel && <button type="button" className={`${BUTTON.quiet} !min-h-9 !text-[12.5px]`} onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </div>
  );
}
