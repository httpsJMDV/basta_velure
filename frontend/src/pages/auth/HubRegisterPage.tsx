import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import LovedItLogo from '../../components/LovedItLogo';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import CoverageBarangaySelector from '../../components/logistics/CoverageBarangaySelector';
import type { SelectedBarangay } from '../../components/logistics/CoverageBarangaySelector';
import {
  SignInRequired, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus,
} from '../../components/apply/ApplyKit';
import { applyHubApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { Building2, FileText, AlertCircle, Truck, MapPin, ShieldCheck, Mail, Warehouse } from 'lucide-react';
import axios from 'axios';
import type { ReactNode } from 'react';

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-white md:flex-row">
      <div className="flex flex-col w-full px-6 py-10 overflow-y-auto md:w-1/2 sm:px-12 lg:px-16">
        <div className="w-full max-w-md mx-auto space-y-6">
          <Link to="/" className="inline-block group">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-12 sm:h-14 object-contain group-hover:opacity-95 transition-opacity" />
          </Link>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold border rounded-full bg-brand-red/10 border-brand-red/20 text-brand-red">
              <Truck className="w-3.5 h-3.5" />
              <span>Logistics &amp; Sorting Center Network</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-brand-black">Run a Sorting Hub</h1>
            <p className="text-xs text-gray-500 sm:text-sm">
              Apply from your Loved-IT account to operate an authorized sorting center and route parcels in your area.
            </p>
          </div>
          {children}
        </div>
      </div>

      <div className="sticky top-0 hidden h-screen overflow-hidden md:block md:w-1/2 bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80"
          alt="Loved-IT Regional Sorting Center and Logistics Hubs"
          className="absolute inset-0 object-cover w-full h-full opacity-65"
        />
        <div className="absolute inset-0 flex items-end p-12 bg-gradient-to-t from-brand-black via-brand-black/60 to-transparent">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 text-xs font-bold tracking-wider text-white uppercase rounded-full bg-brand-red">Sorting Center Network</span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Lead Regional Sorting in the Philippines</h2>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              Coordinate parcel inbound intake, PSGC jurisdiction sorting, and express delivery dispatch for Loved-IT merchants and buyers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HubRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const [reapplying, setReapplying] = useState(false);

  const [hubName, setHubName] = useState('');
  const [dtiPermit, setDtiPermit] = useState<File | null>(null);
  const [hubAddress, setHubAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [coverageBarangays, setCoverageBarangays] = useState<SelectedBarangay[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Shell><p className="text-sm text-gray-400">Loading…</p></Shell>;
  if (!user) return <Shell><SignInRequired what="hub operator" /></Shell>;

  // ── Status routing: an application in force replaces the form ──
  const hub = user.sorting_center;
  if (hub && !(hub.status === 'REJECTED' && reapplying)) {
    if (hub.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`We're reviewing ${hub.hub_name}`}
            steps={[
              { icon: ShieldCheck, label: 'Permit and coverage check', sub: 'An admin reviews your DTI permit and area' },
              { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
              { icon: Warehouse, label: 'Open your hub dashboard', sub: 'Receive, sort and dispatch parcels' },
            ]}
          />
        </Shell>
      );
    }
    if (hub.status === 'APPROVED') {
      return <Shell><ApprovedStatus title="Your hub is approved!" text={`${hub.hub_name} is live on the logistics network.`} to="/hub/dashboard" cta="Go to Hub Dashboard" /></Shell>;
    }
    if (hub.status === 'REJECTED') {
      return <Shell><RejectedStatus who="platform administration" reason={hub.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
    }
    return <Shell><BlockedStatus title="Hub suspended" text="Your sorting center has been suspended by platform administration. Please contact support for assistance." /></Shell>;
  }

  if (user.role !== 'buyer') {
    return <Shell><BlockedStatus title="This account can't run a hub" text="Hub applications are made from a buyer account. Sign in with your buyer account to apply." /></Shell>;
  }
  if (user.rider && user.rider.status !== 'DISAPPROVED') {
    return <Shell><BlockedStatus title="Couriers can't run a hub" text="This account is a courier (or has a courier application in review), so it cannot also run a logistics hub." /></Shell>;
  }
  if (!user.government_id_type) {
    return (
      <Shell>
        <BlockedStatus
          title="Add your ID first"
          text="The hub application uses the government ID on your account. Finish your profile with a valid ID, then come back to apply."
          action={{ to: '/complete-profile', label: 'Complete your profile' }}
        />
      </Shell>
    );
  }

  // ── Form ──
  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!hubName.trim()) errs.hub_name = 'Hub or business name is required.';
    else if (hubName.length > 150) errs.hub_name = 'Hub name must not exceed 150 characters.';
    if (!hubAddress.province && !hubAddress.provinceName) errs.address_province = 'Province is required for hub address.';
    if (!hubAddress.city && !hubAddress.cityName) errs.address_city = 'City or municipality is required for hub address.';
    if (!hubAddress.barangay && !hubAddress.barangayName) errs.address_barangay = 'Barangay is required for hub address.';
    if (!hubAddress.street.trim()) errs.address_street = 'Street or building address is required.';
    if (!dtiPermit) errs.dti_permit = 'Official DTI registration or Mayor\'s Permit document is required.';
    if (coverageBarangays.length === 0) errs.coverage_barangays = 'At least one coverage barangay must be assigned to this hub.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('hub_name', hubName.trim());
      formData.append('address_province', hubAddress.provinceName || hubAddress.province);
      formData.append('address_city', hubAddress.cityName || hubAddress.city);
      formData.append('address_barangay', hubAddress.barangayName || hubAddress.barangay);
      formData.append('address_street', hubAddress.street.trim());
      if (hubAddress.province) formData.append('psgc_province_code', hubAddress.province);
      if (hubAddress.city) formData.append('psgc_city_code', hubAddress.city);
      if (hubAddress.barangay) formData.append('psgc_barangay_code', hubAddress.barangay);
      if (dtiPermit) formData.append('dti_permit', dtiPermit);
      coverageBarangays.forEach((b) => formData.append('coverage_barangays[]', b.code));

      const response = await applyHubApi(formData);
      setReapplying(false);
      setUser(response.data.user); // the status screen takes over
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 422) {
          const apiErrors = err.response.data?.errors as Record<string, string[]> | undefined;
          if (apiErrors) {
            const mapped: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(apiErrors)) mapped[key] = Array.isArray(msgs) ? msgs[0] : String(msgs);
            const coverageErrKey = Object.keys(apiErrors).find((k) => k.startsWith('coverage_barangays'));
            if (coverageErrKey && !mapped.coverage_barangays) mapped.coverage_barangays = apiErrors[coverageErrKey][0];
            setErrors((prev) => ({ ...prev, ...mapped }));
          }
          setServerError(apiErrors?.account?.[0] ?? err.response.data?.message ?? 'Please review and resolve the highlighted errors in the form.');
        } else if (err.response.status === 429) {
          setServerError('Too many attempts. Please wait a few moments and try again.');
        } else {
          setServerError(err.response.data?.message || 'An error occurred while submitting your hub application. Please try again.');
        }
      } else {
        setServerError('Network error. Please check your internet connection and try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <ApplyingAs user={user} />

      {serverError && (
        <div className="flex items-start gap-3 p-4 text-xs text-red-700 border border-red-200 shadow-xs rounded-xl bg-red-50" role="alert">
          <AlertCircle className="w-4 h-4 text-brand-red shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Application could not be submitted</p>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-7">
        {/* ── Hub details & PSGC address ── */}
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Building2 className="w-4 h-4 text-brand-red" />
            <h2 className="text-xs font-bold tracking-wider text-gray-700 uppercase">Sorting Center Information</h2>
          </div>

          <Input
            label="Registered Business / Hub Name"
            required
            value={hubName}
            onChange={(e) => { setHubName(e.target.value); if (errors.hub_name) setErrors((prev) => ({ ...prev, hub_name: '' })); }}
            placeholder="e.g. Laguna Central Logistics Hub"
            error={errors.hub_name}
            disabled={submitting}
          />

          <FileUploadZone
            label="DTI Registration / Mayor's Permit"
            required
            hint="DTI, SEC, or LGU Mayor's Permit — JPG, PNG, PDF max 5MB"
            file={dtiPermit}
            onChange={(f) => { setDtiPermit(f); if (errors.dti_permit) setErrors((prev) => ({ ...prev, dti_permit: '' })); }}
            onClear={() => setDtiPermit(null)}
            error={errors.dti_permit}
            disabled={submitting}
          />

          <div className="pt-1 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-brand-red" />
              <span>Physical Hub Facility Location</span>
            </div>
            <PsgcCascadingAddress
              value={hubAddress}
              onChange={(newAddr) => {
                setHubAddress(newAddr);
                setErrors((prev) => ({ ...prev, address_province: '', address_city: '', address_barangay: '', address_street: '' }));
              }}
              errors={{ province: errors.address_province, city: errors.address_city, barangay: errors.address_barangay, street: errors.address_street }}
              disabled={submitting}
            />
          </div>
        </div>

        {/* ── Coverage area ── */}
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <FileText className="w-4 h-4 text-brand-red" />
            <h2 className="text-xs font-bold tracking-wider text-gray-700 uppercase">Service Area Coverage</h2>
          </div>
          <CoverageBarangaySelector
            selected={coverageBarangays}
            onChange={(items) => { setCoverageBarangays(items); if (errors.coverage_barangays) setErrors((prev) => ({ ...prev, coverage_barangays: '' })); }}
            error={errors.coverage_barangays}
            disabled={submitting}
          />
        </div>

        <div className="rounded-xl bg-amber-50/80 border border-amber-200/90 p-3.5 text-xs text-amber-800 leading-relaxed space-y-1">
          <p className="font-semibold text-amber-900">Administrative Vetting Notice:</p>
          <p>
            An admin checks your DTI permit, your coverage area and the ID on your account. You can keep shopping while the
            application is <strong>PENDING</strong>; the hub dashboard opens once it is approved.
          </p>
        </div>

        <Button type="submit" loading={submitting} disabled={submitting} className="w-full min-h-[46px] text-sm font-bold shadow-sm">
          {submitting ? 'Submitting Application…' : 'Submit Hub Application'}
        </Button>
      </form>
    </Shell>
  );
}
