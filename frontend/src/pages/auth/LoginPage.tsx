import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Banknote, RotateCcw, Truck } from 'lucide-react';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import { roleHomePath } from '../../utils/roleHome';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import AuthShell, { AuthDivider, AuthNotice } from '../../components/auth/AuthShell';
import { PasswordField } from '../../components/auth/AuthFields';
import { useToast } from '../../components/ui/Toast';
import photo from '../../assets/auth/buyer-login.jpg';

const FACTS = [
  { icon: Banknote, text: 'Pay cash on delivery, or by GCash straight to the shop' },
  { icon: Truck, text: 'Follow every parcel from the shop to your door' },
  { icon: RotateCcw, text: '7 days to return an item that is damaged or not as described' },
];

export default function LoginPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const notice = (location.state as { notice?: string } | null)?.notice ?? '';
  const [loading, setLoading] = useState(false);

  const { showToast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problem = validateLoginIdentifier(identifier);
    setIdentifierError(problem ?? '');
    if (problem) return;
    setLoading(true);
    try {
      const res = await loginApi(identifier.trim(), password);
      setAuth(res.data, res.token);
      showToast(`Welcome back, ${res.data.first_name}!`);
      // ?next=/register/hub (from "Sign in to apply") returns there; only same-site paths are followed.
      const next = new URLSearchParams(location.search).get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : roleHomePath(res.data));
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; code?: string; email?: string } } })?.response?.data;
      // An account that has not entered its email code yet goes to the verification page (A9).
      if (data?.code === 'email_unverified' && data.email) {
        navigate(`/verify-email?email=${encodeURIComponent(data.email)}`, { state: { message: data.message } });
        return;
      }
      setError(data?.message ?? 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with your email or username."
      topLink={{ text: 'New to Loved-IT?', label: 'Create an account', to: '/register' }}
      image={photo}
      imageAlt="A parcel being handed to a shopper"
      imagePosition="35% center"
      headline="Your orders, from the shop to your door."
      facts={FACTS}
    >
      {notice && !error && <AuthNotice tone="green">{notice}</AuthNotice>}
      {error && <AuthNotice tone="red">{error}</AuthNotice>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email or username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); if (identifierError) setIdentifierError(''); }}
          error={identifierError}
          required
        />
        <div className="flex flex-col gap-1">
          <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
          <Link to="/forgot-password" className="self-end mt-1 text-[12.5px] font-medium text-brand-red hover:underline">Forgot password?</Link>
        </div>

        <Button type="submit" loading={loading} className="w-full mt-1">Sign in</Button>
      </form>

      <AuthDivider />
      <GoogleSignInButton />

      <p className="mt-6 text-[13px] text-center text-stone-500 sm:hidden">
        New to Loved-IT? <Link to="/register" className="font-semibold text-brand-red hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
