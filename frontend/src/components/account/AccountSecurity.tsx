// Account security (Buyer workbook B1): change the email or the mobile number with a 6-digit code sent by email, and
// change the password with the current one. Nothing changes until the code (or current password) checks out.
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import { KeyRound, Mail, Smartphone } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import PhoneInput from '../ui/PhoneInput';
import { CodeInput, PasswordField } from '../auth/AuthFields';
import {
  changePasswordApi, confirmEmailChangeApi, confirmPhoneChangeApi, requestEmailChangeApi, requestPhoneChangeApi,
} from '../../api/account';
import { compact, confirmError, emailError, firstErrors, localPhMobile, passwordError, phoneError } from '../../utils/accountRules';

const INPUT = 'h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10';
const PRIMARY = 'h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50 transition-colors';
const GHOST = 'h-9 px-4 rounded-full border border-stone-300 text-stone-700 text-[13px] font-semibold hover:border-stone-500 transition-colors';

function apiError(err: unknown, field: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
    return data?.errors?.[field]?.[0] ?? data?.message ?? 'That did not work. Please try again.';
  }
  return 'No connection. Check your network and try again.';
}

function Card({ icon: Icon, title, value, hint, open, onOpen, children }: {
  icon: React.ElementType; title: string; value: ReactNode; hint: string; open: boolean; onOpen: () => void; children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 ${open ? 'sm:col-span-2 border-stone-300' : 'border-stone-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">{title}</p>
            <p className="mt-0.5 text-[15px] font-medium text-stone-900 break-all">{value}</p>
            <p className="mt-0.5 text-[12px] text-stone-500">{hint}</p>
          </div>
        </div>
        {!open && <button type="button" onClick={onOpen} className="h-8 px-3 rounded-full text-[12px] font-semibold text-brand-red hover:bg-rose-50 shrink-0">Change</button>}
      </div>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** A request step (new value) and then a code step; the old value stays in force until the code is entered. */
function CodeChange({ kind, onDone }: { kind: 'email' | 'phone'; onDone: (msg: string) => void }) {
  const { setUser } = useAuth();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const local = kind === 'email' ? emailError(value) : phoneError(value);
    if (local) { setError(local); return; }
    setBusy(true);
    setError('');
    try {
      const res = kind === 'email' ? await requestEmailChangeApi(value.trim().toLowerCase()) : await requestPhoneChangeApi(value.trim());
      setPending(kind === 'email' ? (res as { pending_email: string }).pending_email : (res as { pending_phone: string }).pending_phone);
      setNotice(res.message);
      setCode('');
    } catch (err) {
      setError(apiError(err, kind));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = kind === 'email' ? await confirmEmailChangeApi(code) : await confirmPhoneChangeApi(code);
      setUser(res.data);
      onDone(res.message);
    } catch (err) {
      setError(apiError(err, 'code'));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <form onSubmit={confirm} noValidate className="space-y-3">
        <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-800">{notice}</p>
        <CodeInput value={code} onChange={(v) => { setCode(v); setError(''); }} error={error} disabled={busy} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Checking…' : 'Confirm'}</button>
          <button type="button" className={GHOST} disabled={busy} onClick={(e) => { setPending(null); request(e as unknown as FormEvent); }}>Send a new code</button>
          <button type="button" className={GHOST} onClick={() => onDone('')}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={request} noValidate className="space-y-3">
      {kind === 'email' ? (
        <div className="space-y-1">
          <label htmlFor="new-email" className="text-sm font-medium text-brand-gray-mid">New email</label>
          <input id="new-email" type="email" autoComplete="email" value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} className={`${INPUT} ${error ? 'border-red-500' : 'border-stone-300'}`} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-[12px] text-stone-500">We send a code to the new address. Until you enter it, keep signing in with your current email.</p>
        </div>
      ) : (
        <div className="sm:max-w-sm">
          <PhoneInput id="new-phone" label="New mobile number" value={value} onChange={(v) => { setValue(v); setError(''); }} error={error}
            hint="We email you a code to confirm it. Your number changes once you enter it." />
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        <button type="button" className={GHOST} onClick={() => onDone('')}>Cancel</button>
      </div>
    </form>
  );
}

function PasswordChange({ onDone }: { onDone: (msg: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problems = compact({
      current_password: current ? undefined : 'Enter your current password.',
      password: passwordError(next) ?? (next && next === current ? 'The new password must be different from your current password.' : undefined),
      password_confirmation: confirmError(next, confirm),
    });
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const res = await changePasswordApi({ current_password: current, password: next, password_confirmation: confirm });
      onDone(res.message);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 422) setErrors(firstErrors(err.response.data?.errors));
      else setErrors({ password: apiError(err, 'password') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid sm:grid-cols-3 gap-3">
      <PasswordField id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={(v) => { setCurrent(v); setErrors({}); }} error={errors.current_password} />
      <PasswordField id="new-password" label="New password" value={next} onChange={(v) => { setNext(v); setErrors({}); }} error={errors.password} showRules />
      <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={(v) => { setConfirm(v); setErrors({}); }} error={errors.password_confirmation} />
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        <button type="button" className={GHOST} onClick={() => onDone('')}>Cancel</button>
      </div>
    </form>
  );
}

export default function AccountSecurity({ show = ['email', 'phone', 'password'] }: { show?: Array<'email' | 'phone' | 'password'> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<'email' | 'phone' | 'password' | null>(null);
  const [message, setMessage] = useState('');
  const done = (msg: string) => { setOpen(null); setMessage(msg); };

  return (
    <div className="space-y-3">
      {message && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-800">{message}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {show.includes('email') && <Card icon={Mail} title="Email" value={user?.email} hint="Used to sign in and for order updates." open={open === 'email'} onOpen={() => { setMessage(''); setOpen('email'); }}>
          <CodeChange kind="email" onDone={done} />
        </Card>}
        {show.includes('phone') && <Card icon={Smartphone} title="Mobile number" value={user?.phone_local ?? localPhMobile(user?.phone) ?? 'Not set'} hint="For couriers and order calls." open={open === 'phone'} onOpen={() => { setMessage(''); setOpen('phone'); }}>
          <CodeChange kind="phone" onDone={done} />
        </Card>}
        {show.includes('password') && <Card icon={KeyRound} title="Password" value="••••••••" hint="At least 8 characters with upper and lower case, a number and a symbol." open={open === 'password'} onOpen={() => { setMessage(''); setOpen('password'); }}>
          <PasswordChange onDone={done} />
        </Card>}
      </div>
    </div>
  );
}
