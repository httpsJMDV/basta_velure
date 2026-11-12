import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Dialog, BUTTON } from '../ui/Overlay';
import { sentenceError } from '../../utils/accountRules';

/** Why someone reports a shop. The words go into the message Loved-IT Support reads. */
const SHOP_REPORT_REASONS = [
  { value: 'fake', label: 'Fake or counterfeit items', hint: 'Sells copies sold as originals.' },
  { value: 'not_as_described', label: 'Items not as described', hint: 'Photos or details do not match what arrives.' },
  { value: 'scam', label: 'Scam or payment outside Loved-IT', hint: 'Asked to pay another way, or took payment and did not ship.' },
  { value: 'banned', label: 'Selling banned items', hint: 'Medicine, supplements, weapons or anything not allowed.' },
  { value: 'abusive', label: 'Rude or abusive seller', hint: 'Insults, threats or harassment in chat.' },
  { value: 'other', label: 'Something else', hint: 'Tell us what happened below.' },
] as const;

type ShopReportReason = (typeof SHOP_REPORT_REASONS)[number]['value'];

/**
 * Reporting a shop: the person chooses why, describes what happened (10 to 500 characters) and confirms before
 * anything is sent. Only then does the report go to Loved-IT Support in chat, where a team member reads it.
 */
export default function ReportShopDialog({ open, shopName, onClose, onSend }: {
  open: boolean;
  shopName: string;
  onClose: () => void;
  /** Sends the report; resolves to true when it was sent. */
  onSend: (reasonLabel: string, details: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<ShopReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  // The page mounts this only while it is open, so every report starts with an empty form.

  const detailsError = sentenceError(details, 'What happened', { min: 10, max: 500 });
  const reasonError = reason ? undefined : 'Choose why you are reporting this shop.';
  const confirmError = confirmed ? undefined : 'Tick the box to confirm the report.';
  const ready = !detailsError && !reasonError && !confirmError;

  async function submit() {
    setTouched(true);
    if (!ready || sending) return;
    const label = SHOP_REPORT_REASONS.find((r) => r.value === reason)?.label ?? 'Other';
    setSending(true);
    try {
      if (await onSend(label, details.trim().replace(/\s+/g, ' '))) onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onClose={sending ? () => {} : onClose} size="max-w-lg"
      title={<span className="inline-flex items-center gap-2"><Flag className="w-4 h-4 text-brand-red" aria-hidden="true" /> Report {shopName}</span>}
      footer={<>
        <button type="button" className={BUTTON.ghost} onClick={onClose} disabled={sending}>Cancel</button>
        <button type="button" className={BUTTON.primary} onClick={() => void submit()} disabled={sending || (touched && !ready)}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
      </>}>
      <p className="text-[13px] text-stone-600">
        Tell us what is wrong. A Loved-IT team member reads every report, may ask you for more details in chat, and decides
        what happens to the shop. The shop is not told who reported it.
      </p>

      <fieldset className="mt-4">
        <legend className="text-[13px] font-semibold text-stone-900">Why are you reporting this shop?</legend>
        <div className="mt-2 grid gap-2" role="radiogroup">
          {SHOP_REPORT_REASONS.map((r) => {
            const on = reason === r.value;
            return (
              <label key={r.value}
                className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${on ? 'border-brand-red bg-rose-50/50' : 'border-stone-200 hover:border-stone-400'}`}>
                <input type="radio" name="report-reason" value={r.value} checked={on} onChange={() => setReason(r.value)}
                  className="mt-0.5 w-4 h-4 accent-brand-red shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-stone-900">{r.label}</span>
                  <span className="block text-[12px] text-stone-500">{r.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        {touched && reasonError && <p className="mt-1.5 text-xs text-red-600" role="alert">{reasonError}</p>}
      </fieldset>

      <div className="mt-4">
        <label htmlFor="report-details" className="text-[13px] font-semibold text-stone-900">What happened?</label>
        <textarea id="report-details" rows={4} maxLength={500} value={details}
          onChange={(e) => setDetails(e.target.value.replace(/^\s+/, ''))}
          placeholder="For example: the order arrived with a different phone model than the photos, and the seller stopped replying."
          className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent ${touched && detailsError ? 'border-red-500' : 'border-stone-300'}`} />
        <div className="flex justify-between text-[11.5px]">
          <span className="text-red-600" role="alert">{touched ? detailsError : ''}</span>
          <span className="text-stone-400 tabular-nums">{details.length}/500</span>
        </div>
      </div>

      <label className="mt-3 flex items-start gap-2.5 text-[12.5px] text-stone-700 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-red shrink-0" />
        <span>I confirm this report is true to the best of my knowledge. False reports may lead to my account being restricted.</span>
      </label>
      {touched && confirmError && <p className="mt-1 text-xs text-red-600" role="alert">{confirmError}</p>}
    </Dialog>
  );
}
