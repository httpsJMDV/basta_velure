import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronRight, Clock, IdCard, MapPin, Upload, UserRound } from 'lucide-react';
import { completeProfileApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import CustomSelect from '../../components/ui/CustomSelect';
import PhoneInput from '../../components/ui/PhoneInput';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import photo from '../../assets/auth/profile.jpg';

// ─── Constants ───────────────────────────────────────────────────────────────

const SEX_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// Government-issued IDs only: every account is 18 or older, so a school ID is no longer accepted.
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

const PRIMARY = 'min-h-[46px] flex items-center justify-center gap-2 rounded-lg bg-brand-red text-white text-sm font-semibold hover:bg-brand-red-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const SECONDARY = 'min-h-[46px] flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white text-sm font-semibold text-stone-700 hover:border-stone-900 transition-colors disabled:opacity-40';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'About you', title: 'About you', sub: 'Your photo, mobile number and birthday.', icon: UserRound },
  { label: 'Address', title: 'Your address', sub: 'Where should we deliver your orders?', icon: MapPin },
  { label: 'Valid ID', title: 'A valid ID', sub: 'A government-issued ID, so we know it is really you.', icon: IdCard },
];

/** Three segments that fill as the steps are done, with the step names under them. */
function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2 mb-7" aria-label="Steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} aria-current={active ? 'step' : undefined}>
            <span className={`block h-1 rounded-full transition-colors duration-300 ${done || active ? 'bg-brand-red' : 'bg-stone-200'}`} />
            <span className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${active ? 'text-stone-900' : done ? 'text-stone-500' : 'text-stone-400'}`}>
              {done && <Check className="w-3.5 h-3.5 text-brand-red" strokeWidth={3} />}
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
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
      <span className="text-sm font-medium text-brand-gray-mid">Profile photo <span className="text-brand-red">*</span></span>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          'w-full rounded-xl border flex items-center gap-4 px-4 py-3 text-left bg-white transition-colors',
          error ? 'border-red-400' : (file || usingGoogle) ? 'border-stone-300' : 'border-dashed border-stone-300 hover:border-brand-red',
        ].join(' ')}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0" />
        ) : (
          <span className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center shrink-0"><Upload className="w-5 h-5 text-stone-400" /></span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-stone-800 truncate">{file ? file.name : usingGoogle ? 'Using your Google photo' : 'Upload a photo'}</span>
          <span className="block text-xs text-stone-500 mt-0.5">
            {file || usingGoogle ? 'Click to choose a different photo.' : 'A clear photo of your face. JPG, PNG or WebP, up to 5 MB.'}
          </span>
        </span>
        <span className="ml-auto shrink-0 text-[12.5px] font-semibold text-brand-red">{file || usingGoogle ? 'Change' : 'Choose'}</span>
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
      <AvatarUpload file={avatarFile} previewUrl={avatarPreview} googleAvatarUrl={googleAvatarUrl} error={errors.avatar} onChange={onAvatarChange} />

      <PhoneInput label="Mobile number" required value={data.phone} onChange={(v) => onChange({ phone: v })} error={errors.phone} />

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <DatePicker
            label="Birthday"
            required
            value={data.date_of_birth}
            onChange={(v) => onChange({ date_of_birth: v })}
            error={errors.date_of_birth || ageError}
            maxDate={new Date().toISOString().split('T')[0]}
          />
          {age !== null && !ageError && <p className="text-xs text-stone-400 mt-0.5">Age {age}</p>}
        </div>
        <CustomSelect label="Sex" required value={data.sex} onChange={(v) => onChange({ sex: v })} options={SEX_OPTIONS} placeholder="Select" error={errors.sex} />
      </div>

      <button
        type="submit"
        disabled={!hasAvatar || !data.phone || data.phone === '+63' || !data.date_of_birth || !data.sex || !!ageError}
        className={`mt-1 w-full ${PRIMARY}`}
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

  const NCR_CODE = '130000000';

  useEffect(() => {
    fetch('https://psgc.gitlab.io/api/provinces/')
      .then((r) => r.json())
      .then((d: PsgcItem[]) => {
        const sorted = [...d].sort((a, b) => a.name.localeCompare(b.name));
        setProvinces([{ code: NCR_CODE, name: 'Metro Manila (NCR)' }, ...sorted]);
      })
      .catch(() => {});
  }, []);

  function handleProvince(code: string) {
    onChange({ province: code, city_municipality: '', barangay: '' });
    setCities([]); setBarangays([]);
    if (!code) return;
    const isNCR = code === NCR_CODE;
    const url = isNCR
      ? `https://psgc.gitlab.io/api/regions/${NCR_CODE}/cities-municipalities/`
      : `https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`;
    setLoadingCities(true);
    fetch(url)
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
      <div className="grid sm:grid-cols-2 gap-4">
        <CustomSelect
          label="City / Municipality" required
          value={data.city_municipality} onChange={handleCity}
          options={cities.map((c) => ({ value: c.code, label: c.name }))}
          placeholder={loadingCities ? 'Loading…' : data.province ? 'Select city' : 'Province first'}
          disabled={!data.province || loadingCities}
          error={errors.city_municipality}
        />
        <CustomSelect
          label="Barangay" required
          value={data.barangay} onChange={(v) => onChange({ barangay: v })}
          options={barangays.map((b) => ({ value: b.code, label: b.name }))}
          placeholder={loadingBrgy ? 'Loading…' : data.city_municipality ? 'Select barangay' : 'City first'}
          disabled={!data.city_municipality || loadingBrgy}
          error={errors.barangay}
        />
      </div>
      <Input
        label="Street / House No."
        value={data.street_address}
        onChange={(e) => onChange({ street_address: e.target.value })}
        placeholder="e.g. 123 Rizal St., Unit 4B"
      />

      <div className="flex gap-3 mt-1">
        <button type="button" onClick={onBack} className={`flex-1 ${SECONDARY}`}>Back</button>
        <button type="submit" disabled={!canProceed} className={`flex-[2] ${PRIMARY}`}>
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

