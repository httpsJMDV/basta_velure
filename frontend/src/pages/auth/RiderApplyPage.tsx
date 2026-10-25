import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Mail, MapPin, Search, ShieldCheck } from 'lucide-react';
import photo from '../../assets/auth/rider.jpg';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import CustomSelect from '../../components/ui/CustomSelect';
import FileUploadZone from '../../components/ui/FileUploadZone';
import { ApplyLayout, ApplySection, ApplyRail, PendingStatus } from '../../components/apply/ApplyKit';
import { FormErrorSummary, TermsConsent } from '../../components/auth/AuthFields';
import { getPublicApprovedHubsApi } from '../../api/client';
import { registerRiderApi } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import type { PublicApprovedHub, RiderApplicationResult } from '../../types';
import {
  compact, dobError, emailError, fileError, firstErrors, licenseExpiryError, licenseNumberError, manilaToday, nameError, phoneError,
} from '../../utils/accountRules';

const VEHICLES = ['Motorcycle', 'Tricycle', 'Car', 'Van'].map((v) => ({ value: v, label: v }));

// Rider pay follows config/shipping.php (A33), the same figures the Partner page shows.
const PAY = [{ label: 'Per completed pickup', value: '₱30' }, { label: 'Per successful delivery', value: '₱50' }];

const FIELD_LABELS: Record<string, string> = {
  sorting_center_id: 'Hub', first_name: 'First name', last_name: 'Last name', date_of_birth: 'Date of birth', email: 'Email',
  phone: 'Mobile number', license_number: "Driver's license no.", license_expiry: 'License expiry', vehicle_type: 'Vehicle type',
  plate_number: 'Plate number', drivers_license_image: "Driver's license photo", or_cr_image: 'OR/CR', accept_terms: 'Terms',
};

const EMPTY = { first_name: '', last_name: '', date_of_birth: '', email: '', phone: '', license_number: '', license_expiry: '', vehicle_type: '', plate_number: '' };

function Shell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <ApplyLayout
      kicker="Ride for a courier"
      image={photo}
      imageAlt="A rider on a scooter in city traffic"
      title="Become a Loved-IT rider"
      intro="Pick the hub near you and send your license and vehicle papers. The hub checks them, and once you're approved we email you a link to set your password and start taking jobs."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

/**
 * The public "Become a rider" form (POST /auth/register-rider). A hub shares a link with ?hub= (its QR code points
 * here) and a courier company one with ?courier=, which pick the hub or narrow the list. Nothing here signs anyone in:
 * the application waits for the hub, and only an approved rider gets the email to set a password.
 */
