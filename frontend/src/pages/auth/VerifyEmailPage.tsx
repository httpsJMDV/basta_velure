import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Inbox, MailCheck, RotateCw } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import photo from '../../assets/auth/buyer-register.jpg';
import { CodeInput } from '../../components/auth/AuthFields';
import { resendVerificationApi, verifyEmailApi } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toast';
import { roleHomePath } from '../../utils/roleHome';
import type { User } from '../../types';

const CODE_SECONDS = 5 * 60;
const RESEND_COOLDOWN = 30;

const FACTS = [
  { icon: Clock, text: 'Each code works for 5 minutes' },
  { icon: RotateCw, text: 'A new code cancels the one before it' },
  { icon: Inbox, text: 'Not there? Check your spam or promotions folder' },
];

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Where a newly verified account goes: its application status page if it applied, else its home. */
function nextPath(u: User): string {
  if (u.seller_profile?.application_status === 'pending') return '/register/seller';
  if (u.logistics_company?.status === 'PENDING') return '/register/courier';
  return roleHomePath(u);
}

/**
 * Email verification (A9): the 6-digit code from the registration email, valid for 5 minutes. Resend sends a new code
 * and cancels the old one. The account stays Unverified until the right code is entered.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState<string>((location.state as { message?: string } | null)?.message ?? '');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [left, setLeft] = useState(CODE_SECONDS);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    const t = window.setInterval(() => {
      setLeft((s) => Math.max(0, s - 1));
      setCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    if (loading) return;
    setError('');
    if (!email.trim()) { setError('Enter the email you registered with.'); return; }
    if (!/^\d{6}$/.test(code)) { setError(code ? 'The code is exactly 6 digits (numbers only).' : 'Enter the 6-digit code from your email.'); return; }
    setLoading(true);
    try {
      const res = await verifyEmailApi(email.trim(), code);
      setAuth(res.data, res.token);
      showToast(res.message);
      navigate(nextPath(res.data), { replace: true });
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]>; already_verified?: boolean } } })?.response;
      if (resp?.data?.already_verified) {
        navigate('/login', { replace: true, state: { notice: resp.data.message } });
        return;
      }
      setError(resp?.data?.errors?.code?.[0] ?? resp?.data?.errors?.email?.[0] ?? resp?.data?.message ?? 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (resending || cooldown > 0 || !email.trim()) return;
    setResending(true);
    setError('');
    try {
      const res = await resendVerificationApi(email.trim());
      setInfo(res.message);
      setCode('');
      setLeft(res.expires_in ?? CODE_SECONDS);
      setCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Could not send a new code. Please try again in a minute.');
    } finally {
      setResending(false);
    }
  }

  const expired = left === 0;

  return (
    <AuthShell
      eyebrow="Last step"
      title="Check your email"
      subtitle={<>Enter the 6-digit code we sent to <span className="font-semibold text-stone-900 break-all">{email || 'your email'}</span>. Your account stays unverified until you do.</>}
      topLink={{ text: 'Wrong email?', label: 'Register again', to: '/register' }}
      image={photo}
      imageAlt="Kraft paper shopping bags being packed"
      headline="One code, and you're in."
      facts={FACTS}
    >
      {info && !error && <AuthNotice tone="green" icon={MailCheck}>{info}</AuthNotice>}

      <form onSubmit={verify} noValidate className="flex flex-col gap-4">
        {!params.get('email') && (
          <Input id="verify-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <CodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} error={error} disabled={loading} />

        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className={`tabular-nums ${expired ? 'text-red-600 font-semibold' : 'text-stone-500'}`}>
            {expired ? 'This code has expired. Send a new one.' : `Code expires in ${mmss(left)}`}
          </span>
          <button
            type="button"
            onClick={resend}
            disabled={resending || cooldown > 0}
            className="inline-flex items-center gap-1.5 font-semibold text-brand-red disabled:text-stone-400 hover:underline disabled:no-underline"
          >
            <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </div>

        <Button type="submit" loading={loading} className="w-full">Verify email</Button>
      </form>

      <p className="mt-6 text-[13px] leading-relaxed text-stone-500">
        Already verified? <Link to="/login" className="font-semibold text-brand-red hover:underline">Sign in</Link>.
      </p>
    </AuthShell>
  );
}
