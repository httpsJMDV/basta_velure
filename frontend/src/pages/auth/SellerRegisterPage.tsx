import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Store, ShieldCheck, Mail, Clock } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import PhoneInput from '../../components/ui/PhoneInput';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import { ApplyLayout, ApplySection, ApplyRail, ApplyingAs, PendingStatus, ApprovedStatus, RejectedStatus } from '../../components/apply/ApplyKit';
import { FormErrorSummary, PasswordField, TermsConsent } from '../../components/auth/AuthFields';
import { applyAsSellerApi, getStorefrontCategoriesApi } from '../../api/client';
import { registerSellerApi } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import {
  compact, confirmError, emailError, fileError, firstErrors, formatTin, nameError, passwordError, phoneError, postalError, tinError,
} from '../../utils/accountRules';

type SellerType = 'individual' | 'sole_proprietorship' | 'corporation';

const SELLER_TYPES: { value: SellerType; label: string; docs: string }[] = [
  { value: 'individual', label: 'Individual', docs: 'Government-issued ID' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship', docs: 'ID, DTI certificate, BIR Form 2303' },
  { value: 'corporation', label: 'Corporation', docs: "Representative's ID, SEC certificate, BIR Form 2303" },
];

const EMPTY_ADDRESS: HubAddressValue = {
  region: '', regionName: '', province: '', provinceName: '', city: '', cityName: '', barangay: '', barangayName: '', street: '',
};

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Mobile number', password: 'Password',
  password_confirmation: 'Confirm password', shop_name: 'Shop name', shop_category: 'Shop category',
  shop_description: 'Description', seller_type: 'Seller type', tin: 'TIN', address_region: 'Region',
  address_province: 'Province', address_city: 'City / Municipality', address_barangay: 'Barangay',
  address_street: 'Street address', address_postal_code: 'Postal code', government_id_image: 'Government-issued ID',
  dti_certificate: 'DTI certificate', sec_certificate: 'SEC certificate', bir_2303: 'BIR Form 2303', accept_terms: 'Terms',
  account: 'Account',
};

interface Docs {
  government_id_image: File | null;
  government_id_image_back: File | null;
  dti_certificate: File | null;
  sec_certificate: File | null;
  bir_2303: File | null;
  business_permit: File | null;
}

const EMPTY_DOCS: Docs = {
  government_id_image: null, government_id_image_back: null, dti_certificate: null, sec_certificate: null, bir_2303: null, business_permit: null,
};

function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <ApplyLayout
      icon={Store}
      kicker="Sell on Loved-IT"
      title="Open your shop"
      intro="Tell us about your shop and send the documents for your seller type. We confirm your email first, then an admin reviews the application, usually within 1 to 3 business days."
      aside={aside}
    >
      {children}
    </ApplyLayout>
  );
}

