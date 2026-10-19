// The rider's profile (RID-PROF-001), vehicle change with a new OR/CR (RID-PROF-002/003) and license renewal
// (RID-PROF-004/005). A change to documents is saved at once and flagged for the courier company to re-verify.
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Bike, Building2, FileText, IdCard, RefreshCw, ShieldAlert, ShieldCheck, Warehouse } from 'lucide-react';
import CustomSelect from '../../components/ui/CustomSelect';
import { useToast } from '../../components/ui/Toast';
import FileUploadZone from '../../components/ui/FileUploadZone';
import { openAuthorizedFile } from '../../api/client';
import { updateRiderLicenseApi, updateRiderVehicleApi } from '../../api/riderAccount';
import type { RiderProfileData, RiderVehicleType } from '../../types';
import { fileError, licenseExpiryError, manilaToday } from '../../utils/accountRules';

const VEHICLE_TYPES: RiderVehicleType[] = ['Motorcycle', 'Tricycle', 'Car', 'Van'];
const CARD = 'bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4';
const SUBMIT = 'w-full sm:w-auto min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed';

const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '—');

function errorsFrom(err: unknown): { fields: Record<string, string>; message: string | null } {
  if (axios.isAxiosError(err) && err.response?.status === 422) {
    const raw = (err.response.data as { errors?: Record<string, string[]> }).errors ?? {};
    return { fields: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v[0]])), message: null };
  }
  if (axios.isAxiosError(err) && err.response) return { fields: {}, message: (err.response.data as { message?: string })?.message || 'That could not be saved. Try again.' };
  return { fields: {}, message: 'No connection. Check your network and try again.' };
}

