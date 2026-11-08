import { useCallback, useEffect, useState } from 'react';
import { Calculator, Ship } from 'lucide-react';
import { Panel } from './CourierKit';
import { ListError, TH, TD, relativeTime } from '../admin/listKit';
import Input from '../ui/Input';
import { BUTTON } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { getTruckPlanApi, saveTruckPlanSettingsApi } from '../../api/client';
import type { TruckPlan } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';

const VERDICT: Record<TruckPlan['verdict'], { tone: string; bar: string; label: string }> = {
  short:            { tone: 'text-red-700',     bar: 'bg-red-500',     label: 'Not enough drivers' },
  tight:            { tone: 'text-amber-700',   bar: 'bg-amber-500',   label: 'Enough, no spare' },
  ok:               { tone: 'text-emerald-700', bar: 'bg-emerald-500', label: 'Right number' },
  more_than_needed: { tone: 'text-sky-700',     bar: 'bg-sky-500',     label: 'More than needed' },
  idle:             { tone: 'text-stone-600',   bar: 'bg-stone-300',   label: 'No land trips yet' },
};

const n1 = (v: number) => v.toLocaleString('en-PH', { maximumFractionDigits: 1 });
const plural = (v: number, one: string, many = `${one}s`) => `${n1(v)} ${v === 1 ? one : many}`;

/**
 * "Do we need more truck drivers?": the courier's last 7 days of trips between hubs (and what waits now), turned into
 * trips a day, driver hours and drivers, with the sum written out so the courier can follow it.
 */
