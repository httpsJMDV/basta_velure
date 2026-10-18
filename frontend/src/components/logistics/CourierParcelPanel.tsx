import { useCallback, useEffect, useState } from 'react';
import { Lock, Camera } from 'lucide-react';
import { SidePanel, Dialog, BUTTON } from '../ui/Overlay';
import { Pill, relativeTime, type PillTone } from '../admin/listKit';
import CustomSelect from '../ui/CustomSelect';
import { useToast } from '../ui/Toast';
import {
  getCourierParcelApi, overrideParcelApi, markParcelExceptionApi, rescheduleParcelApi, getDispatchRidersApi,
  type CourierParcelDetail, type DispatchRider,
} from '../../api/courierOps';
import { apiErrorMessage } from '../../utils/apiError';

const TONE: Record<string, PillTone> = {
  READY_FOR_PICKUP: 'blue', PICKED_UP: 'blue', AT_SORTING_CENTER: 'violet', SORTED: 'violet', ASSIGNED_TO_RIDER: 'amber',
  OUT_FOR_DELIVERY: 'amber', DELIVERED: 'emerald', DELIVERY_FAILED: 'red', RETURN_TO_SENDER: 'red', RETURNED: 'gray', LOST: 'red', DAMAGED: 'red',
};
const ACTION_LABEL: Record<string, string> = {
  'parcel.override': 'Status overridden', 'parcel.lost': 'Marked lost', 'parcel.damaged': 'Marked damaged',
  'dispatch.assigned': 'Pickup assigned', 'dispatch.reassigned': 'Pickup reassigned', 'rts.assigned': 'Return rider assigned',
};
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

type Action = 'override' | 'reschedule' | 'lost' | 'damaged' | null;

/**
 * One parcel for the courier company (L6, L7): who has it, every failed attempt, the timeline and the audit trail, with
 * the fixes: override to the next step with a reason, reschedule a failed delivery, or mark it Lost or Damaged.
 */
