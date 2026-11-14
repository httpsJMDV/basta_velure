import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, RefreshCw, Settings2, ShieldCheck, Package, RotateCcw } from 'lucide-react';
import { http } from '../../api/client';
import CustomSelect from '../../components/ui/CustomSelect';
import { Dialog } from '../../components/ui/Overlay';
import { PageHero } from '../../components/admin/dashboardKit';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../utils/apiError';

type Field = 'auto_seller_pickups' | 'auto_return_pickups';
type Setting = { value: boolean | null; effective: boolean; company_default: boolean };
type Control = { name: string; scope: string; settings: Record<Field, Setting> };
type Job = { id: number; tracking_number: string; shop: string; address: string; rider: string | null; state: string; pickup_date: string | null; pickup_window: string | null };
type Rider = { id: number; name: string; jobs: number; distance: string };

export default function PickupControlPage({ hub = false }: { hub?: boolean }) {
  const scope = hub ? 'hub' : 'logistics';
  const base = `/${scope}/pickup-control`;
  const { showToast } = useToast();
  const [control, setControl] = useState<Control | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [riderId, setRiderId] = useState('');
  const [loadingRiders, setLoadingRiders] = useState(false);
  const load = useCallback(async () => {
    try {
      const [settings, queue] = await Promise.all([http.get<{ data: Control }>(base), http.get<{ data: Job[] }>(`${base}/jobs`)]);
      setControl(settings.data.data); setJobs(queue.data.data); setError('');
    } catch (e) { setError(apiErrorMessage(e, 'Pickup controls could not be loaded.')); }
  }, [base]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const save = async (field: Field, value: boolean | null) => {
    if (!control || busy) return;
    setBusy(true);
    try {
      const values = Object.fromEntries(Object.entries(control.settings).map(([key, setting]) => [key, key === field ? value : setting.value]));
      const res = await http.patch<{ data: Control }>(base, values);
      setControl(res.data.data); showToast('Assignment preference saved.', 'success'); await load();
    } catch (e) { showToast(apiErrorMessage(e, 'Preference could not be saved.'), 'error'); }
    finally { setBusy(false); }
  };
  const choose = async (job: Job) => {
    setSelected(job); setRiders([]); setRiderId(''); setLoadingRiders(true);
    try { setRiders((await http.get<{ data: Rider[] }>(`${base}/riders`, { params: { parcel_id: job.id } })).data.data); }
    catch (e) { showToast(apiErrorMessage(e, 'Riders could not be loaded.'), 'error'); }
    finally { setLoadingRiders(false); }
  };
  const assign = async () => {
    if (!selected || !riderId || busy) return;
    setBusy(true);
    try {
      await http.post(`${base}/assign`, { parcel_id: selected.id, rider_id: Number(riderId) });
      setSelected(null); showToast('Pickup assigned to the selected rider.', 'success'); await load();
    } catch (e) { showToast(apiErrorMessage(e, 'Assignment could not be completed.'), 'error'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 pb-8">
    <PageHero icon={Settings2} eyebrow="Dispatch preferences" title="Pickup control" subtitle="Choose who assigns each rider. Booking a pickup, assigning a rider, and collecting the parcel are separate steps." />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={() => void load()}>Retry</button></div>}
    {!control && !error && <p role="status" className="p-6 text-stone-500">Loading assignment preferences…</p>}
    {control && <>
      <div className="flex items-center gap-2 text-sm text-stone-600"><ShieldCheck className="h-4 w-4 text-brand-red" />{control.name} · {hub ? 'Your hub’s preferences override company defaults' : 'Company defaults apply to hubs without an override'}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['auto_seller_pickups', 'auto_return_pickups'] as Field[]).map((field) => {
          const setting = control.settings[field]; const seller = field === 'auto_seller_pickups'; const Icon = seller ? Package : RotateCcw;
          return <section key={field} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand-red/5 p-2.5 text-brand-red"><Icon className="h-5 w-5" /></span><div><h2 className="font-bold text-stone-900">{seller ? 'Seller pickups' : 'Buyer returns'}</h2><p className="mt-1 text-xs text-stone-500">{setting.value === null ? 'Following company default' : 'Custom preference'} · {setting.effective ? 'Automatic' : 'Manual'}</p></div></div>
              <button type="button" role="switch" aria-checked={setting.effective} aria-label={`Automatic ${seller ? 'seller pickups' : 'buyer returns'}`} disabled={busy} onClick={() => void save(field, !setting.effective)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${setting.effective ? 'bg-brand-red' : 'bg-stone-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${setting.effective ? 'left-1 translate-x-5' : 'left-1'}`} /></button>
            </div>
            <p className="mt-5 text-sm leading-6 text-stone-600">{seller ? 'Automatic mode offers new ready parcels to the nearest eligible online rider for 60 seconds, trying up to three riders. With automatic mode off, staff choose the rider from the pickup queue below.' : 'An approved return can book a collection without choosing a rider. Automatic mode assigns an available rider from the responsible hub, including the final trip back to the shop. With it off, staff choose the rider in Return pickups.'}</p>
            <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-600">{seller ? 'Switching off closes unaccepted offers. Assigned jobs remain with their riders. Switching on applies to new and scheduled jobs; use Run auto-assign in courier Dispatch to retry waiting jobs.' : 'Automatic returns run each minute and when staff open the return queue. If no local rider is eligible, the return stays waiting. Existing assignments remain unchanged.'}</p>
            {hub && <button disabled={busy || setting.value === null} onClick={() => void save(field, null)} className="mt-4 text-xs font-semibold text-brand-red disabled:text-stone-400">Use company default ({setting.company_default ? 'automatic' : 'manual'})</button>}
          </section>;
        })}
      </div>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Manual seller pickup assignment</h2><p className="mt-1 text-sm text-stone-500">{hub ? 'Pickups in your hub’s origin coverage; assign one of your own riders.' : 'Ready seller pickups in your courier network.'} Up to 200 jobs.</p></div><button className="rounded-lg border border-stone-200 p-2" aria-label="Refresh queue" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></button></div>
        <div className="mt-4 divide-y divide-stone-100">{jobs.length === 0 && <p className="py-8 text-center text-sm text-stone-500">No ready seller pickups in this queue.</p>}{jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="font-semibold text-sm">{job.tracking_number} <span className="font-normal text-stone-500">· {job.shop}</span></p><p className="mt-1 text-xs text-stone-500">{job.address}</p><p className="mt-1 text-xs text-stone-600">{job.rider ? `Assigned to ${job.rider}` : job.state === 'offering' ? 'Automatic offer in progress' : 'Waiting for a rider'}{job.pickup_date ? ` · ${job.pickup_date.slice(0, 10)} ${job.pickup_window ?? ''}` : ''}</p></div><button disabled={busy} onClick={() => void choose(job)} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white">{job.rider ? 'Reassign' : 'Assign rider'}</button></div>)}</div>
      </section>
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600"><p className="font-semibold text-stone-900">How assignments work</p><p className="mt-2">Staff may assign manually in either mode. Seller pickup riders must be active, online, and eligible under the vehicle’s reviewed cargo allowance (or the existing three-job restriction while awaiting review). A hub can only assign its own local riders. A courier can manage its network. Riders confirm collection in the app; assignment alone never marks an item collected.</p><p className="mt-2">Buyer returns start at the hub that delivered the order. When the shop is farther away, the item travels through the hubs and a rider at the shop’s hub handles the final leg. Regular delivery dispatch and truck trips remain staff-managed.</p><Link to={hub ? '/hub/deliveries' : '/logistics/returns'} className="mt-3 inline-flex items-center gap-2 font-semibold text-brand-red"><Bike className="h-4 w-4" />Open returns and assign a return rider</Link></div>
    </>}
    <Dialog open={selected !== null} onClose={() => { if (!busy) setSelected(null); }} title="Choose a pickup rider">
      <p className="mb-5 text-sm text-stone-500">{selected?.tracking_number} · {selected?.shop}. This replaces any unaccepted offer or previous pickup assignment.</p>
      {loadingRiders ? <p role="status">Loading eligible riders…</p> : riders.length === 0 ? <p className="text-sm text-stone-600">No eligible rider is online. Ask a rider to go online or finish a current job, then refresh.</p> : <CustomSelect label="Available rider" value={riderId} onChange={setRiderId} placeholder="Choose a rider" options={riders.map((rider) => ({ value: String(rider.id), label: `${rider.name} · ${rider.jobs} active parcels · ${rider.distance}` }))} />}
      <div className="mt-6 flex justify-end gap-3"><button disabled={busy} onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={busy || !riderId || loadingRiders} onClick={() => void assign()} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Assigning…' : 'Confirm assignment'}</button></div>
    </Dialog>
  </div>;
}
