import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Lock, Mail } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import { forgotPasswordApi } from '../../api/client';
import photo from '../../assets/auth/buyer-login.jpg';

const FACTS = [
  { icon: Mail, text: 'The link goes to the email on your account' },
  { icon: Clock, text: 'It works once, for 1 hour' },
  { icon: Lock, text: 'Nobody at Loved-IT will ever ask for your password' },
];

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPasswordApi(email);
      setSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={sent ? 'Check your inbox' : 'Forgot your password?'}
      subtitle={sent
        ? <>We sent a reset link to <span className="font-semibold text-stone-900 break-all">{email}</span>.</>
        : 'Enter the email on your account and we will send you a link to set a new password.'}
      topLink={{ text: 'Remembered it?', label: 'Sign in', to: '/login' }}
      image={photo}
      imageAlt="A parcel being handed to a shopper"
      imagePosition="35% center"
      headline="Back into your account in a minute."
      facts={FACTS}
    >
      {sent ? (
        <>
          <AuthNotice tone="green" icon={CheckCircle2}>
            Didn&apos;t get it? Check your spam folder, or{' '}
            <button type="button" onClick={() => setSent(false)} className="font-semibold underline">send it again</button>.
          </AuthNotice>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-stone-600 hover:text-brand-red">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </>
      ) : (
        <>
          {error && <AuthNotice tone="red">{error}</AuthNotice>}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="Email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" loading={loading} className="w-full mt-1">Send reset link</Button>
          </form>
          <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-stone-600 hover:text-brand-red">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
