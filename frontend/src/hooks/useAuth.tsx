import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getMeApi } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  suspended: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [token, setToken]         = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading]     = useState(true);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) { setLoading(false); return; }
    getMeApi()
      .then((u) => {
        if (!active) return;
        if (u.status === 'suspended') {
          // Token still technically valid but account is suspended —
          // wipe local auth and show the suspended banner.
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          setSuspended(true);
        } else if (u.status === 'unverified' || u.status === 'pending_activation') {
          // A sign-up that was never finished (email code, or a rider's activation link): the server refuses this
          // token everywhere else, so sign out here and let them sign in again once it is finished.
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        } else {
          setSuspended(false);
          setUser(u);
        }
      })
      .catch((err: { response?: { status?: number } }) => {
        if (!active) return;
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const setAuth = (u: User, t: string) => {
    if (u.status === 'suspended') {
      setSuspended(true);
      return;
    }
    localStorage.setItem('token', t);
    setToken(t);
    setUser(u);
    setSuspended(false);
  };

  const updateUser = (u: User) => setUser(u);

  const clearAuth = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setSuspended(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, suspended, setAuth, setUser: updateUser, clearAuth, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
