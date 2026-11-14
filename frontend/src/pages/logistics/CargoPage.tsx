import { useCallback, useEffect, useState } from 'react';
import { Scale, PackageCheck, ShieldCheck } from 'lucide-react';
import { http } from '../../api/client';
import { PageHero } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import { BUTTON } from '../../components/ui/Overlay';
import { apiErrorMessage } from '../../utils/apiError';
import { useToast } from '../../components/ui/Toast';

type Capacity = { mode: 'weight' | 'legacy'; capacity_kg: number | null; reserved_kg?: number; remaining_kg?: number; active_jobs?: number; unmeasured_jobs?: number; capacity_litres?: number; reserved_litres?: number; notice?: string; configuration?: Record<string, string | number | boolean> };
type Rider = { id: number; name: string; vehicle_type: string; plate_number: string; capacity: Capacity };
const ratingFields = [ ['registered_payload_kg', 'Registered total carrying allowance (kg)'], ['manufacturer_payload_kg', 'Manufacturer total payload (kg)'], ['rider_gear_kg', 'Rider and riding gear (kg)'], ['carrier_rating_kg', 'Lesser box / rack rating, including empty box (kg)'], ['empty_carrier_kg', 'Empty box, rack and added equipment (kg)'], ['length_cm', 'Usable length (cm)'], ['width_cm', 'Usable width (cm)'], ['height_cm', 'Usable height (cm)'] ];
const boxFields = [['weight_kg', 'Packed weight (kg)'], ['length_cm', 'Packed length (cm)'], ['width_cm', 'Packed width (cm)'], ['height_cm', 'Packed height (cm)']];
const input = 'mt-1.5 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm';

