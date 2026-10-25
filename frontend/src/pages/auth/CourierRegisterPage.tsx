import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import photo from '../../assets/auth/courier.jpg';
import { Check, Mail, Network, ShieldCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import { ApplyLayout, ApplySection, ApplyRail, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus } from '../../components/apply/ApplyKit';
import { FormErrorSummary, PasswordField, TermsConsent } from '../../components/auth/AuthFields';
import { applyCourierApi } from '../../api/client';
import { registerCourierApi } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import { PH_REGIONS } from '../../data/ph-regions';
import {
  compact, confirmError, emailError, fileError, firstErrors, formatTin, nameError, passwordError, phoneError, postalError,
  secNumberError, tinError,
} from '../../utils/accountRules';

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};

const FIELD_LABELS: Record<string, string> = {
  contact_first_name: 'Contact first name', contact_last_name: 'Contact last name', contact_position: 'Position',
  email: 'Email', phone: 'Mobile number', contact_phone: 'Mobile number', password: 'Password', password_confirmation: 'Confirm password',
  name: 'Company name', sec_registration_no: 'SEC registration no.', tin: 'TIN', service_regions: 'Service areas',
  address_region: 'Region', address_province: 'Province', address_city: 'City / Municipality', address_barangay: 'Barangay',
  address_street: 'Street address', address_postal_code: 'Postal code', sec_certificate: 'SEC certificate', bir_2303: 'BIR Form 2303',
  business_permit: "Mayor's / business permit", representative_id: 'Representative ID', accept_terms: 'Terms', account: 'Account',
};

type DocKey = 'sec_certificate' | 'bir_2303' | 'business_permit' | 'representative_id';

function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <ApplyLayout
      kicker="Run a courier company"
      image={photo}
      imageAlt="Parcels stacked inside a delivery van"
      title="Bring your courier to Loved-IT"
      intro="Deliver for Loved-IT shops with your own hubs and riders. Confirm your email, then the admin team reviews your company documents."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

