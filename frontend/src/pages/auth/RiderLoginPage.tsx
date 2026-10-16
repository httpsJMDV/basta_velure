import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PortalLoginShell from '../../components/auth/PortalLoginShell';
import { useToast } from '../../components/ui/Toast';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import { AlertCircle, ArrowRight, Clock, Eye, EyeOff, MapPin, ShieldAlert, Wallet, XCircle } from 'lucide-react';

type ErrorType = 'pending' | 'disapproved' | 'not_rider' | 'invalid' | 'general';

const PERKS = [
  { icon: MapPin, text: 'Pickups and drop-offs in your service areas' },
  { icon: Wallet, text: 'Paid for every parcel: 20% of the fee per pickup, 65% per delivery' },
];

/** Sign-in for delivery couriers. Same layout as the buyer and logistics hub sign-in. */
export default function RiderLoginPage() {
  const { setAuth, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
        setErrorMessage('This account has no courier profile yet. Sign in on the main page, then apply as a courier from your account.');
        return;
      }

      // A pending or disapproved applicant stays signed in and sees the application status (and can resubmit).
      setAuth(res.data, res.token);
      if (res.data.rider.status !== 'ACTIVE') {
        navigate('/register/rider');
        return;
      }
      showToast(`Welcome back, Courier ${res.data.first_name}!`, 'success');
      navigate('/rider/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.message;

        if (status === 403) {
          // Hub/Rider status gating 403 from AuthController
          if (msg && msg.toLowerCase().includes('pending')) {
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

  const tone =
    errorType === 'pending'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : errorType === 'not_rider'
        ? 'bg-gray-50 border-gray-200 text-gray-900'
        : 'bg-red-50 border-red-200 text-red-700';

  return (
    <PortalLoginShell
      badge="Courier sign in"
      heading="Welcome back"
      subtitle="Sign in to see your pickups, deliveries and earnings."
      image="https://images.unsplash.com/photo-1526367790999-0150786686a2?w=1200&q=80"
      imageAlt="A courier on a motorbike delivering parcels"
      headline={['Ride with Loved-IT.', 'Deliver, get paid.']}
      perks={PERKS}
    >
      {errorType && errorMessage && (
        <div role="alert" aria-live="assertive" className={`rounded-lg border px-4 py-3 text-sm mb-5 ${tone}`}>
          <div className="flex items-start gap-2.5">
            {errorType === 'pending' ? (
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorType === 'disapproved' ? (
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorType === 'not_rider' ? (
              <ShieldAlert className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="space-y-2 min-w-0">
              <p className="font-medium leading-relaxed">{errorMessage}</p>

              {errorType === 'pending' && (
                <Link to="/register/rider/pending" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900">
                  View application status
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
              {errorType === 'not_rider' && (
                <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
                  Go to the standard sign in
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        </div>
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

        <div>
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
              disabled={loading}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute bottom-0 right-0 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          <div className="flex justify-end mt-1.5">
            <Link to="/forgot-password" className="text-xs text-brand-red hover:underline font-medium">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={loading} className="w-full mt-1">
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-sm text-center text-gray-500">
        Want to deliver with Loved-IT?{' '}
        <Link to="/register/rider" className="text-brand-red font-semibold hover:underline">
          Apply as a courier
        </Link>
      </p>

      <div className="mt-5 pt-4 border-t border-gray-100 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-brand-red hover:text-brand-red-dark font-semibold">
          <span>Buyer, seller or hub owner? Standard Sign In</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </PortalLoginShell>
  );
}