export default function CargoPage({ scope = 'logistics' }: { scope?: 'logistics' | 'hub' | 'rider' }) {
  const [riders, setRiders] = useState<Rider[]>([]), [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [ratings, setRatings] = useState<Record<string, string>>({}), [source, setSource] = useState(''), [carrier, setCarrier] = useState('manufacturer');
  const [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [kind, setKind] = useState('parcel'), [code, setCode] = useState(''), [box, setBox] = useState<Record<string, string>>({});
  const { showToast } = useToast(); const readonly = scope === 'rider';
  const load = useCallback(async () => {
    try {
      if (scope === 'rider') setCapacity((await http.get<{data: Capacity}>('/rider/cargo')).data.data);
      else setRiders((await http.get<{data: Rider[]}>(`/${scope}/cargo/riders`, { params: { search: search.trim() || undefined } })).data.data);
      setError('');
    } catch (e) { setError(apiErrorMessage(e, 'Cargo information could not be loaded.')); }
  }, [scope, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  const choose = async (id: string) => {
    setSelected(id); setCapacity(null); setChecked(false); setBusy(true); setError('');
    try {
      const c = (await http.get<{data: Capacity}>(`/${scope}/cargo/riders/${id}`)).data.data;
      setCapacity(c); const config = c.configuration ?? {};
      setRatings(Object.fromEntries(ratingFields.map(([key]) => [key, config[key] == null ? '' : String(config[key])])));
      setSource(String(config.source_note ?? '')); setCarrier(String(config.carrier_type ?? 'manufacturer'));
    } catch (e) { setError(apiErrorMessage(e, 'The rider could not be loaded.')); }
    finally { setBusy(false); }
  };
  const review = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !selected || !checked) return; setBusy(true); setError('');
    try {
      const response = await http.patch<{data: Capacity}>(`/${scope}/cargo/riders/${selected}`, { ...Object.fromEntries(Object.entries(ratings).map(([key, value]) => [key, Number(value)])), carrier_type: carrier, source_note: source.trim(), reviewed_documents_and_mounting: checked });
      setCapacity(response.data.data); setChecked(false); showToast('Cargo review saved for this vehicle.', 'success'); await load();
    } catch (e) { setError(apiErrorMessage(e, 'The cargo review could not be saved.')); }
    finally { setBusy(false); }
  };
  const measure = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      await http.post(`/${scope}/cargo/measurements`, {kind, code: code.trim(), ...Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Number(value)]))});
      showToast('Packed measurements recorded. Shipping charges are unchanged.', 'success');
      if (selected) setCapacity((await http.get<{data: Capacity}>(`/${scope}/cargo/riders/${selected}`)).data.data);
    } catch (e) { setError(apiErrorMessage(e, 'The package could not be measured.')); }
    finally { setBusy(false); }
  };
  const allowance = Math.max(0, Math.min(Number(ratings.registered_payload_kg), Number(ratings.manufacturer_payload_kg)) - Number(ratings.rider_gear_kg) - Number(ratings.empty_carrier_kg));
  const net = Math.max(0, Math.min(allowance, Number(ratings.carrier_rating_kg) - Number(ratings.empty_carrier_kg)));
  return <div className="space-y-5 pb-8">
    <PageHero icon={Scale} eyebrow="Vehicle and package checks" title="Cargo allowance" subtitle="Use documented vehicle and carrier ratings—not a universal motorcycle weight limit. Staff review enables kg-based assignments; physical loading still needs an in-person safety check." />
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" className="ml-3 underline" onClick={() => void load()}>Refresh</button></div>}
    {!readonly && <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5"><label className="block text-xs font-medium text-stone-600">Find rider by name or plate<input type="search" maxLength={100} disabled={busy} value={search} onChange={(e) => { setSearch(e.target.value); setSelected(''); setCapacity(null); }} className={input} placeholder="Search your courier’s rider roster" /></label><CustomSelect label="Rider and vehicle" disabled={busy} value={selected} onChange={(id) => void choose(id)} placeholder="Choose a rider" searchable options={riders.map((r) => ({ value: String(r.id), label: `${r.name} · ${r.vehicle_type} ${r.plate_number} · ${r.capacity.mode === 'weight' ? `${r.capacity.capacity_kg} kg reviewed` : 'review needed'}` }))} /><p className="text-xs text-stone-500">Newest 100 matches. Search to find a rider in a larger network.</p></div>}
    {capacity && <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-brand-red"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">{capacity.mode === 'weight' ? 'Reviewed cargo allowance' : 'Courier review required'}</h2></div><div className="my-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{[['Reserved weight', `${capacity.reserved_kg ?? 0} kg`], ['Cargo allowance', capacity.capacity_kg == null ? 'Not reviewed' : `${capacity.capacity_kg} kg`], ['Assigned parcels', String(capacity.active_jobs ?? 0)], ['Need measurement', String(capacity.unmeasured_jobs ?? 0)]].map(([label, value]) => <div key={label} className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p></div>)}</div><p className="text-sm leading-6 text-stone-600">{capacity.notice}</p>{capacity.mode === 'weight' && <p className="mt-2 text-xs text-stone-500">Space reserved: {capacity.reserved_litres} / {capacity.capacity_litres} litres. Jobs reserve capacity as soon as they are assigned, including pickups and returns.</p>}</section>}
    {!readonly && <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold"><Scale className="h-5 w-5 text-brand-red" />Vehicle review</h2>
        {scope === 'hub' ? <p className="mt-4 text-sm leading-6 text-stone-600">Only courier-company staff can approve or increase a cargo allowance. Ask the courier to review the registration, manufacturer rating, rider/gear mass and carrier limits for this exact vehicle.</p> : !selected ? <p className="mt-4 text-sm text-stone-500">Choose a rider to review their vehicle. No ratings are prefilled for unreviewed vehicles.</p> : <form className="mt-4 space-y-4" onSubmit={(event) => void review(event)}>
          <p className="text-xs leading-5 text-stone-500">Use the registration’s total carrying allowance (loaded gross mass minus vehicle mass) and manufacturer payload. Both include the rider and equipment. Use the lower box/rack rating; include empty carrier weight in that rating.</p>
          <div className="grid gap-3 sm:grid-cols-2">{ratingFields.map(([key, label]) => <label key={key} className="text-xs font-medium text-stone-600">{label}<input required type="number" min={key === 'empty_carrier_kg' ? 0 : 0.001} step="0.001" value={ratings[key] ?? ''} onChange={(e) => setRatings((prev) => ({...prev, [key]: e.target.value}))} className={input} /></label>)}</div>
          <CustomSelect label="Carrier type" value={carrier} onChange={setCarrier} options={[{value:'manufacturer',label:'Manufacturer-designed carrier'}, {value:'custom',label:'Custom top box'}, {value:'vehicle_bay',label:'Car / van cargo bay'}]} />
          <label className="block text-xs font-medium text-stone-600">Document references and inspection notes<textarea required minLength={20} maxLength={1000} rows={3} value={source} onChange={(e) => setSource(e.target.value)} className={input} /></label>
          <p className="rounded-xl bg-stone-50 p-3 text-sm font-semibold">Calculated net cargo: {Number.isFinite(net) ? Math.floor(net * 1000) / 1000 : 0} kg</p>
          <label className="flex items-start gap-3 text-xs leading-5 text-stone-600"><input required type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 accent-brand-red" /><span>I checked the documents for this vehicle, external carrier dimensions, applicable inspection/registration, secure mounting, and unobstructed lights, plate, mirrors and controls. This is a staff review, not an LTO certification.</span></label>
          <button disabled={busy || !checked} className={BUTTON.primary}>{busy ? 'Saving…' : 'Approve reviewed allowance'}</button>
        </form>}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold"><PackageCheck className="h-5 w-5 text-brand-red" />Packed measurements</h2><p className="mt-3 text-sm leading-6 text-stone-600">Measure the complete packed parcel, including packaging. These measurements control rider loads and do not change the delivery charge. Unmeasured jobs cannot be added to a kg-based load.</p><form className="mt-4 space-y-4" onSubmit={(event) => void measure(event)}>
        <CustomSelect label="Package type" value={kind} onChange={setKind} options={[{value:'parcel',label:'Seller / delivery parcel'}, {value:'return',label:'Buyer return pickup'}]} />
        <label className="block text-xs font-medium text-stone-600">{kind === 'parcel' ? 'Parcel tracking number' : 'Return pickup code'}<input required maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} className={input} /></label>
        <div className="grid gap-3 sm:grid-cols-2">{boxFields.map(([key, label]) => <label key={key} className="text-xs font-medium text-stone-600">{label}<input required type="number" min="0.001" step="0.001" value={box[key] ?? ''} onChange={(e) => setBox((prev) => ({...prev, [key]: e.target.value}))} className={input} /></label>)}</div>
        <button disabled={busy} className={BUTTON.dark}>{busy ? 'Saving…' : 'Record package measurements'}</button>
      </form></section>
    </div>}
    <aside className="rounded-2xl border border-stone-200 bg-stone-50 p-5 text-xs leading-6 text-stone-600"><p className="font-semibold text-stone-900">Road safety comes before parcel count</p><p>The three-job setting is an app pickup-offer restriction, not a Philippine legal weight rating. Reviewed vehicles use kg and cargo-space checks instead. A package must fit within the reviewed dimensions, and total packed volume must fit. Volume alone does not prove a stack is stable or will physically pack.</p><p className="mt-2">Never tape oversized packages around a motorcycle to bypass the checks. Split the load or use a suitable larger vehicle. A vehicle or plate change requires another review. Custom motorcycle top boxes are subject to the LTO’s 2 ft (60.96 cm) per-side rule and applicable inspection/registration.</p><p className="mt-2"><a className="font-semibold underline" href="https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/26188" target="_blank" rel="noreferrer">RA 4136</a> · <a className="font-semibold underline" href="https://lto.gov.ph/wp-content/uploads/2023/10/Memo_MCTopBoxesSaddleBags.pdf" target="_blank" rel="noreferrer">LTO carrier guidance</a></p></aside>
  </div>;
}