export default function CourierRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  const guest = !user;
  const [reapplying, setReapplying] = useState(false);

  const [account, setAccount] = useState({ email: '', password: '', password_confirmation: '' });
  const [contact, setContact] = useState({ first: '', last: '', position: '', phone: '' });
  const [name, setName] = useState('');
  const [secNo, setSecNo] = useState('');
  const [tin, setTin] = useState('');
  const [description, setDescription] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [address, setAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [postal, setPostal] = useState('');
  const [docs, setDocs] = useState<Record<DocKey, File | null>>({ sec_certificate: null, bir_2303: null, business_permit: null, representative_id: null });
  const [logo, setLogo] = useState<File | null>(null);
  const [terms, setTerms] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Shell><p className="text-sm text-stone-400">Loading…</p></Shell>;

  const company = user?.logistics_company;
  if (user && company && !(company.status === 'REJECTED' && reapplying)) {
    if (company.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`We're reviewing ${company.name}`}
            steps={[
              { icon: ShieldCheck, label: 'Company check', sub: 'An admin reviews your SEC, BIR and permit documents' },
              { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
              { icon: Network, label: 'Open your courier portal', sub: 'Add hubs and riders, set your rates' },
            ]}
            note="Your email is verified and the application is Pending Approval."
          />
        </Shell>
      );
    }
    if (company.status === 'APPROVED') {
      return <Shell><ApprovedStatus title={`${company.name} is approved!`} text="Open your courier portal to add riders, set your delivery rates and run dispatch." to="/logistics" cta="Open courier portal" /></Shell>;
    }
    if (company.status === 'REJECTED') {
      return <Shell><RejectedStatus who="platform administration" reason={company.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
    }
    return <Shell><BlockedStatus title="Courier company suspended" text="Your courier company has been suspended by platform administration. Please contact support." /></Shell>;
  }
  if (user && user.role !== 'buyer') {
    return <Shell><BlockedStatus title="This account can't apply" text="Courier companies are run from a buyer account. Sign out and apply with a new account." /></Shell>;
  }

  const clear = (...keys: string[]) => setErrors((prev) => {
    const next = { ...prev };
    keys.forEach((k) => delete next[k]);
    return next;
  });
  const contactFirst = guest ? contact.first : (contact.first || user?.first_name || '');
  const contactLast = guest ? contact.last : (contact.last || user?.last_name || '');
  const contactPhone = guest ? contact.phone : (contact.phone || user?.phone_local || user?.phone || '');

  function validate(): Record<string, string> {
    const e: Record<string, string | undefined> = {
      contact_first_name: nameError(contactFirst, 'First name'),
      contact_last_name: nameError(contactLast, 'Last name'),
      contact_position: contact.position.trim().length >= 2 ? undefined : "The contact person's position is required.",
      contact_phone: phoneError(contactPhone),
      name: name.trim().length >= 2 ? undefined : 'Company name is required.',
      sec_registration_no: secNumberError(secNo),
      tin: tinError(tin),
      service_regions: regions.length ? undefined : 'Choose at least one region you deliver in.',
      address_region: address.region ? undefined : 'Region is required.',
      address_province: address.province ? undefined : 'Province is required.',
      address_city: address.city ? undefined : 'City / Municipality is required.',
      address_barangay: address.barangay ? undefined : 'Barangay is required.',
      address_street: address.street.trim() ? undefined : 'Street address is required.',
      address_postal_code: postalError(postal),
      sec_certificate: fileError(docs.sec_certificate, 'the SEC certificate', { pdf: true }),
      bir_2303: fileError(docs.bir_2303, 'BIR Form 2303', { pdf: true }),
      business_permit: fileError(docs.business_permit, "the Mayor's / business permit", { pdf: true }),
      representative_id: fileError(docs.representative_id, 'a valid ID of the authorized representative', { pdf: true }),
      logo: fileError(logo, 'the logo', { required: false }),
      accept_terms: terms ? undefined : 'You must accept the Terms of Use and Privacy Policy to apply.',
    };
    if (guest) {
      e.email = emailError(account.email);
      e.password = passwordError(account.password);
      e.password_confirmation = confirmError(account.password, account.password_confirmation);
    }
    return compact(e);
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setServerError('');
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const fd = new FormData();
    if (guest) {
      fd.append('first_name', contactFirst.trim());
      fd.append('last_name', contactLast.trim());
      fd.append('email', account.email.trim().toLowerCase());
      fd.append('phone', contactPhone.trim());
      fd.append('password', account.password);
      fd.append('password_confirmation', account.password_confirmation);
    } else {
      fd.append('contact_email', user!.email);
    }
    fd.append('contact_first_name', contactFirst.trim());
    fd.append('contact_last_name', contactLast.trim());
    fd.append('contact_position', contact.position.trim());
    fd.append('contact_phone', contactPhone.trim());
    fd.append('name', name.trim());
    fd.append('sec_registration_no', secNo.trim().toUpperCase());
    fd.append('tin', tin.trim());
    if (description.trim()) fd.append('description', description.trim());
    regions.forEach((r) => fd.append('service_regions[]', r));
    fd.append('address_region', address.regionName);
    fd.append('address_region_code', address.region);
    fd.append('address_province', address.provinceName);
    fd.append('address_province_code', address.province);
    fd.append('address_city', address.cityName);
    fd.append('address_city_code', address.city);
    fd.append('address_barangay', address.barangayName);
    fd.append('address_barangay_code', address.barangay);
    fd.append('address_street', address.street.trim());
    fd.append('address_postal_code', postal.trim());
    (Object.keys(docs) as DocKey[]).forEach((k) => { if (docs[k]) fd.append(k, docs[k] as File); });
    if (logo) fd.append('logo', logo);
    fd.append('accept_terms', '1');

    setSubmitting(true);
    try {
      if (guest) {
        const res = await registerCourierApi(fd);
        navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true, state: { message: res.message } });
        return;
      }
      const res = await applyCourierApi(fd);
      setReapplying(false);
      setUser(res.data.user);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const mapped = firstErrors(err.response.data?.errors);
        if (mapped['service_regions.0']) mapped.service_regions = mapped['service_regions.0'];
        setErrors(mapped);
        setServerError(mapped.account ?? 'Please fix the highlighted fields.');
      } else {
        setServerError((axios.isAxiosError(err) && err.response?.data?.message) || 'The application could not be submitted. Please try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const toggleRegion = (code: string) => {
    setRegions((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));
    clear('service_regions');
  };

  const checklist = [
    { label: 'Contact person', done: !!(contactFirst && contactLast && contact.position && contactPhone) },
    ...(guest ? [{ label: 'Sign-in email and password', done: !!(account.email && account.password) }] : []),
    { label: 'Company, SEC no. and TIN', done: !!name.trim() && !secNumberError(secNo) && !tinError(tin) },
    { label: 'Service areas', done: regions.length > 0 },
    { label: 'Head office address', done: !!(address.barangay && address.street.trim() && !postalError(postal)) },
    { label: 'Four documents', done: Object.values(docs).every(Boolean) },
    { label: 'Terms accepted', done: terms },
  ];

  let n = 0;
  return (
    <Shell aside={<ApplyRail checklist={checklist} approver="The Loved-IT admin team checks your SEC, BIR and permit documents and emails you the decision." facts={[{ label: 'Service areas chosen', value: String(regions.length) }]} />}>
      {user && <ApplyingAs user={user} />}
      {serverError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{serverError}</p>}
      <FormErrorSummary errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={submit} noValidate className="space-y-4">
        <ApplySection n={++n} title="Contact person" hint={guest ? 'This person signs in to the courier portal.' : 'Who we contact about the company.'}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input id="contact_first_name" label="First name" value={contactFirst} onChange={(e) => { setContact((c) => ({ ...c, first: e.target.value })); clear('contact_first_name', 'first_name'); }} error={errors.contact_first_name ?? errors.first_name} />
            <Input id="contact_last_name" label="Last name" value={contactLast} onChange={(e) => { setContact((c) => ({ ...c, last: e.target.value })); clear('contact_last_name', 'last_name'); }} error={errors.contact_last_name ?? errors.last_name} />
            <Input id="contact_position" label="Position" placeholder="e.g. Operations Manager" value={contact.position} onChange={(e) => { setContact((c) => ({ ...c, position: e.target.value })); clear('contact_position'); }} error={errors.contact_position} />
            <PhoneInput label="Mobile number" value={contactPhone} onChange={(v) => { setContact((c) => ({ ...c, phone: v })); clear('contact_phone', 'phone'); }} error={errors.contact_phone ?? errors.phone} />
            {guest && (
              <>
                <div className="sm:col-span-2">
                  <Input id="email" label="Email" type="email" value={account.email} onChange={(e) => { setAccount((a) => ({ ...a, email: e.target.value })); clear('email'); }} error={errors.email} />
                </div>
                <PasswordField id="password" label="Password" value={account.password} onChange={(v) => { setAccount((a) => ({ ...a, password: v })); clear('password'); }} error={errors.password} showRules />
                <PasswordField id="password_confirmation" label="Confirm password" value={account.password_confirmation} onChange={(v) => { setAccount((a) => ({ ...a, password_confirmation: v })); clear('password_confirmation'); }} error={errors.password_confirmation} />
              </>
            )}
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Company details" hint="As registered with the SEC and the BIR.">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Input id="company_name" label="Registered company name" placeholder="e.g. Bilis Hatid Express Inc." value={name} onChange={(e) => { setName(e.target.value); clear('name'); }} error={errors.name} />
            </div>
            <Input id="sec_no" label="SEC registration no." placeholder="CS202012345" value={secNo} maxLength={11} onChange={(e) => { setSecNo(e.target.value.toUpperCase().replace(/\s/g, '')); clear('sec_registration_no'); }} error={errors.sec_registration_no} />
            <Input id="tin" label="TIN" inputMode="numeric" placeholder="000-000-000-000" value={tin} onChange={(e) => { setTin(formatTin(e.target.value)); clear('tin'); }} error={errors.tin} />
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label htmlFor="courier_description" className="text-sm font-medium text-brand-gray-mid">About the company (optional)</label>
              <textarea id="courier_description" rows={2} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent" />
            </div>
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Service areas" hint="Every region you deliver in. Choose as many as apply.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PH_REGIONS.map((r) => {
              const on = regions.includes(r.code);
              return (
                <button key={r.code} type="button" aria-pressed={on} onClick={() => toggleRegion(r.code)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors ${on ? 'border-brand-red bg-red-50/60 text-stone-900' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'}`}>
                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-brand-red text-white' : 'border border-stone-300'}`}>
                    {on && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="leading-tight">{r.name}</span>
                </button>
              );
            })}
          </div>
          {regions.length > 0 && (
            <p className="mt-2 text-[12.5px] text-stone-600">Selected: {PH_REGIONS.filter((r) => regions.includes(r.code)).map((r) => r.short).join(', ')}</p>
          )}
          {errors.service_regions && <p className="mt-1 text-xs text-red-600">{errors.service_regions}</p>}
        </ApplySection>

        <ApplySection n={++n} title="Head office address">
          <PsgcCascadingAddress
            value={address}
            onChange={(v) => { setAddress(v); clear('address_region', 'address_province', 'address_city', 'address_barangay', 'address_street'); }}
            errors={{ region: errors.address_region, province: errors.address_province, city: errors.address_city, barangay: errors.address_barangay, street: errors.address_street }}
            disabled={submitting}
          />
          <div className="mt-3 max-w-[10rem]">
            <Input id="postal" label="Postal code" inputMode="numeric" maxLength={6} value={postal} onChange={(e) => { setPostal(e.target.value); clear('address_postal_code'); }} error={errors.address_postal_code} />
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Documents" hint="JPG, PNG or PDF, up to 5 MB each.">
          <div className="grid sm:grid-cols-2 gap-4">
            {([
              ['sec_certificate', 'SEC certificate'],
              ['bir_2303', 'BIR Form 2303'],
              ['business_permit', "Mayor's / business permit"],
              ['representative_id', 'Valid ID of the authorized representative'],
            ] as [DocKey, string][]).map(([key, label]) => (
              <FileUploadZone key={key} label={label} required file={docs[key]}
                onChange={(f) => { setDocs((d) => ({ ...d, [key]: f })); clear(key); }}
                onClear={() => setDocs((d) => ({ ...d, [key]: null }))} error={errors[key]} />
            ))}
            <FileUploadZone label="Company logo (optional)" hint="JPG or PNG, max 5 MB" accept=".jpg,.jpeg,.png" file={logo} onChange={setLogo} onClear={() => setLogo(null)} error={errors.logo} />
          </div>
        </ApplySection>

        <TermsConsent checked={terms} onChange={(v) => { setTerms(v); clear('accept_terms'); }} error={errors.accept_terms} />

        <Button type="submit" loading={submitting} className="w-full min-h-[48px]">
          {guest ? 'Create account and apply' : 'Submit courier application'}
        </Button>
      </form>
    </Shell>
  );
}
