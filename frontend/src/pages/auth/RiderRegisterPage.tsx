import { useState, useEffect } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import LovedItLogo from '../../components/LovedItLogo';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import FileUploadZone from '../../components/ui/FileUploadZone';
import {
  SignInRequired, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus,
} from '../../components/apply/ApplyKit';
import { applyRiderApi, getPublicApprovedHubsApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { PublicApprovedHub, RiderVehicleType } from '../../types';
import {
  Truck, Bike, Building2, AlertCircle, ArrowRight, ShieldCheck, CheckCircle2, RefreshCw, Search, Mail, Package,
} from 'lucide-react';
import axios from 'axios';

const VEHICLE_OPTIONS: { value: RiderVehicleType; label: string }[] = [
  { value: 'Motorcycle', label: 'Motorcycle (Two-wheeler)' },
  { value: 'Tricycle',   label: 'Tricycle / Three-wheeler' },
  { value: 'Car',        label: 'Car / Sedan / Hatchback' },
  { value: 'Van',        label: 'Delivery Van / MPV / L300' },
];

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

function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col justify-between min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between h-16 max-w-5xl px-4 mx-auto sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-block group"><LovedItLogo size="sm" /></Link>
            <div className="hidden w-px h-5 bg-gray-200 sm:block" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-red bg-rose-50 px-2.5 py-1 rounded-full">
              <Bike className="w-3.5 h-3.5" />
              <span>Courier Application</span>
            </div>
          </div>
        </div>
      </header>
      <main className={`w-full mx-auto px-4 sm:px-6 py-10 flex-grow ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Deliver with Loved-IT</h1>
          <p className="mt-2 text-sm text-gray-600">
            Earn flexibly delivering parcels in your community. Apply from your Loved-IT account to an approved logistics hub.
          </p>
        </div>
        {children}
      </main>
      <footer className="py-6 text-xs text-center text-gray-400 bg-white border-t border-gray-200">
        &copy; {new Date().getFullYear()} Loved-IT Philippines. All rights reserved.
      </footer>
    </div>
  );
}

function SectionHead({ n, icon: Icon, title, sub, action }: { n: number; icon: React.ElementType; title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-4 mb-6 border-b border-gray-100">
      <div className="flex items-center justify-center text-sm font-bold w-9 h-9 rounded-xl bg-rose-50 text-brand-red">{n}</div>
      <div className="flex-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><Icon className="w-4 h-4 text-gray-400" />{title}</h2>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export default function RiderRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const [reapplying, setReapplying] = useState(false);

  // Hub Selection State
  const [hubs, setHubs] = useState<PublicApprovedHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [hubSearch, setHubSearch] = useState('');
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [hubLoadError, setHubLoadError] = useState<string | null>(null);

  // Vehicle Details
  const [vehicleType, setVehicleType] = useState<RiderVehicleType | ''>('Motorcycle');
  const [plateNumber, setPlateNumber] = useState('');

  // Documents
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
      .catch(() => setHubLoadError('Unable to load logistics hub directory. Please try again.'))
      .finally(() => setLoadingHubs(false));
  }

  useEffect(() => { loadHubs(); }, []);

  if (loading) return <Shell><p className="text-sm text-gray-400">Loading…</p></Shell>;
  if (!user) return <Shell><SignInRequired what="courier" /></Shell>;

  // ── Status routing: an application in force replaces the form ──
  const rider = user.rider;
  if (rider && !(rider.status === 'DISAPPROVED' && reapplying)) {
    if (rider.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`Waiting for ${rider.hub_name ?? 'the hub'}`}
            note="The hub you chose reviews courier applications. You can keep shopping meanwhile."
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
      return <Shell><ApprovedStatus title="You're an approved courier!" text={`You deliver for ${rider.hub_name ?? 'your hub'}.`} to="/rider/dashboard" cta="Go to Courier Dashboard" /></Shell>;
    }
    return <Shell><RejectedStatus who="logistics hub" reason={rider.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
  }

  if (user.role !== 'buyer') {
    return <Shell><BlockedStatus title="This account can't apply" text="Courier applications are made from a buyer account. Sign in with your buyer account to apply." /></Shell>;
  }
  if (user.sorting_center && user.sorting_center.status !== 'REJECTED') {
    return <Shell><BlockedStatus title="Hub owners can't be couriers" text="This account runs a logistics hub (or has a hub application in review), so it cannot also deliver as a courier." /></Shell>;
  }
  const age = ageOf(user.date_of_birth);
  if (age === null || age < 18) {
    return (
      <Shell>
        <BlockedStatus
          title={age === null ? 'Add your birthday first' : 'Couriers must be 18 or older'}
          text={age === null ? 'Courier applicants must be at least 18. Add your birthday to your account, then come back to apply.' : 'Courier applicants must be at least 18 years old.'}
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

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!selectedHubId) errs.sorting_center_id = 'Please select the logistics hub you wish to apply to.';
    if (!vehicleType) errs.vehicle_type = 'Please select your vehicle type.';
    if (!plateNumber.trim()) errs.plate_number = 'Vehicle plate number is required.';
    else if (!/^[A-Za-z0-9\s-]+$/.test(plateNumber.trim())) errs.plate_number = 'Plate number contains invalid characters.';
    else if (plateNumber.trim().length > 20) errs.plate_number = 'Plate number must not exceed 20 characters.';
    if (!orCrImage) errs.or_cr_image = 'OR/CR document is required.';
    if (!driversLicenseImage) errs.drivers_license_image = "Driver's license is required.";
    if (!agreeTerms) errs.terms = 'Please confirm that your details and documents are genuine.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) {
      setServerError('Please review the highlighted fields below.');
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
          setServerError(rawErrors.account?.[0] ?? 'Please review the highlighted fields below.');
        } else if (err.response.status === 429) {
          setServerError('Too many attempts. Please wait a few moments and try again.');
        } else {
          setServerError(err.response.data?.message || 'Courier application failed. Please try again.');
        }
      } else {
        setServerError('A network error occurred. Please check your internet connection.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell wide>
      <div className="mb-6"><ApplyingAs user={user} /></div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 mb-6 border border-red-200 bg-red-50 rounded-xl" role="alert">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm font-medium text-red-700">{serverError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* ─── 1: Logistics Hub Selection ─── */}
        <section className="p-6 bg-white border border-gray-200 shadow-sm rounded-2xl sm:p-8">
          <SectionHead
            n={1}
            icon={Building2}
            title="Logistics / Sorting Center Hub"
            sub="The approved hub where you will report for parcel collection and delivery assignments"
            action={
              <button type="button" onClick={loadHubs} disabled={loadingHubs} className="flex items-center gap-1 p-1 text-xs text-gray-400 transition-colors hover:text-gray-700" title="Refresh hubs list">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHubs ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            }
          />

          {hubLoadError ? (
            <div className="flex items-start justify-between gap-3 p-4 border bg-amber-50 border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">{hubLoadError}</p>
              </div>
              <button type="button" onClick={loadHubs} className="text-xs font-semibold text-amber-900 hover:underline shrink-0">Retry</button>
            </div>
          ) : loadingHubs ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-center text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-red" />
              <span>Loading approved logistics hubs…</span>
            </div>
          ) : hubs.length === 0 ? (
            <div className="p-4 text-center border border-gray-200 bg-gray-50 rounded-xl">
              <p className="text-sm font-semibold text-gray-700">No Approved Logistics Hubs Found</p>
              <p className="mt-1 text-xs text-gray-500">There are no approved sorting centers accepting couriers yet. Please check back soon.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute w-4 h-4 text-gray-400 pointer-events-none left-3 top-3" />
                <input
                  type="text"
                  value={hubSearch}
                  onChange={(e) => setHubSearch(e.target.value)}
                  placeholder="Search hub by name, city, or province..."
                  className="w-full h-10 pr-3 text-sm transition-colors border border-gray-200 outline-none pl-9 bg-gray-50 rounded-xl focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 pr-1 overflow-y-auto sm:grid-cols-2 max-h-60">
                {filteredHubs.map((hub) => {
                  const isSelected = selectedHubId === String(hub.id);
                  return (
                    <button
                      type="button"
                      key={hub.id}
                      onClick={() => { setSelectedHubId(String(hub.id)); setErrors((p) => ({ ...p, sorting_center_id: '' })); }}
                      aria-pressed={isSelected}
                      className={`p-3.5 rounded-xl border text-left transition-all ${isSelected ? 'border-brand-red bg-rose-50/60 ring-2 ring-brand-red/20 shadow-xs' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900 line-clamp-1">{hub.hub_name}</div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-red shrink-0 mt-0.5" />}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{hub.address_city}, {hub.address_province}</div>
                    </button>
                  );
                })}
              </div>
              {filteredHubs.length === 0 && <p className="py-4 text-xs text-center text-gray-400">No hubs match &ldquo;{hubSearch}&rdquo;.</p>}
              {selectedHubObj && (
                <div className="flex items-center justify-between p-3 mt-3 text-xs border bg-rose-50 border-rose-100 rounded-xl text-brand-red-dark">
                  <span className="font-medium">Selected Hub: <strong>{selectedHubObj.hub_name}</strong> ({selectedHubObj.address_city})</span>
                  <button type="button" onClick={() => setSelectedHubId('')} className="font-semibold text-brand-red hover:underline">Change</button>
                </div>
              )}
              {errors.sorting_center_id && <p className="mt-1 text-xs text-red-600">{errors.sorting_center_id}</p>}
            </div>
          )}
        </section>

        {/* ─── 2: Vehicle Information ─── */}
        <section className="p-6 bg-white border border-gray-200 shadow-sm rounded-2xl sm:p-8">
          <SectionHead n={2} icon={Truck} title="Vehicle Information" sub="The motorized vehicle you will use for pickups and deliveries" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CustomSelect
              label="Vehicle Type"
              value={vehicleType}
              onChange={(v) => setVehicleType(v as RiderVehicleType)}
              options={VEHICLE_OPTIONS}
              placeholder="Select vehicle type"
              error={errors.vehicle_type}
              required
            />
            <div>
              <Input
                label="Plate Number"
                placeholder="e.g. ABC 1234 or ND 1234"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                error={errors.plate_number}
                required
              />
              <p className="mt-1 text-[11px] text-gray-400">Motorized license plate number (alphanumeric and dashes)</p>
            </div>
          </div>
        </section>

        {/* ─── 3: Document Uploads ─── */}
        <section className="p-6 bg-white border border-gray-200 shadow-sm rounded-2xl sm:p-8">
          <SectionHead n={3} icon={ShieldCheck} title="Driving Documents" sub="Clear photos or scans of your vehicle OR/CR and driver's license (max 5MB each)" />
          <div className="space-y-6">
            <FileUploadZone
              label="Official Receipt / Certificate of Registration (OR/CR)"
              file={orCrImage}
              onChange={setOrCrImage}
              onClear={() => setOrCrImage(null)}
              error={errors.or_cr_image}
              hint="Clear scan or photo of the LTO OR/CR — max 5MB (JPG, PNG, PDF)"
              required
            />
            <FileUploadZone
              label="Driver's License"
              file={driversLicenseImage}
              onChange={setDriversLicenseImage}
              onClear={() => setDriversLicenseImage(null)}
              error={errors.drivers_license_image}
              hint="Valid LTO Driver's License — max 5MB (JPG, PNG, PDF)"
              required
            />
          </div>
        </section>

        {/* ─── Terms & Submit ─── */}
        <div className="space-y-4">
          <label className="flex items-start gap-3 p-4 transition-colors bg-white border border-gray-200 cursor-pointer rounded-2xl hover:bg-gray-50">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-red focus:ring-brand-red/40"
            />
            <span className="text-xs leading-relaxed text-gray-600">
              I declare that my vehicle details and uploaded documents are genuine and accurate. I understand that the selected
              logistics hub reviews my application, and that the decision is sent to the email on my account.
            </span>
          </label>
          {errors.terms && <p className="text-xs text-red-600">{errors.terms}</p>}

          <Button type="submit" disabled={submitting} className="flex items-center justify-center w-full h-12 gap-2 font-bold text-white shadow-sm bg-brand-red hover:bg-brand-red-dark rounded-xl">
            {submitting ? (<><RefreshCw className="w-4 h-4 animate-spin" /><span>Submitting Courier Application…</span></>) : (<><span>Submit Courier Application</span><ArrowRight className="w-4 h-4" /></>)}
          </Button>
        </div>
      </form>
    </Shell>
  );
}
