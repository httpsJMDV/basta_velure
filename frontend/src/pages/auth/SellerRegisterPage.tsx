import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerSellerApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import DatePicker from '../../components/ui/DatePicker';
import PhoneInput from '../../components/ui/PhoneInput';
import type { GovernmentIdType } from '../../types';
import { UploadCloud, FileText, X, Image as ImageIcon } from 'lucide-react';

const SHOP_CATEGORIES = [
  { value: 'dresses',    label: 'Dresses' },
  { value: 'skirts',     label: 'Skirts' },
  { value: 'tops',       label: 'Tops' },
  { value: 'blouses',    label: 'Blouses' },
  { value: 'activewear', label: 'Activewear' },
  { value: 'yoga_pants', label: 'Yoga Pants' },
  { value: 'lingerie',   label: 'Lingerie' },
  { value: 'sleepwear',  label: 'Sleepwear' },
  { value: 'jackets',    label: 'Jackets' },
  { value: 'coats',      label: 'Coats' },
  { value: 'shoes',      label: 'Shoes' },
  { value: 'accessories',label: 'Accessories' },
];

const ID_TYPES: { value: GovernmentIdType; label: string }[] = [
  { value: 'national_id',      label: 'National ID (PhilSys)' },
  { value: 'drivers_license',  label: "Driver's License" },
  { value: 'passport',         label: 'Passport' },
  { value: 'umid',             label: 'UMID' },
  { value: 'sss_id',           label: 'SSS ID' },
  { value: 'philhealth_id',    label: 'PhilHealth ID' },
  { value: 'voters_id',        label: "Voter's ID" },
  { value: 'postal_id',        label: 'Postal ID' },
];

interface FormState {
  first_name: string; middle_name: string; last_name: string;
  email: string; phone: string;
  password: string; password_confirmation: string;
  date_of_birth: string;
  shop_name: string; shop_category: string; shop_description: string; payout_gcash_number: string;
  government_id_type: GovernmentIdType | '';
  government_id_number: string;
  government_id_image: File | null;
  government_id_image_back: File | null;
}

const initial: FormState = {
  first_name: '', middle_name: '', last_name: '',
  email: '', phone: '',
  password: '', password_confirmation: '',
  date_of_birth: '',
  shop_name: '', shop_category: '', shop_description: '', payout_gcash_number: '',
  government_id_type: '',
  government_id_number: '',
  government_id_image: null,
  government_id_image_back: null,
};

function IDUploadZone({
  label,
  file,
  onChange,
  onClear,
  error,
}: {
  label: string;
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
  error?: string;
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pick(f);
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
          onDrop={handleDrop}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer',
            'min-h-[120px] px-4 py-6 transition-all duration-150',
            dragging ? 'border-brand-red bg-red-50' : error ? 'border-red-400 bg-red-50/30' : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50/20',
          ].join(' ')}
        >
          <UploadCloud className={`w-8 h-8 ${dragging ? 'text-brand-red' : 'text-gray-300'}`} />
          <p className="text-sm font-semibold text-gray-500">Click to upload or drag & drop</p>
          <p className="text-xs text-gray-400">JPG, PNG, PDF up to 5MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }}
          />
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
              <img src={preview} alt="ID preview" className="w-full max-h-48 object-contain bg-gray-50 rounded-t-xl" />
              <div className="px-4 py-2 flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs text-gray-500 truncate flex-1">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:border-red-400 hover:text-brand-red transition-colors"
            aria-label="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// IDs that require both front and back scans
const REQUIRES_BACK: GovernmentIdType[] = [
  'drivers_license', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id', 'umid',
];

