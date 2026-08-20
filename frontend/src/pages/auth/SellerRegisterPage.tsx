import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { applyAsSellerApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import AddressFields from '../../components/ui/AddressFields';
import type { AddressValue } from '../../components/ui/AddressFields';
import type { GovernmentIdType } from '../../types';
import { CATEGORY_OPTIONS } from '../../data/categories';
import { UploadCloud, FileText, X, Image as ImageIcon, CheckCircle, Clock, AlertCircle, Store } from 'lucide-react';

const ID_TYPES: { value: GovernmentIdType; label: string }[] = [
  { value: 'national_id',     label: 'National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport',        label: 'Passport' },
  { value: 'umid',            label: 'UMID' },
  { value: 'sss_id',          label: 'SSS ID' },
  { value: 'philhealth_id',   label: 'PhilHealth ID' },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'postal_id',       label: 'Postal ID' },
  { value: 'school_id',       label: 'School ID' },
];

const REQUIRES_BACK: GovernmentIdType[] = [
  'drivers_license', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id', 'umid',
];

interface FormState {
  shop_name: string;
  line_of_business: string;
  line_of_business_custom: string;
  shop_description: string;
  government_id_type: GovernmentIdType | '';
  government_id_image: File | null;
  government_id_image_back: File | null;
  business_permit: File | null;
  address: AddressValue;
}

const initial: FormState = {
  shop_name: '',
  line_of_business: '',
  line_of_business_custom: '',
  shop_description: '',
  government_id_type: '',
  government_id_image: null,
  government_id_image_back: null,
  business_permit: null,
  address: { province: '', city_municipality: '', barangay: '', street_address: '' },
};

function IDUploadZone({
  label, file, onChange, onClear, error,
}: {
  label: string; file: File | null;
  onChange: (f: File) => void; onClear: () => void; error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pick(f: File) {
    onChange(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  function clear() {
    setPreview(null);
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  }

  const isPdf = file?.type === 'application/pdf';

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-brand-gray-mid">
        {label} <span className="text-brand-red">*</span>
        <span className="text-xs text-gray-400 font-normal ml-1">(JPG, PNG, or PDF — max 5MB)</span>
      </label>
      {!file ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer',
            'min-h-[120px] px-4 py-6 transition-all duration-150',
            dragging ? 'border-brand-red bg-red-50' : error ? 'border-red-400 bg-red-50/30' : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50/20',
          ].join(' ')}
        >
          <UploadCloud className={`w-8 h-8 ${dragging ? 'text-brand-red' : 'text-gray-300'}`} />
          <p className="text-sm font-semibold text-gray-500">Click to upload or drag & drop</p>
          <p className="text-xs text-gray-400">JPG, PNG, PDF up to 5MB</p>
          <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
        </div>
      ) : (
        <div className="relative rounded-xl border-2 border-brand-red/30 bg-red-50/20 overflow-hidden">
          {isPdf ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-brand-red" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-black truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB · PDF</p>
              </div>
            </div>
          ) : preview ? (
            <div className="relative">
              <img src={preview} alt="preview" className="w-full max-h-48 object-contain bg-gray-50 rounded-t-xl" />
              <div className="px-4 py-2 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs text-gray-500 truncate flex-1">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          ) : null}
          <button type="button" onClick={clear}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:border-red-400 hover:text-brand-red transition-colors"
            aria-label="Remove file">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Status screens ───────────────────────────────────────────────────────────

function PendingScreen() {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-8">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
        <Clock className="w-8 h-8 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-brand-black">Application Under Review</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-xs">
          Your seller application has been submitted. Our team will review it and notify you via email once a decision is made.
        </p>
      </div>
      <Link to="/" className="text-sm text-brand-red font-semibold hover:underline">Back to Shopping</Link>
    </div>
  );
}

function ApprovedScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center text-center gap-4 py-8">
      <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-green-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-brand-black">You're a Velure Seller!</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-xs">
          Your seller account is active. Head to your Seller Dashboard to manage your shop.
        </p>
      </div>
      <Button onClick={() => navigate('/seller/dashboard')} className="min-w-[180px]">
        Go to Seller Dashboard
      </Button>
      <Link to="/" className="text-sm text-gray-400 hover:underline">Back to Shopping</Link>
    </div>
  );
}

