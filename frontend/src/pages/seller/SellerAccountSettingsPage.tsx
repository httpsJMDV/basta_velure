import { useEffect, useState, useRef } from 'react';
import {
  User, Lock, Bell, Mail, Camera, Pencil, Check, X,
  Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, Shield,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import http, { updateProfileApi, uploadAvatarApi } from '../../api/client';
import CustomSelect from '../../components/ui/CustomSelect';
import { getSellerNotificationPreferencesApi, saveSellerNotificationPreferencesApi } from '../../api/notifications';
import type { NotificationPreference } from '../../api/notifications';
import AccountSecurity from '../../components/account/AccountSecurity';
import { nameError as validateName } from '../../utils/accountRules';
import UserAvatar from '../../components/ui/UserAvatar';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'security' | 'notifications';

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-6 py-5 border-b border-gray-100">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

const inputCls = (err?: string) =>
  `w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none transition-all bg-gray-50 focus:bg-white ${
    err
      ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 focus:border-brand-red focus:ring-2 focus:ring-red-100'
  }`;

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}{required && <span className="text-brand-red ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

function Toast({ type, message, onDismiss }: {
  type: 'success' | 'error'; message: string; onDismiss: () => void;
}) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-[13px] font-semibold max-w-sm animate-in slide-in-from-bottom-4 ${
      type === 'success' ? 'bg-white border-emerald-100 text-emerald-700' : 'bg-white border-red-100 text-red-600'
    }`}>
      {type === 'success'
        ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
        : <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />}
      {message}
      <button onClick={onDismiss} className="ml-1 text-gray-300 hover:text-gray-500 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, setUser } = useAuth();

  // Avatar
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatarApi(file);
      setUser(updated);
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  }

  // Name
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [middleName, setMiddleName] = useState(user?.middle_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  // Sex
  const [editingSex, setEditingSex] = useState(false);
  const [sex, setSex] = useState(user?.sex ?? '');
  const [savingSex, setSavingSex] = useState(false);

  async function saveName() {
    const problem = validateName(firstName, 'First name') ?? validateName(middleName, 'Middle name', false) ?? validateName(lastName, 'Last name');
    if (problem) { setNameError(problem); return; }
    setNameError('');
    setSavingName(true);
    try {
      const updated = await updateProfileApi({ first_name: firstName.trim(), middle_name: middleName.trim() || undefined, last_name: lastName.trim() });
      setUser(updated);
      setEditingName(false);
    } catch (err: unknown) {
      const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      setNameError(errors?.first_name?.[0] ?? errors?.middle_name?.[0] ?? errors?.last_name?.[0] ?? 'Your name could not be saved.');
    } finally { setSavingName(false); }
  }

  async function saveSex() {
    setSavingSex(true);
    try {
      const updated = await updateProfileApi({ sex });
      setUser(updated);
      setEditingSex(false);
    } finally { setSavingSex(false); }
  }

  const displayDob = () => {
    if (!user?.date_of_birth) return '—';
    const [y, m, d] = user.date_of_birth.split('-');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
  };

  const age = () => {
    if (!user?.date_of_birth) return null;
    const today = new Date();
    const birth = new Date(user.date_of_birth);
    let a = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) a--;
    return a;
  };

  return (
    <div className="space-y-5">
      {/* Avatar card */}
      <SectionCard>
        <SectionHeader title="Profile Photo" />
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="relative shrink-0">
            <UserAvatar
              firstName={user?.first_name ?? ''}
              lastName={user?.last_name ?? ''}
              avatarUrl={user?.avatar_url}
              size="xl"
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-red hover:bg-brand-red-dark text-white flex items-center justify-center shadow-md transition-colors disabled:opacity-60"
            >
              {uploadingAvatar
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-[14px] font-bold text-gray-900">{user?.first_name} {user?.last_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{user?.seller_profile?.shop_name}</p>
            <p className="text-[11px] text-gray-300 mt-1">Click the camera icon to update your photo.</p>
          </div>
        </div>
      </SectionCard>

      {/* Personal info card */}
      <SectionCard>
        <SectionHeader title="Personal Information" subtitle="Your identity details as registered on Loved-IT." />
        <div className="divide-y divide-gray-50">

          {/* Full Name */}
          <div className="px-6 py-4">
            {editingName ? (
              <div className="space-y-3">
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Full Name</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="First Name" required error={undefined}>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputCls()} />
                  </Field>
                  <Field label="Middle Name" error={undefined}>
                    <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Optional" className={inputCls()} />
                  </Field>
                  <Field label="Last Name" required error={undefined}>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputCls()} />
                  </Field>
                </div>
                {nameError && <p className="text-[11px] text-red-500 font-medium">{nameError}</p>}
                <div className="flex gap-2">
                  <button onClick={saveName} disabled={savingName}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white text-[12px] font-bold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-50 min-h-[36px]">
                    {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {savingName ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingName(false); setNameError(''); }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-[12px] font-bold rounded-xl hover:bg-gray-200 transition-colors min-h-[36px]">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Full Name</p>
                  <p className="text-[13px] font-semibold text-gray-800">
                    {[user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
                <button onClick={() => { setFirstName(user?.first_name ?? ''); setMiddleName(user?.middle_name ?? ''); setLastName(user?.last_name ?? ''); setEditingName(true); }}
                  className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Email and mobile: each change is confirmed with a code sent by email */}
          <div className="px-6 py-4">
            <AccountSecurity show={['email', 'phone']} />
          </div>

          {/* Birthday — read-only */}
          <div className="px-6 py-4">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Birthday</p>
            <p className="text-[13px] font-semibold text-gray-800">{displayDob()}{age() !== null ? ` · Age ${age()}` : ''}</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Birthday cannot be changed after registration.</p>
          </div>

          {/* Sex */}
          <div className="px-6 py-4">
            {editingSex ? (
              <div className="space-y-3">
                <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Sex</p>
                <CustomSelect value={sex} onChange={setSex} options={SEX_OPTIONS} placeholder="Select sex" />
                <div className="flex gap-2">
                  <button onClick={saveSex} disabled={savingSex}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white text-[12px] font-bold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-50 min-h-[36px]">
                    {savingSex ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {savingSex ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingSex(false)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-[12px] font-bold rounded-xl hover:bg-gray-200 transition-colors min-h-[36px]">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Sex</p>
                  <p className="text-[13px] font-semibold text-gray-800">
                    {SEX_OPTIONS.find((o) => o.value === user?.sex)?.label ?? '—'}
                  </p>
                </div>
                <button onClick={() => { setSex(user?.sex ?? ''); setEditingSex(true); }}
                  className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

        </div>
      </SectionCard>

      {/* Seller status card */}
      <SectionCard>
        <div className="px-6 py-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-gray-900">Approved Seller</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Your seller account is active and in good standing.</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab({ onToast }: { onToast: (t: { type: 'success' | 'error'; message: string }) => void }) {
  const { user } = useAuth();
  const hasPassword = user?.has_password ?? true;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const strength = (() => {
    if (!newPassword) return 0;
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'][strength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (hasPassword && !currentPassword) errs.current_password = 'Current password is required.';
    if (!newPassword || newPassword.length < 8) errs.new_password = 'New password must be at least 8 characters.';
    if (newPassword !== confirmPassword) errs.confirm_password = 'Passwords do not match.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    try {
      await http.post('/auth/change-password', {
        ...(hasPassword ? { current_password: currentPassword } : {}),
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      onToast({ type: 'success', message: hasPassword ? 'Password changed successfully.' : 'Password set successfully.' });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })?.response?.data;
      if (data?.errors) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.errors)) mapped[k] = v[0];
        setErrors(mapped);
      } else {
        onToast({ type: 'error', message: data?.message ?? 'Failed to update password.' });
      }
    } finally { setSaving(false); }
  }

  const PasswordInput = ({ value, onChange, show, onToggle, placeholder, error }: {
    value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
    placeholder: string; error?: string;
  }) => (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls(error)} pr-10`}
        autoComplete="new-password"
      />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Google account notice */}
      {!hasPassword && (
        <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-2xl">
          <div className="w-8 h-8 rounded-lg bg-white border border-blue-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-bold text-blue-800">Google account detected</p>
            <p className="text-[12px] text-blue-600 mt-0.5">You signed up with Google and don't have a password yet. Set one below to also be able to log in with email and password.</p>
          </div>
        </div>
      )}

      <SectionCard>
        <SectionHeader
          title={hasPassword ? 'Change Password' : 'Set a Password'}
          subtitle={hasPassword ? "Use a strong password you don't use elsewhere." : 'Add a password so you can log in without Google.'}
        />
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {hasPassword && (
            <Field label="Current Password" required error={errors.current_password}>
              <PasswordInput value={currentPassword} onChange={setCurrentPassword}
                show={showCurrent} onToggle={() => setShowCurrent((v) => !v)}
                placeholder="Enter current password" error={errors.current_password} />
            </Field>
          )}

          <Field label="New Password" required error={errors.new_password}
            hint="At least 8 characters. Mix uppercase, numbers, and symbols for a stronger password.">
            <PasswordInput value={newPassword} onChange={setNewPassword}
              show={showNew} onToggle={() => setShowNew((v) => !v)}
              placeholder="Enter new password" error={errors.new_password} />
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor : 'bg-gray-100'}`} />
                  ))}
                </div>
                <p className={`text-[11px] font-semibold ${['', 'text-red-500', 'text-amber-500', 'text-blue-500', 'text-emerald-600'][strength]}`}>
                  {strengthLabel}
                </p>
              </div>
            )}
          </Field>

          <Field label="Confirm New Password" required error={errors.confirm_password}>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword}
              show={showConfirm} onToggle={() => setShowConfirm((v) => !v)}
              placeholder="Re-enter new password" error={errors.confirm_password} />
          </Field>

          <div className="pt-1">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 text-white text-[13px] font-bold px-6 py-2.5 rounded-xl transition-colors min-h-[44px]">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : hasPassword ? 'Update Password' : 'Set Password'}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-900">Account Security Tips</p>
            <ul className="mt-2 space-y-1.5">
              {[
                'Never share your password with anyone, including Loved-IT staff.',
                'Use a unique password not used on other websites.',
                'Enable a strong password with uppercase, numbers, and symbols.',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-[12px] text-gray-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

type ChannelPrefs = Record<string, { app: boolean; email: boolean }>;

function Toggle({ enabled, onChange, label, disabled }: { enabled: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 disabled:opacity-50 ${enabled ? 'bg-brand-red' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

/**
 * What the seller hears about, by the bell and by email. Saved on the account and obeyed by both: a switched-off
 * channel gets nothing for that kind of event. Account, security and application notices are always sent.
 */
function NotificationsTab({ onToast }: { onToast: (t: { type: 'success' | 'error'; message: string }) => void }) {
  const [rows, setRows] = useState<NotificationPreference[] | null>(null);
  const [saved, setSaved] = useState<ChannelPrefs>({});
  const [prefs, setPrefs] = useState<ChannelPrefs>({});
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = (list: NotificationPreference[]) => {
    const map = Object.fromEntries(list.map((r) => [r.key, { app: r.app, email: r.email }]));
    setRows(list);
    setSaved(map);
    setPrefs(map);
  };

  const load = () => {
    setLoadError(false);
    getSellerNotificationPreferencesApi().then(apply).catch(() => setLoadError(true));
  };
  useEffect(load, []);

  const dirty = rows !== null && rows.some((r) => prefs[r.key]?.app !== saved[r.key]?.app || prefs[r.key]?.email !== saved[r.key]?.email);

  function set(key: string, channel: 'app' | 'email', value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: { ...prev[key], [channel]: value } }));
  }

  function setAll(channel: 'app' | 'email', value: boolean) {
    setPrefs((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, [channel]: value }])));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await saveSellerNotificationPreferencesApi(prefs);
      apply(res.data);
      onToast({ type: 'success', message: res.message });
    } catch {
      onToast({ type: 'error', message: 'Your notification settings were not saved. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const allOn = (channel: 'app' | 'email') => Object.values(prefs).every((p) => p[channel]);

  return (
    <div className="space-y-5">
      <SectionCard>
        <SectionHeader title="Notifications" subtitle="Choose what Loved-IT tells you about your shop, on the bell at the top of the page and by email." />

        {loadError ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-gray-600">Your notification settings could not be loaded.</p>
            <button type="button" onClick={load} className="mt-2 text-[13px] font-bold text-brand-red hover:underline">Try again</button>
          </div>
        ) : rows === null ? (
          <div className="divide-y divide-gray-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="flex-1 space-y-2"><div className="h-3 w-40 bg-gray-100 rounded" /><div className="h-3 w-64 bg-gray-50 rounded" /></div>
                <div className="h-6 w-11 bg-gray-100 rounded-full" /><div className="h-6 w-11 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_64px_64px] items-end gap-4 px-6 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <span>Event</span>
              <span className="flex flex-col items-center gap-1"><Bell className="w-3.5 h-3.5" aria-hidden="true" />Bell</span>
              <span className="flex flex-col items-center gap-1"><Mail className="w-3.5 h-3.5" aria-hidden="true" />Email</span>
            </div>
            <div className="divide-y divide-gray-50">
              {rows.map((row) => (
                <div key={row.key} className="px-6 py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_64px_64px] items-center gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800">{row.label}</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">{row.description}</p>
                  </div>
                  <div className="flex items-center justify-end gap-3 sm:contents">
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="sm:hidden text-[11px] text-gray-400">Bell</span>
                      <Toggle label={`${row.label} on the bell`} enabled={prefs[row.key]?.app ?? true} onChange={(v) => set(row.key, 'app', v)} />
                    </span>
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="sm:hidden text-[11px] text-gray-400">Email</span>
                      <Toggle label={`${row.label} by email`} enabled={prefs[row.key]?.email ?? true} onChange={(v) => set(row.key, 'email', v)} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <button type="button" onClick={() => setAll('app', !allOn('app'))} className="font-semibold text-gray-600 hover:text-brand-red">
                {allOn('app') ? 'Turn off every bell notification' : 'Turn on every bell notification'}
              </button>
              <button type="button" onClick={() => setAll('email', !allOn('email'))} className="font-semibold text-gray-600 hover:text-brand-red">
                {allOn('email') ? 'Turn off every email' : 'Turn on every email'}
              </button>
            </div>
          </>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11.5px] text-gray-400 max-w-md">
            Account, security and application emails are always sent. Buyer messages show under Messages, with their own count.
          </p>
          <div className="flex items-center gap-2 justify-end">
            {dirty && (
              <button type="button" onClick={() => setPrefs(saved)} disabled={saving}
                className="text-[13px] font-semibold text-gray-600 px-4 py-2.5 rounded-xl hover:bg-gray-100 min-h-[44px]">
                Discard
              </button>
            )}
            <button onClick={handleSave} disabled={saving || !dirty}
              className="flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white text-[13px] font-bold px-6 py-2.5 rounded-xl transition-colors min-h-[44px]">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; icon: React.ElementType; label: string }[] = [
  { key: 'profile',       icon: User,  label: 'Profile' },
  { key: 'security',      icon: Lock,  label: 'Security' },
  { key: 'notifications', icon: Bell,  label: 'Notifications' },
];

export default function SellerAccountSettingsPage() {
  const pageRef = useMountAnim();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  return (
    <div ref={pageRef} className="max-w-3xl mx-auto space-y-5">

      {/* Tab bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-[13px] font-semibold transition-all duration-150',
              activeTab === key
                ? 'bg-brand-red text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
            ].join(' ')}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profile'       && <ProfileTab />}
      {activeTab === 'security'      && <SecurityTab onToast={setToast} />}
      {activeTab === 'notifications' && <NotificationsTab onToast={setToast} />}

      {/* Toast */}
      {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}
    </div>
  );
}
