import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bike, LinkIcon } from 'lucide-react';
import Button from '../../components/ui/Button';
import LovedItLogo from '../../components/LovedItLogo';
import { PasswordField } from '../../components/auth/AuthFields';
import { activateRiderApi, getRiderActivationApi } from '../../api/account';
import type { RiderActivationInfo } from '../../api/account';
import { compact, confirmError, firstErrors, passwordError } from '../../utils/accountRules';

type LinkState = { kind: 'loading' } | { kind: 'ok'; info: RiderActivationInfo } | { kind: 'bad'; status: number; message: string };

/**
 * The page behind the rider activation email (A13): set a password once, within 24 hours. An expired, used or unknown
 * link says so and cannot set a password.
 */
export default function RiderActivatePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [state, setState] = useState<LinkState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'bad', status: 404, message: 'This activation link is incomplete. Open the link from your email again.' });
      return;
    }
    getRiderActivationApi(token)
      .then((info) => setState({ kind: 'ok', info }))
      .catch((err: { response?: { status?: number; data?: { message?: string } } }) =>
        setState({ kind: 'bad', status: err.response?.status ?? 0, message: err.response?.data?.message ?? 'This activation link could not be checked. Try again later.' }));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const problems = compact({ password: passwordError(password), password_confirmation: confirmError(password, confirm) });
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSubmitting(true);
    try {
      const res = await activateRiderApi(token, password, confirm);
      navigate('/rider/login', { replace: true, state: { notice: res.message } });
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
      if (resp?.status === 422) setErrors(firstErrors(resp.data?.errors));
      else setState({ kind: 'bad', status: resp?.status ?? 0, message: resp?.data?.message ?? 'Activation failed. Try again later.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <header className="px-6 sm:px-10 py-5">
        <Link to="/" className="inline-block"><LovedItLogo variant="light" type="full" size="custom" imgClassName="h-11 object-contain" /></Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-3xl bg-white border border-stone-200 p-6 sm:p-8">
          {state.kind === 'loading' && <p className="text-sm text-stone-400">Checking your activation link…</p>}

          {state.kind === 'bad' && (
            <>
              <span className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center"><LinkIcon className="w-6 h-6" /></span>
              <h1 className="mt-4 text-[24px] font-serif font-bold tracking-tight text-[#1E1B18]">
                {state.status === 410 ? 'This link has expired' : 'This link cannot be used'}
              </h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{state.message}</p>
              <Link to="/rider/login" className="mt-6 inline-flex min-h-[44px] items-center justify-center w-full rounded-full border border-stone-300 text-[14px] font-semibold text-stone-800 hover:border-stone-900">
                Go to rider sign-in
              </Link>
            </>
          )}

          {state.kind === 'ok' && (
            <>
              <span className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center"><Bike className="w-6 h-6" /></span>
              <h1 className="mt-4 text-[26px] font-serif font-bold tracking-tight text-[#1E1B18]">Activate your rider account</h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">
                {state.info.company ?? 'Your courier company'} added you as a rider. Set a password for{' '}
                <span className="font-semibold text-stone-900 break-all">{state.info.email}</span> to start.
              </p>
              <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
                <PasswordField id="rider-password" label="Password" value={password} onChange={(v) => { setPassword(v); setErrors({}); }} error={errors.password} showRules />
                <PasswordField id="rider-password-confirm" label="Confirm password" value={confirm} onChange={(v) => { setConfirm(v); setErrors({}); }} error={errors.password_confirmation} />
                <Button type="submit" loading={submitting} className="w-full">Activate account</Button>
              </form>
              {state.info.expires_at && (
                <p className="mt-4 text-[12px] text-stone-500">
                  This link works once, until {new Date(state.info.expires_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
