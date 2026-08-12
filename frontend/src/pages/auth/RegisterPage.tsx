import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { registerBuyerApi } from '../../api/client';

export default function RegisterPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '',
    email: '', phone: '',
    password: '', password_confirmation: '',
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    setLoading(true);
    try {
      const res = await registerBuyerApi(form);
      setAuth(res.data, res.token);
      navigate('/');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        const mapped: Partial<typeof form> = {};
        Object.entries(resp.errors).forEach(([k, v]) => {
          mapped[k as keyof typeof form] = v[0];
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
      <div className="flex flex-col justify-center w-full md:w-1/2 px-6 py-12 sm:px-12 lg:px-16 bg-white overflow-y-auto">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="flex items-center gap-2 mb-6">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-xl tracking-tight">Velure</span>
          </Link>

          <h1 className="text-3xl font-bold text-brand-black mb-1">Create account</h1>
          <p className="text-sm text-gray-500 mb-8">Join Velure and start shopping today.</p>

          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} required />
              <Input label="Last Name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} required />
            </div>
            <Input label="Middle Name (optional)" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} error={errors.middle_name} />
            <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
            <PhoneInput label="Phone" required value={form.phone} onChange={(val) => set('phone', val)} error={errors.phone} />
            <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} required />
            <Input label="Confirm Password" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)} error={errors.password_confirmation} required />

            <Button type="submit" loading={loading} className="w-full mt-2">
              Create Account
            </Button>
          </form>

          {/* Divider */}
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
            <p className="text-white/70 text-lg mt-1">Fashion. Delivered.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