function RejectedScreen({ reason, onReapply }: { reason: string | null; onReapply: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-8">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-brand-red" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-brand-black">Application Rejected</h2>
        {reason && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-left max-w-sm">
            <span className="font-semibold">Reason: </span>{reason}
          </div>
        )}
        <p className="text-sm text-gray-500 mt-3 max-w-xs">
          You may correct the issues above and resubmit your application.
        </p>
      </div>
      <Button onClick={onReapply} className="min-w-[180px]">Resubmit Application</Button>
      <Link to="/" className="text-sm text-gray-400 hover:underline">Back to Shopping</Link>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SellerRegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initial);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof AddressValue, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  // Allow rejected users to resubmit by resetting to form view
  const [forceForm, setForceForm] = useState(false);

  // Redirect unauthenticated users to login
  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  const status = user.seller_profile?.application_status;

  // ── State routing ──────────────────────────────────────────────────────────
  if (!forceForm) {
    if (status === 'pending')  return <PageShell><PendingScreen /></PageShell>;
    if (status === 'approved') return <PageShell><ApprovedScreen /></PageShell>;
    if (status === 'rejected') return (
      <PageShell>
        <RejectedScreen
          reason={user.seller_profile?.rejection_reason ?? null}
          onReapply={() => setForceForm(true)}
        />
      </PageShell>
    );
  }

  // ── Application form ───────────────────────────────────────────────────────
  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  const needsBack = form.government_id_type !== '' && REQUIRES_BACK.includes(form.government_id_type as GovernmentIdType);

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    const addrErrs: Partial<Record<keyof AddressValue, string>> = {};
    if (!form.shop_name.trim())        errs.shop_name        = 'Shop name is required.';
    if (!form.line_of_business)        errs.line_of_business = 'Please select a line of business.';
    if (form.line_of_business === 'others' && !form.line_of_business_custom.trim())
      errs.line_of_business_custom = 'Please specify your line of business.';
    if (!form.shop_description.trim()) errs.shop_description = 'Store description is required.';
    if (!form.address.province)          addrErrs.province          = 'Province is required.';
    if (!form.address.city_municipality) addrErrs.city_municipality = 'City / Municipality is required.';
    if (!form.address.barangay)          addrErrs.barangay          = 'Barangay is required.';
    if (!form.government_id_type)      errs.government_id_type = 'Please select an ID type.';
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!form.government_id_image) {
      errs.government_id_image = 'Please upload your government ID (front).';
    } else if (!allowed.includes(form.government_id_image.type)) {
      errs.government_id_image = 'Only JPG, PNG, or PDF files are allowed.';
    } else if (form.government_id_image.size > 5 * 1024 * 1024) {
      errs.government_id_image = 'File must be 5MB or smaller.';
    }
    if (needsBack) {
      if (!form.government_id_image_back) {
        errs.government_id_image_back = 'Please upload the back of your ID.';
      } else if (!allowed.includes(form.government_id_image_back.type)) {
        errs.government_id_image_back = 'Only JPG, PNG, or PDF files are allowed.';
      } else if (form.government_id_image_back.size > 5 * 1024 * 1024) {
        errs.government_id_image_back = 'File must be 5MB or smaller.';
      }
    }
    if (!form.business_permit) {
      errs.business_permit = 'Please upload your business permit.';
    } else if (!allowed.includes(form.business_permit.type)) {
      errs.business_permit = 'Only JPG, PNG, or PDF files are allowed.';
    } else if (form.business_permit.size > 5 * 1024 * 1024) {
      errs.business_permit = 'File must be 5MB or smaller.';
    }
    setErrors(errs);
    setAddressErrors(addrErrs);
    return Object.keys(errs).length === 0 && Object.keys(addrErrs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setLoading(true);

    const data = new FormData();
    data.append('shop_name', form.shop_name);
    data.append('line_of_business', form.line_of_business === 'others' ? form.line_of_business_custom : form.line_of_business);
    data.append('shop_description', form.shop_description);
    data.append('address_province', form.address.province);
    data.append('address_city', form.address.city_municipality);
    data.append('address_barangay', form.address.barangay);
    if (form.address.street_address) data.append('address_street', form.address.street_address);
    data.append('government_id_type', form.government_id_type);
    if (form.government_id_image)      data.append('government_id_image', form.government_id_image);
    if (form.government_id_image_back) data.append('government_id_image_back', form.government_id_image_back);
    if (form.business_permit)          data.append('business_permit', form.business_permit);

    try {
      const res = await applyAsSellerApi(data);
      setUser(res.data);
      // setUser updates context; the status routing above will now show PendingScreen
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        const mapped: Partial<Record<keyof FormState, string>> = {};
        const addrMapped: Partial<Record<keyof AddressValue, string>> = {};
        Object.entries(resp.errors).forEach(([k, v]) => {
          if (k === 'address_province')        addrMapped.province          = v[0];
          else if (k === 'address_city')       addrMapped.city_municipality = v[0];
          else if (k === 'address_barangay')   addrMapped.barangay          = v[0];
          else if (k === 'address_street')     addrMapped.street_address    = v[0];
          else mapped[k as keyof FormState] = v[0];
        });
        setErrors(mapped);
        setAddressErrors(addrMapped);
      } else {
        setServerError(resp?.message ?? 'Submission failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ');

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-brand-black mb-1">Become a Seller</h1>
      <p className="text-sm text-gray-500 mb-6">Set up your shop and submit your documents for review.</p>

      {/* Read-only account info */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm mb-6 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="w-1.5 h-4 rounded-full bg-brand-red" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Your Account</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Full Name</p>
            <p className="text-sm font-semibold text-brand-black leading-snug">{fullName}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Email</p>
            <p className="text-sm font-semibold text-brand-black truncate leading-snug">{user.email}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Phone</p>
            <p className="text-sm font-semibold text-brand-black leading-snug">{user.phone ?? '—'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Date of Birth</p>
            <p className="text-sm font-semibold text-brand-black leading-snug">{user.date_of_birth ?? '—'}</p>
          </div>
        </div>
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1.5">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] text-gray-400">This information is from your account and cannot be changed here.</p>
        </div>
      </div>

      {serverError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Business Information</p>

        <Input label="Shop / Store Name" value={form.shop_name}
          onChange={(e) => set('shop_name', e.target.value)} error={errors.shop_name} required />

        <CustomSelect
          label="Line of Business (Category)" required
          value={form.line_of_business}
          onChange={(val) => { set('line_of_business', val); if (val !== 'others') set('line_of_business_custom', ''); }}
          options={CATEGORY_OPTIONS} placeholder="Select a category…"
          error={errors.line_of_business}
        />

        {form.line_of_business === 'others' && (
          <Input label="Specify your line of business" value={form.line_of_business_custom}
            onChange={(e) => set('line_of_business_custom', e.target.value)}
            error={errors.line_of_business_custom} placeholder="e.g. Handmade Crafts" required />
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-brand-gray-mid">
            Store Description <span className="text-brand-red">*</span>
          </label>
          <div className="relative">
            <textarea
              value={form.shop_description}
              onChange={(e) => { if (e.target.value.length <= 200) set('shop_description', e.target.value); }}
              placeholder="Tell shoppers what your store is about…"
              rows={3}
              className={[
                'w-full rounded-xl border px-4 py-3 text-sm resize-none',
                'bg-white text-brand-black placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent transition-colors',
                errors.shop_description ? 'border-red-400' : 'border-gray-300',
              ].join(' ')}
            />
            <span className={['absolute bottom-2.5 right-3 text-xs',
              form.shop_description.length >= 200 ? 'text-brand-red font-semibold' : 'text-gray-400'].join(' ')}>
              {form.shop_description.length}/200
            </span>
          </div>
          {errors.shop_description && <p className="text-xs text-red-600">{errors.shop_description}</p>}
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Business / Warehouse Address</p>
        <p className="text-xs text-gray-400 -mt-2">Where your products will be shipped from. You can update this later.</p>
        <AddressFields
          value={form.address}
          onChange={(addr) => { setForm((f) => ({ ...f, address: addr })); setAddressErrors({}); }}
          errors={addressErrors}
          streetLabel="Street / House No. (optional)"
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Government ID</p>
        <CustomSelect
          label="ID Type" required value={form.government_id_type}
          onChange={(val) => {
            setForm((f) => ({ ...f, government_id_type: val as GovernmentIdType, government_id_image: null, government_id_image_back: null }));
            setErrors((e) => ({ ...e, government_id_type: undefined, government_id_image: undefined, government_id_image_back: undefined }));
          }}
          options={ID_TYPES} placeholder="Select ID type…" error={errors.government_id_type}
        />

        {form.government_id_type && (
          <IDUploadZone
            label={needsBack ? 'ID Image (Front)' : 'ID Image'}
            file={form.government_id_image}
            onChange={(f) => { setForm((s) => ({ ...s, government_id_image: f })); setErrors((e) => ({ ...e, government_id_image: undefined })); }}
            onClear={() => { setForm((s) => ({ ...s, government_id_image: null })); }}
            error={errors.government_id_image}
          />
        )}

        {needsBack && (
          <IDUploadZone
            label="ID Image (Back)"
            file={form.government_id_image_back}
            onChange={(f) => { setForm((s) => ({ ...s, government_id_image_back: f })); setErrors((e) => ({ ...e, government_id_image_back: undefined })); }}
            onClear={() => { setForm((s) => ({ ...s, government_id_image_back: null })); }}
            error={errors.government_id_image_back}
          />
        )}

        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Business Permit</p>
        <IDUploadZone
          label="Business Permit"
          file={form.business_permit}
          onChange={(f) => { setForm((s) => ({ ...s, business_permit: f })); setErrors((e) => ({ ...e, business_permit: undefined })); }}
          onClear={() => { setForm((s) => ({ ...s, business_permit: null })); }}
          error={errors.business_permit}
        />

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 leading-relaxed">
          After submitting, please wait for the administrator's approval. You will be notified via email.
        </div>

        <Button type="submit" loading={loading} className="w-full mt-2">Submit Application</Button>
      </form>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="flex flex-col w-full md:w-1/2 px-6 py-12 sm:px-12 lg:px-16 bg-white overflow-y-auto">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="flex items-center gap-2 mb-6">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-xl tracking-tight">Velure</span>
          </Link>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-full bg-brand-red/10 flex items-center justify-center">
              <Store className="w-4 h-4 text-brand-red" />
            </div>
            <span className="text-sm font-semibold text-gray-600">Seller Application</span>
          </div>
          {children}
        </div>
      </div>
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black sticky top-0 h-screen">
        <img
          src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200&q=80"
          alt="Velure fashion store"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 to-transparent flex items-end p-12">
          <div>
            <p className="text-brand-white text-3xl font-bold">Start selling on Velure</p>
            <p className="text-brand-white/70 mt-2 text-base">Reach thousands of shoppers across the Philippines.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
