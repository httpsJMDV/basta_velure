import { useState } from 'react';
import { Wallet, Copy, Check, Receipt, ImagePlus } from 'lucide-react';
import type { RefundView } from '../../api/commerce';
import { refundReceiptUrlApi, sendRefundApi } from '../../api/commerce';
import { useToast } from '../ui/Toast';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { pesoCompact as peso } from '../../utils/pricing';

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RECEIPT_MAX = 8 * 1024 * 1024;

/**
 * The refund a shop owes the buyer of a GCash or cash-on-delivery order (docs/api/refunds.md): where to send it, then
 * the 13-digit GCash reference and a screenshot of the receipt. The buyer confirms it arrived, or reports it.
 */
export default function SellerRefundBlock({ orderId, refund, onChanged }: { orderId: number; refund: RefundView; onChanged: (r: RefundView) => void }) {
  const { showToast } = useToast();
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const digits = reference.replace(/\D/g, '');

  const send = async () => {
    const e: Record<string, string> = {};
    if (digits.length !== 13) e.reference = 'Enter the 13-digit reference number from the GCash receipt.';
    if (!receipt) e.receipt = 'Add a screenshot of the GCash receipt.';
    setErrors(e);
    if (Object.keys(e).length || !receipt) return;
    setBusy('send');
    try {
      const res = await sendRefundApi(orderId, digits, receipt);
      onChanged(res.data);
      showToast(res.message);
      setReference('');
      setReceipt(null);
    } catch (err) {
      const p = apiProblem(err, 'The refund was not recorded. Try again.');
      setErrors(Object.keys(p.fields).length ? p.fields : { form: p.message });
    } finally { setBusy(null); }
  };

  const pickReceipt = (f: File | undefined) => {
    if (!f) return;
    if (!RECEIPT_TYPES.includes(f.type)) { setErrors((x) => ({ ...x, receipt: 'The receipt must be a JPG, PNG or WebP picture.' })); return; }
    if (f.size > RECEIPT_MAX) { setErrors((x) => ({ ...x, receipt: 'The receipt picture must be 8 MB or smaller.' })); return; }
    setReceipt(f);
    setErrors((x) => ({ ...x, receipt: '' }));
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText((refund.gcash_number ?? '').replace(/\s/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the number is on screen anyway */ }
  };

  const openReceipt = async () => {
    setBusy('receipt');
    try {
      const url = await refundReceiptUrlApi(refund.id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The receipt could not be opened.'), 'error');
    } finally { setBusy(null); }
  };

  const tone = refund.status === 'received' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : refund.status === 'awaiting_shop' && refund.overdue ? 'bg-red-50 border-red-200 text-red-900'
      : 'bg-amber-50 border-amber-200 text-amber-900';

  return (
    <section aria-label="Refund to send" className={`p-3 border rounded-xl text-xs space-y-2 ${tone}`}>
      <p className="font-bold inline-flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Refund {peso(refund.amount)}</p>

      {refund.status === 'awaiting_account' && <p>The buyer paid you directly, so you send this refund to their GCash. We are waiting for them to say which account; you will be told.</p>}

      {refund.status === 'awaiting_shop' && (
        <>
          <p>
            Send it to <span className="font-bold">{refund.gcash_number}</span>
            <button type="button" onClick={copyNumber} aria-label="Copy the GCash number" className="ml-1 align-middle inline-flex p-1 rounded hover:bg-black/5">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            ({refund.gcash_name}){refund.send_by ? ` by ${when(refund.send_by)}` : ''}.
            {refund.overdue && <span className="block font-semibold mt-0.5">This is late. Loved-IT has been told.</span>}
            {refund.times_sent_before > 0 && <span className="block mt-0.5">Loved-IT asked you to send it again: {refund.resolution_note}</span>}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block font-semibold">
              GCash reference (13 digits)
              <input inputMode="numeric" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="1234 567 890123"
                aria-invalid={!!errors.reference} className={`mt-1 w-full h-9 px-3 rounded-lg border bg-white text-gray-900 font-mono outline-none ${errors.reference ? 'border-red-500' : 'border-gray-300 focus:border-gray-900'}`} />
              {errors.reference && <span role="alert" className="mt-0.5 block text-red-700">{errors.reference}</span>}
            </label>
            <div className="font-semibold">
              Receipt screenshot
              <label className="mt-1 flex items-center gap-2 h-9 px-3 rounded-lg border border-dashed border-gray-400 bg-white text-gray-700 cursor-pointer hover:border-gray-900">
                <ImagePlus className="w-4 h-4 shrink-0" /><span className="truncate font-normal">{receipt ? receipt.name : 'Choose a picture'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pickReceipt(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {errors.receipt && <span role="alert" className="mt-0.5 block text-red-700">{errors.receipt}</span>}
            </div>
          </div>
          {errors.form && <p role="alert" className="font-semibold text-red-700">{errors.form}</p>}
          <button type="button" onClick={send} disabled={busy !== null} className="w-full py-2 rounded-lg bg-gray-900 text-white font-bold disabled:opacity-60">
            {busy === 'send' ? 'Saving…' : 'I sent the refund'}
          </button>
        </>
      )}

      {refund.status === 'sent' && <p>You sent it on {when(refund.sent_at)} (reference <span className="font-mono">{refund.reference}</span>). The buyer confirms it arrived; without a report by {when(refund.confirm_by)}, it counts as received.</p>}
      {refund.status === 'not_received' && <p>The buyer says it did not arrive: “{refund.report_note}”. Loved-IT is checking your receipt and will tell you if it has to be sent again.</p>}
      {refund.status === 'received' && <p>Done{refund.auto_confirmed ? ' (no problem was reported in time)' : ''}, {when(refund.received_at)}.</p>}

      {refund.has_receipt && (
        <button type="button" onClick={openReceipt} disabled={busy === 'receipt'} className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2">
          <Receipt className="w-3.5 h-3.5" /> {busy === 'receipt' ? 'Opening…' : 'Your receipt'}
        </button>
      )}
    </section>
  );
}
