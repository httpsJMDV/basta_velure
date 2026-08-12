import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import GoogleSignInButton from '../../components/GoogleSignInButton';

export default function LoginPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi(email, password);
      setAuth(res.data, res.token);
      const role = res.data.role;
      if (role === 'admin') navigate('/admin');
      else if (role === 'seller') navigate('/seller/dashboard');
      else navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Login failed.';
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

          <h1 className="text-3xl font-bold text-brand-black mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your Velure account</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1">
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs text-brand-red hover:underline font-medium mt-1"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full mt-1">
              Sign In
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <GoogleSignInButton />

          <p className="mt-6 text-sm text-center text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-red font-semibold hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>

      {/* Lifestyle image column — hidden on mobile */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img
          src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80"
          alt="Velure fashion"
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/70 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-4xl font-bold leading-tight">Velure</p>
            <p className="text-white/70 text-lg mt-1">Fashion. Delivered.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
