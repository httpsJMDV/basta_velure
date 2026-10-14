import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import LovedItLogo from '../../components/LovedItLogo';
import { useToast } from '../../components/ui/Toast';
import {
  Bike,
  AlertCircle,
  Clock,
  XCircle,
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export default function RiderLoginPage() {
  const { setAuth, clearAuth } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<'pending' | 'disapproved' | 'not_rider' | 'invalid' | 'general' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorType(null);
    setErrorMessage('');
    setLoading(true);

    try {
      const res = await loginApi(email.trim(), password);

      // Verify the authenticated account has the rider role
      if (res.data.role !== 'rider') {
        clearAuth();
        setErrorType('not_rider');
        setErrorMessage(
          'This sign-in station is exclusively reserved for courier delivery personnel. If you are a buyer, seller, or hub manager, please use the standard portal.'
        );
        return;
      }

      // Check rider profile status (if returned by backend)
      if (res.data.rider) {
        if (res.data.rider.status === 'PENDING') {
          clearAuth();
          setErrorType('pending');
          setErrorMessage(
            'Your rider application is currently pending hub approval. You will receive an email notification once reviewed.'
          );
          return;
        }

        if (res.data.rider.status === 'DISAPPROVED') {
          clearAuth();
          setErrorType('disapproved');
          setErrorMessage(
            'Your rider application was not approved. Please check your email for details or contact support.'
          );
          return;
        }
      }

      setAuth(res.data, res.token);
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
          setErrorMessage('Invalid email or password. Please verify your credentials and try again.');
        } else if (err.code === 'ERR_NETWORK' || !err.response) {
          setErrorType('general');
          setErrorMessage('Network error: Unable to connect to Loved-IT servers. Please check your internet connection.');
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between text-gray-900 font-sans antialiased selection:bg-rose-100">
      {/* ─── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <LovedItLogo size="sm" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-red bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200/60">
            <Bike className="w-3.5 h-3.5 text-brand-red" />
            <span>Courier Station</span>
          </div>
        </div>
      </header>

      {/* ─── Phone-First Main Container ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center px-4 py-8 sm:py-12">
        <div className="max-w-md w-full mx-auto">
          {/* Header Card */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-red text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-brand-red/20">
              <Bike className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Courier Dispatch Sign In
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 leading-relaxed">
              Log in to your active rider profile to receive delivery assignments and manage pickups.
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
                  : errorType === 'not_rider'
                  ? 'bg-gray-50 border-gray-200 text-gray-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-start gap-3">
                {errorType === 'pending' ? (
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : errorType === 'disapproved' ? (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                ) : errorType === 'not_rider' ? (
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
                        to="/register/rider/pending"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 underline hover:text-amber-900"
                      >
                        <span>View Pending Application Status</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  {errorType === 'not_rider' && (
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
              {/* Email Address */}
              <div>
                <label
                  htmlFor="rider-email"
                  className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2"
                >
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="rider-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. rider@lovedit.ph"
                    className="w-full h-12 px-4 text-base bg-white border border-gray-300 rounded-xl outline-none transition-all focus:border-brand-red focus:ring-2 focus:ring-brand-red/40 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="rider-password"
                    className="block text-xs font-bold text-gray-700 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    tabIndex={0}
                    className="text-xs font-semibold text-brand-red hover:text-brand-red-dark hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="rider-password"
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
                    <span>Sign In to Station</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">New Courier?</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Register Action */}
            <Link
              to="/register/rider"
              className="w-full h-11 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <span>Apply as a Delivery Courier</span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
            </Link>
          </div>

          {/* Standard Portal Switch Link */}
          <div className="mt-6 text-center text-xs text-gray-500">
            Looking for buyer, seller, or hub sign in?{' '}
            <Link to="/login" className="font-semibold text-brand-red hover:underline">
              Standard Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Loved-IT Philippines. Courier Dispatch Network.
      </footer>
    </div>
  );
}
