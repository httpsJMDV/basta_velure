import { Truck, CheckCircle2, Clock } from 'lucide-react';
import type { HubTruckDriver } from '../../types';

export default function HubTruckTeam({ drivers }: { drivers: HubTruckDriver[] }) {
  const available = drivers.filter(d => !d.busy).length;
  return <div className="border-b border-gray-100 bg-stone-50/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Truck className="h-4 w-4 text-brand-red" /> Your hub’s truck team</h3><p className="mt-1 text-xs leading-relaxed text-gray-500">Only drivers assigned to this home hub appear here. Your courier manages the assignments.</p></div><span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{available} available · {drivers.length} assigned</span></div>
    {drivers.length === 0 ? <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">No active truck drivers are assigned to this hub. Ask your courier to assign a driver before loading a truck.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{drivers.map(d => <div key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{d.name}</p><p className="mt-0.5 text-xs text-gray-500">{d.vehicle_type}{d.plate_number ? ` · ${d.plate_number}` : ''}</p><p className="mt-1 text-xs text-gray-500">{d.busy ? `On a trip to ${d.on_trip_to ?? 'another hub'}` : 'Available for a new dispatch'}</p></div>{d.busy ? <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}</div>)}</div>}
    {drivers.length === 1 && <p className="mt-2 text-xs text-gray-500">For backup coverage, ask your courier to assign a second driver to this hub.</p>}
  </div>;
}
