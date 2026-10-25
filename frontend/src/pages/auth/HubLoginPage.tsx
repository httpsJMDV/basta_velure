import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import { PasswordField } from '../../components/auth/AuthFields';
import photo from '../../assets/auth/hub.jpg';
import { useToast } from '../../components/ui/Toast';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import { AlertCircle, ArrowRight, Ban, Clock, Layers, ScanLine, ShieldAlert, Send, XCircle } from 'lucide-react';

type HubLoginError = 'pending' | 'rejected' | 'suspended' | 'not_hub' | 'invalid' | 'general';

const PERKS = [
  { icon: ScanLine, text: 'Scan parcels in as riders drop them off' },
  { icon: Layers, text: 'Sort by barangay and dispatch your riders' },
  { icon: Send, text: 'Track every delivery and failed attempt' },
];

/** Sign-in for logistics hub (sorting center) owners, on the same layout as every other sign-in page. */
export default function HubLoginPage() {
  const { setAuth, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [password, setPassword] = useState('');

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
        fail('not_hub', 'This account has no logistics hub yet. Sign in on the main page, then apply to run a hub from your account.');
        return;
      }
      // A pending or rejected applicant stays signed in and sees the application status (and can resubmit).
      if (hub.status === 'PENDING' || hub.status === 'REJECTED') {
        setAuth(res.data, res.token);
        navigate('/register/hub');
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

  const tone = errorType === 'pending' ? 'amber' : errorType === 'not_hub' ? 'gray' : 'red';
  const Icon = errorType === 'pending' ? Clock : errorType === 'rejected' ? XCircle : errorType === 'suspended' ? Ban : errorType === 'not_hub' ? ShieldAlert : AlertCircle;

  return (
    <AuthShell
      eyebrow="Logistics hub sign in"
      title="Welcome back"
      subtitle="Sign in to run your hub: intake, sorting, dispatch and deliveries."
      topLink={{ text: 'No hub yet?', label: 'Apply to run one', to: '/register/hub' }}
      image={photo}
      imageAlt="Shelves of parcels in a logistics warehouse"
      headline="Run your hub. Keep parcels moving."
      facts={PERKS}
    >
      {errorType && errorMessage && (
        <AuthNotice tone={tone} icon={Icon}>
          <p className="font-medium">{errorMessage}</p>
          {errorType === 'pending' && (
            <Link to="/register/hub" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900">
              View application status <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
          {errorType === 'rejected' && (
            <Link to="/register/hub" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
              Apply again with a corrected application <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )}
          {errorType === 'not_hub' && (
            <Link to="/login" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
              Go to the shopper sign in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
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
          <PasswordField id="hub-password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
          <Link to="/forgot-password" className="self-end mt-1 text-[12.5px] font-medium text-brand-red hover:underline">Forgot password?</Link>
        </div>

        <Button type="submit" loading={loading} className="w-full mt-1">Sign in</Button>
      </form>

      <p className="mt-7 text-[13px] text-center text-stone-500 sm:hidden">
        No hub yet? <Link to="/register/hub" className="font-semibold text-brand-red hover:underline">Apply to run one</Link>
      </p>
    </AuthShell>
  );
}
