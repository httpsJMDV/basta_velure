import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings, UserRound, KeyRound, Warehouse, Camera, Pencil, Check, X, Loader2, MapPin, Truck, ShieldCheck, FileCheck2, Mail, Phone,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getHubProfileApi, getPayoutAccountApi, updatePayoutAccountApi, updateProfileApi, uploadAvatarApi } from '../../api/client';
import type { HubProfile } from '../../types';
import { PageHeader } from './hubKit';
import { Pill, ListError } from '../../components/admin/listKit';
import AccountSecurity from '../../components/account/AccountSecurity';
import { PayoutAccountForm } from '../../components/payments/GcashKit';
import UserAvatar from '../../components/ui/UserAvatar';
import { fileError, nameError } from '../../utils/accountRules';

type Tab = 'account' | 'security' | 'hub';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'account', label: 'Account', icon: UserRound },
  { key: 'security', label: 'Password', icon: KeyRound },
  { key: 'hub', label: 'Hub & payout', icon: Warehouse },
];

const loadGcash = () => getPayoutAccountApi('hub');
const saveGcash = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('hub', p);

const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '—';

/** A labelled row in a settings card: the label on the left, the value (or the editor) on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

/**
 * The hub manager's settings (the seller portal's Account Settings, for the hub): their own account (photo, name,
 * email and mobile with a code), the password, and the hub's details with the GCash its courier pays it on. The hub's
 * name, address and coverage are read-only here: the courier company approves them, so changes go through it.
 */
export default function HubSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'account';

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHeader icon={Settings} accent="gray" title="Settings"
        subtitle="Your account, your password, your hub's details and the GCash your courier pays you on." />

      <section className="hub-settings-shell overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="hub-settings-navigation">
          <div role="tablist" aria-label="Settings sections" className="inline-flex max-w-full items-center gap-0.5 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}
                className={`min-h-9 px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${tab === key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hub-settings-content">
        {tab === 'account' && <AccountTab />}
        {tab === 'security' && (
          <div className="divide-y divide-gray-100">
            <Row label="Password" hint="Use it to sign in at /hub/login. You need your current password to set a new one.">
              <div className="max-w-3xl"><AccountSecurity show={['password']} /></div>
            </Row>
          </div>
        )}
        {tab === 'hub' && <HubTab />}
        </div>
      </section>
    </div>
  );
}

function AccountTab() {
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
      <Row label="Profile photo" hint="Shown to your riders in messages. JPG or PNG, up to 5 MB.">
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
      </Row>

      <Row label="Full name" hint="As on your government ID. Letters, spaces, hyphens, apostrophes and periods.">
        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ['first_name', 'First name', first, setFirst, true],
                ['middle_name', 'Middle name (optional)', middle, setMiddle, false],
                ['last_name', 'Last name', last, setLast, true],
              ] as const).map(([key, label, value, set, required]) => (
                <div key={key}>
                  <label htmlFor={`hub-${key}`} className="block mb-1 text-[11.5px] font-medium text-gray-600">{label}{required && <span className="text-brand-red"> *</span>}</label>
                  <input id={`hub-${key}`} value={value} maxLength={50} aria-invalid={Boolean(errors[key])}
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
      </Row>

      <Row label="Email and mobile" hint="Each change is confirmed with a 6-digit code sent to your email.">
        <div className="max-w-3xl"><AccountSecurity show={['email', 'phone']} /></div>
      </Row>
    </div>
  );
}

function HubTab() {
  const [hub, setHub] = useState<HubProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getHubProfileApi().then(setHub).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const address = hub ? [hub.address_street, hub.address_barangay, hub.address_city, hub.address_province].filter(Boolean).join(', ') : '';

  return (
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:divide-x divide-gray-100">
      <div className="min-w-0">
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-[13px] font-bold text-gray-900">Hub details</h2>
          <p className="text-[11.5px] text-gray-500">What riders, sellers and your courier see about this hub.</p>
        </div>
        {failed ? <div className="p-5"><ListError message="The hub details could not be loaded." onRetry={load} /></div> : !hub ? (
          <div className="p-5 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : (
          <>
            <dl className="divide-y divide-gray-100">
              {([
                [Warehouse, 'Hub name', <span key="hub-name" className="inline-flex flex-wrap items-center gap-2">{hub.hub_name} <Pill tone="emerald">Approved</Pill></span>],
                [Truck, 'Courier company', hub.courier ? `${hub.courier.name} (${hub.courier.code})` : '—'],
                [MapPin, 'Address', address || '—'],
                [ShieldCheck, 'Delivery coverage', `${hub.coverage_barangays_count} barangay${hub.coverage_barangays_count === 1 ? '' : 's'}`],
                [FileCheck2, 'Business permit', hub.has_permit ? 'On file' : 'Not on file'],
                [Settings, 'Applied · approved', `${longDate(hub.applied_at)} · ${longDate(hub.approved_at)}`],
              ] as const).map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-3 px-5 py-3">
                  <span className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                    <dd className="text-[13px] font-medium text-gray-900 break-words">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="m-5 mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-950">
              <p className="font-semibold">Need to change the hub's name, address or coverage?</p>
              <p className="mt-0.5 text-amber-900">
                Your courier company approved these, so it makes the change.{' '}
                {hub.courier ? <>Contact <b>{hub.courier.name}</b>:</> : 'Contact your courier company.'}
              </p>
              {hub.courier && (hub.courier.contact_email || hub.courier.contact_phone) && (
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {hub.courier.contact_email && <a href={`mailto:${hub.courier.contact_email}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Mail className="w-3.5 h-3.5" aria-hidden="true" />{hub.courier.contact_email}</a>}
                  {hub.courier.contact_phone && <a href={`tel:${hub.courier.contact_phone}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Phone className="w-3.5 h-3.5" aria-hidden="true" />{hub.courier.contact_phone}</a>}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="p-5 space-y-2 border-t border-gray-100 lg:border-t-0">
        <h2 className="text-[13px] font-bold text-gray-900">Payout GCash</h2>
        <p className="text-[11.5px] text-gray-500">Your courier sends the hub's share of delivery fees here. The Earnings page shows what it owes.</p>
        <PayoutAccountForm load={loadGcash} save={saveGcash} who="your courier" tone="gray" />
      </div>
    </div>
  );
}
