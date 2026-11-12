import { useState, useEffect } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, MapPin, ShieldCheck, Mail, Warehouse, CheckCircle2, ArrowRight } from 'lucide-react';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import PhoneInput from '../../components/ui/PhoneInput';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import CoverageBarangaySelector from '../../components/logistics/CoverageBarangaySelector';
import type { SelectedBarangay } from '../../components/logistics/CoverageBarangaySelector';
import {
  ApplyLayout, ApplySection, ApplyRail, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus, SeparateAccount,
} from '../../components/apply/ApplyKit';
import { FormErrorSummary, PasswordField, TermsConsent } from '../../components/auth/AuthFields';
import { applyHubApi, getCouriersApi } from '../../api/client';
import { registerHubApi } from '../../api/account';
import type { CourierOption } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { GOV_ID_OPTIONS, ID_REQUIRES_BACK } from '../../data/governmentIds';
import {
  compact, confirmError, dobError, emailError, fileError, firstErrors, manilaToday, nameError, passwordError, phoneError, squish,
} from '../../utils/accountRules';
import photo from '../../assets/auth/hub-register.jpg';

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};
const EMPTY_PERSON = { first_name: '', last_name: '', date_of_birth: '', phone: '', email: '', password: '', password_confirmation: '' };

// The hub share of each delivery fee (15%, config/shipping.php); the fee itself comes from the courier's rate table.
const HUB_PAY = '15% of the delivery fee';

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name', last_name: 'Last name', date_of_birth: 'Date of birth', phone: 'Mobile number', email: 'Email',
  password: 'Password', password_confirmation: 'Confirm password', government_id_type: 'ID type',
  government_id_image: 'Front of the ID', government_id_image_back: 'Back of the ID', logistics_company_id: 'Courier company',
  hub_name: 'Hub name', dti_permit: 'Permit', address_province: 'Province', address_city: 'City / Municipality',
  address_barangay: 'Barangay', address_street: 'Street address', coverage_barangays: 'Coverage', accept_terms: 'Terms', account: 'Account',
};

function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <ApplyLayout
      kicker="Run a logistics hub"
      image={photo}
      imageAlt="A forklift between shelves of parcels in a warehouse"
      title="Run a sorting hub"
      intro="Receive parcels from pickup riders, sort them by barangay, and send your riders out for the last mile. A hub has its own account for deliveries, separate from shopping."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

