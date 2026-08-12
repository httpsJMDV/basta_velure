import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { forgotPasswordApi } from '../../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPasswordApi(email);
      setSent(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Form column */}
      <div className="flex flex-col justify-center w-full md:w-1/2 px-6 py-12 sm:px-12 lg:px-16 bg-white">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <img src="/logo1.png" alt="Velure" className="w-8 h-8 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-xl tracking-tight">Velure</span>
          </Link>

          <AnimatePresence mode="wait">
            {!sent ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
                  <Mail className="w-6 h-6 text-brand-red" />
                </div>

                <h1 className="text-3xl font-bold text-brand-black mb-1">Forgot password?</h1>
                <p className="text-sm text-gray-500 mb-8">
                  No worries — enter your email and we'll send you a reset link.
                </p>

                {error && (
                  <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <Input
                    label="Email address"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" loading={loading} className="w-full mt-1">
                    Send Reset Link
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
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-6">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-brand-black mb-2">Check your inbox</h2>
                <p className="text-sm text-gray-500 mb-2">
                  We sent a password reset link to
                </p>
                <p className="text-sm font-semibold text-brand-black mb-6">{email}</p>
                <p className="text-xs text-gray-400 mb-8">
                  Didn't receive it? Check your spam folder or{' '}
                  <button
                    onClick={() => setSent(false)}
                    className="text-brand-red hover:underline font-medium"
                  >
                    try again
                  </button>
                  .
                </p>
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-black transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Sign In
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Image column */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200&q=80"
          alt="Velure fashion"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-3xl font-bold">Reset your password</p>
            <p className="text-white/60 mt-2 text-base">We'll get you back in no time.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
