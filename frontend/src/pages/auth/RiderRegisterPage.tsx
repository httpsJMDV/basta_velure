import { useState, useEffect } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Input from '../../components/ui/Input';
import FileUploadZone from '../../components/ui/FileUploadZone';
import {
  ApplyLayout, ApplySection, ApplyRail, SignInRequired, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus,
} from '../../components/apply/ApplyKit';
import { applyRiderApi, getPublicApprovedHubsApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { PublicApprovedHub, RiderVehicleType } from '../../types';
import { Bike, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2, RefreshCw, Search, Mail, Package, Warehouse } from 'lucide-react';
import { DELIVERY_FEE } from '../../utils/shipping';
import axios from 'axios';

const VEHICLES: { value: RiderVehicleType; label: string; sub: string }[] = [
  { value: 'Motorcycle', label: 'Motorcycle', sub: 'Two-wheeler' },
  { value: 'Tricycle', label: 'Tricycle', sub: 'Three-wheeler' },
  { value: 'Car', label: 'Car', sub: 'Sedan or hatchback' },
  { value: 'Van', label: 'Van', sub: 'MPV or L300' },
];

// From every delivery fee: 20% for the pickup leg, 65% for the delivery leg (config/shipping.php).
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
const PICKUP_PAY = peso(DELIVERY_FEE * 0.2);
const DELIVERY_PAY = peso(DELIVERY_FEE * 0.65);

function ageOf(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <ApplyLayout
      icon={Bike}
      kicker="Become a delivery rider"
      title="Deliver with Loved-IT"
      intro="Pick up parcels from shops near you, bring them to your hub, and deliver them to buyers. You apply from your Loved-IT account to an approved logistics hub."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

export default function RiderRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const [reapplying, setReapplying] = useState(false);

  const [hubs, setHubs] = useState<PublicApprovedHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [hubSearch, setHubSearch] = useState('');
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [hubLoadError, setHubLoadError] = useState<string | null>(null);

  const [vehicleType, setVehicleType] = useState<RiderVehicleType | ''>('Motorcycle');
  const [plateNumber, setPlateNumber] = useState('');
  const [orCrImage, setOrCrImage] = useState<File | null>(null);
  const [driversLicenseImage, setDriversLicenseImage] = useState<File | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadHubs() {
    setLoadingHubs(true);
    setHubLoadError(null);
    getPublicApprovedHubsApi({ limit: 100 })
      .then((data) => setHubs(data || []))
      .catch(() => setHubLoadError('The list of hubs could not be loaded. Try again.'))
      .finally(() => setLoadingHubs(false));
  }

  useEffect(() => { loadHubs(); }, []);

  if (loading) return <Shell><p className="text-sm text-stone-400">Loading…</p></Shell>;
  if (!user) return <Shell><SignInRequired what="rider" /></Shell>;

  // ── Status routing: an application in force replaces the form ──
  const rider = user.rider;
  if (rider && !(rider.status === 'DISAPPROVED' && reapplying)) {
    if (rider.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`Waiting for ${rider.hub_name ?? 'the hub'}`}
            note="The hub you chose reviews rider applications. You can keep shopping meanwhile."
            steps={[
              { icon: ShieldCheck, label: 'Hub reviews your documents', sub: 'OR/CR and driver’s license' },
              { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
              { icon: Package, label: 'Start delivering', sub: 'Pickups and deliveries in your areas' },
            ]}
          />
        </Shell>
      );
    }
    if (rider.status === 'ACTIVE') {
      return <Shell><ApprovedStatus title="You are an approved rider" text={`You deliver for ${rider.hub_name ?? 'your hub'}.`} to="/rider/dashboard" cta="Open the rider app" /></Shell>;
    }
    return <Shell><RejectedStatus who="logistics hub" reason={rider.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
  }

  if (user.role !== 'buyer') {
    return <Shell><BlockedStatus title="This account can't apply" text="Rider applications are made from a buyer account. Sign in with your buyer account to apply." /></Shell>;
  }
  if (user.sorting_center && user.sorting_center.status !== 'REJECTED') {
    return <Shell><BlockedStatus title="Hub owners can't be riders" text="This account runs a logistics hub (or has a hub application in review), so it cannot also deliver as a rider." /></Shell>;
  }
  const age = ageOf(user.date_of_birth);
  if (age === null || age < 18) {
    return (
      <Shell>
        <BlockedStatus
          title={age === null ? 'Add your birthday first' : 'Riders must be 18 or older'}
          text={age === null ? 'Rider applicants must be at least 18. Add your birthday to your account, then come back to apply.' : 'Rider applicants must be at least 18 years old.'}
          action={age === null ? { to: '/complete-profile', label: 'Complete your profile' } : undefined}
        />
      </Shell>
    );
  }

  const filteredHubs = hubs.filter((h) => {
    if (!hubSearch.trim()) return true;
    const term = hubSearch.toLowerCase();
    return h.hub_name.toLowerCase().includes(term) || h.address_city.toLowerCase().includes(term) || h.address_province.toLowerCase().includes(term);
  });
  const selectedHubObj = hubs.find((h) => String(h.id) === selectedHubId);
  const plateOk = /^[A-Za-z0-9\s-]{2,20}$/.test(plateNumber.trim());

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!selectedHubId) errs.sorting_center_id = 'Pick the hub you want to ride for.';
    if (!vehicleType) errs.vehicle_type = 'Pick your vehicle type.';
    if (!plateNumber.trim()) errs.plate_number = 'Enter your plate number.';
    else if (!/^[A-Za-z0-9\s-]+$/.test(plateNumber.trim())) errs.plate_number = 'Use letters, numbers, spaces and dashes only.';
    else if (plateNumber.trim().length > 20) errs.plate_number = 'A plate number has at most 20 characters.';
    if (!orCrImage) errs.or_cr_image = 'Upload your OR/CR.';
    if (!driversLicenseImage) errs.drivers_license_image = "Upload your driver's license.";
    if (!agreeTerms) errs.terms = 'Confirm that your details and documents are genuine.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) {
      setServerError('A few things still need your attention. They are marked below.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('sorting_center_id', selectedHubId);
      formData.append('vehicle_type', vehicleType);
      formData.append('plate_number', plateNumber.trim().toUpperCase());
      if (orCrImage) formData.append('or_cr_image', orCrImage);
      if (driversLicenseImage) formData.append('drivers_license_image', driversLicenseImage);

      const res = await applyRiderApi(formData);
      setReapplying(false);
      setUser(res.data.user); // the status screen takes over
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 422 && err.response.data?.errors) {
          const rawErrors = err.response.data.errors as Record<string, string[]>;
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(rawErrors)) mapped[key] = msgs[0];
          setErrors(mapped);
          setServerError(rawErrors.account?.[0] ?? 'A few things still need your attention. They are marked below.');
        } else if (err.response.status === 429) {
          setServerError('Too many attempts. Wait a moment and try again.');
        } else {
          setServerError(err.response.data?.message || 'The application was not sent. Try again.');
        }
      } else {
        setServerError('No connection. Check your internet and try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const rail = (
    <ApplyRail
      checklist={[
        { label: 'Hub to ride for', done: Boolean(selectedHubId) },
        { label: 'Vehicle and plate number', done: Boolean(vehicleType) && plateOk },
        { label: 'OR/CR uploaded', done: Boolean(orCrImage) },
        { label: "Driver's license uploaded", done: Boolean(driversLicenseImage) },
        { label: 'Details confirmed', done: agreeTerms },
      ]}
      facts={[
        { label: 'Pickup leg', value: `${PICKUP_PAY} per parcel` },
        { label: 'Delivery leg', value: `${DELIVERY_PAY} per parcel` },
        { label: 'Your areas', value: 'Set by your hub' },
      ]}
      approver="The hub you pick checks your documents and approves you. The decision goes to the email on your account."
      footnote={<>Pay is a share of the flat {peso(DELIVERY_FEE)} delivery fee of each parcel.</>}
    />
  );

  return (
    <Shell aside={rail}>
      <ApplyingAs user={user} />

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200" role="alert">
          <AlertCircle className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <p className="text-[13px] font-medium text-red-800">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ApplySection
          n={1}
          title="Your hub"
          hint="Where you collect parcels and get your delivery areas."
          action={
            <button type="button" onClick={loadHubs} disabled={loadingHubs} className="h-8 px-3 rounded-full text-[12px] font-semibold text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center gap-1.5" title="Refresh the list">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHubs ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Refresh</span>
            </button>
          }
        >
          {hubLoadError ? (
            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <p className="text-[13px] text-amber-900">{hubLoadError}</p>
              <button type="button" onClick={loadHubs} className="text-[12px] font-semibold text-amber-900 hover:underline shrink-0">Retry</button>
            </div>
          ) : loadingHubs ? (
            <div className="grid sm:grid-cols-2 gap-2.5">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] rounded-2xl bg-stone-100 animate-pulse" />)}</div>
          ) : hubs.length === 0 ? (
            <p className="p-4 rounded-2xl bg-stone-50 text-[13px] text-stone-600">No hubs are taking riders yet. Check back soon.</p>
          ) : (
            <>
              <label className="relative block mb-3">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input type="text" value={hubSearch} onChange={(e) => setHubSearch(e.target.value)} placeholder="Search by hub name, city or province" aria-label="Search hubs"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-stone-50 border border-stone-200 text-[14px] outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-brand-red/10" />
              </label>
              <div className="grid sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1" role="radiogroup" aria-label="Hub">
                {filteredHubs.map((hub) => {
                  const on = selectedHubId === String(hub.id);
                  return (
                    <button type="button" key={hub.id} role="radio" aria-checked={on}
                      onClick={() => { setSelectedHubId(String(hub.id)); setErrors((p) => ({ ...p, sorting_center_id: '' })); }}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-[1.5px] text-left transition-colors ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-brand-red text-white' : 'bg-stone-100 text-stone-500'}`}><Warehouse className="w-4 h-4" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold text-stone-900 truncate">{hub.hub_name}</span>
                        <span className="block text-[12px] text-stone-500 truncate">{hub.address_city}, {hub.address_province}</span>
                      </span>
                      {on && <CheckCircle2 className="w-4 h-4 text-brand-red shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {filteredHubs.length === 0 && <p className="py-4 text-[13px] text-center text-stone-500">No hub matches &ldquo;{hubSearch}&rdquo;.</p>}
              {selectedHubObj && <p className="mt-3 text-[12.5px] text-stone-600">You will ride for <span className="font-semibold text-stone-900">{selectedHubObj.hub_name}</span>.</p>}
            </>
          )}
          {errors.sorting_center_id && <p className="mt-2 text-[12.5px] text-brand-red" role="alert">{errors.sorting_center_id}</p>}
        </ApplySection>

        <ApplySection n={2} title="Your vehicle" hint="What you will use for pickups and deliveries.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="radiogroup" aria-label="Vehicle type">
            {VEHICLES.map((v) => {
              const on = vehicleType === v.value;
              return (
                <button key={v.value} type="button" role="radio" aria-checked={on} onClick={() => { setVehicleType(v.value); setErrors((p) => ({ ...p, vehicle_type: '' })); }}
                  className={`p-3.5 rounded-2xl border-[1.5px] text-left transition-colors ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                  <span className="block text-[14px] font-semibold text-stone-900">{v.label}</span>
                  <span className="block text-[12px] text-stone-500">{v.sub}</span>
                </button>
              );
            })}
          </div>
          {errors.vehicle_type && <p className="mt-2 text-[12.5px] text-brand-red">{errors.vehicle_type}</p>}
          <div className="mt-4 sm:max-w-xs">
            <Input label="Plate number" placeholder="ABC 1234" value={plateNumber}
              onChange={(e) => { setPlateNumber(e.target.value.toUpperCase()); if (errors.plate_number) setErrors((p) => ({ ...p, plate_number: '' })); }}
              error={errors.plate_number} required />
            <p className="mt-1 text-[12px] text-stone-400">Letters, numbers and dashes, as on the plate.</p>
          </div>
        </ApplySection>

        <ApplySection n={3} title="Your documents" hint="Clear photos or scans, up to 5 MB each.">
          <div className="space-y-5">
            <FileUploadZone label="Official Receipt and Certificate of Registration (OR/CR)" file={orCrImage} onChange={setOrCrImage} onClear={() => setOrCrImage(null)}
              error={errors.or_cr_image} hint="The LTO OR/CR of the vehicle above (JPG, PNG or PDF)" required />
            <FileUploadZone label="Driver's license" file={driversLicenseImage} onChange={setDriversLicenseImage} onClear={() => setDriversLicenseImage(null)}
              error={errors.drivers_license_image} hint="A valid LTO driver's license (JPG, PNG or PDF)" required />
          </div>
        </ApplySection>

        <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreeTerms} onChange={(e) => { setAgreeTerms(e.target.checked); if (errors.terms) setErrors((p) => ({ ...p, terms: '' })); }}
              className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-brand-red" />
            <span className="text-[13px] leading-relaxed text-stone-700">
              My vehicle details and documents are genuine. I understand the hub I picked reviews this application and sends its decision to my account email.
            </span>
          </label>
          {errors.terms && <p className="text-[12.5px] text-brand-red">{errors.terms}</p>}
          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending your application…</> : <>Send rider application <ArrowRight className="w-4 h-4" /></>}
          </button>
        </section>
      </form>
    </Shell>
  );
}
