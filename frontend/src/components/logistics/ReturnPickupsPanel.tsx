import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plane, RefreshCw, Ship, Truck, Undo2 } from 'lucide-react';
import { assignReturnPickupApi, getReturnPickupsApi, type ReturnPickupList, type ReturnPickupView } from '../../api/commerce';
import { apiErrorMessage } from '../../utils/apiError';
import { useToast } from '../ui/Toast';
import { useLiveRefresh } from '../../hooks/useLiveNotices';

const TONE: Record<string, string> = {
  requested: 'bg-amber-50 text-amber-800 border-amber-200',
  assigned: 'bg-sky-50 text-sky-800 border-sky-200',
  collected: 'bg-violet-50 text-violet-800 border-violet-200',
  at_hub: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  out_to_shop: 'bg-sky-50 text-sky-800 border-sky-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  received: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
};

/**
 * Return pickups for the hub (its area) or the courier (the whole network): approved returns a rider collects from the
 * buyer and takes to the shop. Waiting ones need a rider; one not yet collected can go to another rider.
 * `hideWhenEmpty` keeps the hub's Deliveries page clean when there is nothing to do.
 */
export default function ReturnPickupsPanel({ scope, hideWhenEmpty = false }: { scope: 'hub' | 'logistics'; hideWhenEmpty?: boolean }) {
  const { showToast } = useToast();
  const [list, setList] = useState<ReturnPickupList | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    getReturnPickupsApi(scope).then(setList).catch(() => setList((prev) => prev ?? { data: [], meta: {} }));
  }, [scope]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);
  useLiveRefresh(load, 30_000, busy !== null);

  const assign = async (row: ReturnPickupView) => {
    const riderId = Number(pick[row.id]);
    if (!riderId) return;
    setBusy(row.id);
    try {
      showToast((await assignReturnPickupApi(scope, row.id, riderId)).message);
      setPick((p) => ({ ...p, [row.id]: '' }));
      load();
    } catch (e) {
      showToast(apiErrorMessage(e, 'The rider was not assigned.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const rows = list?.data ?? [];
  const OPEN = ['requested', 'assigned', 'collected', 'at_hub', 'out_to_shop'];
  const open = rows.filter((r) => OPEN.includes(r.status));
  const done = rows.filter((r) => !OPEN.includes(r.status));
  // Who can be given a rider now: one still to collect, or one at the hub near the shop for the last leg.
  const canAssign = (r: ReturnPickupView) => ['requested', 'assigned', 'out_to_shop'].includes(r.status) || !!r.ready_for_shop_rider;
  const shopLeg = (r: ReturnPickupView) => r.status === 'out_to_shop' || !!r.ready_for_shop_rider;
  if (hideWhenEmpty && list && open.length === 0) return null;
  const riders = list?.meta.riders ?? [];

  return (
    <section aria-label="Return pickups" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-50 text-sky-700 shrink-0"><Undo2 className="w-4 h-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Return pickups</h2>
            <p className="text-[11px] text-gray-500">Approved returns to collect from buyers and bring back to the shop. Far-away shops get theirs back through the hubs.</p>
          </div>
        </div>
        {list && (
          <p className="text-xs text-gray-600 tabular-nums">
            <span className="font-bold text-gray-900">{list.meta.waiting ?? 0}</span> need a rider · <span className="font-bold text-gray-900">{list.meta.moving ?? 0}</span> on the way
          </p>
        )}
      </header>

      {!list && <div className="h-24 animate-pulse bg-gray-50" aria-hidden="true" />}
      {list && open.length === 0 && <p className="px-4 py-6 text-sm text-center text-gray-500">No return pickups right now.</p>}

      <ul className="divide-y divide-gray-100">
        {open.map((r) => (
          <li key={r.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs font-semibold text-gray-700">{r.code}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${TONE[r.status]}`}>{r.status_label}</span>
                {r.attempts > 0 && <span className="text-[11px] text-amber-800">Missed {r.attempts} of {r.max_attempts}</span>}
              </p>
              <p className="mt-1 text-xs text-gray-700">
                <span className="font-semibold">From</span> {r.buyer?.name} · {r.buyer?.barangay}, {r.buyer?.city}
                <span className="mx-1.5 text-gray-300">→</span>
                <span className="font-semibold">To</span> {r.shop?.shop_name} · {r.shop?.city}
              </p>
              <p className="text-[11px] text-gray-500">
                Order {r.order_number}{r.rider ? ` · Collected by ${r.rider.name}` : ''}{r.shop_rider ? ` · Bringing it to the shop: ${r.shop_rider.name}` : ''}
              </p>
              {r.through_hubs && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-indigo-900">
                  <span className="font-semibold">Back through the hubs:</span>
                  <span>{r.collect_hub?.city}</span>
                  <ArrowRight className="w-3 h-3 text-indigo-400" aria-hidden="true" />
                  <span>{r.shop_hub?.city}</span>
                  {r.status === 'at_hub' && r.current_hub && (
                    <span className="text-indigo-700">
                      · {r.in_transit ? `on the way to ${r.current_hub.name}` : `at ${r.current_hub.name}`}
                      {!r.in_transit && r.next_hub && (
                        <span className="inline-flex items-center gap-1 ml-1">
                          , next {r.next_hub.by === 'sea' ? <Ship className="w-3 h-3" aria-hidden="true" /> : r.next_hub.by === 'air' ? <Plane className="w-3 h-3" aria-hidden="true" /> : <Truck className="w-3 h-3" aria-hidden="true" />} {r.next_hub.name}
                        </span>
                      )}
                    </span>
                  )}
                </p>
              )}
            </div>
            {canAssign(r) && (
              <div className="flex items-center gap-2">
                <select
                  value={pick[r.id] ?? ''}
                  onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}
                  aria-label={`Rider for ${r.code}`}
                  className="px-3 text-sm bg-white border border-gray-300 rounded-xl min-h-10 min-w-[200px] focus:border-gray-900 focus:outline-none"
                >
                  <option value="">{riders.length ? (shopLeg(r) ? (r.shop_rider ? 'Change the rider' : 'Rider to take it to the shop') : r.rider ? 'Change the rider' : 'Choose a rider') : 'No active rider'}</option>
                  {riders.map((d) => <option key={d.id} value={d.id}>{d.name}{d.online ? ' · online' : ''}</option>)}
                </select>
                <button
                  type="button"
                  disabled={!pick[r.id] || busy !== null}
                  onClick={() => void assign(r)}
                  className="inline-flex items-center gap-1.5 px-4 text-xs font-bold text-white rounded-xl min-h-10 bg-brand-red hover:bg-brand-red-dark disabled:opacity-50"
                >
                  {busy === r.id && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  {(shopLeg(r) ? r.shop_rider : r.rider) ? 'Reassign' : shopLeg(r) ? 'Send to shop' : 'Assign'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <div className="border-t border-gray-100">
          <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="w-full px-4 text-xs font-semibold text-left text-gray-600 min-h-10 hover:bg-gray-50">
            {showDone ? 'Hide' : 'Show'} the last {done.length} finished
          </button>
          {showDone && (
            <ul className="divide-y divide-gray-50">
              {done.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-gray-600">
                  <span className="font-mono">{r.code}</span>
                  <span>{r.buyer?.barangay} → {r.shop?.shop_name}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${TONE[r.status]}`}>{r.status_label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