// ─── ID types that require a back photo ─────────────────────────────────────

const REQUIRES_BACK = new Set(['drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id']);

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
      <span className="text-sm font-medium text-brand-gray-mid">{label} <span className="text-brand-red">*</span></span>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="hidden" />
      <button
        type="button" onClick={() => inputRef.current?.click()}
        className={[
          'min-h-[96px] w-full rounded-xl border bg-white flex flex-col items-center justify-center gap-1.5 px-4 py-4 transition-colors',
          error ? 'border-red-400' : file ? 'border-stone-300' : 'border-dashed border-stone-300 hover:border-brand-red',
        ].join(' ')}
      >
        {file ? (
          <>
            <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center"><Check className="w-4 h-4 text-emerald-600" /></span>
            <span className="text-sm font-semibold text-stone-800 truncate max-w-full px-4">{file.name}</span>
            <span className="text-xs text-stone-500">Click to change</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-stone-400" />
            <span className="text-sm font-semibold text-stone-700">Upload a photo or PDF</span>
            <span className="text-xs text-stone-400">JPG, PNG or PDF, up to 5 MB</span>
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
  const [idType, setIdType] = useState(data.government_id_type);

  const needsBack = REQUIRES_BACK.has(idType);

  function handleIdTypeChange(v: string) {
    setIdType(v);
    onChange({ government_id_type: v });
    if (!REQUIRES_BACK.has(v)) { setBackFile(null); setBackError(''); }
    setFrontError('');
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
      <div>
        <CustomSelect label="ID type" required value={idType} onChange={handleIdTypeChange} options={GOV_ID_OPTIONS} placeholder="Select ID type" error={errors.government_id_type} />
        {idType && <p className="mt-1.5 text-[12.5px] text-stone-500">{needsBack ? 'This ID needs a photo of the front and the back.' : 'This ID needs a photo of the front only.'}</p>}
      </div>

      <div className={needsBack ? 'grid sm:grid-cols-2 gap-4' : ''}>
        <IdUploadZone label={needsBack ? 'Front of ID' : 'Photo of your ID'} file={frontFile} error={frontError || errors.government_id_image}
          onChange={(f) => { setFrontFile(f); setFrontError(''); }} />
        {needsBack && (
          <IdUploadZone label="Back of ID" file={backFile} error={backError || errors.government_id_image_back}
            onChange={(f) => { setBackFile(f); setBackError(''); }} />
        )}
      </div>

      <p className="flex items-start gap-2.5 rounded-xl bg-white border border-stone-200 px-4 py-3 text-[12.5px] leading-relaxed text-stone-600">
        <Clock className="w-4 h-4 mt-px shrink-0 text-amber-600" />
        An admin checks your ID after you submit. We email you once your account is reviewed.
      </p>

      <div className="flex gap-3 mt-1">
        <button type="button" onClick={onBack} disabled={loading} className={`flex-1 ${SECONDARY}`}>Back</button>
        <button type="submit" disabled={!data.government_id_type || loading} className={`flex-[2] ${PRIMARY}`}>
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
            : <><Check className="w-4 h-4" /> Finish</>}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompleteProfilePage() {
  const { user, clearAuth } = useAuth();
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
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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

      await completeProfileApi(fd);
      completedRef.current = true;
      setShowSuccessModal(true);
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

  const signOut = () => { clearAuth(); navigate('/', { replace: true }); };

  return (
    <AuthShell
      wide
      portals={false}
      eyebrow={`Step ${step + 1} of ${STEPS.length}`}
      title={STEPS[step].title}
      subtitle={STEPS[step].sub}
      image={photo}
      imageAlt="A rail of colourful clothes in a shop"
      headline={user?.first_name ? `Almost done, ${user.first_name}.` : 'Almost done.'}
      facts={STEPS.map((s, i) => ({ icon: i < step ? Check : s.icon, text: `${s.title}${i < step ? ' · done' : i === step ? ' · now' : ''}` }))}
    >
      <StepIndicator current={step} />

      {serverError && <AuthNotice tone="red">{serverError}</AuthNotice>}

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

      <p className="mt-6 text-[13px] text-stone-500">
        Not now? <button type="button" onClick={signOut} className="font-semibold text-brand-red hover:underline">Sign out</button> and finish later.
      </p>

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 px-4" role="dialog" aria-modal="true" aria-labelledby="profile-done-title">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8">
            <span className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center"><Clock className="w-6 h-6" /></span>
            <h2 id="profile-done-title" className="mt-5 font-serif text-[24px] font-bold tracking-tight text-[#1E1B18]">Thanks, we&apos;re checking it</h2>
            <p className="mt-2 text-sm text-stone-600 leading-relaxed">
              An admin reviews your ID and details. We email you as soon as your account is approved.
            </p>
            <button
              onClick={() => { setShowSuccessModal(false); clearAuth(); navigate('/login', { replace: true }); }}
              className={`mt-6 w-full ${PRIMARY}`}
            >
              Got it, go to sign in
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
