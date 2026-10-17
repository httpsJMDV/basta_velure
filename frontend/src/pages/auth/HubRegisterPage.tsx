import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import Input from '../../components/ui/Input';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import CoverageBarangaySelector from '../../components/logistics/CoverageBarangaySelector';
import type { SelectedBarangay } from '../../components/logistics/CoverageBarangaySelector';
import {
  ApplyLayout, ApplySection, ApplyRail, SignInRequired, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus,
} from '../../components/apply/ApplyKit';
import { DELIVERY_FEE } from '../../utils/shipping';
import { applyHubApi, getCouriersApi } from '../../api/client';
import type { CourierOption } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { AlertCircle, MapPin, ShieldCheck, Mail, Warehouse, CheckCircle2, ArrowRight } from 'lucide-react';
import axios from 'axios';
import type { ReactNode } from 'react';

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};

// The hub share of each delivery fee (15%, config/shipping.php).
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
const HUB_PAY = peso(DELIVERY_FEE * 0.15);

function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <ApplyLayout
      icon={Warehouse}
      kicker="Run a logistics hub"
      title="Run a sorting hub"
      intro="Receive parcels from pickup riders, sort them by barangay, and send your riders out for the last mile. You apply from your Loved-IT account to a partner courier company."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

export default function HubRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const [reapplying, setReapplying] = useState(false);

  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [courierId, setCourierId] = useState<number | null>(null);
  const [hubName, setHubName] = useState('');
  const [dtiPermit, setDtiPermit] = useState<File | null>(null);
  const [hubAddress, setHubAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [coverageBarangays, setCoverageBarangays] = useState<SelectedBarangay[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The courier companies a hub can join; with only one, it is chosen for the applicant.
  useEffect(() => {
    getCouriersApi()
      .then((list) => { setCouriers(list); if (list.length === 1) setCourierId(list[0].id); })
      .catch(() => setCouriers([]));
  }, []);

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
              { icon: ShieldCheck, label: 'Permit and coverage check', sub: 'Your courier company reviews your permit and area' },
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
    if (!courierId) errs.logistics_company_id = 'Choose the courier company your hub will join.';
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
      if (courierId) formData.append('logistics_company_id', String(courierId));
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

  const rail = (
    <ApplyRail
      checklist={[
        { label: 'Courier company to join', done: Boolean(courierId) },
        { label: 'Hub name', done: Boolean(hubName.trim()) },
        { label: 'DTI or business permit', done: Boolean(dtiPermit) },
        { label: 'Hub address', done: Boolean((hubAddress.barangay || hubAddress.barangayName) && hubAddress.street.trim()) },
        { label: 'Barangays you cover', done: coverageBarangays.length > 0 },
      ]}
      facts={[
        { label: 'Hub share', value: `${HUB_PAY} per parcel` },
        { label: 'Coverage picked', value: `${coverageBarangays.length} barangay${coverageBarangays.length === 1 ? '' : 's'}` },
      ]}
      approver="The courier company you join checks your permit, your area and the ID on your account. Once approved, you approve the riders who pick your hub."
      footnote={<>The hub share is 15% of the flat {peso(DELIVERY_FEE)} delivery fee of each parcel you sort.</>}
    />
  );

  return (
    <Shell aside={rail}>
      <ApplyingAs user={user} />

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200" role="alert">
          <AlertCircle className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-800">The application was not sent</p>
            <p className="text-[13px] text-red-800">{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <ApplySection n={1} title="Courier company" hint="Your hub sorts and delivers parcels for this courier, and its team reviews your application.">
          {!couriers ? (
            <div className="grid sm:grid-cols-2 gap-2.5">{[1, 2].map((i) => <div key={i} className="h-[68px] rounded-2xl bg-stone-100 animate-pulse" />)}</div>
          ) : couriers.length === 0 ? (
            <p className="p-4 rounded-2xl bg-stone-50 text-[13px] text-stone-600">No courier company is taking hubs right now.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Courier company">
              {couriers.map((c) => {
                const on = courierId === c.id;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on}
                    onClick={() => { setCourierId(c.id); setErrors((p) => ({ ...p, logistics_company_id: '' })); }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-[1.5px] text-left transition-colors ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                    <span className="flex items-center justify-center w-11 h-11 overflow-hidden text-[11px] font-black text-white rounded-xl bg-stone-900 shrink-0">
                      {c.logo_url ? <img src={c.logo_url} alt="" className="object-cover w-full h-full" /> : c.code}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-stone-900 truncate">{c.name}</span>
                      <span className="block text-[12px] text-stone-500">{c.hubs_count} hub{c.hubs_count === 1 ? '' : 's'} in its network</span>
                    </span>
                    {on && <CheckCircle2 className="w-4 h-4 text-brand-red shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          {errors.logistics_company_id && <p className="mt-2 text-[12.5px] text-brand-red" role="alert">{errors.logistics_company_id}</p>}
        </ApplySection>

        <ApplySection n={2} title="Your hub" hint="The registered name, permit and where the facility is.">
          <div className="space-y-5">
            <Input label="Registered business or hub name" required value={hubName}
              onChange={(e) => { setHubName(e.target.value); if (errors.hub_name) setErrors((prev) => ({ ...prev, hub_name: '' })); }}
              placeholder="For example: Laguna Central Logistics Hub" error={errors.hub_name} disabled={submitting} />
            <FileUploadZone label="DTI registration or Mayor's permit" required hint="DTI, SEC or Mayor's permit (JPG, PNG or PDF, up to 5 MB)"
              file={dtiPermit} onChange={(f) => { setDtiPermit(f); if (errors.dti_permit) setErrors((prev) => ({ ...prev, dti_permit: '' })); }}
              onClear={() => setDtiPermit(null)} error={errors.dti_permit} disabled={submitting} />
            <div>
              <p className="flex items-center gap-1.5 mb-2 text-[13px] font-semibold text-stone-800"><MapPin className="w-4 h-4 text-brand-red" /> Facility address</p>
              <PsgcCascadingAddress
                value={hubAddress}
                onChange={(newAddr) => { setHubAddress(newAddr); setErrors((prev) => ({ ...prev, address_province: '', address_city: '', address_barangay: '', address_street: '' })); }}
                errors={{ province: errors.address_province, city: errors.address_city, barangay: errors.address_barangay, street: errors.address_street }}
                disabled={submitting}
              />
            </div>
          </div>
        </ApplySection>

        <ApplySection n={3} title="Where you deliver" hint="Pick the barangays your riders cover. Parcels for these barangays come to your hub.">
          <CoverageBarangaySelector
            selected={coverageBarangays}
            onChange={(items) => { setCoverageBarangays(items); if (errors.coverage_barangays) setErrors((prev) => ({ ...prev, coverage_barangays: '' })); }}
            error={errors.coverage_barangays}
            disabled={submitting}
          />
        </ApplySection>

        <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6 space-y-4">
          <p className="text-[13px] leading-relaxed text-stone-600">
            While the application is in review you can keep shopping. The hub dashboard opens as soon as your courier company approves it.
          </p>
          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {submitting ? 'Sending your application…' : <>Send hub application <ArrowRight className="w-4 h-4" /></>}
          </button>
        </section>
      </form>
    </Shell>
  );
}
