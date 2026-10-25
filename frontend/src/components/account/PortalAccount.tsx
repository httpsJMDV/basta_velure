// The "your own account" part of a portal's Settings (the hub's and the courier company's): the photo, the name,
// and the email and mobile changed with a code. Each portal adds its own tabs around it.
import { useRef, useState } from 'react';
import { Camera, Check, Loader2, Pencil, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfileApi, uploadAvatarApi } from '../../api/client';
import AccountSecurity from './AccountSecurity';
import UserAvatar from '../ui/UserAvatar';
import { fileError, nameError } from '../../utils/accountRules';

/** A labelled row in a settings card: the label on the left, the value (or the editor) on the right. */
export function SettingsRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
      <div>
        <p className="text-[12.5px] font-semibold text-gray-800">{label}</p>
        {hint && <p className="mt-0.5 text-[11.5px] text-gray-500">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function PortalAccountTab({ photoHint, idPrefix }: { photoHint: string; idPrefix: string }) {
  const { user, setUser } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const changePhoto = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileError(file, 'your photo');
    if (problem) { setPhotoError(problem); return; }
    setPhotoError('');
    setPhotoBusy(true);
    try { setUser(await uploadAvatarApi(file)); }
    catch (e) { setPhotoError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'The photo was not saved. Try a JPG or PNG up to 5 MB.'); }
    finally { setPhotoBusy(false); }
  };

  const startEditing = () => {
    setFirst(user?.first_name ?? '');
    setMiddle(user?.middle_name ?? '');
    setLast(user?.last_name ?? '');
    setErrors({});
    setEditing(true);
  };

  const saveName = async () => {
    const local = Object.fromEntries(Object.entries({
      first_name: nameError(first, 'First name'),
      middle_name: nameError(middle, 'Middle name', false),
      last_name: nameError(last, 'Last name'),
    }).filter(([, v]) => v)) as Record<string, string>;
    if (Object.keys(local).length) { setErrors(local); return; }
    setSaving(true);
    try {
      setUser(await updateProfileApi({ first_name: first.trim(), middle_name: middle.trim() || undefined, last_name: last.trim() }));
      setEditing(false);
    } catch (e) {
      const errs = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors ?? {};
      setErrors(Object.keys(errs).length ? Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])) : { first_name: 'Your name was not saved. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const input = (err?: string) =>
    `w-full h-10 px-3 text-[13px] bg-white border rounded-xl outline-none focus:ring-2 focus:ring-brand-red/10 ${err ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'}`;

  return (
    <div className="divide-y divide-gray-100">
      <SettingsRow label="Profile photo" hint={photoHint}>
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar firstName={user?.first_name ?? ''} lastName={user?.last_name ?? ''} avatarUrl={user?.avatar_url} size="lg" />
          <button type="button" onClick={() => photoInput.current?.click()} disabled={photoBusy}
            className="min-h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1.5 disabled:opacity-50">
            {photoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Camera className="w-3.5 h-3.5" aria-hidden="true" />}
            {photoBusy ? 'Uploading…' : 'Change photo'}
          </button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png" className="sr-only"
            onChange={(e) => { void changePhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {photoError && <p role="alert" className="mt-2 text-[12px] font-medium text-red-700">{photoError}</p>}
      </SettingsRow>

      <SettingsRow label="Full name" hint="As on your government ID. Letters, spaces, hyphens, apostrophes and periods.">
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ['first_name', 'First name', first, setFirst, true],
                ['middle_name', 'Middle name (optional)', middle, setMiddle, false],
                ['last_name', 'Last name', last, setLast, true],
              ] as const).map(([key, label, value, set, required]) => (
                <div key={key}>
                  <label htmlFor={`${idPrefix}-${key}`} className="block mb-1 text-[11.5px] font-medium text-gray-600">{label}{required && <span className="text-brand-red"> *</span>}</label>
                  <input id={`${idPrefix}-${key}`} value={value} maxLength={50} aria-invalid={Boolean(errors[key])}
                    onChange={(e) => { set(e.target.value); setErrors(({ [key]: _drop, ...rest }) => rest); }} className={input(errors[key])} />
                  {errors[key] && <p role="alert" className="mt-1 text-[11.5px] text-red-700">{errors[key]}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveName()} disabled={saving}
                className="min-h-9 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} {saving ? 'Saving…' : 'Save name'}
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={saving}
                className="min-h-9 px-4 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" aria-hidden="true" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-semibold text-gray-900">{[user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ') || '—'}</p>
            <button type="button" onClick={startEditing} aria-label="Edit your name"
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 inline-flex items-center justify-center">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </SettingsRow>

      <SettingsRow label="Email and mobile" hint="Each change is confirmed with a 6-digit code sent to your email.">
        <div className="max-w-3xl"><AccountSecurity show={['email', 'phone']} /></div>
      </SettingsRow>
    </div>
  );
}
