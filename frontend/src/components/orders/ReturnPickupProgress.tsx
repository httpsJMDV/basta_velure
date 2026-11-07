import { Camera, Check } from 'lucide-react';
import type { ReturnPickupView } from '../../api/commerce';
import { openAuthorizedFile } from '../../api/client';

const STEPS: { key: string; label: string }[] = [
  { key: 'requested', label: 'Pickup booked' },
  { key: 'assigned', label: 'Rider assigned' },
  { key: 'collected', label: 'Collected from the buyer' },
  { key: 'received', label: 'Back with the shop' },
];

const ORDER = ['requested', 'assigned', 'collected', 'delivered', 'received'];

function reached(status: string, step: string): boolean {
  // Handed to the shop counts as back with it until the shop confirms.
  const at = ORDER.indexOf(status === 'delivered' ? 'received' : status);
  return at >= ORDER.indexOf(step);
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

/**
 * The return pickup on an order: a rider collecting the returned item from the buyer and taking it to the shop.
 * `audience` words it for the buyer or the shop; the shop also gets "I received it" once the rider has the item.
 */
export default function ReturnPickupProgress({
  pickup,
  audience,
  onReceived,
  busy = false,
}: {
  pickup: ReturnPickupView;
  audience: 'buyer' | 'seller';
  onReceived?: () => void;
  busy?: boolean;
}) {
  const cancelled = pickup.status === 'cancelled';
  const lead = cancelled
    ? pickup.cancel_reason ?? 'The pickup was cancelled.'
    : pickup.status === 'requested'
      ? audience === 'buyer' ? 'Keep the item packed. A rider will come to collect it; we will tell you who.' : 'The courier is choosing a rider to collect it from the buyer.'
      : pickup.status === 'assigned'
        ? audience === 'buyer' ? `${pickup.rider_name ?? 'A rider'} will collect the item. Keep your phone on.` : `${pickup.rider_name ?? 'A rider'} is going to collect it from the buyer.`
        : pickup.status === 'collected'
          ? audience === 'buyer' ? 'The rider has the item and is taking it to the shop.' : 'The rider has the item and is bringing it to you.'
          : pickup.status === 'delivered'
            ? audience === 'buyer' ? 'The rider handed the item to the shop.' : 'The rider says you have the item. Confirm you received it.'
            : audience === 'buyer' ? 'The shop has the item back. This return is complete.' : 'You confirmed you have the item back.';

  return (
    <div className="p-3 bg-white border rounded-xl border-stone-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-stone-900">Return pickup <span className="font-mono font-semibold text-stone-500">{pickup.code}</span></p>
        <span className={`text-[10px] font-bold uppercase ${cancelled ? 'text-red-700' : 'text-stone-600'}`}>{pickup.status_label}</span>
      </div>
      {!cancelled && (
        <ol className="grid grid-cols-4 gap-1 mt-2.5" aria-label="Return pickup progress">
          {STEPS.map((s) => {
            const done = reached(pickup.status, s.key);
            return (
              <li key={s.key} className="min-w-0">
                <span className={`block h-1 rounded-full ${done ? 'bg-stone-900' : 'bg-stone-200'}`} aria-hidden="true" />
                <span className={`mt-1 flex items-center gap-1 text-[10px] leading-tight ${done ? 'font-semibold text-stone-900' : 'text-stone-400'}`}>
                  {done && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  {s.label}
                  <span className="sr-only">{done ? '(done)' : '(not yet)'}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-[12px] text-stone-700">{lead}</p>
      {pickup.attempts > 0 && !cancelled && pickup.status === 'assigned' && (
        <p className="mt-1 text-[11px] text-amber-800">
          Missed visit {pickup.attempts} of {pickup.max_attempts}{pickup.last_failure ? `: ${pickup.last_failure}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {pickup.photo_url && (
          <button
            type="button"
            onClick={() => void openAuthorizedFile(pickup.photo_url as string)}
            className="inline-flex items-center gap-1 h-8 px-3 text-[11px] font-semibold border rounded-full border-stone-300 text-stone-800 hover:border-stone-900"
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Photo at pickup {pickup.collected_at ? `· ${when(pickup.collected_at)}` : ''}
          </button>
        )}
        {audience === 'seller' && onReceived && (pickup.status === 'collected' || pickup.status === 'delivered') && (
          <button
            type="button"
            onClick={onReceived}
            disabled={busy}
            className="inline-flex items-center gap-1 h-8 px-3.5 text-[11px] font-semibold text-white rounded-full bg-stone-900 hover:bg-stone-800 disabled:opacity-60"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> I received the item
          </button>
        )}
      </div>
    </div>
  );
}
