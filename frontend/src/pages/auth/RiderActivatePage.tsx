import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LinkIcon, MapPin, Wallet } from 'lucide-react';
import Button from '../../components/ui/Button';
import AuthShell from '../../components/auth/AuthShell';
import photo from '../../assets/auth/rider.jpg';
import { PasswordField } from '../../components/auth/AuthFields';
import { activateRiderApi, getRiderActivationApi } from '../../api/account';
import type { RiderActivationInfo } from '../../api/account';
import { compact, confirmError, firstErrors, passwordError } from '../../utils/accountRules';

const FACTS = [
  { icon: MapPin, text: 'Pickups and drop-offs in the areas your hub assigns' },
  { icon: Wallet, text: 'Paid per job: ₱30 for each pickup, ₱50 for each delivery' },
];

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

  const title = state.kind === 'ok' ? 'Activate your rider account'
    : state.kind === 'bad' ? (state.status === 410 ? 'This link has expired' : 'This link cannot be used') : 'Checking your link…';

  return (
    <AuthShell
      eyebrow="Rider activation"
      title={title}
      subtitle={state.kind === 'ok'
        ? <>{state.info.company ?? 'Your courier company'} added you as a rider. Set a password for <span className="font-semibold text-stone-900 break-all">{state.info.email}</span> to start.</>
        : state.kind === 'bad' ? state.message : undefined}
      image={photo}
      imageAlt="A delivery rider on a scooter in the city"
      headline="Set a password, then start your first run."
      facts={FACTS}
    >
      {state.kind === 'loading' && <p className="text-sm text-stone-400">One moment…</p>}

      {state.kind === 'bad' && (
        <Link to="/rider/login" className="inline-flex min-h-[46px] items-center justify-center gap-2 w-full rounded-full border border-stone-300 bg-white text-[14px] font-semibold text-stone-800 hover:border-stone-900">
          <LinkIcon className="w-4 h-4" /> Go to rider sign in
        </Link>
      )}

      {state.kind === 'ok' && (
        <>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <PasswordField id="rider-password" label="Password" value={password} onChange={(v) => { setPassword(v); setErrors({}); }} error={errors.password} showRules />
            <PasswordField id="rider-password-confirm" label="Confirm password" value={confirm} onChange={(v) => { setConfirm(v); setErrors({}); }} error={errors.password_confirmation} />
            <Button type="submit" loading={submitting} className="w-full">Activate account</Button>
          </form>
          {state.info.expires_at && (
            <p className="mt-4 text-[12.5px] text-stone-500">
              This link works once, until {new Date(state.info.expires_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.
            </p>
          )}
        </>
      )}
    </AuthShell>
  );
}
