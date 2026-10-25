import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import AuthShell, { AuthDivider, AuthNotice } from '../../components/auth/AuthShell';
import { MessageCircle, Store, Ticket } from 'lucide-react';
import photo from '../../assets/auth/buyer-register.jpg';
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

const FACTS = [
  { icon: Store, text: 'Every shop is checked before it can sell' },
  { icon: Ticket, text: 'Vouchers from shops and from Loved-IT, in one wallet' },
  { icon: MessageCircle, text: 'Chat with a shop before you buy' },
];

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
    <AuthShell
      wide
      title="Create your account"
      subtitle={<>We email you a 6-digit code to confirm it&apos;s you. Selling or delivering? <Link to="/partner" className="font-semibold text-brand-red hover:underline">See partner options</Link>.</>}
      topLink={{ text: 'Already have an account?', label: 'Sign in', to: '/login' }}
      image={photo}
      imageAlt="Kraft paper shopping bags being packed"
      headline="One account for every shop on Loved-IT."
      facts={FACTS}
    >
      {serverError && <AuthNotice tone="red">{serverError}</AuthNotice>}

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

      <AuthDivider />
      <GoogleSignInButton label="Sign up with Google" />

      <p className="mt-6 text-[13px] text-center text-stone-500 sm:hidden">
        Already have an account? <Link to="/login" className="font-semibold text-brand-red hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