export default function SellerRegisterPage() {
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  const guest = !user;
  const [reapplying, setReapplying] = useState(false);

  const [account, setAccount] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '', password_confirmation: '' });
  const [shopName, setShopName] = useState('');
  const [shopCategory, setShopCategory] = useState('');
  const [description, setDescription] = useState('');
  const [sellerType, setSellerType] = useState<SellerType | ''>('');
  const [tin, setTin] = useState('');
  const [address, setAddress] = useState<HubAddressValue>(EMPTY_ADDRESS);
  const [postal, setPostal] = useState('');
  const [docs, setDocs] = useState<Docs>(EMPTY_DOCS);
  const [terms, setTerms] = useState(false);

  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getStorefrontCategoriesApi()
      .then((list) => setCategories(list.map((c) => ({ value: c.name, label: c.name }))))
      .catch(() => setCategories([]));
  }, []);

  const needs = useMemo(() => ({
    dti: sellerType === 'sole_proprietorship',
    sec: sellerType === 'corporation',
    bir: sellerType === 'sole_proprietorship' || sellerType === 'corporation',
  }), [sellerType]);

  if (loading) return <Shell><p className="text-sm text-stone-400">Loading…</p></Shell>;

  const status = user?.seller_profile?.application_status;
  if (user && status && !(status === 'rejected' && reapplying)) {
    if (status === 'pending') {
      return (
        <Shell>
          <PendingStatus
            title={`We're reviewing ${user.seller_profile?.shop_name ?? 'your shop'}`}
            steps={[
              { icon: ShieldCheck, label: 'Document check', sub: 'An admin reviews your ID and business documents' },
              { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
              { icon: Clock, label: 'Start selling', sub: 'Add products from your Seller Center' },
            ]}
            note="Your email is verified and the application is Pending Approval. You can keep shopping meanwhile."
          />
        </Shell>
      );
    }
    if (status === 'approved') {
      return <Shell><ApprovedStatus title="Your shop is approved!" text="Open your Seller Center to add products and start selling." to="/seller" cta="Open Seller Center" /></Shell>;
    }
    return <Shell><RejectedStatus who="admin team" reason={user.seller_profile?.rejection_reason} onReapply={() => setReapplying(true)} /></Shell>;
  }

  const clear = (...keys: string[]) => setErrors((prev) => {
    const next = { ...prev };
    keys.forEach((k) => delete next[k]);
    return next;
  });

  function validate(): Record<string, string> {
    const e: Record<string, string | undefined> = {};
    if (guest) {
      e.first_name = nameError(account.first_name, 'First name');
      e.last_name = nameError(account.last_name, 'Last name');
      e.email = emailError(account.email);
      e.phone = phoneError(account.phone);
      e.password = passwordError(account.password);
      e.password_confirmation = confirmError(account.password, account.password_confirmation);
    }
    const name = shopName.trim();
    e.shop_name = !name ? 'Shop name is required.' : name.length < 3 || name.length > 30 ? 'Shop name must be 3 to 30 characters.' : undefined;
    e.shop_category = shopCategory ? undefined : 'Choose a shop category.';
    e.shop_description = description.length > 500 ? 'The shop description must be 500 characters or fewer.' : undefined;
    e.seller_type = sellerType ? undefined : 'Choose a seller type.';
    e.tin = tinError(tin);
    e.address_region = address.region ? undefined : 'Region is required.';
    e.address_province = address.province ? undefined : 'Province is required.';
    e.address_city = address.city ? undefined : 'City / Municipality is required.';
    e.address_barangay = address.barangay ? undefined : 'Barangay is required.';
    e.address_street = address.street.trim() ? undefined : 'Street address is required.';
    e.address_postal_code = postalError(postal);
    e.government_id_image = fileError(docs.government_id_image, 'a government-issued ID', { pdf: true });
    e.government_id_image_back = fileError(docs.government_id_image_back, 'the back of the ID', { pdf: true, required: false });
    e.dti_certificate = fileError(docs.dti_certificate, 'the DTI certificate', { pdf: true, required: needs.dti });
    e.sec_certificate = fileError(docs.sec_certificate, 'the SEC certificate', { pdf: true, required: needs.sec });
    e.bir_2303 = fileError(docs.bir_2303, 'BIR Form 2303', { pdf: true, required: needs.bir });
    e.business_permit = fileError(docs.business_permit, 'the business permit', { pdf: true, required: false });
    e.accept_terms = terms ? undefined : 'You must accept the Terms of Use and Privacy Policy to apply.';
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
    if (guest) Object.entries(account).forEach(([k, v]) => fd.append(k, k === 'email' ? v.trim().toLowerCase() : v));
    fd.append('shop_name', shopName.trim());
    fd.append('shop_category', shopCategory);
    if (description.trim()) fd.append('shop_description', description.trim());
    fd.append('seller_type', sellerType);
    fd.append('tin', tin.trim());
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
    (Object.keys(docs) as (keyof Docs)[]).forEach((k) => {
      const f = docs[k];
      if (!f) return;
      if ((k === 'dti_certificate' && !needs.dti) || (k === 'sec_certificate' && !needs.sec) || (k === 'bir_2303' && !needs.bir)) return;
      fd.append(k, f);
    });
    fd.append('accept_terms', '1');

    setSubmitting(true);
    try {
      if (guest) {
        const res = await registerSellerApi(fd);
        navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true, state: { message: res.message } });
        return;
      }
      const res = await applyAsSellerApi(fd);
      setReapplying(false);
      setUser(res.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const mapped = firstErrors(err.response.data?.errors);
        setErrors(mapped);
        setServerError(mapped.account ?? 'Please fix the highlighted fields.');
      } else if (axios.isAxiosError(err) && err.response?.status === 413) {
        setServerError('The files are too large to send together. Each document must be 5 MB or smaller.');
      } else {
        setServerError((axios.isAxiosError(err) && err.response?.data?.message) || 'The application could not be submitted. Please try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const checklist = [
    ...(guest ? [{ label: 'Your account', done: !!(account.first_name && account.last_name && account.email && account.phone && account.password) }] : []),
    { label: 'Shop name and category', done: shopName.trim().length >= 3 && !!shopCategory },
    { label: 'Seller type and TIN', done: !!sellerType && !tinError(tin) },
    { label: 'Pickup address', done: !!(address.barangay && address.street.trim() && !postalError(postal)) },
    { label: 'Documents', done: !!docs.government_id_image && (!needs.dti || !!docs.dti_certificate) && (!needs.sec || !!docs.sec_certificate) && (!needs.bir || !!docs.bir_2303) },
    { label: 'Terms accepted', done: terms },
  ];

  let n = 0;
  return (
    <Shell aside={<ApplyRail checklist={checklist} approver="The Loved-IT admin team checks your documents and emails you the decision." facts={[{ label: 'Commission', value: '5% of item sales' }, { label: 'Payout', value: 'GCash, weekly' }]} />}>
      {user && <ApplyingAs user={user} />}
      {serverError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{serverError}</p>}
      <FormErrorSummary errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={submit} noValidate className="space-y-4">
        {guest && (
          <ApplySection n={++n} title="Your account" hint="You sign in with this email. We send a 6-digit code to confirm it.">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input id="first_name" label="First name" value={account.first_name} onChange={(e) => { setAccount((a) => ({ ...a, first_name: e.target.value })); clear('first_name'); }} error={errors.first_name} />
              <Input id="last_name" label="Last name" value={account.last_name} onChange={(e) => { setAccount((a) => ({ ...a, last_name: e.target.value })); clear('last_name'); }} error={errors.last_name} />
              <Input id="email" label="Email" type="email" value={account.email} onChange={(e) => { setAccount((a) => ({ ...a, email: e.target.value })); clear('email'); }} error={errors.email} />
              <PhoneInput label="Mobile number" value={account.phone} onChange={(v) => { setAccount((a) => ({ ...a, phone: v })); clear('phone'); }} error={errors.phone} />
              <PasswordField id="password" label="Password" value={account.password} onChange={(v) => { setAccount((a) => ({ ...a, password: v })); clear('password'); }} error={errors.password} showRules />
              <PasswordField id="password_confirmation" label="Confirm password" value={account.password_confirmation} onChange={(v) => { setAccount((a) => ({ ...a, password_confirmation: v })); clear('password_confirmation'); }} error={errors.password_confirmation} />
            </div>
          </ApplySection>
        )}

        <ApplySection n={++n} title="Shop details" hint="How buyers will see your shop.">
          <div className="grid gap-3">
            <div>
              <Input id="shop_name" label="Shop name" value={shopName} maxLength={40} onChange={(e) => { setShopName(e.target.value); clear('shop_name'); }} error={errors.shop_name} />
              <p className={`mt-1 text-right text-[11px] tabular-nums ${shopName.trim().length > 30 ? 'text-red-600' : 'text-stone-400'}`}>{shopName.trim().length}/30</p>
            </div>
            <CustomSelect label="Shop category" required value={shopCategory} onChange={(v) => { setShopCategory(v); clear('shop_category'); }} options={categories} placeholder={categories.length ? 'Choose a category' : 'Loading…'} error={errors.shop_category} />
            <div className="flex flex-col gap-1">
              <label htmlFor="shop_description" className="text-sm font-medium text-brand-gray-mid">About the shop (optional)</label>
              <textarea id="shop_description" rows={3} value={description} onChange={(e) => { setDescription(e.target.value); clear('shop_description'); }}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent ${errors.shop_description ? 'border-red-500' : 'border-gray-300'}`} />
              <div className="flex justify-between text-[11px]">
                <span className="text-red-600">{errors.shop_description}</span>
                <span className={`tabular-nums ${description.length > 500 ? 'text-red-600' : 'text-stone-400'}`}>{description.length}/500</span>
              </div>
            </div>
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Business details" hint="Your seller type decides which documents we need.">
          <div role="radiogroup" aria-label="Seller type" className="grid sm:grid-cols-3 gap-2">
            {SELLER_TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={sellerType === t.value}
                onClick={() => { setSellerType(t.value); clear('seller_type', 'dti_certificate', 'sec_certificate', 'bir_2303'); }}
                className={`text-left rounded-2xl border px-3.5 py-3 transition-colors ${sellerType === t.value ? 'border-brand-red bg-red-50/50 ring-1 ring-brand-red' : 'border-stone-200 bg-white hover:border-stone-400'}`}>
                <span className="block text-[14px] font-semibold text-stone-900">{t.label}</span>
                <span className="block mt-0.5 text-[12px] leading-snug text-stone-500">{t.docs}</span>
              </button>
            ))}
          </div>
          {errors.seller_type && <p className="mt-1 text-xs text-red-600">{errors.seller_type}</p>}
          <div className="mt-3 max-w-xs">
            <Input id="tin" label="TIN" inputMode="numeric" placeholder="000-000-000-000" value={tin} onChange={(e) => { setTin(formatTin(e.target.value)); clear('tin'); }} error={errors.tin} />
          </div>
        </ApplySection>

        <ApplySection n={++n} title="Pickup address" hint="Where couriers collect your parcels.">
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
            <FileUploadZone label={sellerType === 'corporation' ? "Representative's government ID" : 'Government-issued ID'} required file={docs.government_id_image}
              onChange={(f) => { setDocs((d) => ({ ...d, government_id_image: f })); clear('government_id_image'); }} onClear={() => setDocs((d) => ({ ...d, government_id_image: null }))} error={errors.government_id_image} />
            <FileUploadZone label="Back of the ID (optional)" file={docs.government_id_image_back}
              onChange={(f) => setDocs((d) => ({ ...d, government_id_image_back: f }))} onClear={() => setDocs((d) => ({ ...d, government_id_image_back: null }))} error={errors.government_id_image_back} />
            {needs.dti && (
              <FileUploadZone label="DTI certificate" required file={docs.dti_certificate}
                onChange={(f) => { setDocs((d) => ({ ...d, dti_certificate: f })); clear('dti_certificate'); }} onClear={() => setDocs((d) => ({ ...d, dti_certificate: null }))} error={errors.dti_certificate} />
            )}
            {needs.sec && (
              <FileUploadZone label="SEC certificate" required file={docs.sec_certificate}
                onChange={(f) => { setDocs((d) => ({ ...d, sec_certificate: f })); clear('sec_certificate'); }} onClear={() => setDocs((d) => ({ ...d, sec_certificate: null }))} error={errors.sec_certificate} />
            )}
            {needs.bir && (
              <FileUploadZone label="BIR Form 2303" required file={docs.bir_2303}
                onChange={(f) => { setDocs((d) => ({ ...d, bir_2303: f })); clear('bir_2303'); }} onClear={() => setDocs((d) => ({ ...d, bir_2303: null }))} error={errors.bir_2303} />
            )}
            <FileUploadZone label="Mayor's / business permit (optional)" file={docs.business_permit}
              onChange={(f) => setDocs((d) => ({ ...d, business_permit: f }))} onClear={() => setDocs((d) => ({ ...d, business_permit: null }))} error={errors.business_permit} />
          </div>
          {!sellerType && <p className="mt-3 text-[12.5px] text-stone-500">Choose your seller type above to see the documents it needs.</p>}
        </ApplySection>

        <TermsConsent checked={terms} onChange={(v) => { setTerms(v); clear('accept_terms'); }} error={errors.accept_terms} />

        <Button type="submit" loading={submitting} className="w-full min-h-[48px]">
          {guest ? 'Create account and apply' : 'Submit application'}
        </Button>
      </form>
    </Shell>
  );
}
