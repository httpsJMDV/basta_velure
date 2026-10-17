import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck, RotateCw } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LovedItLogo from '../../components/LovedItLogo';
import { CodeInput } from '../../components/auth/AuthFields';
import { resendVerificationApi, verifyEmailApi } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toast';
import { roleHomePath } from '../../utils/roleHome';
import type { User } from '../../types';

const CODE_SECONDS = 5 * 60;
const RESEND_COOLDOWN = 30;

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
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <header className="px-6 sm:px-10 py-5">
        <Link to="/" className="inline-block">
          <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-11 object-contain" />
        </Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-3xl bg-white border border-stone-200 p-6 sm:p-8">
          <span className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </span>
          <h1 className="mt-4 text-[26px] font-serif font-bold tracking-tight text-[#1E1B18]">Verify your email</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">
            Enter the 6-digit code we sent to{' '}
            <span className="font-semibold text-stone-900 break-all">{email || 'your email'}</span>.
            Your account stays unverified until you do.
          </p>

          {info && !error && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-800">{info}</p>}

          <form onSubmit={verify} noValidate className="mt-5 flex flex-col gap-4">
            {!params.get('email') && (
              <Input id="verify-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
            <CodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} error={error} disabled={loading} />

            <div className="flex items-center justify-between text-[12.5px]">
              <span className={`tabular-nums ${expired ? 'text-red-600 font-semibold' : 'text-stone-500'}`}>
                {expired ? 'This code has expired. Resend a new code.' : `Code expires in ${mmss(left)}`}
              </span>
              <button
                type="button"
                onClick={resend}
                disabled={resending || cooldown > 0}
                className="inline-flex items-center gap-1.5 font-semibold text-brand-red disabled:text-stone-400 hover:underline disabled:no-underline"
              >
                <RotateCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>

            <Button type="submit" loading={loading} className="w-full">Verify email</Button>
          </form>

          <p className="mt-5 text-[12.5px] leading-relaxed text-stone-500">
            Can't find it? Check your spam folder. Asking for a new code cancels the previous one.
          </p>
          <p className="mt-3 text-[13px] text-stone-600">
            Wrong email? <Link to="/register" className="font-semibold text-brand-red hover:underline">Register again</Link> or{' '}
            <Link to="/login" className="font-semibold text-brand-red hover:underline">sign in</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
