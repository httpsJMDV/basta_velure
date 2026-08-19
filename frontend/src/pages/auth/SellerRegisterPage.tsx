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

const SEX_OPTIONS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
];

const LINE_OF_BUSINESS = [
  { value: 'dresses_skirts',      label: 'Dresses & Skirts' },
  { value: 'tops_blouses',        label: 'Tops & Blouses' },
  { value: 'activewear_yoga',     label: 'Activewear & Yoga Pants' },
  { value: 'lingerie_sleepwear',  label: 'Lingerie & Sleepwear' },
  { value: 'jackets_coats',       label: 'Jackets & Coats' },
  { value: 'shoes_accessories',   label: 'Shoes & Accessories' },
  { value: 'others',              label: 'Others' },
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
  sex: string;
  email: string; phone: string;
  password: string; password_confirmation: string;
  date_of_birth: string;
  shop_name: string; line_of_business: string; line_of_business_custom: string; shop_description: string;
  government_id_type: GovernmentIdType | '';
  government_id_image: File | null;
  government_id_image_back: File | null;
  business_permit: File | null;
}

const initial: FormState = {
  first_name: '', middle_name: '', last_name: '',
  sex: '',
  email: '', phone: '',
  password: '', password_confirmation: '',
  date_of_birth: '',
  shop_name: '', line_of_business: '', line_of_business_custom: '', shop_description: '',
  government_id_type: '',
  government_id_image: null,
  government_id_image_back: null,
  business_permit: null,
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
  const [step, setStep] = useState<1 | 2>(1);
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

  function handleFilePermit(file: File) {
    setForm((f) => ({ ...f, business_permit: file }));
    setErrors((e) => ({ ...e, business_permit: undefined }));
  }

  function clearFilePermit() {
    setForm((f) => ({ ...f, business_permit: null }));
    setErrors((e) => ({ ...e, business_permit: undefined }));
  }

  const needsBack = form.government_id_type !== '' && REQUIRES_BACK.includes(form.government_id_type as GovernmentIdType);

  function validateStep1(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.first_name.trim())  errs.first_name  = 'First name is required.';
    if (!form.middle_name.trim()) errs.middle_name  = 'Middle name is required.';
    if (!form.last_name.trim())   errs.last_name   = 'Last name is required.';
    if (!form.sex)                errs.sex         = 'Sex is required.';
    if (!form.email.trim())       errs.email       = 'Email is required.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email.';
    if (!form.phone.trim() || form.phone === '+63') errs.phone = 'Phone number is required.';
    if (!form.date_of_birth)      errs.date_of_birth = 'Date of birth is required.';
    if (!form.password)           errs.password = 'Password is required.';
    else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(form.password)) errs.password = 'Password must include an uppercase letter.';
    else if (!/[a-z]/.test(form.password)) errs.password = 'Password must include a lowercase letter.';
    else if (!/[0-9]/.test(form.password)) errs.password = 'Password must include a number.';
    else if (!/[^A-Za-z0-9]/.test(form.password)) errs.password = 'Password must include a symbol.';
    if (!form.password_confirmation)          errs.password_confirmation = 'Please confirm your password.';
    else if (form.password !== form.password_confirmation) errs.password_confirmation = 'Passwords do not match.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNextStep(e: FormEvent) {
    e.preventDefault();
    if (!validateStep1()) return;
    setErrors({});
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.shop_name.trim())        errs.shop_name        = 'Shop name is required.';
    if (!form.line_of_business)        errs.line_of_business = 'Please select a line of business.';
    if (form.line_of_business === 'others' && !form.line_of_business_custom.trim())
      errs.line_of_business_custom = 'Please specify your line of business.';
    if (!form.shop_description.trim()) errs.shop_description = 'Store description is required.';
    if (!form.government_id_type)      errs.government_id_type = 'Please select an ID type.';
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
    if (!form.business_permit) {
      errs.business_permit = 'Please upload your business permit.';
    } else {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowed.includes(form.business_permit.type)) errs.business_permit = 'Only JPG, PNG, or PDF files are allowed.';
      else if (form.business_permit.size > 5 * 1024 * 1024) errs.business_permit = 'File must be 5MB or smaller.';
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
        if (k === 'line_of_business' && form.line_of_business === 'others') {
          data.append('line_of_business', form.line_of_business_custom);
        } else if (k !== 'line_of_business_custom') {
          data.append(k, val as string | Blob);
        }
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
        Object.entries(resp.errors).forEach(([k, v]) => { mapped[k as keyof FormState] = v[0]; });
        setErrors(mapped);
        const step1Keys = ['first_name','middle_name','last_name','sex','email','phone','date_of_birth','password','password_confirmation'];
        if (Object.keys(mapped).some((k) => step1Keys.includes(k))) setStep(1);
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
      <div className="flex flex-col w-full md:w-1/2 px-6 py-12 sm:px-12 lg:px-16 bg-white overflow-y-auto">
        <div className="max-w-sm w-full mx-auto">

          <Link to="/" className="flex items-center gap-2 mb-6">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-xl tracking-tight">Velure</span>
          </Link>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-brand-red text-white text-xs font-bold flex items-center justify-center">1</div>
              <span className={`text-xs font-semibold ${step === 1 ? 'text-brand-red' : 'text-gray-400'}`}>Personal Info</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                step === 2 ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-400'
              }`}>2</div>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-brand-red' : 'text-gray-400'}`}>Shop & Documents</span>
            </div>
          </div>

          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          {step === 1 ? (
            <>
              <h1 className="text-3xl font-bold text-brand-black mb-1">Become a Seller</h1>
              <p className="text-sm text-gray-500 mb-8">Tell us about yourself to get started.</p>

              <form onSubmit={handleNextStep} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="First Name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} required />
                  <Input label="Last Name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} required />
                </div>
                <Input label="Middle Name" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} error={errors.middle_name} required />
                <CustomSelect label="Sex" required value={form.sex} onChange={(v) => set('sex', v)} options={SEX_OPTIONS} placeholder="Select sex" error={errors.sex} />
                <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
                <PhoneInput label="Phone" required value={form.phone} onChange={(val) => set('phone', val)} error={errors.phone} />
                <DatePicker
                  label="Date of Birth"
                  required
                  value={form.date_of_birth}
                  onChange={(val) => set('date_of_birth', val)}
                  maxDate={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                  error={errors.date_of_birth}
                />
                <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} required />
                <Input label="Confirm Password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} error={errors.password_confirmation} required />

                <Button type="submit" className="w-full mt-2">Continue</Button>
              </form>

              <p className="mt-6 text-sm text-center text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-red font-semibold hover:underline">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-brand-black mb-1">Shop & Documents</h1>
              <p className="text-sm text-gray-500 mb-8">Set up your store and upload your requirements.</p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
                <Input label="Shop / Store Name" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} error={errors.shop_name} required />

                <CustomSelect
                  label="Line of Business (Category)"
                  required
                  value={form.line_of_business}
                  onChange={(val) => {
                    set('line_of_business', val);
                    if (val !== 'others') set('line_of_business_custom', '');
                  }}
                  options={LINE_OF_BUSINESS}
                  placeholder="Select a category…"
                  error={errors.line_of_business}
                />

                {form.line_of_business === 'others' && (
                  <Input
                    label="Specify your line of business"
                    value={form.line_of_business_custom}
                    onChange={(e) => set('line_of_business_custom', e.target.value)}
                    error={errors.line_of_business_custom}
                    placeholder="e.g. Handmade Crafts"
                    required
                  />
                )}

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

                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Government ID</p>
                <CustomSelect
                  label="ID Type"
                  required
                  value={form.government_id_type}
                  onChange={(val) => {
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

                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Business Permit</p>
                <IDUploadZone
                  label="Business Permit"
                  file={form.business_permit}
                  onChange={handleFilePermit}
                  onClear={clearFilePermit}
                  error={errors.business_permit}
                />

                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 leading-relaxed">
                  After submitting, please wait for the administrator's approval. You will be notified via email.
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setServerError(''); }}
                    className="flex-1 min-h-[44px] rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <Button type="submit" loading={loading} className="flex-1">Submit Application</Button>
                </div>
              </form>
            </>
          )}
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
            <p className="text-brand-white/70 mt-2 text-base">Reach thousands of shoppers across the Philippines.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
