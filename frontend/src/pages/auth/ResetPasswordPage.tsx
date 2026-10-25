import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import Button from '../../components/ui/Button';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import { PasswordField } from '../../components/auth/AuthFields';
import { resetPasswordApi } from '../../api/client';
import photo from '../../assets/auth/buyer-login.jpg';

const FACTS = [
  { icon: KeyRound, text: 'At least 8 characters, with upper and lower case, a number and a symbol' },
  { icon: ShieldCheck, text: 'Every device signed in to your account is signed out' },
  { icon: Lock, text: 'Nobody at Loved-IT will ever ask for your password' },
];

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const emailParam = params.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPasswordApi({ token, email: emailParam, password, password_confirmation: confirmation });
      navigate('/login?reset=1');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Reset failed. The link may have expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={token ? 'Set a new password' : 'This reset link is not valid'}
      subtitle={token ? 'Pick one you do not use on any other site.' : 'The link is missing its code. Ask for a new one.'}
      topLink={{ text: 'Remembered it?', label: 'Sign in', to: '/login' }}
      image={photo}
      imageAlt="A parcel being handed to a shopper"
      imagePosition="35% center"
      headline="Almost there."
      facts={FACTS}
    >
      {!token ? (
        <Link to="/forgot-password" className="inline-flex min-h-[46px] w-full items-center justify-center rounded-full bg-brand-red text-white text-sm font-semibold hover:bg-brand-red-dark">
          Request a new link
        </Link>
      ) : (
        <>
          {error && <AuthNotice tone="red">{error}</AuthNotice>}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} showRules />
            <PasswordField id="new-password-confirm" label="Confirm new password" value={confirmation} onChange={setConfirmation} />
            <Button type="submit" loading={loading} className="w-full mt-1">Save new password</Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-stone-600 hover:text-brand-red">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </Link>
    </AuthShell>
  );
}
