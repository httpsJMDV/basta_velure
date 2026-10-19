import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BellRing, Ban, CheckCircle2, ChevronLeft, ChevronRight, FileImage, History, Scale, Store, Truck } from 'lucide-react';
import { getAdminSettlementsApi, resolveAdminSettlementApi, remindAdminSettlementApi } from '../../api/client';
import type { AdminSettlementList, AdminSettlementRow, AdminSettlementView, GcashAccount } from '../../types';
import { StatusTabs, ListError, ListEmpty, Avatar, Pill, TH, TD, relativeTime, type PillTone } from '../../components/admin/listKit';
import { SidePanel, BUTTON } from '../../components/ui/Overlay';
import { formatReference, CopyButton } from '../../components/payments/GcashKit';
import { ReceiptViewer, shortDate } from '../../components/payments/SettlementWeeks';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../utils/apiError';
import { peso } from '../../utils/adminReports';

const VIEW_HINT: Record<AdminSettlementView, string> = {
  reported: 'The receiving side says the money did not arrive. Check the reference and the receipt, then decide.',
  overdue: 'Recorded, but the receiving side has neither confirmed nor reported it. Remind them, or decide yourself.',
  voided: 'Payments you voided. The payer has been asked to send the week again.',
  history: 'Everything an admin decided, and weeks that had to be paid more than once.',
};

function status(row: AdminSettlementRow): [string, PillTone] {
  if (row.state === 'disputed') return ['Reported', 'red'];
  if (row.state === 'pay_again') return ['Voided · pay again', 'amber'];
  if (row.state === 'settled') return [row.resolution?.outcome === 'received' ? 'Received · by admin' : 'Settled', 'emerald'];
  return [row.overdue ? 'Unconfirmed' : 'Waiting', row.overdue ? 'amber' : 'gray'];
}

/** Who sends this week's money, and who should receive it. */
function parties(row: AdminSettlementRow) {
  const courier = { kind: 'Courier', name: row.courier?.name ?? 'Courier', logo: row.courier?.logo_url ?? null, gcash: row.courier?.gcash ?? null, Icon: Truck };
  const shop = { kind: 'Shop', name: row.shop.name, logo: row.shop.logo_url, gcash: row.shop.gcash, Icon: Store };
  return row.paid_by === 'courier' ? { payer: courier, receiver: shop } : { payer: shop, receiver: courier };
}

/**
 * Admin → Payments → Settlements. Couriers and shops settle each week between themselves by GCash, so Loved-IT only
 * steps in when a payment goes wrong: reported as not received, left unconfirmed, or voided to be sent again.
 */
