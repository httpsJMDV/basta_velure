import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import LovedItLogo from '../../components/LovedItLogo';
import { PasswordField, TermsConsent } from '../../components/auth/AuthFields';
import { registerAccountApi } from '../../api/account';
import {
  compact, confirmError, dobError, emailError, firstErrors, manilaToday, nameError, passwordError, phoneError,
} from '../../utils/accountRules';

interface Form {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  password: string;
  password_confirmation: string;
  accept_terms: boolean;
}

const EMPTY: Form = {
  first_name: '', middle_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
  password: '', password_confirmation: '', accept_terms: false,
};

/** Every problem at once (TC-BUY-002/003): the form is never blocked one field at a time. */
function validate(f: Form): Record<string, string> {
  return compact({
    first_name: nameError(f.first_name, 'First name'),
    middle_name: nameError(f.middle_name, 'Middle name', false),
    last_name: nameError(f.last_name, 'Last name'),
    email: emailError(f.email),
    phone: phoneError(f.phone),
    date_of_birth: dobError(f.date_of_birth),
    password: passwordError(f.password),
    password_confirmation: confirmError(f.password, f.password_confirmation),
    accept_terms: f.accept_terms ? undefined : 'You must accept the Terms of Use and Privacy Policy to create an account.',
  });
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const copy = { ...e };
      delete copy[field];
      return copy;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setServerError('');
    const problems = validate(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setLoading(true);
    try {
      const res = await registerAccountApi({ ...form, email: form.email.trim().toLowerCase() });
      navigate(`/verify-email?email=${encodeURIComponent(res.email)}`, { replace: true, state: { message: res.message } });
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      if (resp?.errors) {
        setErrors(firstErrors(resp.errors));
        setServerError('Please fix the highlighted fields.');
      } else {
        setServerError(resp?.message ?? 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex flex-col w-full md:w-1/2 px-6 py-10 sm:px-12 lg:px-16 bg-white overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-block mb-6 group">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-12 sm:h-14 object-contain group-hover:opacity-95 transition-opacity" />
          </Link>

          <h1 className="text-3xl font-bold text-brand-black mb-1">Create account</h1>
          <p className="text-sm text-gray-500 mb-6">
            We'll email you a 6-digit code to confirm it's you. Selling or delivering?{' '}
            <Link to="/partner" className="font-semibold text-brand-red hover:underline">See partner options</Link>.
          </p>

          {serverError && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{serverError}</div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input id="first_name" label="First name" autoComplete="given-name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} />
              <Input id="last_name" label="Last name" autoComplete="family-name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} />
            </div>
            <Input id="middle_name" label="Middle name (optional)" autoComplete="additional-name" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} error={errors.middle_name} />
            <Input id="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PhoneInput label="Mobile number" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} />
              <Input id="date_of_birth" label="Date of birth" type="date" max={manilaToday()} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} error={errors.date_of_birth} />
            </div>
            <PasswordField id="password" label="Password" value={form.password} onChange={(v) => set('password', v)} error={errors.password} showRules />
            <PasswordField id="password_confirmation" label="Confirm password" value={form.password_confirmation} onChange={(v) => set('password_confirmation', v)} error={errors.password_confirmation} />
            <TermsConsent checked={form.accept_terms} onChange={(v) => set('accept_terms', v)} error={errors.accept_terms} />

            <Button type="submit" loading={loading} className="w-full mt-1">Create account</Button>
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
        </div>
      </div>

      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&q=80"
          alt="Loved-IT marketplace"
          className="absolute inset-0 w-full h-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 via-brand-black/30 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-4xl font-bold leading-tight">Millions of products.</p>
            <p className="text-white text-4xl font-bold leading-tight">One account.</p>
            <p className="text-white/60 text-base mt-2">Join thousands of shoppers on Loved-IT.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
