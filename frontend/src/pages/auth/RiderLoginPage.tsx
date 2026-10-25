import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import { PasswordField } from '../../components/auth/AuthFields';
import photo from '../../assets/auth/rider.jpg';
import { useToast } from '../../components/ui/Toast';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import { AlertCircle, ArrowRight, Clock, MapPin, ShieldAlert, Wallet, XCircle } from 'lucide-react';

type ErrorType = 'pending' | 'disapproved' | 'reapply' | 'not_rider' | 'invalid' | 'general';

const PERKS = [
  { icon: MapPin, text: 'Pickups and drop-offs in your service areas' },
  { icon: Wallet, text: 'Paid per job: ₱30 for each pickup, ₱50 for each delivery' },
];

/** Sign-in for delivery riders, on the same layout as every other sign-in page. */
export default function RiderLoginPage() {
  const { setAuth, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const notice = (useLocation().state as { notice?: string } | null)?.notice ?? '';

  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorType(null);
    setErrorMessage('');
    const problem = validateLoginIdentifier(identifier);
    setIdentifierError(problem ?? '');
    if (problem) return;
    setLoading(true);

    try {
      const res = await loginApi(identifier.trim(), password);

      // A courier is a buyer account (or an older role "rider" account) with a rider profile.
      if (!res.data.rider) {
        clearAuth();
        setErrorType('not_rider');
        setErrorMessage('This account is not a rider. Riders sign in with their own email: apply to be a rider, or ask your courier company to add you.');
        return;
      }

      // Active and suspended riders open the rider pages (a suspended rider sees why there); anyone else is refused.
      if (!['ACTIVE', 'SUSPENDED'].includes(res.data.rider.status)) {
        clearAuth();
        setErrorType(res.data.rider.status === 'DISAPPROVED' ? 'disapproved' : 'pending');
        setErrorMessage(res.data.rider.status === 'DISAPPROVED'
          ? `Your rider account was not approved${res.data.rider.rejection_reason ? `: ${res.data.rider.rejection_reason}` : '.'}`
          : 'Your rider account is waiting for your courier company to verify it.');
        return;
      }
      setAuth(res.data, res.token);
      showToast(`Welcome back, Courier ${res.data.first_name}!`, 'success');
      navigate('/rider/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.message;

        const code = err.response?.data?.code;
        if (status === 403) {
          // Hub/Rider status gating 403 from AuthController
          if (code === 'rider_application_pending' || code === 'rider_application_rejected') {
            setErrorType(code === 'rider_application_pending' ? 'pending' : 'reapply');
            setErrorMessage(msg);
          } else if (msg && msg.toLowerCase().includes('pending')) {
            setErrorType('pending');
            setErrorMessage(msg);
          } else if (msg && (msg.toLowerCase().includes('not approved') || msg.toLowerCase().includes('disapproved'))) {
            setErrorType('disapproved');
            setErrorMessage(msg);
          } else {
            setErrorType('general');
            setErrorMessage(msg || 'Access restricted. Please contact support.');
          }
        } else if (status === 401) {
          setErrorType('invalid');
          setErrorMessage('Invalid email, username or password. Please check your details and try again.');
        } else if (status === 429) {
          setErrorType('general');
          setErrorMessage('Too many sign-in attempts. Please wait a minute and try again.');
        } else if (err.code === 'ERR_NETWORK' || !err.response) {
          setErrorType('general');
          setErrorMessage('Network error: unable to connect to Loved-IT. Please check your internet connection.');
        } else {
          setErrorType('general');
          setErrorMessage(msg || 'An unexpected error occurred during sign-in.');
        }
      } else {
        setErrorType('general');
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const tone = errorType === 'pending' ? 'amber' : errorType === 'not_rider' ? 'gray' : 'red';
  const Icon = errorType === 'pending' ? Clock : errorType === 'disapproved' || errorType === 'reapply' ? XCircle : errorType === 'not_rider' ? ShieldAlert : AlertCircle;

  return (
    <AuthShell
      eyebrow="Rider sign in"
      title="Welcome back"
      subtitle="Sign in to see your pickups, deliveries and earnings."
      topLink={{ text: 'Shopping instead?', label: 'Shopper sign in', to: '/login' }}
      image={photo}
      imageAlt="A delivery rider on a scooter in the city"
      headline="Ride with Loved-IT. Deliver, get paid."
      facts={PERKS}
    >
      {notice && !errorType && <AuthNotice tone="green">{notice}</AuthNotice>}
      {errorType && errorMessage && (
        <AuthNotice tone={tone} icon={Icon}>
          <p className="font-medium">{errorMessage}</p>
          {errorType === 'not_rider' && (
            <Link to="/login" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
              Go to the shopper sign in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
          {errorType === 'reapply' && (
            <Link to="/register/rider" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
              Apply again <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
        </AuthNotice>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email or username"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); if (identifierError) setIdentifierError(''); }}
          error={identifierError}
          disabled={loading}
          required
        />
        <div className="flex flex-col gap-1">
          <PasswordField id="rider-password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
          <Link to="/forgot-password" className="self-end mt-1 text-[12.5px] font-medium text-brand-red hover:underline">Forgot password?</Link>
        </div>

        <Button type="submit" loading={loading} className="w-full mt-1">Sign in</Button>
      </form>

      <p className="mt-7 rounded-xl bg-white border border-stone-200 px-4 py-3 text-[13px] leading-relaxed text-stone-600">
        Want to deliver with us?{' '}
        <Link to="/register/rider" className="font-semibold text-brand-red hover:underline">Apply to be a rider</Link>.
        Once a hub approves you, we email you a link to set your password.
      </p>
    </AuthShell>
  );
}
