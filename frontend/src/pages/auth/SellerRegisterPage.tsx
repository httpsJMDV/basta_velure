import { useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerSellerApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import DatePicker from '../../components/ui/DatePicker';
import PhoneInput from '../../components/ui/PhoneInput';
import type { GovernmentIdType } from '../../types';

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
  shop_name: string; payout_gcash_number: string;
  government_id_type: GovernmentIdType | '';
  government_id_number: string;
  government_id_image: File | null;
}

const initial: FormState = {
  first_name: '', middle_name: '', last_name: '',
  email: '', phone: '',
  password: '', password_confirmation: '',
  date_of_birth: '',
  shop_name: '', payout_gcash_number: '',
  government_id_type: '',
  government_id_number: '',
  government_id_image: null,
};

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

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, government_id_image: file }));
    setErrors((e) => ({ ...e, government_id_image: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    setLoading(true);

    const data = new FormData();
    (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
      if (form[k] !== null && form[k] !== '') {
        data.append(k, form[k] as string | Blob);
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
            <Input label="GCash Payout Number" type="tel" value={form.payout_gcash_number} onChange={(e) => set('payout_gcash_number', e.target.value)} error={errors.payout_gcash_number} required />

            {/* Government ID */}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-2">Government ID</p>
            <CustomSelect
              label="ID Type"
              required
              value={form.government_id_type}
              onChange={(val) => set('government_id_type', val)}
              options={ID_TYPES}
              placeholder="Select ID type…"
              error={errors.government_id_type}
            />
            <Input label="ID Number" value={form.government_id_number} onChange={(e) => set('government_id_number', e.target.value)} error={errors.government_id_number} required />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-brand-gray-mid">ID Image (JPG, PNG, or PDF — max 5MB)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFile}
                required
                className="min-h-[44px] w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-red file:text-white hover:file:bg-brand-red-dark cursor-pointer"
              />
              {errors.government_id_image && <p className="text-xs text-red-600">{errors.government_id_image}</p>}
            </div>

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
