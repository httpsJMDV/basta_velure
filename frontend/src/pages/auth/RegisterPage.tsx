import { useState, useEffect, useRef } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import CustomSelect from '../../components/ui/CustomSelect';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { registerBuyerApi } from '../../api/client';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const REQUIRES_BACK = new Set(['national_id', 'drivers_license', 'umid', 'sss_id', 'voters_id']);

const GOV_ID_OPTIONS = [
  { value: 'national_id',    label: 'National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport',       label: 'Passport' },
  { value: 'umid',           label: 'UMID' },
  { value: 'sss_id',         label: 'SSS ID' },
  { value: 'philhealth_id',  label: 'PhilHealth ID' },
  { value: 'voters_id',      label: "Voter's ID" },
  { value: 'postal_id',      label: 'Postal ID' },
];

interface PsgcItem { code: string; name: string; }

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function RegisterPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    sex: '',
    email: '', phone: '',
    date_of_birth: '',
    password: '', password_confirmation: '',
    province: '', city_municipality: '', barangay: '', street_address: '',
    government_id_type: '',
  });
  const [idFile,     setIdFile]     = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [idFileError,     setIdFileError]     = useState('');
  const [idBackFileError, setIdBackFileError] = useState('');
  const [avatarFileError, setAvatarFileError] = useState('');
  const idInputRef     = useRef<HTMLInputElement>(null);
  const idBackInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setAvatarFile(f);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(f ? URL.createObjectURL(f) : null);
    setAvatarFileError('');
  }

  // PSGC cascading dropdowns
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBrgy, setLoadingBrgy] = useState(false);

  useEffect(() => {
    fetch('https://psgc.gitlab.io/api/provinces/')
      .then((r) => r.json())
      .then((data: PsgcItem[]) =>
        setProvinces([...data].sort((a, b) => a.name.localeCompare(b.name)))
      )
      .catch(() => {});
  }, []);

  function handleProvince(code: string) {
    setForm((f) => ({ ...f, province: code, city_municipality: '', barangay: '' }));
    setCities([]);
    setBarangays([]);
    if (!code) return;
    setLoadingCities(true);
    fetch(`https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) =>
        setCities([...data].sort((a, b) => a.name.localeCompare(b.name)))
      )
      .catch(() => {})
      .finally(() => setLoadingCities(false));
  }

  function handleCity(code: string) {
    setForm((f) => ({ ...f, city_municipality: code, barangay: '' }));
    setBarangays([]);
    if (!code) return;
    setLoadingBrgy(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${code}/barangays/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) =>
        setBarangays([...data].sort((a, b) => a.name.localeCompare(b.name)))
      )
      .catch(() => {})
      .finally(() => setLoadingBrgy(false));
  }

  const age = calcAge(form.date_of_birth);
  const ageError = age !== null && age < 18 ? 'You must be at least 18 years old.' : '';

  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleIdFile(e: ChangeEvent<HTMLInputElement>) {
    setIdFile(e.target.files?.[0] ?? null);
    setIdFileError('');
  }

  function handleIdBackFile(e: ChangeEvent<HTMLInputElement>) {
    setIdBackFile(e.target.files?.[0] ?? null);
    setIdBackFileError('');
  }

  const needsBack = REQUIRES_BACK.has(form.government_id_type);

  function handleNextStep(e: FormEvent) {
    e.preventDefault();
    // Basic step-1 client validation before advancing
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'First name is required.';
    if (!form.last_name.trim())  errs.last_name  = 'Last name is required.';
    if (!form.email.trim())      errs.email      = 'Email is required.';
    if (form.phone.length < 5)   errs.phone      = 'Phone is required.';
    if (!form.password)          errs.password   = 'Password is required.';
    if (form.password !== form.password_confirmation)
      errs.password_confirmation = 'Passwords do not match.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStep(2);
    window.scrollTo({ top: 0 });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    if (ageError) return;
    if (!avatarFile) { setAvatarFileError('Please upload a profile photo.'); return; }
    if (!idFile) { setIdFileError('Please upload the front of your ID.'); return; }
    if (needsBack && !idBackFile) { setIdBackFileError('Please upload the back of your ID.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'province') {
          fd.append('province', provinces.find((p) => p.code === v)?.name ?? v);
        } else if (k === 'city_municipality') {
          fd.append('city_municipality', cities.find((c) => c.code === v)?.name ?? v);
        } else if (k === 'barangay') {
          fd.append('barangay', barangays.find((b) => b.code === v)?.name ?? v);
        } else {
          fd.append(k, v);
        }
      });
      fd.append('government_id_image', idFile);
      if (needsBack && idBackFile) fd.append('government_id_image_back', idBackFile);
      if (avatarFile) fd.append('avatar', avatarFile);
      const res = await registerBuyerApi(fd as unknown as Record<string, string>);
      setAuth(res.data, res.token);
      navigate('/');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        const mapped: Record<string, string> = {};
        Object.entries(resp.errors).forEach(([k, v]) => { mapped[k] = v[0]; });
        setErrors(mapped);
        // If server returns step-1 errors, go back to step 1
        const step1Keys = ['first_name','last_name','email','phone','password','password_confirmation'];
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
              <span className={`text-xs font-semibold ${step === 1 ? 'text-brand-red' : 'text-gray-400'}`}>Account</span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                step === 2 ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-400'
              }`}>2</div>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-brand-red' : 'text-gray-400'}`}>Verification</span>
            </div>
          </div>

          {step === 1 ? (
            <>
              <h1 className="text-3xl font-bold text-brand-black mb-1">Create account</h1>
              <p className="text-sm text-gray-500 mb-8">Join Velure and start shopping today.</p>

              {serverError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleNextStep} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="First Name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} required />
                  <Input label="Last Name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} required />
                </div>
                <Input label="Middle Name (optional)" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} />
                <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
                <PhoneInput label="Phone" required value={form.phone} onChange={(val) => set('phone', val)} error={errors.phone} />
                <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} required />
                <Input label="Confirm Password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} error={errors.password_confirmation} required />

                <Button type="submit" className="w-full mt-2">Continue</Button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <GoogleSignInButton label="Sign up with Google" />

              <p className="mt-6 text-sm text-center text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-red font-semibold hover:underline">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-brand-black mb-1">Verify your identity</h1>
              <p className="text-sm text-gray-500 mb-8">Almost there — just a few more details.</p>

              {serverError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                {/* Profile Photo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Profile Photo <span className="text-brand-red">*</span>
                  </label>
                  <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="hidden" />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className={[
                      'w-full rounded-xl border-2 border-dashed flex items-center gap-4 px-4 py-3 transition-all',
                      avatarFileError || errors.avatar ? 'border-red-400 bg-red-50'
                        : avatarFile ? 'border-brand-red bg-red-50'
                        : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50',
                    ].join(' ')}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2 border-brand-red shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-700">{avatarFile ? avatarFile.name : 'Upload a photo'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">A clear, formal photo is recommended — but any photo is okay. JPG, PNG or WebP, max 5MB.</p>
                    </div>
                  </button>
                  {(avatarFileError || errors.avatar) && <p className="text-xs text-red-600">{avatarFileError || errors.avatar}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Input
                    label="Birthday"
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => set('date_of_birth', e.target.value)}
                    error={errors.date_of_birth || ageError}
                    required
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {age !== null && !ageError && (
                    <p className="text-xs text-gray-400">Age: {age}</p>
                  )}
                </div>
                <CustomSelect label="Sex" required value={form.sex} onChange={(v) => set('sex', v)} options={SEX_OPTIONS} placeholder="Select sex" error={errors.sex} />

                {/* Address */}
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-brand-black">Address</p>
                  <CustomSelect
                    label="Province"
                    required
                    value={form.province}
                    onChange={handleProvince}
                    options={provinces.map((p) => ({ value: p.code, label: p.name }))}
                    placeholder={provinces.length === 0 ? 'Loading…' : 'Select province'}
                    error={errors.province}
                  />
                  <CustomSelect
                    label="City / Municipality"
                    required
                    value={form.city_municipality}
                    onChange={handleCity}
                    options={cities.map((c) => ({ value: c.code, label: c.name }))}
                    placeholder={loadingCities ? 'Loading…' : form.province ? 'Select city/municipality' : 'Select province first'}
                    disabled={!form.province || loadingCities}
                    error={errors.city_municipality}
                  />
                  <CustomSelect
                    label="Barangay"
                    required
                    value={form.barangay}
                    onChange={(v) => set('barangay', v)}
                    options={barangays.map((b) => ({ value: b.code, label: b.name }))}
                    placeholder={loadingBrgy ? 'Loading…' : form.city_municipality ? 'Select barangay' : 'Select city first'}
                    disabled={!form.city_municipality || loadingBrgy}
                    error={errors.barangay}
                  />
                  <Input
                    label="Street / House No. (optional)"
                    value={form.street_address}
                    onChange={(e) => set('street_address', e.target.value)}
                    placeholder="e.g. 123 Rizal St."
                  />
                </div>

                {/* Government ID */}
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-brand-black">Government ID</p>
                  <CustomSelect
                    label="ID Type"
                    required
                    value={form.government_id_type}
                    onChange={(v) => {
                      set('government_id_type', v);
                      if (!REQUIRES_BACK.has(v)) setIdBackFile(null);
                      setIdFileError(''); setIdBackFileError('');
                    }}
                    options={GOV_ID_OPTIONS}
                    placeholder="Select ID type"
                    error={errors.government_id_type}
                  />

                  {form.government_id_type && (
                    <p className={`text-xs px-3 py-2 rounded-lg border ${
                      needsBack ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                      {needsBack
                        ? '📋 This ID requires both a front and back photo.'
                        : '📋 This ID only requires a single photo (front/main page).'}
                    </p>
                  )}

                  {/* Front */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-brand-gray-mid">
                      {needsBack ? 'Front of ID' : 'Upload ID'} <span className="text-brand-red">*</span>
                    </label>
                    <input ref={idInputRef} type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleIdFile} className="hidden" />
                    <button
                      type="button"
                      onClick={() => idInputRef.current?.click()}
                      className={[
                        'min-h-[44px] w-full rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors flex items-center gap-3',
                        idFileError || errors.government_id_image ? 'border-red-400 bg-red-50 text-red-500' : idFile ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-brand-red hover:bg-red-50 hover:text-brand-red',
                      ].join(' ')}
                    >
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="truncate">{idFile ? idFile.name : 'JPG, PNG or PDF — max 5MB'}</span>
                    </button>
                    {(idFileError || errors.government_id_image) && <p className="text-xs text-red-600">{idFileError || errors.government_id_image}</p>}
                  </div>

                  {/* Back — only for IDs that require it */}
                  {needsBack && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-brand-gray-mid">
                        Back of ID <span className="text-brand-red">*</span>
                      </label>
                      <input ref={idBackInputRef} type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleIdBackFile} className="hidden" />
                      <button
                        type="button"
                        onClick={() => idBackInputRef.current?.click()}
                        className={[
                          'min-h-[44px] w-full rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors flex items-center gap-3',
                          idBackFileError || errors.government_id_image_back ? 'border-red-400 bg-red-50 text-red-500' : idBackFile ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-brand-red hover:bg-red-50 hover:text-brand-red',
                        ].join(' ')}
                      >
                        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <span className="truncate">{idBackFile ? idBackFile.name : 'JPG, PNG or PDF — max 5MB'}</span>
                      </button>
                      {(idBackFileError || errors.government_id_image_back) && <p className="text-xs text-red-600">{idBackFileError || errors.government_id_image_back}</p>}
                    </div>
                  )}
                </div>

                {/* Pending approval notice */}
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 leading-relaxed">
                  After submitting, please wait for the administrator’s approval. You will be notified via email.
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setServerError(''); }}
                    className="flex-1 min-h-[44px] rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                  <Button type="submit" loading={loading} className="flex-1">
                    Create Account
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Lifestyle image — hidden on mobile */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200&q=80"
          alt="Velure fashion"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/70 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-4xl font-bold leading-tight">Velure</p>
            <p className="text-white/70 text-lg mt-1">Shop Everything, Delivered.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