export default function AdminSettlementsPanel({ onCounts }: { onCounts?: (open: number) => void }) {
  const [view, setView] = useState<AdminSettlementView>('reported');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminSettlementList | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<AdminSettlementRow | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getAdminSettlementsApi(view, page)
      .then((r) => { setList(r); onCounts?.(r.counts.reported + r.counts.overdue); })
      .catch(() => setFailed(true));
  }, [view, page, onCounts]);
  useEffect(() => { load(); }, [load]);

  const changeView = (v: AdminSettlementView) => { setView(v); setPage(1); setList(null); };
  const days = list?.confirm_days ?? 3;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {([
            { key: 'reported', label: 'Reported', note: 'Money said not to have arrived', tone: 'text-red-700' },
            { key: 'overdue', label: 'Unconfirmed', note: `No answer after ${days} days`, tone: 'text-amber-700' },
            { key: 'voided', label: 'Voided', note: 'Waiting to be sent again', tone: 'text-gray-900' },
          ] as const).map((c) => (
            <button key={c.key} type="button" onClick={() => changeView(c.key)} aria-pressed={view === c.key}
              className={`px-4 py-3 text-left transition-colors ${view === c.key ? 'bg-gray-50' : 'hover:bg-gray-50/60'}`}>
              <p className="text-[11px] font-semibold text-gray-500">{c.label}</p>
              <p className={`mt-1 text-[22px] font-bold tracking-tight tabular-nums ${list && list.counts[c.key] > 0 ? c.tone : 'text-gray-300'}`}>
                {list ? list.counts[c.key] : '…'}
              </p>
              <p className="text-[11px] text-gray-400">{c.note}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200/80 rounded-2xl px-3 py-2.5 shadow-xs">
        <StatusTabs<AdminSettlementView> label="Settlements" value={view} onChange={changeView} options={[
          { value: 'reported', label: 'Reported', count: list ? list.counts.reported : null },
          { value: 'overdue', label: 'Unconfirmed', count: list ? list.counts.overdue : null },
          { value: 'voided', label: 'Voided', count: list ? list.counts.voided : null },
          { value: 'history', label: 'History' },
        ]} />
        <p className="text-[12px] text-gray-500 sm:max-w-md sm:text-right">{VIEW_HINT[view]}</p>
      </div>

      {failed ? <ListError message="The settlements could not be loaded." onRetry={load} /> : (
        <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={!list}>
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead><tr>
                <th scope="col" className={TH}>Payment</th>
                <th scope="col" className={`${TH} hidden lg:table-cell`}>Week</th>
                <th scope="col" className={`${TH} text-right`}>Amount</th>
                <th scope="col" className={`${TH} hidden md:table-cell`}>GCash reference</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={`${TH} text-right`}><span className="sr-only">Action</span></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {!list && Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">{[0, 1, 2, 3, 4, 5].map((c) => <td key={c} className={TD}><div className="w-3/4 h-3 bg-gray-100 rounded" /></td>)}</tr>
                ))}
                {list && list.data.length === 0 && (
                  <tr><td colSpan={6}>
                    <ListEmpty icon={Scale} title={view === 'history' ? 'No decisions yet' : 'Nothing needs you here'}
                      hint={view === 'reported' ? 'When a shop or courier says a payment did not arrive, it shows up here.' : VIEW_HINT[view]} />
                  </td></tr>
                )}
                {list?.data.map((row) => {
                  const { payer, receiver } = parties(row);
                  const [label, tone] = status(row);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/60 cursor-pointer" onClick={() => setOpen(row)}>
                      <td className={TD}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={payer.name} src={payer.logo} icon={payer.Icon} />
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden="true" />
                          <Avatar name={receiver.name} src={receiver.logo} icon={receiver.Icon} />
                          <div className="min-w-0 ml-1">
                            <p className="font-semibold text-gray-900 truncate max-w-[240px]">{payer.name} → {receiver.name}</p>
                            <p className="text-[11px] text-gray-500">{payer.kind} pays the {receiver.kind.toLowerCase()}{row.attempts.length ? ` · payment ${row.attempts.length + 1}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${TD} hidden lg:table-cell text-gray-600 whitespace-nowrap`}>{shortDate(row.week.start)} – {shortDate(row.week.end)}</td>
                      <td className={`${TD} text-right font-bold text-gray-900 tabular-nums whitespace-nowrap`}>{peso(row.amount)}</td>
                      <td className={`${TD} hidden md:table-cell`}>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-gray-700">
                          {formatReference(row.reference)}
                          {row.has_receipt && <FileImage className="w-3.5 h-3.5 text-[#0064CC]" aria-label="Receipt attached" />}
                        </span>
                      </td>
                      <td className={TD}>
                        <Pill tone={tone}>{label}</Pill>
                        {row.days_waiting !== null && row.state !== 'pay_again' && (
                          <p className="mt-1 text-[11px] text-gray-400">{row.state === 'disputed' ? 'Reported' : 'Sent'} {row.days_waiting === 0 ? 'today' : `${row.days_waiting} day${row.days_waiting === 1 ? '' : 's'} ago`}</p>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-red">{row.state === 'disputed' || row.state === 'sent' ? 'Review' : 'View'} <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list && list.meta.last_page > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 text-[12px] text-gray-500">
              <span className="tabular-nums">{list.meta.from}–{list.meta.to} of {list.meta.total}</span>
              <span className="inline-flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <span className="tabular-nums">{list.meta.current_page} / {list.meta.last_page}</span>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= list.meta.last_page} aria-label="Next page" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </span>
            </div>
          )}
        </div>
      )}

      {open && <SettlementReview row={open} onClose={() => setOpen(null)} onChanged={(row) => { setOpen(row); load(); }} />}
    </div>
  );
}

function Party({ caption, party }: { caption: string; party: { kind: string; name: string; logo: string | null; gcash: GcashAccount | null; Icon: React.ElementType } }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3.5 min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">{caption}</p>
      <div className="mt-2 flex items-center gap-2.5 min-w-0">
        <Avatar name={party.name} src={party.logo} icon={party.Icon} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-stone-900 truncate">{party.name}</p>
          <p className="text-[11.5px] text-stone-500">{party.kind}</p>
        </div>
      </div>
      <p className="mt-2.5 text-[11.5px] text-stone-500">GCash</p>
      {party.gcash
        ? <p className="text-[12.5px] text-stone-800"><span className="font-mono font-semibold">{party.gcash.number}</span>{party.gcash.name ? ` · ${party.gcash.name}` : ''}</p>
        : <p className="text-[12.5px] text-stone-400">Not set up</p>}
    </div>
  );
}

/** One payment in full, with what the admin can decide. */
function SettlementReview({ row, onClose, onChanged }: { row: AdminSettlementRow; onClose: () => void; onChanged: (row: AdminSettlementRow) => void }) {
  const { showToast } = useToast();
  const { payer, receiver } = parties(row);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'received' | 'pay_again' | 'remind' | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<number | 'current' | null>(null);
  const [label, tone] = status(row);
  const open = row.state === 'sent' || row.state === 'disputed';

  const decide = async (outcome: 'received' | 'pay_again') => {
    if (note.trim().length < 10) { setError('Write what you checked (at least 10 characters). Both sides will read it.'); return; }
    setBusy(outcome);
    setError('');
    try {
      const res = await resolveAdminSettlementApi(row.id, outcome, note.trim());
      showToast(res.message);
      setNote('');
      onChanged(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, 'That did not go through. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const remind = async () => {
    setBusy('remind');
    try { const res = await remindAdminSettlementApi(row.id); showToast(res.message); onChanged(res.data); }
    catch (e) { showToast(apiErrorMessage(e, 'The reminder was not sent.'), 'error'); }
    finally { setBusy(null); }
  };

  return (
    <SidePanel open onClose={onClose} width="max-w-2xl"
      title={<span className="inline-flex flex-wrap items-center gap-2">{peso(row.amount)} <Pill tone={tone}>{label}</Pill></span>}
      subtitle={`Week of ${shortDate(row.week.start)} – ${shortDate(row.week.end)} · ${row.orders_count} parcel${row.orders_count === 1 ? '' : 's'}`}
      footer={open ? (
        <div className="w-full space-y-2">
          <label htmlFor={`decision-${row.id}`} className="block text-[12px] font-medium text-stone-600">Your note to both sides</label>
          <textarea id={`decision-${row.id}`} rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setError(''); }}
            placeholder="e.g. The receipt shows the transfer to the shop's GCash number on Oct 13."
            className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none resize-none ${error ? 'border-brand-red ring-2 ring-brand-red/10' : 'border-stone-300 focus:border-brand-red focus:ring-2 focus:ring-brand-red/10'}`} />
          {error && <p role="alert" className="text-[12px] font-medium text-brand-red">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {row.state === 'sent' && (
              <button type="button" className={`${BUTTON.quiet} mr-auto`} onClick={() => void remind()} disabled={busy !== null || !row.can_remind}
                title={row.can_remind ? undefined : 'A reminder was already sent today'}>
                <BellRing className="w-4 h-4" aria-hidden="true" /> {row.can_remind ? `Remind ${receiver.name}` : 'Reminded today'}
              </button>
            )}
            <button type="button" className={BUTTON.danger} onClick={() => void decide('pay_again')} disabled={busy !== null}>
              <Ban className="w-4 h-4" aria-hidden="true" /> {busy === 'pay_again' ? 'Voiding…' : 'Void · ask to pay again'}
            </button>
            <button type="button" className={`${BUTTON.dark}`} onClick={() => void decide('received')} disabled={busy !== null}>
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {busy === 'received' ? 'Saving…' : 'Mark as received'}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] items-stretch">
          <Party caption="Sends" party={payer} />
          <span className="hidden sm:flex items-center justify-center text-stone-300"><ArrowRight className="w-4 h-4" aria-hidden="true" /></span>
          <Party caption="Should receive it at" party={receiver} />
        </div>

        <section className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11.5px] text-stone-500">GCash reference</p>
              <p className="font-mono text-[17px] font-bold tracking-wide text-stone-900">{formatReference(row.reference)}</p>
              <p className="text-[12px] text-stone-500">Recorded {row.paid_at ? `${shortDate(row.paid_at)} · ${relativeTime(row.paid_at)}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CopyButton text={row.reference} label="Copy ref" />
              {row.has_receipt
                ? <button type="button" onClick={() => setReceipt('current')} className={BUTTON.ghost}><FileImage className="w-4 h-4" aria-hidden="true" /> View receipt</button>
                : <span className="inline-flex items-center h-8 px-3 rounded-full bg-white border border-stone-200 text-[12px] text-stone-500">No receipt attached</span>}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-200 text-[12px]">
            <div><dt className="text-stone-500">Cash collected</dt><dd className="font-semibold text-stone-900 tabular-nums">{peso(row.cod_collected)}</dd></div>
            <div><dt className="text-stone-500">Delivery fees</dt><dd className="font-semibold text-stone-900 tabular-nums">{peso(row.courier_fees)}</dd></div>
            <div><dt className="text-stone-500">Net sent</dt><dd className="font-bold text-stone-900 tabular-nums">{peso(row.amount)}</dd></div>
          </dl>
        </section>

        {row.dispute && (
          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">{receiver.name} reported it · {shortDate(row.dispute.at)}</p>
            <p className="mt-1 text-[13.5px] text-red-950">“{row.dispute.reason}”</p>
          </section>
        )}

        {row.resolution && (
          <section className={`rounded-2xl border p-4 ${row.resolution.outcome === 'received' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
            <p className={`text-[11px] font-bold uppercase tracking-wider ${row.resolution.outcome === 'received' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {row.resolution.outcome === 'received' ? 'Marked as received' : 'Voided · asked to pay again'} · {shortDate(row.resolution.at)}
            </p>
            <p className="mt-1 text-[13px] text-stone-800">“{row.resolution.note}”</p>
          </section>
        )}

        {row.state === 'sent' && (
          <p className="text-[12.5px] leading-relaxed text-stone-600">
            {receiver.name} has not confirmed or reported this payment{row.days_waiting ? ` for ${row.days_waiting} day${row.days_waiting === 1 ? '' : 's'}` : ''}.
            {row.reminded_at ? ` Last reminded ${relativeTime(row.reminded_at)}.` : ''}
          </p>
        )}

        {open && (
          <p className="rounded-xl bg-white border border-stone-200 px-3.5 py-2.5 text-[12px] leading-relaxed text-stone-600">
            Check that the receipt shows <b>{peso(row.amount)}</b> sent to <b>{receiver.gcash?.number ?? `${receiver.name}'s GCash`}</b> with this reference.
            Mark it received if it does; void it if it does not, and {payer.name} will be asked to send it again.
          </p>
        )}

        {row.attempts.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-400"><History className="w-3.5 h-3.5" aria-hidden="true" /> Earlier payments of this week</p>
            <ol className="space-y-2">
              {row.attempts.map((a) => (
                <li key={a.number} className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-[12.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-stone-900">Payment {a.number} · <span className="font-mono">{a.reference ? formatReference(a.reference) : '—'}</span></p>
                    <span className="inline-flex items-center gap-2">
                      {a.voided_at && <Pill tone="gray">Voided {shortDate(a.voided_at)}</Pill>}
                      {a.has_receipt && <button type="button" onClick={() => setReceipt(a.number)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0064CC] hover:underline underline-offset-2"><FileImage className="w-3.5 h-3.5" aria-hidden="true" /> Receipt</button>}
                    </span>
                  </div>
                  {a.dispute_reason && <p className="mt-1 text-stone-600">Reported: “{a.dispute_reason}”</p>}
                  {a.resolution_note && <p className="mt-0.5 text-stone-600">Admin: “{a.resolution_note}”</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {receipt !== null && <ReceiptViewer settlementId={row.id} attempt={receipt === 'current' ? undefined : receipt} onClose={() => setReceipt(null)} />}
    </SidePanel>
  );
}