export default function TruckPlanner() {
  const { showToast } = useToast();
  const [plan, setPlan] = useState<TruckPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [shift, setShift] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getTruckPlanApi().then((p) => {
      setPlan(p);
      setCapacity((c) => c || String(p.settings.capacity));
      setShift((s) => s || String(p.settings.shift_hours));
    }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveTruckPlanSettingsApi(Number(capacity), Number(shift));
      setPlan(res.data);
      showToast(res.message);
    } catch (e) {
      showToast(apiErrorMessage(e, 'The numbers were not saved.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <ListError message="The truck plan could not be worked out." onRetry={load} />;

  const v = plan ? VERDICT[plan.verdict] : null;
  const have = plan?.drivers.active ?? 0;
  const need = plan?.needed.recommended ?? 0;
  const scale = Math.max(have, need, 1);

  return (
    <Panel icon={Calculator} title="Do we need more truck drivers?"
      subtitle="Worked out from your own trips between hubs in the last 7 days, and the parcels waiting for a truck right now.">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px] lg:divide-x divide-gray-100">
        <div className="p-4 sm:p-5 space-y-5">
          {!plan ? (
            <div className="space-y-3" aria-hidden="true">
              <div className="h-10 w-2/3 rounded-lg bg-gray-100 animate-pulse" />
              <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-gray-100 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">You need</p>
                  <p className="text-[34px] font-black leading-none tabular-nums text-gray-900">{need}<span className="ml-1.5 text-[15px] font-bold text-gray-500">{need === 1 ? 'driver' : 'drivers'}</span></p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">You have</p>
                  <p className="text-[34px] font-black leading-none tabular-nums text-gray-900">{have}</p>
                </div>
                <p className={`text-[13px] font-bold ${v?.tone}`}>{v?.label}</p>
              </div>

              {/* Have against need, on one scale. */}
              <div className="space-y-1.5" aria-hidden="true">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-gray-800" style={{ width: `${(have / scale) * 100}%` }} /></div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${v?.bar}`} style={{ width: `${(need / scale) * 100}%` }} /></div>
              </div>

              <p className="text-[13.5px] leading-relaxed text-gray-700">{plan.message}</p>

              {plan.needed.recommended > 0 && (
                <ol className="grid gap-2 sm:grid-cols-3 text-[12.5px]">
                  <li className="rounded-xl border border-gray-200 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-gray-500">1. Trips a day</p>
                    <p className="font-black text-[18px] tabular-nums text-gray-900">{plan.needed.trips_per_day}</p>
                    <p className="text-gray-500">parcels a day on each route ÷ {plural(plan.settings.capacity, 'parcel')} a truck, rounded up</p>
                  </li>
                  <li className="rounded-xl border border-gray-200 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-gray-500">2. Driving a day</p>
                    <p className="font-black text-[18px] tabular-nums text-gray-900">{n1(plan.needed.driver_hours_per_day)} h</p>
                    <p className="text-gray-500">each trip there and back (about {n1(plan.settings.trip_hours)} h one way)</p>
                  </li>
                  <li className="rounded-xl border border-gray-200 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-gray-500">3. Drivers</p>
                    <p className="font-black text-[18px] tabular-nums text-gray-900">{plan.needed.drivers} + {plan.needed.spare}</p>
                    <p className="text-gray-500">driving hours ÷ a {plan.settings.shift_hours} h shift, plus a spare for days off</p>
                  </li>
                </ol>
              )}

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-[12.5px]">
                <div><dt className="text-gray-500">Parcels by truck, 7 days</dt><dd className="font-bold tabular-nums text-gray-900">{plan.demand.parcels_last_7_days.toLocaleString('en-PH')}</dd></div>
                <div><dt className="text-gray-500">Waiting for a truck now</dt><dd className="font-bold tabular-nums text-gray-900">{plan.demand.waiting_now.toLocaleString('en-PH')}</dd></div>
                <div><dt className="text-gray-500">Average wait at a hub</dt><dd className="font-bold tabular-nums text-gray-900">{plan.demand.average_wait_hours === null ? '—' : `${n1(plan.demand.average_wait_hours)} h`}</dd></div>
                <div><dt className="text-gray-500">Waited over {plan.settings.long_wait_hours} h</dt><dd className={`font-bold tabular-nums ${plan.demand.waited_too_long ? 'text-red-700' : 'text-gray-900'}`}>{plan.demand.waited_too_long}</dd></div>
              </dl>

              {(plan.demand.by_sea_or_air_waiting > 0 || plan.demand.by_sea_or_air_last_7_days > 0) && (
                <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
                  <Ship className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {plural(plan.demand.by_sea_or_air_last_7_days, 'parcel')} crossed between islands this week and {plan.demand.by_sea_or_air_waiting} wait at your island gateways.
                    Ships and planes are cargo carriers, so they need no truck driver of yours.
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-3 bg-gray-50/60">
          <p className="text-[12.5px] font-bold text-gray-900">Your numbers</p>
          <Input id="tp-capacity" label="Parcels one truck carries" type="number" min={10} max={5000} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <Input id="tp-shift" label="Hours one driver works a day" type="number" min={1} max={16} value={shift} onChange={(e) => setShift(e.target.value)} />
          <button type="button" className={`${BUTTON.dark} w-full`} onClick={() => void save()} disabled={busy || !plan}>{busy ? 'Saving…' : 'Save and work it out again'}</button>
          <p className="text-[11.5px] leading-relaxed text-gray-500">
            A small van carries about 150 parcels, a 6-wheeler truck about 400. Trip times come from your finished trips; until there are some, a trip counts as {plan ? n1(plan.settings.trip_hours) : 3} hours.
          </p>
        </div>
      </div>

      {plan && plan.routes.length > 0 && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Route</th>
                <th className={`${TH} text-right`}>Parcels a day</th>
                <th className={`${TH} text-right`}>Waiting now</th>
                <th className={`${TH} text-right`}>Trips a day</th>
                <th className={`${TH} text-right`}>One way</th>
                <th className={`${TH} text-right`}>Driver hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {plan.routes.map((r) => (
                <tr key={`${r.from?.id}-${r.to?.id}`}>
                  <td className={`${TD} min-w-[240px]`}>
                    <span className="font-semibold text-gray-900">{r.from?.city}</span>
                    <span className="mx-1.5 text-gray-300" aria-hidden="true">→</span>
                    <span className="font-semibold text-gray-900">{r.to?.city}</span>
                    {r.to?.gateway && <span className="ml-2 text-[11px] font-semibold text-indigo-700">{r.to.gateway}</span>}
                    <span className="block text-[11px] text-gray-400 truncate">{r.from?.name} to {r.to?.name}</span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{n1(r.parcels_per_day)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {r.waiting_now || '—'}
                    {r.oldest_waiting_at && <span className="block text-[11px] text-gray-400">oldest {relativeTime(r.oldest_waiting_at)}</span>}
                  </td>
                  <td className={`${TD} text-right tabular-nums font-semibold`}>{r.trips_per_day}</td>
                  <td className={`${TD} text-right tabular-nums text-gray-600`}>{n1(r.trip_hours)} h</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`}>{n1(r.driver_hours)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.route_count > plan.routes.length && (
            <p className="px-4 py-2.5 text-[11.5px] text-gray-500 border-t border-gray-100">The {plan.routes.length} busiest of {plan.route_count} routes. The totals above count them all.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
