import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import LovedItLogo from '../../components/LovedItLogo';
import { useToast } from '../../components/ui/Toast';
import { validateLoginIdentifier } from '../../utils/loginIdentifier';
import {
  Warehouse,
  AlertCircle,
  Clock,
  XCircle,
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldAlert,
  Ban,
} from 'lucide-react';

type HubLoginError = 'pending' | 'rejected' | 'suspended' | 'not_hub' | 'invalid' | 'general';

/** Sign-in for logistics hub (sorting center) owners. Mirrors the courier sign-in at /rider/login. */
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
        fail(
          'not_hub',
          'This sign-in is reserved for logistics hub owners. If you are a buyer, seller, or courier, please use your own sign-in.'
        );
        return;
      }

      if (hub.status === 'PENDING') {
        clearAuth();
        fail(
          'pending',
          'Your hub application is currently pending approval by Loved-IT administration. You will receive an email notification once reviewed.'
        );
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
          fail('invalid', 'Invalid email, username or password. Please verify your credentials and try again.');
        } else if (status === 429) {
          fail('general', 'Too many sign-in attempts. Please wait a minute and try again.');
        } else if (err.code === 'ERR_NETWORK' || !err.response) {
          fail('general', 'Network error: Unable to connect to Loved-IT servers. Please check your internet connection.');
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between text-gray-900 font-sans antialiased selection:bg-rose-100">
      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <LovedItLogo size="sm" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-red bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200/60">
            <Warehouse className="w-3.5 h-3.5 text-brand-red" />
            <span>Hub Command</span>
          </div>
        </div>
      </header>

      {/* ─── Phone-First Main Container ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center px-4 py-8 sm:py-12">
        <div className="max-w-md w-full mx-auto">
          {/* Header Card */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-red text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-brand-red/20">
              <Warehouse className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Logistics Hub Sign In
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 leading-relaxed">
              Sign in to your approved sorting center to receive parcels, sort them and dispatch riders.
            </p>
          </div>

          {/* ─── Error Banners ─────────────────────────────────────────────── */}
          {errorType && errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className={`mb-6 p-4 rounded-2xl border text-xs sm:text-sm transition-all duration-150 animate-in fade-in ${
                errorType === 'pending'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : errorType === 'not_hub'
                  ? 'bg-gray-50 border-gray-200 text-gray-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-start gap-3">
                {errorType === 'pending' ? (
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : errorType === 'rejected' ? (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                ) : errorType === 'suspended' ? (
                  <Ban className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                ) : errorType === 'not_hub' ? (
                  <ShieldAlert className="w-5 h-5 text-gray-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-2 flex-1">
                  <p className="font-semibold leading-relaxed">{errorMessage}</p>

                  {/* Contextual actions */}
                  {errorType === 'pending' && (
                    <div>
                      <Link
                        to="/register/hub/pending"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900"
                      >
                        <span>View Pending Application Status</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  {errorType === 'rejected' && (
                    <div>
                      <Link
                        to="/register/hub"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 underline hover:text-red-900"
                      >
                        <span>Apply again with a corrected application</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  {errorType === 'not_hub' && (
                    <div>
                      <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg text-xs font-bold hover:bg-brand-red-dark transition-colors shadow-xs"
                      >
                        <span>Go to Standard Member Sign In</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Sign In Form Card ─────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-xs">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Email or username */}
              <div>
                <label
                  htmlFor="hub-identifier"
                  className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2"
                >
                  Email or username
                </label>
                <div className="relative">
                  <input
                    id="hub-identifier"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={loading}
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (identifierError) setIdentifierError('');
                    }}
                    aria-invalid={identifierError ? true : undefined}
                    aria-describedby={identifierError ? 'hub-identifier-error' : undefined}
                    placeholder="e.g. owner@yourhub.ph or hub1"
                    className={`w-full h-12 px-4 text-base bg-white border rounded-xl outline-none transition-all focus:border-brand-red focus:ring-2 focus:ring-brand-red/40 disabled:bg-gray-100 disabled:cursor-not-allowed ${identifierError ? 'border-red-500' : 'border-gray-300'}`}
                  />
                </div>
                {identifierError && (
                  <p id="hub-identifier-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                    {identifierError}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="hub-password"
                    className="block text-xs font-bold text-gray-700 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-brand-red hover:text-brand-red-dark hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="hub-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full h-12 pl-4 pr-12 text-base bg-white border border-gray-300 rounded-xl outline-none transition-all focus:border-brand-red focus:ring-2 focus:ring-brand-red/40 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red/40"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-brand-red hover:bg-brand-red-dark active:bg-brand-red-dark text-white font-bold text-base rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Authenticating…</span>
                  </span>
                ) : (
                  <>
                    <span>Sign In to Hub</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">New hub?</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Register Action */}
            <Link
              to="/register/hub"
              className="w-full h-11 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <span>Register a Logistics Hub</span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </Link>
          </div>

          {/* Standard Portal Switch Link */}
          <div className="mt-6 text-center text-xs text-gray-500 space-y-1">
            <p>
              Looking for buyer or seller sign in?{' '}
              <Link to="/login" className="font-semibold text-brand-red hover:underline">
                Standard Sign In
              </Link>
            </p>
            <p>
              Delivering parcels instead?{' '}
              <Link to="/rider/login" className="font-semibold text-brand-red hover:underline">
                Courier Sign In
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Loved-IT Philippines. Logistics Hub Network.
      </footer>
    </div>
  );
}