export default function RiderApplyPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const linkedHub = Number(params.get('hub')) || null;
  const linkedCourier = Number(params.get('courier')) || null;

  const [hubs, setHubs] = useState<PublicApprovedHub[] | null>(null);
  const [hubId, setHubId] = useState<number | null>(linkedHub);
  const [browsing, setBrowsing] = useState(!linkedHub);
  const [query, setQuery] = useState('');

  const [form, setForm] = useState(EMPTY);
  const [license, setLicense] = useState<File | null>(null);
  const [orCr, setOrCr] = useState<File | null>(null);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<RiderApplicationResult | null>(null);

  useEffect(() => {
    getPublicApprovedHubsApi({ limit: 100, ...(linkedCourier ? { courier_id: linkedCourier } : {}) })
      .then((list) => {
        setHubs(list);
        // A link to a hub that is no longer taking riders falls back to the list.
        if (linkedHub && !list.some((h) => h.id === linkedHub)) { setHubId(null); setBrowsing(true); }
        else if (!linkedHub && list.length === 1) setHubId(list[0].id);
      })
      .catch(() => setHubs([]));
  }, [linkedHub, linkedCourier]);

  const hub = hubs?.find((h) => h.id === hubId) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (hubs ?? []).filter((h) => !q || [h.hub_name, h.address_city, h.address_province, h.courier?.name ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [hubs, query]);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    clear(k);
  };
  const clear = (k: string) => setErrors((e) => {
    if (!(k in e)) return e;
    const n = { ...e };
    delete n[k];
    return n;
  });

  if (sent) {
    return (
      <Shell>
        <PendingStatus
          title={`Sent to ${sent.data.hub}`}
          note={`We emailed ${sent.data.email} a copy. The hub usually decides within 1 to 3 business days. You can't sign in until they approve you.`}
          steps={[
            { icon: ShieldCheck, label: 'The hub checks your papers', sub: "Driver's license, OR/CR and your vehicle" },
            { icon: Mail, label: 'Approval email', sub: 'It has a link to set your password (works for 24 hours)' },
            { icon: KeyRound, label: 'Set your password and go Online', sub: 'Sign in on the rider page and start taking jobs' },
          ]}
        />
      </Shell>
    );
  }

  function validate(): Record<string, string> {
    return compact({
      sorting_center_id: hubId ? undefined : 'Choose the hub you want to ride for.',
      first_name: nameError(form.first_name, 'First name'),
      last_name: nameError(form.last_name, 'Last name'),
      date_of_birth: dobError(form.date_of_birth),
      email: emailError(form.email),
      phone: phoneError(form.phone),
      license_number: licenseNumberError(form.license_number),
      license_expiry: licenseExpiryError(form.license_expiry),
      vehicle_type: form.vehicle_type ? undefined : 'Choose the vehicle type.',
      plate_number: form.plate_number.trim() ? undefined : 'Plate number is required.',
      drivers_license_image: fileError(license, "the driver's license", { pdf: true }),
      or_cr_image: fileError(orCr, 'the vehicle OR/CR', { pdf: true }),
      accept_terms: terms ? undefined : 'You must accept the Terms of Use and Privacy Policy to apply.',
    });
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
    fd.append('sorting_center_id', String(hubId));
    Object.entries(form).forEach(([k, v]) => fd.append(k, k === 'email' ? v.trim().toLowerCase() : v.trim()));
    fd.append('drivers_license_image', license as File);
    fd.append('or_cr_image', orCr as File);
    fd.append('accept_terms', '1');

    setSubmitting(true);
    try {
      setSent(await registerRiderApi(fd));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const mapped = firstErrors(err.response.data?.errors);
        setErrors(mapped);
        // A hub that stopped taking riders since the page loaded: back to the list.
        if (mapped.sorting_center_id) setBrowsing(true);
        setServerError('Please fix the highlighted fields.');
      } else {
        setServerError((axios.isAxiosError(err) && err.response?.data?.message) || 'The application could not be sent. Please try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const checklist = [
    { label: 'Hub chosen', done: !!hub },
    { label: 'Your name, birthday and contact', done: !!(form.first_name && form.last_name && form.date_of_birth && form.email && form.phone) },
    { label: 'License and vehicle', done: !licenseNumberError(form.license_number) && !!form.license_expiry && !!form.vehicle_type && !!form.plate_number.trim() },
    { label: "Driver's license and OR/CR photos", done: !!license && !!orCr },
    { label: 'Terms accepted', done: terms },
  ];

  const rail = (
    <ApplyRail
      checklist={checklist}
      facts={PAY}
      approver={hub
        ? `${hub.hub_name}${hub.courier ? ` (${hub.courier.name})` : ''} checks your papers and emails you the decision. Their courier company can decide too.`
        : 'The hub you choose checks your papers and emails you the decision. Their courier company can decide too.'}
      footnote={<>Already approved? <Link to="/rider/login" className="font-semibold text-stone-700 underline underline-offset-2 hover:text-brand-red">Sign in as a rider</Link>.</>}
    />
  );

  const isRider = !!user?.rider && user.rider.status !== 'DISAPPROVED';

  return (
    <Shell aside={rail}>
      {user && (
        <p className="px-4 py-3 rounded-2xl bg-white border border-stone-200 text-[13px] leading-relaxed text-stone-600">
          {isRider
            ? <>You already have a rider account. <Link to="/rider/dashboard" className="font-semibold text-brand-red">Open the rider app</Link>.</>
            : <>You're signed in as {user.email}. A rider account is separate from your shopping account, so apply with a <span className="font-semibold text-stone-900">different email</span>.</>}
        </p>
      )}
      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200" role="alert">
          <AlertCircle className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-800">{serverError}</p>
        </div>
      )}
      <FormErrorSummary errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={submit} noValidate className="space-y-4">
        <ApplySection n={1} title="Your hub" hint="Where you pick up and drop off parcels. Choose the one closest to where you live."
          action={hub && !browsing ? (
            <button type="button" onClick={() => setBrowsing(true)} className="h-8 px-3 rounded-full border border-stone-300 text-[12px] font-semibold text-stone-700 hover:border-stone-900 shrink-0">Change</button>
          ) : undefined}>
          {!hubs ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-[64px] rounded-2xl bg-stone-100 animate-pulse" />)}</div>
          ) : hubs.length === 0 ? (
            <p className="p-4 rounded-2xl bg-stone-50 text-[13px] text-stone-600">No hub is taking riders right now. Please check again later.</p>
          ) : hub && !browsing ? (
            <HubCard hub={hub} on />
          ) : (
            <>
              {hubs.length > 6 && (
                <label className="relative block mb-3">
                  <span className="sr-only">Search hubs</span>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by hub, city or province"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-stone-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent" />
                </label>
              )}
              <div className="grid gap-2 max-h-[340px] overflow-y-auto pr-1" role="radiogroup" aria-label="Hub">
                {shown.map((h) => (
                  <HubCard key={h.id} hub={h} on={h.id === hubId}
                    onPick={() => { setHubId(h.id); setBrowsing(false); setQuery(''); clear('sorting_center_id'); }} />
                ))}
                {shown.length === 0 && <p className="p-4 rounded-2xl bg-stone-50 text-[13px] text-stone-600">No hub matches “{query}”.</p>}
              </div>
            </>
          )}
          {errors.sorting_center_id && <p className="mt-2 text-[12.5px] text-brand-red" role="alert">{errors.sorting_center_id}</p>}
        </ApplySection>

        <ApplySection n={2} title="About you" hint="You must be 18 or older. Your email is how you will sign in, so use one you can open.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input id="ra-first" label="First name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} />
            <Input id="ra-last" label="Last name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} />
            <Input id="ra-dob" label="Date of birth" type="date" max={manilaToday()} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} error={errors.date_of_birth} />
            <PhoneInput id="ra-phone" label="Mobile number" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} />
            <div className="sm:col-span-2">
              <Input id="ra-email" label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
            </div>
          </div>
        </ApplySection>

        <ApplySection n={3} title="License and vehicle" hint="As printed on your LTO license and your vehicle's OR/CR.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input id="ra-license" label="Driver's license no." placeholder="N01-23-456789" value={form.license_number} onChange={(e) => set('license_number', e.target.value.toUpperCase())} error={errors.license_number} />
            <Input id="ra-expiry" label="License expiry date" type="date" min={manilaToday()} value={form.license_expiry} onChange={(e) => set('license_expiry', e.target.value)} error={errors.license_expiry} />
            <CustomSelect label="Vehicle type" required value={form.vehicle_type} onChange={(v) => set('vehicle_type', v)} options={VEHICLES} placeholder="Choose" error={errors.vehicle_type} />
            <Input id="ra-plate" label="Plate number" placeholder="123ABC" value={form.plate_number} onChange={(e) => set('plate_number', e.target.value.toUpperCase())} error={errors.plate_number} />
          </div>
        </ApplySection>

        <ApplySection n={4} title="Photos of your papers" hint="Clear photos or scans. JPG, PNG or PDF, up to 5 MB each.">
          <div className="grid sm:grid-cols-2 gap-4">
            <FileUploadZone label="Driver's license" required file={license} onChange={(f) => { setLicense(f); clear('drivers_license_image'); }} onClear={() => setLicense(null)} error={errors.drivers_license_image} />
            <FileUploadZone label="Vehicle OR/CR" required file={orCr} onChange={(f) => { setOrCr(f); clear('or_cr_image'); }} onClear={() => setOrCr(null)} error={errors.or_cr_image} />
          </div>
        </ApplySection>

        <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6 space-y-4">
          <TermsConsent checked={terms} onChange={(v) => { setTerms(v); clear('accept_terms'); }} error={errors.accept_terms} />
          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
            {submitting ? 'Sending your application…' : <>Send rider application <ArrowRight className="w-4 h-4" /></>}
          </button>
        </section>
      </form>
    </Shell>
  );
}

function HubCard({ hub, on, onPick }: { hub: PublicApprovedHub; on: boolean; onPick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-stone-100 text-stone-600 shrink-0"><MapPin className="w-[18px] h-[18px]" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold text-stone-900 truncate">{hub.hub_name}</span>
        <span className="block text-[12.5px] text-stone-500 truncate">
          {[hub.address_city, hub.address_province].filter(Boolean).join(', ')}{hub.courier ? ` · ${hub.courier.name}` : ''}
        </span>
      </span>
      {on && <CheckCircle2 className="w-4 h-4 text-brand-red shrink-0" />}
    </>
  );
  const cls = `flex items-center gap-3 w-full p-3 rounded-2xl border-[1.5px] text-left transition-colors ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`;

  return onPick
    ? <button type="button" role="radio" aria-checked={on} onClick={onPick} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>;
}
