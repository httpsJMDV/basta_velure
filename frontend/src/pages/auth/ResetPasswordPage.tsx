import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, ArrowLeft } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { resetPasswordApi } from '../../api/client';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const emailParam = params.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await resetPasswordApi({ token, email: emailParam, password, password_confirmation: confirmation });
      navigate('/login?reset=1');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Reset failed. The link may have expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-gray-soft">
        <div className="text-center">
          <p className="text-brand-black font-semibold mb-2">Invalid or missing reset link.</p>
          <Link to="/forgot-password" className="text-brand-red text-sm hover:underline">Request a new one</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex flex-col justify-center w-full md:w-1/2 px-6 py-12 sm:px-12 lg:px-16 bg-white">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-xl tracking-tight">Velure</span>
          </Link>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
              <KeyRound className="w-6 h-6 text-brand-red" />
            </div>

            <h1 className="text-3xl font-bold text-brand-black mb-1">Set new password</h1>
            <p className="text-sm text-gray-500 mb-8">
              Must be at least 8 characters with uppercase, numbers, and symbols.
            </p>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="New Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
              <Button type="submit" loading={loading} className="w-full mt-1">
                Reset Password
              </Button>
            </form>

            <Link
              to="/login"
              className="mt-6 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-brand-black transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </Link>
          </motion.div>
        </div>
      </div>

      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200&q=80"
          alt="Velure fashion"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-3xl font-bold">Almost there.</p>
            <p className="text-white/60 mt-2 text-base">Create a strong new password.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