export default function HubRegisterPage() {
  const { user, setUser, loading, clearAuth } = useAuth();
  const navigate = useNavigate();
  const guest = !user;
  const [reapplying, setReapplying] = useState(false);

  const [person, setPerson] = useState(EMPTY_PERSON);
  const [idType, setIdType] = useState('');
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[] | null>(null);
  const [courierId, setCourierId] = useState<number | null>(null);
  const [hubName, setHubName] = useState('');
  const [dtiPermit, setDtiPermit] = useState<File | null>(null);
  const [hubAddress, setHubAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [coverageBarangays, setCoverageBarangays] = useState<SelectedBarangay[]>([]);
  const [terms, setTerms] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The courier companies a hub can join; with only one, it is chosen for the applicant.
  useEffect(() => {
    getCouriersApi()
      .then((list) => { setCouriers(list); if (list.length === 1) setCourierId(list[0].id); })
      .catch(() => setCouriers([]));
  }, []);

  if (loading) return <Shell><p className="text-sm text-stone-400">Loading…</p></Shell>;

  // ── A hub account: its application's status replaces the form ──
  const hub = user?.sorting_center;
  if (user && hub && !(hub.status === 'REJECTED' && reapplying)) {
    if (hub.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`We're reviewing ${hub.hub_name}`}
            steps={[
              { icon: ShieldCheck, label: 'Permit and coverage check', sub: 'Your courier company reviews your permit, ID and area' },
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
      return <Shell><RejectedStatus who="your courier company" reason={hub.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
    }
    return <Shell><BlockedStatus title="Hub suspended" text="Your sorting center has been suspended. Please contact your courier company or Loved-IT support." /></Shell>;
  }

  // ── A shopping (or other) account: hubs are registered with their own email ──
  if (user && !hub) {
    return <Shell><SeparateAccount what="hub" user={user} onSignOut={() => { clearAuth(); navigate('/register/hub', { replace: true }); }} /></Shell>;
  }

  const setP = (key: keyof typeof EMPTY_PERSON, value: string) => {
    setPerson((p) => ({ ...p, [key]: value }));
    clear(key);
  };
  function clear(...keys: string[]) {
    setErrors((prev) => {
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }
  const needsBack = ID_REQUIRES_BACK.has(idType);

  function validate(): Record<string, string> {
    const e: Record<string, string | undefined> = {
      logistics_company_id: courierId ? undefined : 'Choose the courier company your hub will join.',
      hub_name: (() => {
        const v = squish(hubName);
        if (!v) return 'Hub or business name is required.';
        if (v.length < 3 || v.length > 150) return 'Hub name must be 3 to 150 characters.';
        return /\p{L}.*\p{L}/su.test(v) ? undefined : 'Hub name needs at least two letters.';
      })(),
      address_province: hubAddress.province || hubAddress.provinceName ? undefined : 'Province is required.',
      address_city: hubAddress.city || hubAddress.cityName ? undefined : 'City or municipality is required.',
      address_barangay: hubAddress.barangay || hubAddress.barangayName ? undefined : 'Barangay is required.',
      address_street: squish(hubAddress.street).length >= 3 ? undefined : 'Enter the street, building or lot number.',
      dti_permit: fileError(dtiPermit, "the DTI registration or Mayor's permit", { pdf: true }),
      coverage_barangays: coverageBarangays.length ? undefined : 'Pick at least one barangay your hub covers.',
    };
    if (guest) {
      Object.assign(e, {
        first_name: nameError(person.first_name, 'First name'),
        last_name: nameError(person.last_name, 'Last name'),
        date_of_birth: dobError(person.date_of_birth),
        phone: phoneError(person.phone),
        email: emailError(person.email),
        password: passwordError(person.password),
        password_confirmation: confirmError(person.password, person.password_confirmation),
        government_id_type: idType ? undefined : 'Choose the type of government ID.',
        government_id_image: fileError(idFront, 'the front of your ID', { pdf: true }),
        government_id_image_back: needsBack ? fileError(idBack, 'the back of your ID', { pdf: true }) : undefined,
        accept_terms: terms ? undefined : 'You must accept the Terms of Use and Privacy Policy to register.',
      });
    }
    return compact(e);
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setServerError(null);
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const fd = new FormData();
    if (guest) {
      fd.append('first_name', squish(person.first_name));
      fd.append('last_name', squish(person.last_name));
      fd.append('date_of_birth', person.date_of_birth);
      fd.append('phone', person.phone.trim());
      fd.append('email', person.email.trim().toLowerCase());
      fd.append('password', person.password);
      fd.append('password_confirmation', person.password_confirmation);
      fd.append('government_id_type', idType);
      if (idFront) fd.append('government_id_image', idFront);
      if (needsBack && idBack) fd.append('government_id_image_back', idBack);
      fd.append('accept_terms', '1');
    }
    if (courierId) fd.append('logistics_company_id', String(courierId));
    fd.append('hub_name', squish(hubName));
    fd.append('address_province', hubAddress.provinceName || hubAddress.province);
    fd.append('address_city', hubAddress.cityName || hubAddress.city);
    fd.append('address_barangay', hubAddress.barangayName || hubAddress.barangay);
    fd.append('address_street', squish(hubAddress.street));
    if (hubAddress.province) fd.append('psgc_province_code', hubAddress.province);
    if (hubAddress.city) fd.append('psgc_city_code', hubAddress.city);
    if (hubAddress.barangay) fd.append('psgc_barangay_code', hubAddress.barangay);
    if (dtiPermit) fd.append('dti_permit', dtiPermit);
    coverageBarangays.forEach((b) => fd.append('coverage_barangays[]', b.code));

    setSubmitting(true);
    try {
      if (guest) {
        const res = await registerHubApi(fd);
        navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true, state: { message: res.message } });
        return;
      }
      // A hub account re-applying after a refusal.
      const response = await applyHubApi(fd);
      setReapplying(false);
      setUser(response.data.user);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const mapped = firstErrors(err.response.data?.errors);
        const coverageKey = Object.keys(mapped).find((k) => k.startsWith('coverage_barangays.'));
        if (coverageKey && !mapped.coverage_barangays) mapped.coverage_barangays = mapped[coverageKey];
        setErrors(mapped);
        setServerError(mapped.account ?? 'Please fix the highlighted fields.');
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setServerError('Too many attempts. Please wait a few moments and try again.');
      } else if (axios.isAxiosError(err) && err.response) {
        setServerError(err.response.data?.message || 'The hub application could not be sent. Please try again.');
      } else {
        setServerError('Network error. Please check your internet connection and try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const checklist = [
    ...(guest ? [
      { label: 'Your name, birthday and contact', done: !!(person.first_name && person.last_name && person.date_of_birth && person.phone) },
      { label: 'Sign-in email and password', done: !!(person.email && person.password && person.password_confirmation) },
      { label: 'Government ID', done: !!(idType && idFront && (!needsBack || idBack)) },
    ] : []),
    { label: 'Courier company to join', done: Boolean(courierId) },
    { label: 'Hub name and permit', done: Boolean(hubName.trim() && dtiPermit) },
    { label: 'Hub address', done: Boolean((hubAddress.barangay || hubAddress.barangayName) && hubAddress.street.trim()) },
    { label: 'Barangays you cover', done: coverageBarangays.length > 0 },
    ...(guest ? [{ label: 'Terms accepted', done: terms }] : []),
  ];

  const rail = (
    <ApplyRail
      checklist={checklist}
      facts={[
        { label: 'Hub share', value: `${HUB_PAY}, per parcel` },
        { label: 'Coverage picked', value: `${coverageBarangays.length} barangay${coverageBarangays.length === 1 ? '' : 's'}` },
      ]}
      approver="Confirm your email first. Then the courier company you join checks your permit, your area and your ID. Once approved, you approve the riders who pick your hub."
      footnote={<>A hub account is for deliveries only: it can't shop on Loved-IT. The hub share is 15% of the delivery fee of each parcel you deliver.</>}
    />
  );

  let n = 0;
  return (
    <Shell aside={rail}>
      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200" role="alert">
          <AlertCircle className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-800">The application was not sent</p>
            <p className="text-[13px] text-red-800">{serverError}</p>
          </div>
        </div>
      )}
      <FormErrorSummary errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {guest && (
          <>
            <ApplySection n={++n} title="The hub operator" hint="The person who runs the hub and signs in to its dashboard.">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input id="first_name" label="First name" autoComplete="given-name" value={person.first_name} onChange={(e) => setP('first_name', e.target.value)} error={errors.first_name} disabled={submitting} />
                <Input id="last_name" label="Last name" autoComplete="family-name" value={person.last_name} onChange={(e) => setP('last_name', e.target.value)} error={errors.last_name} disabled={submitting} />
                <Input id="date_of_birth" label="Date of birth" type="date" max={manilaToday()} value={person.date_of_birth} onChange={(e) => setP('date_of_birth', e.target.value)} error={errors.date_of_birth} disabled={submitting} />
                <PhoneInput id="phone" label="Mobile number" value={person.phone} onChange={(v) => setP('phone', v)} error={errors.phone} disabled={submitting} />
                <div className="sm:col-span-2">
                  <Input id="email" label="Email for the hub account" type="email" autoComplete="email" value={person.email} onChange={(e) => setP('email', e.target.value)} error={errors.email} disabled={submitting} />
                  <p className="mt-1.5 text-[12px] text-stone-500">Use an email that has no Loved-IT shopping account. You'll get a 6-digit code to confirm it.</p>
                </div>
                <PasswordField id="password" label="Password" value={person.password} onChange={(v) => setP('password', v)} error={errors.password} showRules />
                <PasswordField id="password_confirmation" label="Confirm password" value={person.password_confirmation} onChange={(v) => setP('password_confirmation', v)} error={errors.password_confirmation} />
              </div>
            </ApplySection>

            <ApplySection n={++n} title="Government ID" hint="The courier company checks it with your permit. JPG, PNG or PDF, up to 5 MB.">
              <div className="space-y-4">
                <div className="max-w-sm">
                  <CustomSelect label="ID type" required value={idType} options={GOV_ID_OPTIONS} placeholder="Choose an ID"
                    onChange={(v) => { setIdType(v); if (!ID_REQUIRES_BACK.has(v)) setIdBack(null); clear('government_id_type', 'government_id_image_back'); }}
                    error={errors.government_id_type} disabled={submitting} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <FileUploadZone label="Front of the ID" required file={idFront} onChange={(f) => { setIdFront(f); clear('government_id_image'); }}
                    onClear={() => setIdFront(null)} error={errors.government_id_image} disabled={submitting} />
                  {needsBack && (
                    <FileUploadZone label="Back of the ID" required file={idBack} onChange={(f) => { setIdBack(f); clear('government_id_image_back'); }}
                      onClear={() => setIdBack(null)} error={errors.government_id_image_back} disabled={submitting} />
                  )}
                </div>
              </div>
            </ApplySection>
          </>
        )}

        <ApplySection n={++n} title="Courier company" hint="Your hub sorts and delivers parcels for this courier, and its team reviews your application.">
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
                    onClick={() => { setCourierId(c.id); clear('logistics_company_id'); }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-[1.5px] text-left transition-colors ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                    <span className="flex items-center justify-center w-11 h-11 overflow-hidden text-[11px] font-black text-white rounded-xl bg-stone-900 shrink-0">
                      {c.logo_url ? <img src={c.logo_url} alt="" className="object-cover w-full h-full" /> : c.code}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-stone-900 truncate">{c.name}</span>
                      <span className="block text-[12px] text-stone-500">{c.hubs_count.toLocaleString()} hub{c.hubs_count === 1 ? '' : 's'} in its network</span>
                    </span>
                    {on && <CheckCircle2 className="w-4 h-4 text-brand-red shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          {errors.logistics_company_id && <p className="mt-2 text-[12.5px] text-brand-red" role="alert">{errors.logistics_company_id}</p>}
        </ApplySection>

        <ApplySection n={++n} title="Your hub" hint="The registered name, permit and where the facility is.">
          <div className="space-y-5">
            <Input label="Registered business or hub name" required value={hubName}
              onChange={(e) => { setHubName(e.target.value); clear('hub_name'); }}
              placeholder="For example: Laguna Central Logistics Hub" error={errors.hub_name} disabled={submitting} />
            <FileUploadZone label="DTI registration or Mayor's permit" required hint="DTI, SEC or Mayor's permit (JPG, PNG or PDF, up to 5 MB)"
              file={dtiPermit} onChange={(f) => { setDtiPermit(f); clear('dti_permit'); }}
              onClear={() => setDtiPermit(null)} error={errors.dti_permit} disabled={submitting} />
            <div>
              <p className="flex items-center gap-1.5 mb-2 text-[13px] font-semibold text-stone-800"><MapPin className="w-4 h-4 text-brand-red" /> Facility address</p>
              <PsgcCascadingAddress
                value={hubAddress}
                onChange={(next) => { setHubAddress(next); clear('address_province', 'address_city', 'address_barangay', 'address_street'); }}
                errors={{ province: errors.address_province, city: errors.address_city, barangay: errors.address_barangay, street: errors.address_street }}
                disabled={submitting}
              />
            </div>
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Where you deliver" hint="Pick the barangays your riders cover. Parcels for these barangays come to your hub.">
          <CoverageBarangaySelector
            selected={coverageBarangays}
            onChange={(items) => { setCoverageBarangays(items); clear('coverage_barangays'); }}
            error={errors.coverage_barangays}
            disabled={submitting}
          />
        </ApplySection>

        {guest && <TermsConsent checked={terms} onChange={(v) => { setTerms(v); clear('accept_terms'); }} error={errors.accept_terms} />}

        <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6 space-y-4">
          <p className="text-[13px] leading-relaxed text-stone-600">
            {guest
              ? 'After you send this, enter the code we email you. The hub dashboard opens once your courier company approves the hub.'
              : 'The hub dashboard opens again as soon as your courier company approves the new application.'}
          </p>
          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {submitting ? 'Sending your application…' : <>{guest ? 'Create hub account and apply' : 'Send hub application'} <ArrowRight className="w-4 h-4" /></>}
          </button>
        </section>
      </form>
    </Shell>
  );
}