export function RiderProfileCard({ rider }: { rider: RiderProfileData }) {
  const [docError, setDocError] = useState<string | null>(null);
  const status = rider.status === 'ACTIVE' ? 'Active' : rider.status === 'SUSPENDED' ? 'Suspended' : rider.status;

  return (
    <section aria-labelledby="profile-heading" className={CARD}>
      <h2 id="profile-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Profile</h2>
      {rider.status === 'SUSPENDED' && (
        <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> Your courier company suspended your account, so you cannot go Online. Reason: {rider.suspension_reason ?? 'not given'}
        </p>
      )}
      {rider.needs_reverification && rider.status === 'ACTIVE' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">Your new documents are waiting for your courier company to re-verify them.</p>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div><dt className="text-xs font-semibold text-gray-500">Name</dt><dd className="font-bold text-gray-900">{rider.full_name}</dd></div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Status</dt>
          <dd className={`font-bold flex items-center gap-1.5 ${rider.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-700'}`}>
            {rider.status === 'ACTIVE' ? <ShieldCheck className="w-4 h-4" aria-hidden="true" /> : <ShieldAlert className="w-4 h-4" aria-hidden="true" />}{status}
          </dd>
        </div>
        <div><dt className="text-xs font-semibold text-gray-500">Courier company</dt><dd className="font-bold text-gray-900 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-gray-500" aria-hidden="true" />{rider.company?.name ?? '—'}</dd></div>
        <div><dt className="text-xs font-semibold text-gray-500">Hub</dt><dd className="font-bold text-gray-900 flex items-center gap-1.5"><Warehouse className="w-4 h-4 text-gray-500" aria-hidden="true" />{rider.hub?.hub_name ?? 'No hub on file'}</dd></div>
        <div><dt className="text-xs font-semibold text-gray-500">Driver's license</dt><dd className="font-bold text-gray-900 font-mono">{rider.license_number ?? '—'}</dd></div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">License expiry</dt>
          <dd className={`font-bold ${rider.license_expiry && rider.license_expiry < manilaToday() ? 'text-red-700' : 'text-gray-900'}`}>{fmt(rider.license_expiry)}</dd>
        </div>
        <div><dt className="text-xs font-semibold text-gray-500">Vehicle</dt><dd className="font-bold text-gray-900">{rider.vehicle_type}</dd></div>
        <div><dt className="text-xs font-semibold text-gray-500">Plate number</dt><dd className="font-bold text-gray-900 font-mono">{rider.plate_number}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {rider.documents.map((d) => (
          <button key={d.key} type="button" onClick={() => { setDocError(null); openAuthorizedFile(d.url).catch(() => setDocError('The document could not be opened.')); }}
            className="inline-flex items-center gap-2 min-h-10 px-3.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 hover:border-gray-400">
            <FileText className="w-4 h-4 text-brand-red" aria-hidden="true" /> {d.label}
          </button>
        ))}
      </div>
      {docError && <p role="alert" className="text-xs font-semibold text-red-700">{docError}</p>}
    </section>
  );
}

// The page re-keys these forms on the saved values, so a saved form is remounted at once: the confirmation is a toast,
// which outlives the remount.
export function RiderVehicleForm({ rider, onSaved }: { rider: RiderProfileData; onSaved: () => void }) {
  const { showToast } = useToast();
  const [type, setType] = useState<RiderVehicleType>(rider.vehicle_type);
  const [plate, setPlate] = useState(rider.plate_number);
  const [orCr, setOrCr] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const cleanPlate = plate.trim().toUpperCase().replace(/[\s-]+/g, '');
  const dirty = type !== rider.vehicle_type || cleanPlate !== rider.plate_number.toUpperCase().replace(/[\s-]+/g, '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current || !dirty) return;
    const local: Record<string, string> = {};
    if (!cleanPlate) local.plate_number = 'Vehicle plate number is required.';
    else if (!/^[A-Z0-9]{2,10}$/.test(cleanPlate)) local.plate_number = 'Use letters and numbers only, for example 123ABC.';
    const fe = fileError(orCr, 'the new OR/CR', { pdf: true });
    if (fe) local.or_cr_image = fe;
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    busy.current = true;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('vehicle_type', type);
      fd.append('plate_number', cleanPlate);
      fd.append('or_cr_image', orCr as File);
      const res = await updateRiderVehicleApi(fd);
      setType(res.data.vehicle_type);
      setPlate(res.data.plate_number);
      setOrCr(null);
      showToast(res.message || 'Vehicle updated.', 'success');
      onSaved();
    } catch (err: unknown) {
      const { fields, message } = errorsFrom(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="vehicle-heading" className={CARD}>
      <div className="flex items-center gap-2">
        <Bike className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <h2 id="vehicle-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Change vehicle</h2>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <CustomSelect label="Vehicle type" value={type} onChange={(v) => setType(v as RiderVehicleType)}
            options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))} error={errors.vehicle_type} />
          <div className="space-y-1">
            <label htmlFor="plate-number" className="block text-sm font-medium text-brand-gray-mid">Plate number</label>
            <input id="plate-number" type="text" value={plate} maxLength={20} autoCapitalize="characters" autoComplete="off"
              onChange={(e) => { setPlate(e.target.value.toUpperCase()); setErrors((x) => ({ ...x, plate_number: '' })); }}
              aria-invalid={errors.plate_number ? true : undefined}
              className={`w-full min-h-11 rounded-xl border px-3 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-red/40 ${errors.plate_number ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.plate_number && <p role="alert" className="text-xs font-semibold text-red-700">{errors.plate_number}</p>}
          </div>
        </div>
        <FileUploadZone label="New OR/CR" required file={orCr} onChange={(f) => { setOrCr(f); setErrors((x) => ({ ...x, or_cr_image: '' })); }} onClear={() => setOrCr(null)} error={errors.or_cr_image} />
        <p className="text-xs text-gray-500">The change shows at once. Your courier company re-verifies the new OR/CR.</p>
        {formError && <p role="alert" className="text-xs font-semibold text-red-700">{formError}</p>}
        <button type="submit" disabled={saving || !dirty} className={SUBMIT}>
          {saving && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save vehicle'}
        </button>
      </form>
    </section>
  );
}

export function RiderLicenseForm({ rider, onSaved }: { rider: RiderProfileData; onSaved: () => void }) {
  const { showToast } = useToast();
  const [expiry, setExpiry] = useState(rider.license_expiry ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = expiry !== (rider.license_expiry ?? '') || file !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    const local: Record<string, string> = {};
    const ex = licenseExpiryError(expiry);
    if (ex) local.license_expiry = ex;
    const fe = fileError(file, "the driver's license", { pdf: true, required: false });
    if (fe) local.drivers_license_image = fe;
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('license_expiry', expiry);
      if (file) fd.append('drivers_license_image', file);
      const res = await updateRiderLicenseApi(fd);
      setFile(null);
      showToast(res.message || 'License updated.', 'success');
      onSaved();
    } catch (err: unknown) {
      const { fields, message } = errorsFrom(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="license-heading" className={CARD}>
      <div className="flex items-center gap-2">
        <IdCard className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <h2 id="license-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Renew license</h2>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="max-w-xs space-y-1">
          <label htmlFor="license-expiry" className="block text-sm font-medium text-brand-gray-mid">License expiry date</label>
          <input id="license-expiry" type="date" min={manilaToday()} value={expiry} onChange={(e) => { setExpiry(e.target.value); setErrors((x) => ({ ...x, license_expiry: '' })); }}
            className={`w-full min-h-11 rounded-xl border px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-red/40 ${errors.license_expiry ? 'border-red-500' : 'border-gray-300'}`} />
          {errors.license_expiry && <p role="alert" className="text-xs font-semibold text-red-700">{errors.license_expiry}</p>}
        </div>
        <FileUploadZone label="New driver's license (optional)" file={file} onChange={(f) => { setFile(f); setErrors((x) => ({ ...x, drivers_license_image: '' })); }} onClear={() => setFile(null)} error={errors.drivers_license_image} />
        {formError && <p role="alert" className="text-xs font-semibold text-red-700">{formError}</p>}
        <button type="submit" disabled={saving || !dirty} className={SUBMIT}>
          {saving && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save license'}
        </button>
      </form>
    </section>
  );
}
