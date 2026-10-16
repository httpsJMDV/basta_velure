import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Building2, FileText, AlertCircle, Truck, MapPin, Mail, Network, ShieldCheck } from 'lucide-react';
import LovedItLogo from '../../components/LovedItLogo';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import { SignInRequired, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus, BlockedStatus } from '../../components/apply/ApplyKit';
import { applyCourierApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};

/** "Flash Padala Express" -> "FPE": a starting point the applicant can change. */
function suggestCode(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const code = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3);
  return code.slice(0, 6);
}

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
              <Network className="w-3.5 h-3.5" />
              <span>Courier Partners</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-brand-black">Run a Courier Company</h1>
            <p className="text-xs text-gray-500 sm:text-sm">
              Deliver for Loved-IT shops with your own network of hubs and riders, like J&amp;T or Flash on other marketplaces.
            </p>
          </div>
          {children}
        </div>
      </div>

      <div className="sticky top-0 hidden h-screen overflow-hidden md:block md:w-1/2 bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1200&q=80"
          alt="Courier vans being loaded at a logistics center"
          className="absolute inset-0 object-cover w-full h-full opacity-60"
        />
        <div className="absolute inset-0 flex items-end p-12 bg-gradient-to-t from-brand-black via-brand-black/60 to-transparent">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 text-xs font-bold tracking-wider text-white uppercase rounded-full bg-brand-red">Courier network</span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Your hubs. Your riders. Our shops.</h2>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              Approve the hubs that join you, watch every parcel in your network, and get chosen by buyers at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CourierRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const [reapplying, setReapplying] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [permit, setPermit] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Shell><p className="text-sm text-gray-400">Loading…</p></Shell>;
  if (!user) return <Shell><SignInRequired what="courier company" /></Shell>;

  // ── Status routing: an application in force replaces the form ──
  const company = user.logistics_company;
  if (company && !(company.status === 'REJECTED' && reapplying)) {
    if (company.status === 'PENDING') {
      return (
        <Shell>
          <PendingStatus
            title={`We're reviewing ${company.name}`}
            steps={[
              { icon: ShieldCheck, label: 'Permit and company check', sub: 'An admin reviews your business permit' },
              { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
              { icon: Network, label: 'Open your courier portal', sub: 'Approve hubs and watch your network' },
            ]}
          />
        </Shell>
      );
    }
    if (company.status === 'APPROVED') {
      return <Shell><ApprovedStatus title={`${company.name} is approved!`} text="Hubs can now join your network and buyers can choose you at checkout." to="/logistics" cta="Open courier portal" /></Shell>;
    }
    if (company.status === 'REJECTED') {
      return <Shell><RejectedStatus who="platform administration" reason={company.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
    }
    return <Shell><BlockedStatus title="Courier company suspended" text="Your courier company has been suspended by platform administration. Please contact support." /></Shell>;
  }
  if (user.role !== 'buyer') {
    return <Shell><BlockedStatus title="This account can't apply" text="Courier companies are run from a buyer account. Sign in with your buyer account to apply." /></Shell>;
  }

  const email = contactEmail || user.email;
  const phone = contactPhone || user.phone || '';

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Company name is required.';
    if (!/^[A-Z0-9]{2,6}$/.test(code)) errs.code = 'Use 2 to 6 letters or numbers (for example JNT).';
    if (!email.trim()) errs.contact_email = 'A contact email is required.';
    if (!phone.trim()) errs.contact_phone = 'A contact number is required.';
    if (!address.province && !address.provinceName) errs.address_province = 'Province is required.';
    if (!address.city && !address.cityName) errs.address_city = 'City or municipality is required.';
    if (!address.barangay && !address.barangayName) errs.address_barangay = 'Barangay is required.';
    if (!address.street.trim()) errs.address_street = 'Street or building address is required.';
    if (!permit) errs.business_permit = 'Upload your DTI, SEC or Mayor\'s Permit.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('code', code);
      if (description.trim()) fd.append('description', description.trim());
      fd.append('contact_email', email.trim());
      fd.append('contact_phone', phone.trim());
      fd.append('address_province', address.provinceName || address.province);
      fd.append('address_city', address.cityName || address.city);
      fd.append('address_barangay', address.barangayName || address.barangay);
      fd.append('address_street', address.street.trim());
      if (permit) fd.append('business_permit', permit);
      if (logo) fd.append('logo', logo);

      const res = await applyCourierApi(fd);
      setReapplying(false);
      setUser(res.data.user); // the status screen takes over
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        const apiErrors = err.response.data?.errors as Record<string, string[]> | undefined;
        if (err.response.status === 422 && apiErrors) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(apiErrors)) mapped[k] = v[0];
          setErrors(mapped);
          setServerError(apiErrors.account?.[0] ?? err.response.data?.message ?? 'Please review the highlighted fields.');
        } else {
          setServerError(err.response.data?.message || 'The application could not be submitted. Please try again.');
        }
      } else {
        setServerError('Network error. Please check your internet connection and try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const clear = (key: string) => setErrors((prev) => ({ ...prev, [key]: '' }));

  return (
    <Shell>
      <ApplyingAs user={user} />

      {serverError && (
        <div className="flex items-start gap-3 p-4 text-xs text-red-700 border border-red-200 rounded-xl bg-red-50" role="alert">
          <AlertCircle className="w-4 h-4 text-brand-red shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Application could not be submitted</p>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-7">
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Building2 className="w-4 h-4 text-brand-red" />
            <h2 className="text-xs font-bold tracking-wider text-gray-700 uppercase">Company</h2>
          </div>
          <Input
            label="Registered company name"
            required
            value={name}
            onChange={(e) => { setName(e.target.value); clear('name'); if (!codeTouched) setCode(suggestCode(e.target.value)); }}
            placeholder="e.g. Flash Padala Express"
            error={errors.name}
            disabled={submitting}
          />
          <Input
            label="Short code"
            required
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setCodeTouched(true); clear('code'); }}
            placeholder="e.g. FPE"
            error={errors.code}
            disabled={submitting}
          />
          <p className="-mt-2 text-[11px] text-gray-400">Printed on waybills and shown to buyers at checkout, like "JNT" or "SPX".</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="courier-description" className="text-sm font-medium text-brand-gray-mid">About the company (optional)</label>
            <textarea
              id="courier-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Where you deliver, how many riders, your service promise…"
              className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent resize-none"
              disabled={submitting}
            />
          </div>
          <FileUploadZone
            label="Company logo (optional)"
            hint="Square image — JPG, PNG or WEBP, max 2MB"
            accept=".jpg,.jpeg,.png,.webp"
            file={logo}
            onChange={setLogo}
            onClear={() => setLogo(null)}
            error={errors.logo}
            disabled={submitting}
          />
        </div>

        <div className="space-y-3.5 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Truck className="w-4 h-4 text-brand-red" />
            <h2 className="text-xs font-bold tracking-wider text-gray-700 uppercase">Operations contact</h2>
          </div>
          <Input label="Contact email" type="email" required value={email} onChange={(e) => { setContactEmail(e.target.value); clear('contact_email'); }} error={errors.contact_email} disabled={submitting} />
          <Input label="Contact number" required value={phone} onChange={(e) => { setContactPhone(e.target.value); clear('contact_phone'); }} placeholder="09171234567" error={errors.contact_phone} disabled={submitting} />
          <div className="pt-1 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-brand-red" />
              <span>Head office address</span>
            </div>
            <PsgcCascadingAddress
              value={address}
              onChange={(v) => { setAddress(v); setErrors((p) => ({ ...p, address_province: '', address_city: '', address_barangay: '', address_street: '' })); }}
              errors={{ province: errors.address_province, city: errors.address_city, barangay: errors.address_barangay, street: errors.address_street }}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-3.5 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <FileText className="w-4 h-4 text-brand-red" />
            <h2 className="text-xs font-bold tracking-wider text-gray-700 uppercase">Business permit</h2>
          </div>
          <FileUploadZone
            label="DTI / SEC registration or Mayor's Permit"
            required
            hint="JPG, PNG or PDF, max 5MB"
            file={permit}
            onChange={(f) => { setPermit(f); clear('business_permit'); }}
            onClear={() => setPermit(null)}
            error={errors.business_permit}
            disabled={submitting}
          />
        </div>

        <div className="rounded-xl bg-amber-50/80 border border-amber-200/90 p-3.5 text-xs text-amber-800 leading-relaxed">
          Loved-IT checks your permit before your company goes live. Once approved, you review the hubs that apply to join
          you, and buyers can pick you at checkout. The delivery fee is the same for every courier.
        </div>

        <Button type="submit" loading={submitting} disabled={submitting} className="w-full min-h-[46px] text-sm font-bold shadow-sm">
          {submitting ? 'Submitting Application…' : 'Submit Courier Application'}
        </Button>
      </form>
    </Shell>
  );
}