export default function CourierParcelPanel({ parcelId, onClose, onChanged }: { parcelId: number; onClose: () => void; onChanged: () => void }) {
  const { showToast } = useToast();
  const [p, setP] = useState<CourierParcelDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [action, setAction] = useState<Action>(null);

  const load = useCallback(() => {
    setFailed(false);
    getCourierParcelApi(parcelId).then(setP).catch(() => setFailed(true));
  }, [parcelId]);
  useEffect(() => { load(); }, [load]);

  const done = (message: string) => { setAction(null); showToast(message); load(); onChanged(); };
  const canReschedule = p?.status === 'DELIVERY_FAILED' && p.attempts < p.max_attempts;

  return (
    <SidePanel open onClose={onClose} width="max-w-2xl"
      title={p ? <span className="font-mono">{p.tracking_number}</span> : 'Parcel'}
      subtitle={p ? <span className="flex flex-wrap items-center gap-2"><Pill tone={TONE[p.status] ?? 'gray'}>{p.status_label}</Pill>{p.order && <span>Order {p.order.order_number}</span>}</span> : undefined}
      footer={p && (p.override_targets.length > 0 || p.can_mark_exception || canReschedule) ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canReschedule && <button type="button" className={BUTTON.dark} onClick={() => setAction('reschedule')}>Reschedule</button>}
          {p.override_targets.length > 0 && <button type="button" className={BUTTON.ghost} onClick={() => setAction('override')}>Override status</button>}
          {p.can_mark_exception && (
            <>
              <button type="button" className={BUTTON.ghost} onClick={() => setAction('damaged')}>Mark damaged</button>
              <button type="button" className={BUTTON.danger} onClick={() => setAction('lost')}>Mark lost</button>
            </>
          )}
        </div>
      ) : undefined}>
      {failed ? <p className="text-[13px] text-red-700">This parcel could not be loaded.</p> : !p ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-stone-100 animate-pulse" />)}</div>
      ) : (
        <div className="space-y-5 text-[13px]">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="From" value={p.shop.shop_name ?? '—'} sub={p.shop.full_address} />
            <Fact label="To" value={p.recipient.name ?? '—'} sub={p.recipient.full_address ?? [p.recipient.barangay, p.recipient.city].filter(Boolean).join(', ')} />
            <Fact label="Payment" value={p.order ? (p.order.payment_method === 'cod' ? `COD ${peso(p.cod_amount ?? p.order.total)}` : `Prepaid ${peso(p.order.total)}`) : '—'}
              sub={p.order?.refund_status ? `Refund ${p.order.refund_status}` : p.order?.buyer ?? undefined} />
            <Fact label="Zone · weight" value={`${p.zone ?? 'No zone'} · ${p.weight_kg !== null ? `${p.weight_kg} kg` : '—'}`} sub={p.hub ?? 'Not at a hub yet'} />
            <Fact label="Riders" value={[p.riders.pickup && `Pickup: ${p.riders.pickup}`, p.riders.delivery && `Delivery: ${p.riders.delivery}`, p.riders.return && `Return: ${p.riders.return}`].filter(Boolean).join(' · ') || 'None yet'} />
            <Fact label="Delivery attempts" value={`${p.attempts} of ${p.max_attempts}`} sub={p.status === 'RETURN_TO_SENDER' ? 'Going back to the seller' : undefined} />
          </dl>

          {p.failures.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">Failed attempts</h3>
              <ol className="space-y-1">
                {p.failures.map((f) => (
                  <li key={f.attempt} className="flex items-start justify-between gap-2 rounded-lg bg-red-50/60 px-3 py-1.5">
                    <span><b>Attempt {f.attempt}:</b> {f.reason}{f.note ? ` · ${f.note}` : ''}</span>
                    <span className="text-[11px] text-stone-500 whitespace-nowrap">{when(f.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {p.exception && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="font-semibold text-red-900">Marked {p.exception.type} · {when(p.exception.at)}</p>
              <p className="mt-0.5 text-red-900/80">{p.exception.reason}</p>
              {p.exception.photo_url && <a href={p.exception.photo_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-red-800 underline"><Camera className="w-3.5 h-3.5" /> View the photo</a>}
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">Timeline</h3>
            <ol className="relative border-l border-stone-200 ml-1.5 space-y-2.5">
              {p.timeline.map((t, i) => (
                <li key={i} className="pl-4">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-stone-300 ring-2 ring-white" aria-hidden="true" />
                  <p className="font-semibold text-stone-900">{t.note || t.status.replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="text-[11px] text-stone-500">{when(t.at)} · {t.actor}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500 mb-1.5">
              <Lock className="w-3 h-3" /> Audit trail <span className="normal-case font-normal tracking-normal">· entries cannot be edited or deleted</span>
            </h3>
            {p.audit.length === 0 ? <p className="text-stone-400">No manual changes.</p> : (
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {p.audit.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <p className="font-semibold text-stone-900">
                      {ACTION_LABEL[a.action] ?? a.action}
                      {typeof a.from?.status === 'string' && typeof a.to?.status === 'string' && <span className="font-normal text-stone-600"> · {String(a.from.status)} → {String(a.to.status)}</span>}
                    </p>
                    {a.reason && <p className="text-stone-700">“{a.reason}”</p>}
                    <p className="text-[11px] text-stone-500">{a.by ?? 'System'} · {when(a.at)} ({relativeTime(a.at)})</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {p && action === 'override' && <OverrideDialog parcel={p} onClose={() => setAction(null)} onDone={done} />}
      {p && action === 'reschedule' && <RescheduleDialog parcel={p} onClose={() => setAction(null)} onDone={done} />}
      {p && (action === 'lost' || action === 'damaged') && <ExceptionDialog parcel={p} type={action} onClose={() => setAction(null)} onDone={done} />}
    </SidePanel>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="font-semibold text-stone-900">{value}</dd>
      {sub && <dd className="text-[11.5px] text-stone-500">{sub}</dd>}
    </div>
  );
}

function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const n = value.trim().length;
  const bad = value.length > 0 && n < 10;

  return (
    <label className="block text-[12px] font-semibold text-stone-700">
      Reason
      <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} rows={3} placeholder={placeholder}
        className={`mt-1 w-full px-3 py-2 text-[13px] border rounded-xl outline-none resize-none ${bad ? 'border-red-400' : 'border-stone-300 focus:border-brand-red'}`} />
      <span className={`block text-[11px] font-normal ${bad ? 'text-red-700' : 'text-stone-400'}`}>{bad ? 'At least 10 characters.' : `${n}/300 · kept in the audit log`}</span>
    </label>
  );
}

function OverrideDialog({ parcel, onClose, onDone }: { parcel: CourierParcelDetail; onClose: () => void; onDone: (m: string) => void }) {
  const [to, setTo] = useState(parcel.override_targets[0]?.value ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = to !== '' && reason.trim().length >= 10;

  const save = async () => {
    setBusy(true); setError('');
    try { onDone((await overrideParcelApi(parcel.id, to, reason.trim())).message); }
    catch (e) { setError(apiErrorMessage(e, 'The override was not saved.')); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title="Override the status"
      footer={<><button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button><button type="button" className={BUTTON.primary} disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Set status'}</button></>}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-stone-600">For when the normal flow broke, for example the rider's app was offline. It moves the parcel to its next step only.</p>
        <label className="block text-[12px] font-semibold text-stone-700">
          New status
          <CustomSelect className="mt-1" value={to} onChange={setTo} options={parcel.override_targets.map((t) => ({ value: t.value, label: t.label }))} />
        </label>
        <ReasonField value={reason} onChange={setReason} placeholder="For example: Rider app offline, delivery confirmed by phone." />
        {error && <p role="alert" className="text-[12px] font-medium text-red-700">{error}</p>}
      </div>
    </Dialog>
  );
}

function RescheduleDialog({ parcel, onClose, onDone }: { parcel: CourierParcelDetail; onClose: () => void; onDone: (m: string) => void }) {
  const [riders, setRiders] = useState<DispatchRider[] | null>(null);
  const [rider, setRider] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getDispatchRidersApi().then((r) => setRiders(r.data)).catch(() => setRiders([])); }, []);

  const save = async () => {
    setBusy(true); setError('');
    try { onDone((await rescheduleParcelApi(parcel.id, Number(rider))).message); }
    catch (e) { setError(apiErrorMessage(e, 'The parcel was not rescheduled.')); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={`Reschedule: attempt ${parcel.attempts + 1} of ${parcel.max_attempts}`}
      footer={<><button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button><button type="button" className={BUTTON.primary} disabled={!rider || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Reschedule'}</button></>}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-stone-600">Last try: {parcel.failures[parcel.failures.length - 1]?.reason ?? '—'}. A refusal or a failed last attempt goes back to the seller instead.</p>
        <CustomSelect value={rider} onChange={setRider}
          options={[{ value: '', label: riders === null ? 'Loading riders…' : riders.length ? 'Choose the delivery rider' : 'No rider can take a job' }, ...(riders ?? []).map((r) => ({ value: String(r.id), label: `${r.name} · ${r.active_jobs} jobs` }))]} />
        {error && <p role="alert" className="text-[12px] font-medium text-red-700">{error}</p>}
      </div>
    </Dialog>
  );
}

function ExceptionDialog({ parcel, type, onClose, onDone }: { parcel: CourierParcelDetail; type: 'lost' | 'damaged'; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = reason.trim().length >= 10 && (type === 'lost' || photo !== null);

  const save = async () => {
    setBusy(true); setError('');
    try { onDone((await markParcelExceptionApi(parcel.id, type, reason.trim(), photo)).message); }
    catch (e) { setError(apiErrorMessage(e, 'The parcel was not updated.')); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={type === 'lost' ? 'Mark the parcel lost' : 'Mark the parcel damaged'}
      footer={<><button type="button" className={BUTTON.ghost} onClick={onClose}>Cancel</button><button type="button" className={BUTTON.danger} disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : type === 'lost' ? 'Mark lost' : 'Mark damaged'}</button></>}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-stone-600">
          The order is cancelled, the buyer and the shop are told, {parcel.order?.payment_method === 'cod' ? 'nothing was paid so nothing is refunded,' : 'the payment is refunded in full,'} and a claim for the items opens for the shop.
        </p>
        <ReasonField value={reason} onChange={setReason} placeholder={type === 'lost' ? 'For example: Not found at the hub after the inventory count.' : 'For example: Box crushed during the trip; the basket rim is broken.'} />
        {type === 'damaged' && (
          <label className="block text-[12px] font-semibold text-stone-700">
            Photo of the damage <span className="text-red-700">(required)</span>
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-white" />
            <span className="block text-[11px] font-normal text-stone-400">JPG or PNG, up to 5 MB.</span>
          </label>
        )}
        {error && <p role="alert" className="text-[12px] font-medium text-red-700">{error}</p>}
      </div>
    </Dialog>
  );
}
