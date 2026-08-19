import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { completeProfileApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import CustomSelect from '../../components/ui/CustomSelect';
import PhoneInput from '../../components/ui/PhoneInput';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import { ArrowLeft, Check, ChevronRight, Upload, X } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const SEX_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const GOV_ID_OPTIONS = [
  { value: 'national_id',     label: 'National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport',        label: 'Passport' },
  { value: 'umid',            label: 'UMID' },
  { value: 'sss_id',          label: 'SSS ID' },
  { value: 'philhealth_id',   label: 'PhilHealth ID' },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'postal_id',       label: 'Postal ID' },
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

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Personal Info', 'Address', 'Government ID'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={[
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                done   ? 'bg-brand-red text-white'
                : active ? 'bg-brand-red text-white ring-4 ring-brand-red/20'
                : 'bg-gray-100 text-gray-400',
              ].join(' ')}>
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={[
                'text-[11px] font-semibold whitespace-nowrap',
                active ? 'text-brand-red' : done ? 'text-gray-500' : 'text-gray-300',
              ].join(' ')}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={[
                'w-16 sm:w-24 h-0.5 mx-2 mb-5 transition-all duration-300',
                i < current ? 'bg-brand-red' : 'bg-gray-200',
              ].join(' ')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Personal Info ───────────────────────────────────────────────────

interface Step1Data { phone: string; date_of_birth: string; sex: string; }

function AvatarUpload({
  file, previewUrl, googleAvatarUrl, error, onChange,
}: {
  file: File | null;
  previewUrl: string | null;
  googleAvatarUrl: string | null;
  error?: string;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const usingGoogle = !file && !!googleAvatarUrl && previewUrl === googleAvatarUrl;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-brand-gray-mid">
        Profile Photo <span className="text-brand-red">*</span>
      </label>
      <input
        ref={inputRef} type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          'w-full rounded-xl border-2 border-dashed flex items-center gap-4 px-4 py-3 transition-all',
          error ? 'border-red-400 bg-red-50'
            : (file || usingGoogle) ? 'border-brand-red bg-red-50'
            : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50',
        ].join(' ')}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="w-14 h-14 rounded-full object-cover border-2 border-brand-red shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-gray-400" />
          </div>
        )}
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-700">
            {file ? file.name : usingGoogle ? 'Using your Google photo' : 'Upload a photo'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {usingGoogle
              ? 'Click to replace with a different photo. A clear, formal photo is recommended.'
              : 'A clear, formal photo is recommended — but any photo is okay. JPG, PNG or WebP, max 5MB.'}
          </p>
        </div>
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Step1({
  data, onChange, onNext, errors, avatarFile, avatarPreview, googleAvatarUrl, onAvatarChange,
}: {
  data: Step1Data;
  onChange: (d: Partial<Step1Data>) => void;
  onNext: () => void;
  errors: Record<string, string>;
  avatarFile: File | null;
  avatarPreview: string | null;
  googleAvatarUrl: string | null;
  onAvatarChange: (f: File | null) => void;
}) {
  const age = calcAge(data.date_of_birth);
  const ageError = age !== null && age < 18 ? 'You must be at least 18 years old.' : '';
  const hasAvatar = !!avatarFile || !!googleAvatarUrl;

  function handleNext(e: FormEvent) {
    e.preventDefault();
    if (ageError || !hasAvatar) return;
    onNext();
  }

  return (
    <form onSubmit={handleNext} className="flex flex-col gap-5">
      <AvatarUpload
        file={avatarFile}
        previewUrl={avatarPreview}
        googleAvatarUrl={googleAvatarUrl}
        error={errors.avatar}
        onChange={onAvatarChange}
      />

      <PhoneInput
        label="Phone Number"
        required
        value={data.phone}
        onChange={(v) => onChange({ phone: v })}
        error={errors.phone}
      />

      <div className="flex flex-col gap-1">
        <DatePicker
          label="Birthday"
          required
          value={data.date_of_birth}
          onChange={(v) => onChange({ date_of_birth: v })}
          error={errors.date_of_birth || ageError}
          maxDate={new Date().toISOString().split('T')[0]}
        />
        {age !== null && !ageError && (
          <p className="text-xs text-gray-400 mt-0.5">Age: {age}</p>
        )}
      </div>

      <CustomSelect
        label="Sex"
        required
        value={data.sex}
        onChange={(v) => onChange({ sex: v })}
        options={SEX_OPTIONS}
        placeholder="Select sex"
        error={errors.sex}
      />

      <button
        type="submit"
        disabled={!hasAvatar || !data.phone || data.phone === '+63' || !data.date_of_birth || !data.sex || !!ageError}
        className="mt-2 min-h-[48px] w-full flex items-center justify-center gap-2 bg-brand-red text-white font-bold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </form>
  );
}

// ─── Step 2 — Address ─────────────────────────────────────────────────────────

interface Step2Data {
  province: string; city_municipality: string; barangay: string; street_address: string;
}

function Step2({
  data, onChange, onNext, onBack, errors,
}: {
  data: Step2Data;
  onChange: (d: Partial<Step2Data>) => void;
  onNext: () => void;
  onBack: () => void;
  errors: Record<string, string>;
}) {
  const [provinces,  setProvinces]  = useState<PsgcItem[]>([]);
  const [cities,     setCities]     = useState<PsgcItem[]>([]);
  const [barangays,  setBarangays]  = useState<PsgcItem[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBrgy,   setLoadingBrgy]   = useState(false);

  useEffect(() => {
    fetch('https://psgc.gitlab.io/api/provinces/')
      .then((r) => r.json())
      .then((d: PsgcItem[]) => setProvinces([...d].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  function handleProvince(code: string) {
    onChange({ province: code, city_municipality: '', barangay: '' });
    setCities([]); setBarangays([]);
    if (!code) return;
    setLoadingCities(true);
    fetch(`https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`)
      .then((r) => r.json())
      .then((d: PsgcItem[]) => setCities([...d].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingCities(false));
  }

  function handleCity(code: string) {
    onChange({ city_municipality: code, barangay: '' });
    setBarangays([]);
    if (!code) return;
    setLoadingBrgy(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${code}/barangays/`)
      .then((r) => r.json())
      .then((d: PsgcItem[]) => setBarangays([...d].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingBrgy(false));
  }

  // Resolve codes → names before proceeding
  function handleNext(e: FormEvent) {
    e.preventDefault();
    const resolved: Partial<Step2Data> = {};
    if (data.province)          resolved.province          = provinces.find((p) => p.code === data.province)?.name          ?? data.province;
    if (data.city_municipality) resolved.city_municipality = cities.find((c) => c.code === data.city_municipality)?.name    ?? data.city_municipality;
    if (data.barangay)          resolved.barangay          = barangays.find((b) => b.code === data.barangay)?.name          ?? data.barangay;
    onChange(resolved);
    onNext();
  }

  const canProceed = !!data.province && !!data.city_municipality && !!data.barangay;

  return (
    <form onSubmit={handleNext} className="flex flex-col gap-5">
      <CustomSelect
        label="Province" required
        value={data.province} onChange={handleProvince}
        options={provinces.map((p) => ({ value: p.code, label: p.name }))}
        placeholder={provinces.length === 0 ? 'Loading…' : 'Select province'}
        error={errors.province}
      />
      <CustomSelect
        label="City / Municipality" required
        value={data.city_municipality} onChange={handleCity}
        options={cities.map((c) => ({ value: c.code, label: c.name }))}
        placeholder={loadingCities ? 'Loading…' : data.province ? 'Select city/municipality' : 'Select province first'}
        disabled={!data.province || loadingCities}
        error={errors.city_municipality}
      />
      <CustomSelect
        label="Barangay" required
        value={data.barangay} onChange={(v) => onChange({ barangay: v })}
        options={barangays.map((b) => ({ value: b.code, label: b.name }))}
        placeholder={loadingBrgy ? 'Loading…' : data.city_municipality ? 'Select barangay' : 'Select city first'}
        disabled={!data.city_municipality || loadingBrgy}
        error={errors.barangay}
      />
      <Input
        label="Street / House No."
        value={data.street_address}
        onChange={(e) => onChange({ street_address: e.target.value })}
        placeholder="e.g. 123 Rizal St., Unit 4B"
      />

      <div className="flex gap-3 mt-2">
        <button
          type="button" onClick={onBack}
          className="min-h-[48px] flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="submit" disabled={!canProceed}
          className="min-h-[48px] flex-[2] flex items-center justify-center gap-2 bg-brand-red text-white font-bold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

// ─── ID types that require a back photo ─────────────────────────────────────

const REQUIRES_BACK = new Set(['national_id', 'drivers_license', 'umid', 'sss_id', 'voters_id']);

// ─── Reusable file upload zone ────────────────────────────────────────────────

function IdUploadZone({
  label, file, error, onChange,
}: {
  label: string;
  file: File | null;
  error?: string;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-brand-gray-mid">
        {label} <span className="text-brand-red">*</span>
      </label>
      <input
        ref={inputRef} type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <button
        type="button" onClick={() => inputRef.current?.click()}
        className={[
          'min-h-[90px] w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 px-4 py-4 transition-all',
          error ? 'border-red-400 bg-red-50'
            : file ? 'border-brand-red bg-red-50'
            : 'border-gray-200 bg-gray-50 hover:border-brand-red hover:bg-red-50',
        ].join(' ')}
      >
        {file ? (
          <>
            <div className="w-9 h-9 rounded-full bg-brand-red/10 flex items-center justify-center">
              <Check className="w-4 h-4 text-brand-red" />
            </div>
            <span className="text-sm font-semibold text-brand-red truncate max-w-full px-4">{file.name}</span>
            <span className="text-xs text-gray-400">Click to change</span>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <Upload className="w-4 h-4 text-gray-400" />
            </div>
            <span className="text-sm font-semibold text-gray-500">Click to upload</span>
            <span className="text-xs text-gray-400">JPG, PNG or PDF — max 5 MB</span>
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Step 3 — Government ID ───────────────────────────────────────────────────

interface Step3Data { government_id_type: string; }

function Step3({
  data, onChange, onBack, onSubmit, errors, loading,
}: {
  data: Step3Data;
  onChange: (d: Partial<Step3Data>) => void;
  onBack: () => void;
  onSubmit: (front: File, back: File | null) => void;
  errors: Record<string, string>;
  loading: boolean;
}) {
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile,  setBackFile]  = useState<File | null>(null);
  const [frontError, setFrontError] = useState('');
  const [backError,  setBackError]  = useState('');

  const needsBack = REQUIRES_BACK.has(data.government_id_type);

  // Reset back file when ID type changes to one that doesn't need it
  function handleIdTypeChange(v: string) {
    onChange({ government_id_type: v });
    if (!REQUIRES_BACK.has(v)) setBackFile(null);
    setFrontError(''); setBackError('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let valid = true;
    if (!frontFile) { setFrontError('Please upload the front of your ID.'); valid = false; }
    if (needsBack && !backFile) { setBackError('Please upload the back of your ID.'); valid = false; }
    if (!valid) return;
    onSubmit(frontFile!, needsBack ? backFile : null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <CustomSelect
        label="ID Type" required
        value={data.government_id_type} onChange={handleIdTypeChange}
        options={GOV_ID_OPTIONS} placeholder="Select ID type"
        error={errors.government_id_type}
      />

      {data.government_id_type && (
        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
          needsBack ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          {needsBack
            ? '📋 This ID requires both a front and back photo.'
            : '📋 This ID only requires a single photo (front/main page).'}
        </div>
      )}

      <IdUploadZone
        label={needsBack ? 'Front of ID' : 'Upload ID'}
        file={frontFile}
        error={frontError || errors.government_id_image}
        onChange={(f) => { setFrontFile(f); setFrontError(''); }}
      />

      {needsBack && (
        <IdUploadZone
          label="Back of ID"
          file={backFile}
          error={backError || errors.government_id_image_back}
          onChange={(f) => { setBackFile(f); setBackError(''); }}
        />
      )}

      {/* Notice */}
      <div className="flex gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
        <span className="text-amber-500 text-lg leading-none mt-0.5">ℹ</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          After submitting, please wait for the administrator's approval. You will be notified via email once your account is reviewed.
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <button
          type="button" onClick={onBack} disabled={loading}
          className="min-h-[48px] flex-1 flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="submit" disabled={!data.government_id_type || loading}
          className="min-h-[48px] flex-[2] flex items-center justify-center gap-2 bg-brand-red text-white font-bold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
          ) : (
            <><Check className="w-4 h-4" /> Complete Registration</>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompleteProfilePage() {
  const { user, setUser, clearAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const completedRef = useRef(false);

  // Google avatar URL passed via navigation state (from GoogleSignInButton)
  const googleAvatarUrl: string | null = (location.state as { googleAvatarUrl?: string | null } | null)?.googleAvatarUrl ?? null;

  const [step, setStep] = useState(0);
  const [step1, setStep1] = useState<Step1Data>({ phone: '+63', date_of_birth: '', sex: '' });
  const [step2, setStep2] = useState<Step2Data>({ province: '', city_municipality: '', barangay: '', street_address: '' });
  const [step3, setStep3] = useState<Step3Data>({ government_id_type: '' });
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(googleAvatarUrl);

  function handleAvatarChange(f: File | null) {
    setAvatarFile(f);
    // Only revoke if it's a local blob URL (not the Google URL)
    if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(f ? URL.createObjectURL(f) : googleAvatarUrl);
  }

  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading]         = useState(false);

  // If profile is already complete, redirect away
  useEffect(() => {
    if (user && user.date_of_birth && user.sex && user.government_id_type) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(idFile: File, idBackFile: File | null) {
    setServerError('');
    setErrors({});
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('phone',              step1.phone);
      fd.append('date_of_birth',      step1.date_of_birth);
      fd.append('sex',                step1.sex);
      fd.append('province',           step2.province);
      fd.append('city_municipality',  step2.city_municipality);
      fd.append('barangay',           step2.barangay);
      fd.append('street_address',     step2.street_address);
      fd.append('government_id_type', step3.government_id_type);
      if (avatarFile) fd.append('avatar', avatarFile);
      else if (googleAvatarUrl) fd.append('google_avatar_url', googleAvatarUrl);
      fd.append('government_id_image', idFile);
      if (idBackFile) fd.append('government_id_image_back', idBackFile);

      const updated = await completeProfileApi(fd);
      setUser(updated);
      completedRef.current = true;
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        const mapped: Record<string, string> = {};
        Object.entries(resp.errors).forEach(([k, v]) => { mapped[k] = v[0]; });
        setErrors(mapped);
        // Jump back to the step that has the error
        const step1Keys = ['phone', 'date_of_birth', 'sex'];
        const step2Keys = ['province', 'city_municipality', 'barangay', 'street_address'];
        if (step1Keys.some((k) => mapped[k])) setStep(0);
        else if (step2Keys.some((k) => mapped[k])) setStep(1);
        else setStep(2);
      } else {
        setServerError(resp?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const stepTitles = [
    { title: 'Personal Information',  sub: 'Tell us a bit about yourself.' },
    { title: 'Your Address',          sub: 'Where should we deliver your orders?' },
    { title: 'Government ID',         sub: 'Required for account verification.' },
  ];

  return (
    <div className="min-h-screen bg-brand-gray-soft flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              onClick={clearAuth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors"
              title="Exit to homepage"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link to="/" onClick={clearAuth} className="flex items-center gap-2">
              <img src="/logo1.png" alt="Velure" className="w-7 h-7 rounded-full logo-img" />
              <span className="text-brand-red font-bold text-lg tracking-tight">Velure</span>
            </Link>
          </div>
          <span className="text-xs text-gray-400 font-medium">Step {step + 1} of {STEPS.length}</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <StepIndicator current={step} />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Card header */}
            <div className="px-6 pt-6 pb-5 border-b border-gray-100">
              <h1 className="text-xl font-bold text-brand-black">{stepTitles[step].title}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{stepTitles[step].sub}</p>
            </div>

            <div className="px-6 py-6">
              {serverError && (
                <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{serverError}</p>
                </div>
              )}

              {step === 0 && (
                <Step1
                  data={step1}
                  onChange={(d) => setStep1((p) => ({ ...p, ...d }))}
                  onNext={() => { setErrors({}); setStep(1); }}
                  errors={errors}
                  avatarFile={avatarFile}
                  avatarPreview={avatarPreview}
                  googleAvatarUrl={googleAvatarUrl}
                  onAvatarChange={handleAvatarChange}
                />
              )}
              {step === 1 && (
                <Step2
                  data={step2}
                  onChange={(d) => setStep2((p) => ({ ...p, ...d }))}
                  onNext={() => { setErrors({}); setStep(2); }}
                  onBack={() => setStep(0)}
                  errors={errors}
                />
              )}
              {step === 2 && (
                <Step3
                  data={step3}
                  onChange={(d) => setStep3((p) => ({ ...p, ...d }))}
                  onBack={() => setStep(1)}
                  onSubmit={(front, back) => handleSubmit(front, back)}
                  errors={errors}
                  loading={loading}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