export default function SellerRegisterPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleFile(file: File) {
    setForm((f) => ({ ...f, government_id_image: file }));
    setErrors((e) => ({ ...e, government_id_image: undefined }));
  }

  function clearFile() {
    setForm((f) => ({ ...f, government_id_image: null }));
    setErrors((e) => ({ ...e, government_id_image: undefined }));
  }

  function handleFileBack(file: File) {
    setForm((f) => ({ ...f, government_id_image_back: file }));
    setErrors((e) => ({ ...e, government_id_image_back: undefined }));
  }

  function clearFileBack() {
    setForm((f) => ({ ...f, government_id_image_back: null }));
    setErrors((e) => ({ ...e, government_id_image_back: undefined }));
  }

  const needsBack = form.government_id_type !== '' && REQUIRES_BACK.includes(form.government_id_type as GovernmentIdType);

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.first_name.trim())  errs.first_name  = 'First name is required.';
    if (!form.last_name.trim())   errs.last_name   = 'Last name is required.';
    if (!form.date_of_birth)      errs.date_of_birth = 'Date of birth is required.';

    if (!form.email.trim())       errs.email    = 'Email is required.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email.';

    if (!form.phone.trim() || form.phone === '+63') errs.phone = 'Phone number is required.';

    if (!form.password)           errs.password = 'Password is required.';
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(form.password)) errs.password = 'Password must include an uppercase letter.';
    else if (!/[a-z]/.test(form.password)) errs.password = 'Password must include a lowercase letter.';
    else if (!/[0-9]/.test(form.password)) errs.password = 'Password must include a number.';
    else if (!/[^A-Za-z0-9]/.test(form.password)) errs.password = 'Password must include a symbol.';

    if (!form.password_confirmation)          errs.password_confirmation = 'Please confirm your password.';
    else if (form.password !== form.password_confirmation) errs.password_confirmation = 'Passwords do not match.';

    if (!form.shop_name.trim())        errs.shop_name        = 'Shop name is required.';
    if (!form.shop_category)           errs.shop_category    = 'Please select a category.';
    if (!form.shop_description.trim()) errs.shop_description = 'Store description is required.';
    if (!form.payout_gcash_number.trim()) errs.payout_gcash_number = 'GCash number is required.';

    if (!form.government_id_type)        errs.government_id_type   = 'Please select an ID type.';
    if (!form.government_id_number.trim()) errs.government_id_number = 'ID number is required.';

    if (!form.government_id_image) {
      errs.government_id_image = 'Please upload your government ID (front).';
    } else {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowed.includes(form.government_id_image.type)) errs.government_id_image = 'Only JPG, PNG, or PDF files are allowed.';
      else if (form.government_id_image.size > 5 * 1024 * 1024) errs.government_id_image = 'File must be 5MB or smaller.';
    }

    const nb = form.government_id_type !== '' && REQUIRES_BACK.includes(form.government_id_type as GovernmentIdType);
    if (nb) {
      if (!form.government_id_image_back) {
        errs.government_id_image_back = 'Please upload the back of your ID.';
      } else {
        const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowed.includes(form.government_id_image_back.type)) errs.government_id_image_back = 'Only JPG, PNG, or PDF files are allowed.';
        else if (form.government_id_image_back.size > 5 * 1024 * 1024) errs.government_id_image_back = 'File must be 5MB or smaller.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setLoading(true);

    const data = new FormData();
    (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
      const val = form[k];
      if (val !== null && val !== '') {
        data.append(k, val as string | Blob);
      }
    });

    try {
      const res = await registerSellerApi(data);
      setAuth(res.data, res.token);
      navigate('/seller/dashboard');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        const mapped: Partial<Record<keyof FormState, string>> = {};
        Object.entries(resp.errors).forEach(([k, v]) => {
          mapped[k as keyof FormState] = v[0];
        });
        setErrors(mapped);
      } else {
        setServerError(resp?.message ?? 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Form column */}
      <div className="flex flex-col justify-start w-full md:w-1/2 px-6 py-10 sm:px-12 lg:px-16 bg-brand-white overflow-y-auto">
        <div className="max-w-lg w-full mx-auto">
          <Link to="/" className="text-brand-red font-bold text-xl tracking-tight">Velure</Link>
          <h1 className="text-2xl font-bold text-brand-black mt-4 mb-1">Become a Seller</h1>
          <p className="text-sm text-gray-500 mb-6">Fill in your details to apply. Our team will review your application.</p>

          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
            {/* Personal info */}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Personal Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="First Name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} required />
              <Input label="Last Name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} required />
            </div>
            <Input label="Middle Name (optional)" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} error={errors.middle_name} />
            <DatePicker
              label="Date of Birth"
              required
              value={form.date_of_birth}
              onChange={(val) => set('date_of_birth', val)}
              maxDate={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              error={errors.date_of_birth}
            />

            {/* Account */}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Account</p>
            <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
            <Input label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} required />
            <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} required />
            <Input label="Confirm Password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} error={errors.password_confirmation} required />

            {/* Shop */}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Shop Details</p>
            <Input label="Shop / Store Name" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} error={errors.shop_name} required />
            <CustomSelect
              label="Shop Category"
              required
              value={form.shop_category}
              onChange={(val) => set('shop_category', val)}
              options={SHOP_CATEGORIES}
              placeholder="Select a category…"
              error={errors.shop_category}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-brand-gray-mid">
                Store Description <span className="text-brand-red">*</span>
              </label>
              <div className="relative">
                <textarea
                  value={form.shop_description}
                  onChange={(e) => {
                    if (e.target.value.length <= 200) set('shop_description', e.target.value);
                  }}
                  placeholder="Tell shoppers what your store is about…"
                  rows={3}
                  className={[
                    'w-full rounded-xl border px-4 py-3 text-sm resize-none',
                    'bg-white text-brand-black placeholder-gray-400',
                    'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent transition-colors',
                    errors.shop_description ? 'border-red-400' : 'border-gray-300',
                  ].join(' ')}
                />
                <span className={[
                  'absolute bottom-2.5 right-3 text-xs',
                  form.shop_description.length >= 200 ? 'text-brand-red font-semibold' : 'text-gray-400',
                ].join(' ')}>
                  {form.shop_description.length}/200
                </span>
              </div>
              {errors.shop_description && <p className="text-xs text-red-600">{errors.shop_description}</p>}
            </div>
            <Input label="GCash Payout Number" type="tel" value={form.payout_gcash_number} onChange={(e) => set('payout_gcash_number', e.target.value)} error={errors.payout_gcash_number} required />

            {/* Government ID */}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Government ID</p>
            <CustomSelect
              label="ID Type"
              required
              value={form.government_id_type}
              onChange={(val) => {
                // reset both images whenever ID type changes
                setForm((f) => ({
                  ...f,
                  government_id_type: val as GovernmentIdType,
                  government_id_image: null,
                  government_id_image_back: null,
                }));
                setErrors((e) => ({ ...e, government_id_type: undefined, government_id_image: undefined, government_id_image_back: undefined }));
              }}
              options={ID_TYPES}
              placeholder="Select ID type…"
              error={errors.government_id_type}
            />
            <Input label="ID Number" value={form.government_id_number} onChange={(e) => set('government_id_number', e.target.value)} error={errors.government_id_number} required disabled={!form.government_id_type} placeholder={!form.government_id_type ? 'Select an ID type first' : ''} />

            {form.government_id_type && (
              <IDUploadZone
                label={needsBack ? 'ID Image (Front)' : 'ID Image'}
                file={form.government_id_image}
                onChange={handleFile}
                onClear={clearFile}
                error={errors.government_id_image}
              />
            )}

            {needsBack && (
              <IDUploadZone
                label="ID Image (Back)"
                file={form.government_id_image_back}
                onChange={handleFileBack}
                onClear={clearFileBack}
                error={errors.government_id_image_back}
              />
            )}

            <Button type="submit" loading={loading} className="w-full mt-4">
              Submit Application
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-red font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Lifestyle image — hidden on mobile */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black sticky top-0 h-screen">
        <img
          src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200&q=80"
          alt="Velure fashion store"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 to-transparent flex items-end p-12">
          <div>
            <p className="text-brand-white text-3xl font-bold">Start selling on Velure</p>
            <p className="text-brand-white/70 mt-2 text-base">Reach thousands of fashion-forward shoppers across the Philippines.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
