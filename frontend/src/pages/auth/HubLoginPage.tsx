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
import { AlertCircle, ArrowRight, Ban, Clock, Eye, EyeOff, Layers, ScanLine, ShieldAlert, Send, XCircle } from 'lucide-react';

type HubLoginError = 'pending' | 'rejected' | 'suspended' | 'not_hub' | 'invalid' | 'general';

const PERKS = [
  { icon: ScanLine, text: 'Scan parcels in as riders drop them off' },
  { icon: Layers, text: 'Sort by barangay and dispatch your riders' },
  { icon: Send, text: 'Track every delivery and failed attempt' },
];

/** Sign-in for logistics hub (sorting center) owners. Same layout as the buyer and courier sign-in. */
export default function HubLoginPage() {
  const { setAuth, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<HubLoginError | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  function fail(type: HubLoginError, message: string) {
    setErrorType(type);
    setErrorMessage(message);
  }

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
      const hub = res.data.sorting_center;

      // Only a hub owner belongs here.
      if (!hub) {
        clearAuth();
        fail('not_hub', 'This sign-in is only for logistics hub owners. If you are a buyer, seller or courier, please use your own sign-in.');
        return;
      }
      if (hub.status === 'PENDING') {
        clearAuth();
        fail('pending', 'Your hub application is currently pending approval by Loved-IT administration. You will receive an email notification once reviewed.');
        return;
      }
      if (hub.status === 'REJECTED') {
        clearAuth();
        fail('rejected', 'Your hub application was not approved. Please check your email for details or contact support.');
        return;
      }
      if (hub.status === 'SUSPENDED') {
        clearAuth();
        fail('suspended', 'Your hub account has been suspended. Please contact platform administration.');
        return;
      }

      setAuth(res.data, res.token);
      showToast(`Welcome back, ${res.data.first_name}!`, 'success');
      navigate('/hub/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg: string | undefined = err.response?.data?.message;
        const lower = msg?.toLowerCase() ?? '';

        if (status === 403) {
          // The same hub gating messages the server sends to the general sign-in.
          if (lower.includes('pending')) fail('pending', msg as string);
          else if (lower.includes('not approved')) fail('rejected', msg as string);
          else if (lower.includes('suspended')) fail('suspended', msg as string);
          else fail('general', msg || 'Access restricted. Please contact support.');
        } else if (status === 401) {
          fail('invalid', 'Invalid email, username or password. Please check your details and try again.');
        } else if (status === 429) {
          fail('general', 'Too many sign-in attempts. Please wait a minute and try again.');
        } else if (err.code === 'ERR_NETWORK' || !err.response) {
          fail('general', 'Network error: unable to connect to Loved-IT. Please check your internet connection.');
        } else {
          fail('general', msg || 'An unexpected error occurred during sign-in.');
        }
      } else {
        fail('general', 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const tone =
    errorType === 'pending'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : errorType === 'not_hub'
        ? 'bg-gray-50 border-gray-200 text-gray-900'
        : 'bg-red-50 border-red-200 text-red-700';

  return (
    <PortalLoginShell
      badge="Logistics hub sign in"
      heading="Welcome back"
      subtitle="Sign in to run your hub: intake, sorting, dispatch and deliveries."
      image="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80"
      imageAlt="Parcels being sorted in a logistics warehouse"
      headline={['Run your hub.', 'Keep parcels moving.']}
      perks={PERKS}
    >
      {errorType && errorMessage && (
        <div role="alert" aria-live="assertive" className={`rounded-lg border px-4 py-3 text-sm mb-5 ${tone}`}>
          <div className="flex items-start gap-2.5">
            {errorType === 'pending' ? (
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorType === 'rejected' ? (
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorType === 'suspended' ? (
              <Ban className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorType === 'not_hub' ? (
              <ShieldAlert className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="space-y-2 min-w-0">
              <p className="font-medium leading-relaxed">{errorMessage}</p>

              {errorType === 'pending' && (
                <Link to="/register/hub/pending" className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900">
                  View application status
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
              {errorType === 'rejected' && (
                <Link to="/register/hub" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
                  Apply again with a corrected application
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
              {errorType === 'not_hub' && (
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
        Want to run a hub with Loved-IT?{' '}
        <Link to="/register/hub" className="text-brand-red font-semibold hover:underline">
          Register a logistics hub
        </Link>
      </p>

      <div className="mt-5 pt-4 border-t border-gray-100 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-brand-red hover:text-brand-red-dark font-semibold">
          <span>Buyer, seller or courier? Standard Sign In</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </PortalLoginShell>
  );
}
