// The weekly courier ↔ shop statement, drawn the same way from both sides. Each line is one courier and one shop in
// one week: the cash on delivery the courier collected for the shop, minus the delivery fees the courier earned.
// Whoever ends up owing sends the difference by GCash and records the reference (and can attach the receipt); the
// other side confirms it or reports that it did not arrive, and then Loved-IT reviews it.
import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock, FileImage, ImagePlus, Loader2, ShieldCheck, Store, Truck } from 'lucide-react';
import type { SettlementLine, SettlementRecord, SettlementWeeks as Weeks } from '../../types';
import { peso, formatReference, prepareReceipt } from './GcashKit';
import { Dialog, BUTTON } from '../ui/Overlay';
import { getSettlementReceiptBlobUrl } from '../../api/client';

export type SettlementSide = 'seller' | 'courier';

/** Today in Manila as YYYY-MM-DD, the calendar the statements are cut on. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function shortDate(d: string): string {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Does this side send the money for this line? */
export function iPay(line: SettlementLine, side: SettlementSide): boolean {
  return side === 'seller' ? line.direction === 'seller_pays' : line.direction === 'courier_pays';
}

export function SettlementWeeks({ data, side, onPay, onConfirm, onDispute, onReceipt, empty }: {
  data: Weeks;
  side: SettlementSide;
  onPay: (line: SettlementLine, weekStart: string) => void;
  onConfirm: (settlement: SettlementRecord) => Promise<void>;
  /** Reports a payment as not received; rejects with a message to show. */
  onDispute: (settlement: SettlementRecord, reason: string) => Promise<void>;
  /** Attaches the GCash receipt of a payment this side sent. */
  onReceipt: (settlement: SettlementRecord, receipt: File) => Promise<void>;
  empty: string;
}) {
  const today = manilaToday();

  if (data.weeks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <span className="mx-auto w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><Clock className="w-5 h-5" /></span>
        <p className="mt-3 text-[14px] font-semibold text-gray-900">No statements yet</p>
        <p className="mt-1 text-[13px] text-gray-500 max-w-sm mx-auto">{empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.weeks.map((week) => {
        const current = week.end >= today;
        const parcels = week.lines.reduce((s, l) => s + l.orders_count, 0);
        return (
          <section key={week.start} className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/70">
              <p className="text-[13px] font-semibold text-gray-900">
                {shortDate(week.start)} – {shortDate(week.end)}
                <span className="ml-2 font-normal text-gray-500">{parcels} parcel{parcels === 1 ? '' : 's'} delivered</span>
              </p>
              {current && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> This week · settles after Sunday
                </span>
              )}
            </header>
            <ul className="divide-y divide-gray-100">
              {week.lines.map((line) => (
                <StatementLine key={`${line.company?.id ?? 0}-${line.seller?.id ?? 0}`} line={line} side={side} current={current}
                  onPay={() => onPay(line, week.start)} onConfirm={onConfirm} onDispute={onDispute} onReceipt={onReceipt} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatementLine({ line, side, current, onPay, onConfirm, onDispute, onReceipt }: {
  line: SettlementLine; side: SettlementSide; current: boolean; onPay: () => void;
  onConfirm: (s: SettlementRecord) => Promise<void>;
  onDispute: (s: SettlementRecord, reason: string) => Promise<void>;
  onReceipt: (s: SettlementRecord, receipt: File) => Promise<void>;
}) {
  const other = side === 'seller'
    ? { name: line.company?.name ?? 'Courier', logo: line.company?.logo_url ?? null, Icon: Truck }
    : { name: line.seller?.shop_name ?? 'Shop', logo: line.seller?.logo_url ?? null, Icon: Store };
  const paying = iPay(line, side);
  const even = line.direction === 'none';
  const [reporting, setReporting] = useState(false);

  return (
    <li className="px-4 sm:px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center text-gray-400 shrink-0">
            {other.logo ? <img src={other.logo} alt="" className="w-full h-full object-cover" /> : <other.Icon className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 truncate">{other.name}</p>
            <p className="text-[12px] text-gray-500 tabular-nums">
              {line.orders_count} parcel{line.orders_count === 1 ? '' : 's'} · {peso(line.cod_collected)} cash collected − {peso(line.courier_fees)} delivery
            </p>
          </div>
        </div>

        <div className="md:w-36 md:text-right flex md:block items-baseline justify-between">
          <p className="md:order-none order-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
            {even ? 'Even' : paying ? 'You send' : 'You receive'}
          </p>
          <p className={`text-[17px] font-bold tabular-nums ${even ? 'text-gray-400' : paying ? 'text-gray-900' : 'text-emerald-700'}`}>{peso(line.net)}</p>
        </div>

        <div className="md:w-[270px] md:flex md:justify-end">
          <LineStatus line={line} paying={paying} even={even} current={current} otherName={other.name}
            onPay={onPay} onConfirm={onConfirm} onReport={() => setReporting(true)} onReceipt={onReceipt} />
        </div>
      </div>

      {line.settlement && <LineNotice s={line.settlement} paying={paying} otherName={other.name} />}

      {reporting && line.settlement && (
        <ReportDialog s={line.settlement} otherName={other.name} onClose={() => setReporting(false)}
          onSubmit={async (reason) => { await onDispute(line.settlement!, reason); setReporting(false); }} />
      )}
    </li>
  );
}

/** What changed hands, and the action this side can take now. */
function LineStatus({ line, paying, even, current, otherName, onPay, onConfirm, onReport, onReceipt }: {
  line: SettlementLine; paying: boolean; even: boolean; current: boolean; otherName: string;
  onPay: () => void; onConfirm: (s: SettlementRecord) => Promise<void>; onReport: () => void;
  onReceipt: (s: SettlementRecord, receipt: File) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = line.settlement;
  const note = 'text-[12px] text-gray-500';
  const sendButton = (label: string) => (
    <button type="button" onClick={onPay} className="h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold w-full md:w-auto">
      {label}
    </button>
  );

  if (even) return <p className={note}>Fees match the cash. Nothing to send.</p>;

  if (!s) {
    if (current) return <p className={note}>{paying ? 'You can pay once the week ends.' : 'Due once the week ends.'}</p>;
    if (paying) return sendButton(`Send ${peso(line.net)}`);
    return <p className={`${note} flex items-center gap-1.5`}><Clock className="w-3.5 h-3.5 text-amber-500" /> Waiting for {otherName} to send it</p>;
  }

  const ref = <span className="font-mono">{formatReference(s.reference)}</span>;

  if (s.state === 'pay_again') {
    return paying ? sendButton(`Send ${peso(line.net)} again`) : (
      <p className={`${note} flex items-center gap-1.5 md:justify-end`}><Clock className="w-3.5 h-3.5 text-amber-500" /> Waiting for {otherName} to send it again</p>
    );
  }

  if (s.state === 'settled') {
    return (
      <div className="text-[12px] text-gray-600 md:text-right">
        <span className="flex md:justify-end items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Settled</span>
        <span className="flex md:justify-end items-center gap-2">Ref {ref}{s.has_receipt && <ReceiptLink id={s.id} />}</span>
      </div>
    );
  }

  if (paying) {
    return (
      <div className="text-[12px] text-gray-600 md:text-right space-y-1">
        <span className="block font-semibold text-gray-900">Sent {s.paid_at ? shortDate(s.paid_at) : ''} · Ref {ref}</span>
        <span className="block">{s.state === 'disputed' ? 'Reported as not received' : `Waiting for ${otherName} to confirm`}</span>
        <span className="flex md:justify-end">{s.has_receipt ? <ReceiptLink id={s.id} /> : <AttachReceipt onPick={(file) => onReceipt(s, file)} />}</span>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="w-full md:w-auto rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
        <p className="text-[12px] text-emerald-900">Is {peso(s.amount)} in your GCash with ref {ref}?</p>
        <div className="mt-2 flex gap-1.5">
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(s); } finally { setBusy(false); setAsking(false); } }}
            className="h-8 px-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Yes, received
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(false)} className="h-8 px-3 rounded-full text-[12px] font-semibold text-gray-600 hover:bg-white">Not yet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
      <p className="flex items-center gap-2 text-[12px] text-gray-600 md:text-right">
        <span>{otherName} sent it · Ref {ref}</span>{s.has_receipt && <ReceiptLink id={s.id} />}
      </p>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setAsking(true)} className="h-8 px-3.5 rounded-full border border-emerald-300 bg-white text-emerald-800 text-[12px] font-semibold hover:bg-emerald-50 shrink-0">
          {s.state === 'disputed' ? 'It arrived · confirm' : 'Confirm received'}
        </button>
        {s.state === 'sent' && (
          <button type="button" onClick={onReport} className="h-8 px-3.5 rounded-full border border-gray-200 bg-white text-gray-700 text-[12px] font-semibold hover:border-brand-red hover:text-brand-red shrink-0">
            Not received
          </button>
        )}
      </div>
    </div>
  );
}

/** A full-width note under the line when the payment was reported, voided or settled by Loved-IT. */
function LineNotice({ s, paying, otherName }: { s: SettlementRecord; paying: boolean; otherName: string }) {
  const ref = formatReference(s.reference);

  if (s.state === 'disputed' && s.dispute) {
    return (
      <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-[12.5px] text-amber-950">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{paying ? `${otherName} says ref ${ref} did not arrive` : `You reported ref ${ref} as not received`} · {shortDate(s.dispute.at)}</p>
          <p className="text-amber-900">“{s.dispute.reason}”</p>
          <p className="text-amber-800/90">
            Loved-IT is reviewing it.{' '}
            {paying
              ? (s.has_receipt ? 'Your receipt is attached; it will be checked.' : 'Attach your GCash receipt so it can be checked.')
              : 'If the money shows up in your GCash, confirm it.'}
          </p>
        </div>
      </div>
    );
  }

  if (s.state === 'pay_again' && s.resolution) {
    return (
      <div className="mt-3 flex gap-3 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-3 text-[12.5px] text-red-950">
        <Ban className="w-4 h-4 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Loved-IT voided the payment with ref {ref} · {shortDate(s.resolution.at)}</p>
          <p className="text-red-900">“{s.resolution.note}”</p>
          <p className="text-red-800/90">{paying ? 'Send the money again and record the new reference.' : `${otherName} has been asked to send it again.`}</p>
        </div>
      </div>
    );
  }

  if (s.state === 'settled' && s.resolution?.outcome === 'received') {
    return (
      <p className="mt-3 flex gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[12px] text-gray-700">
        <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span>Loved-IT checked this payment and marked it received: “{s.resolution.note}”</span>
      </p>
    );
  }

  return null;
}

/** "Receipt": opens the attached GCash receipt. */
function ReceiptLink({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0064CC] hover:underline underline-offset-2">
        <FileImage className="w-3.5 h-3.5" aria-hidden="true" /> Receipt
      </button>
      {open && <ReceiptViewer settlementId={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Picks a receipt picture and attaches it to a payment this side already sent. */
function AttachReceipt({ onPick }: { onPick: (file: File) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span className="inline-flex flex-col md:items-end">
      <label className={`inline-flex items-center gap-1 text-[12px] font-semibold text-[#0064CC] ${busy ? 'opacity-60' : 'cursor-pointer hover:underline underline-offset-2'}`}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />}
        {busy ? 'Attaching…' : 'Attach receipt'}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
          onChange={async (e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (!picked) return;
            setError('');
            setBusy(true);
            try { await onPick(await prepareReceipt(picked)); } catch (err) { setError((err as Error).message || 'The receipt was not attached.'); } finally { setBusy(false); }
          }} />
      </label>
      {error && <span role="alert" className="text-[11.5px] text-brand-red">{error}</span>}
    </span>
  );
}

/** The receipt picture, fetched through the authorized endpoint. `attempt` opens an earlier, voided payment's (admins). */
export function ReceiptViewer({ settlementId, attempt, onClose }: { settlementId: number; attempt?: number; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    getSettlementReceiptBlobUrl(settlementId, attempt)
      .then((u) => { objectUrl = u; if (live) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [settlementId, attempt]);

  return (
    <Dialog open onClose={onClose} title={attempt ? `GCash receipt · payment ${attempt}` : 'GCash receipt'} size="max-w-lg">
      {failed ? <p className="py-10 text-center text-[13px] text-stone-500">The receipt could not be opened.</p>
        : !url ? <div className="h-72 rounded-2xl bg-stone-100 animate-pulse" />
          : <img src={url} alt="GCash receipt" className="w-full max-h-[70vh] object-contain rounded-2xl border border-stone-200 bg-stone-50" />}
    </Dialog>
  );
}

/** "Not received": the receiving side tells the payer and Loved-IT what is wrong. */
function ReportDialog({ s, otherName, onClose, onSubmit }: {
  s: SettlementRecord; otherName: string; onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const short = reason.trim().length < 10;

  const submit = async () => {
    if (short) { setError('Say a little more (at least 10 characters).'); return; }
    setBusy(true);
    setError('');
    try { await onSubmit(reason.trim()); } catch (e) { setError((e as Error).message || 'The report did not go through. Try again.'); setBusy(false); }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} title="Report a payment not received"
      footer={(
        <>
          <button type="button" className={BUTTON.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BUTTON.primary} onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Report to Loved-IT
          </button>
        </>
      )}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-[13px] text-stone-700">
          <p><span className="font-semibold text-stone-900">{otherName}</span> recorded <span className="font-semibold text-stone-900 tabular-nums">{peso(s.amount)}</span>{s.paid_at ? ` on ${shortDate(s.paid_at)}` : ''}.</p>
          <p className="mt-0.5">GCash ref <span className="font-mono font-semibold text-stone-900">{formatReference(s.reference)}</span>{s.has_receipt ? ' · receipt attached' : ''}</p>
        </div>
        <p className="text-[12.5px] leading-relaxed text-stone-600">
          Look for this reference in your GCash history first. If it is not there, tell us what you see. {otherName} and Loved-IT will read it.
        </p>
        <div>
          <label htmlFor={`report-${s.id}`} className="block mb-1.5 text-[12px] font-medium text-stone-600">What is wrong?</label>
          <textarea id={`report-${s.id}`} rows={3} maxLength={500} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }}
            placeholder="e.g. Nothing with this reference is in our GCash, and the amount never arrived."
            aria-invalid={Boolean(error)}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] outline-none resize-none ${error ? 'border-brand-red ring-2 ring-brand-red/10' : 'border-stone-300 focus:border-brand-red focus:ring-2 focus:ring-brand-red/10'}`} />
          <div className="mt-1 flex justify-between gap-3 text-[11.5px]">
            {error ? <span role="alert" className="font-medium text-brand-red">{error}</span> : <span className="text-stone-400">At least 10 characters.</span>}
            <span className="text-stone-400 tabular-nums">{reason.length}/500</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
