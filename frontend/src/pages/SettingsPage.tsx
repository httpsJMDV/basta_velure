import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  updateProfileApi,
  getAddressesApi,
  createAddressApi,
  updateAddressApi,
  deleteAddressApi,
  setDefaultAddressApi,
  getWishlistApi,
  removeFromWishlistApi,
  getFollowedStoresApi,
  toggleStoreFollowApi,
} from '../api/client';
import { useCart } from '../hooks/useCart';
import { useToast } from '../components/ui/Toast';
import CustomSelect from '../components/ui/CustomSelect';
import PhoneInput from '../components/ui/PhoneInput';
import AccountSecurity from '../components/account/AccountSecurity';
import { fileError, localPhMobile, nameError as validateName, phoneError } from '../utils/accountRules';
import { PH_REGIONS, regionName } from '../data/ph-regions';
import UserAvatar from '../components/ui/UserAvatar';
import AvatarCropModal from '../components/ui/AvatarCropModal';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { uploadAvatarApi, getBuyerOrdersPageApi } from '../api/client';
import BuyerOrderCard from '../components/orders/BuyerOrderCard';
import VoucherTicket from '../components/vouchers/VoucherTicket';
import { claimVoucherApi, getPlatformVouchersApi, getWalletApi } from '../api/commerce';
import type { WalletVoucher } from '../api/commerce';
import { apiErrorMessage, apiProblem } from '../utils/apiError';
import type { Address, AddressLabel, BuyerOrderTab, Order, WishlistItem, FollowedStore } from '../types';
import ReviewsPanel from '../components/reviews/ReviewsPanel';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store,
  ChevronRight, Camera, Pencil, Check, X, Home, Briefcase, Plus,
  Trash2, Search, ShoppingCart, Ticket, MessageSquare, AlertTriangle,
} from 'lucide-react';

interface PsgcItem { code: string; name: string; }

// ─── Navigation ─────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    title: 'Account',
    items: [
      { icon: User, label: 'Profile', to: '/settings' },
      { icon: MapPin, label: 'Addresses', to: '/settings/addresses' },
    ],
  },
  {
    title: 'Shopping',
    items: [
      { icon: Package, label: 'Orders', to: '/settings/orders' },
      { icon: RotateCcw, label: 'Returns', to: '/settings/returns' },
      { icon: XCircle, label: 'Cancellations', to: '/settings/cancellations' },
      { icon: Ticket, label: 'My vouchers', to: '/settings/vouchers' },
      { icon: Star, label: 'Reviews', to: '/settings/reviews' },
      { icon: Heart, label: 'Wishlist & stores', to: '/settings/wishlist' },
    ],
  },
  {
    title: 'Inbox',
    items: [{ icon: MessageSquare, label: 'Messages', to: '/settings/messages' }],
  },
];

/** The seller shortcut: open a shop, see the application, or go to the Seller Center. */
function SellCard() {
  const { user } = useAuth();
  const status = user?.seller_profile?.application_status ?? 'none';
  const card = status === 'approved'
    ? { to: '/seller', title: 'Seller Center', text: 'Orders, products and payouts for your shop.' }
    : status === 'pending'
    ? { to: '/register/seller', title: 'Application in review', text: 'We will email you once your shop is approved.' }
    : { to: '/register/seller', title: status === 'rejected' ? 'Apply again to sell' : 'Sell on Loved-IT', text: 'Open a shop and reach buyers across Laguna.' };

  return (
    <Link to={card.to} className="group mt-4 flex items-start gap-3 p-4 rounded-2xl bg-white border border-stone-200 hover:border-brand-red/40 transition-colors">
      <span className="w-9 h-9 rounded-xl bg-rose-50 text-brand-red flex items-center justify-center shrink-0"><Store className="w-[18px] h-[18px]" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-stone-900">{card.title}</span>
        <span className="block text-[12px] text-stone-500 mt-0.5 leading-snug">{card.text}</span>
      </span>
      <ChevronRight className="w-4 h-4 mt-1 text-stone-300 group-hover:text-brand-red group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

function SettingsNav() {
  const location = useLocation();
  const isActive = (to: string) => location.pathname === to;
  const all = NAV_GROUPS.flatMap((g) => g.items);

  return (
    <>
      {/* Phones: one swipeable row */}
      <nav className="lg:hidden -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar" aria-label="Account sections">
        {all.map(({ icon: Icon, label, to }) => (
          <Link key={to} to={to}
            className={`shrink-0 h-9 px-3.5 rounded-full border flex items-center gap-1.5 text-[13px] transition-colors ${isActive(to) ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </Link>
        ))}
      </nav>

      {/* Larger screens: grouped rail */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-[126px]">
          <nav aria-label="Account sections" className="space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">{group.title}</p>
                <ul className="space-y-0.5">
                  {group.items.map(({ icon: Icon, label, to }) => {
                    const active = isActive(to);
                    return (
                      <li key={to}>
                        <Link to={to}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors ${active ? 'bg-white text-brand-red font-semibold shadow-[inset_3px_0_0_#B91C1C] ring-1 ring-stone-200' : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'}`}>
                          <Icon className={`w-[18px] h-[18px] ${active ? 'text-brand-red' : 'text-stone-400'}`} strokeWidth={1.8} />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <SellCard />
        </div>
      </aside>
    </>
  );
}

/** Who is signed in, across the top of every account page. */
function AccountBand() {
  const { user } = useAuth();
  const since = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null;
  const roles = [
    user?.seller_profile?.application_status === 'approved' && 'Seller',
    user?.sorting_center?.status === 'APPROVED' && 'Hub operator',
    user?.rider?.status === 'ACTIVE' && 'Rider',
    user?.logistics_company?.status === 'APPROVED' && 'Courier admin',
  ].filter(Boolean) as string[];

  return (
    <div className="bg-white border-b border-stone-200/70">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
        <UserAvatar firstName={user?.first_name ?? ''} lastName={user?.last_name ?? ''} avatarUrl={user?.avatar_url} size="xl" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-400">My account</p>
          <h1 className="mt-0.5 text-[26px] sm:text-[30px] leading-tight font-serif font-bold tracking-tight text-[#1E1B18] truncate">
            {user?.first_name} {user?.last_name}
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 truncate">
            {user?.email}{since && <span className="text-stone-300"> · </span>}{since && `Member since ${since}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((r) => <span key={r} className="h-7 px-3 rounded-full bg-stone-100 text-[12px] font-medium text-stone-700 flex items-center">{r}</span>)}
          <Link to="/settings/orders" className="h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 flex items-center gap-1.5">
            <Package className="w-4 h-4" /> Track orders
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Birthday dropdown helpers ───────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
].map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }));

const SEX_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// ─── Editable tile ──────────────────────────────────────────────────────────

function InfoRow({
  label,
  display,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  label: string;
  display: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${editing ? 'sm:col-span-2 border-stone-300 bg-white' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">{label}</p>
        {!editing && (
          <button type="button" onClick={onEdit} className="-mt-1 -mr-1 h-7 px-2.5 rounded-full text-[12px] font-semibold text-brand-red hover:bg-rose-50 flex items-center gap-1 transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          {children}
          <div className="flex gap-2">
            <button type="button" onClick={onSave} disabled={saving}
              className="h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onCancel}
              className="h-9 px-4 rounded-full border border-stone-300 text-stone-700 text-[13px] font-semibold hover:border-stone-500 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[15px] font-medium text-stone-900 break-words">{display || <span className="text-stone-400 font-normal">Not set</span>}</p>
      )}
    </div>
  );
}

// ─── Panel shell ─────────────────────────────────────────────────────────────

/** The frame every account page shares (the Profile page's): a white title band over a soft body. */
function PanelShell({ title, subtitle, action, tabs, children, bodyClassName = 'p-6' }: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  /** A tab row that sits at the bottom of the title band. */
  tabs?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-3xl bg-white/60 border border-stone-200 overflow-hidden">
      <header className={`px-6 pt-6 bg-white border-b border-stone-200 ${tabs ? '' : 'pb-5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-serif font-bold tracking-tight text-[#1E1B18]">{title}</h2>
            <p className="mt-1 text-[13px] text-stone-500">{subtitle}</p>
          </div>
          {action}
        </div>
        {tabs}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Underline tabs for a PanelShell's title band, with a count after each label. */
function PanelTabs<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { key: T; label: string; count?: number }[]; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-5 mt-4 -mb-px overflow-x-auto no-scrollbar">
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
          className={`relative shrink-0 pb-3 text-[13.5px] transition-colors ${value === o.key ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className={`ml-1.5 tabular-nums ${value === o.key ? 'text-brand-red' : 'text-stone-400'}`}>{o.count}</span>}
          {value === o.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-red" />}
        </button>
      ))}
    </div>
  );
}

function PanelEmpty({ icon: Icon, title, hint, action }: { icon: React.ElementType; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 flex flex-col items-center text-center">
      <span className="w-14 h-14 rounded-full bg-white border border-stone-200 text-stone-400 flex items-center justify-center"><Icon className="w-6 h-6" /></span>
      <p className="mt-3 font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-[13px] text-stone-500 max-w-sm">{hint}</p>
      {action}
    </div>
  );
}

function PanelSpinner() {
  return <div className="py-14 flex justify-center"><div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>;
}

// ─── Manage Account panel ────────────────────────────────────────────────────

function AccountPanel() {
  const { user, setUser } = useAuth();

  // Avatar state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedMessage, setSavedMessage] = useState('');

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // A16: JPG or PNG up to 5 MB; a rejected file keeps the current photo.
    const problem = fileError(file, 'the profile photo');
    if (problem) { setAvatarMessage({ ok: false, text: problem }); return; }
    setAvatarMessage(null);
    setCropFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatarApi(blob);
      setUser(updated);
      setAvatarMessage({ ok: true, text: 'Your profile photo has been updated.' });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; errors?: { avatar?: string[] } } } })?.response?.data;
      setAvatarMessage({ ok: false, text: data?.errors?.avatar?.[0] ?? data?.message ?? 'The photo could not be uploaded.' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Name edit state
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [middleName, setMiddleName] = useState(user?.middle_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  // Today, fixed for this visit (for the age shown under the birthday).
  const [today] = useState(() => new Date());

  // Sex edit state
  const [editingSex, setEditingSex] = useState(false);
  const [sex, setSex] = useState(user?.sex ?? '');
  const [savingSex, setSavingSex] = useState(false);

  const displayDob = () => {
    if (!user?.date_of_birth) return '';
    const [y, m, d] = user.date_of_birth.split('-');
    const monthLabel = MONTHS.find((mo) => mo.value === m)?.label ?? m;
    return `${monthLabel} ${parseInt(d)}, ${y}`;
  };

  const displaySex = () =>
    SEX_OPTIONS.find((s) => s.value === user?.sex)?.label ?? '—';

  async function saveName() {
    const problem = validateName(firstName, 'First name') ?? validateName(middleName, 'Middle name', false) ?? validateName(lastName, 'Last name');
    if (problem) { setNameError(problem); return; }
    setNameError('');
    setSavingName(true);
    try {
      const updated = await updateProfileApi({ first_name: firstName.trim(), middle_name: middleName.trim() || undefined, last_name: lastName.trim() });
      setUser(updated);
      setEditingName(false);
      setSavedMessage('Your profile has been updated.');
    } catch (err: unknown) {
      const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      setNameError(errors?.first_name?.[0] ?? errors?.middle_name?.[0] ?? errors?.last_name?.[0] ?? 'Your name could not be saved.');
    } finally {
      setSavingName(false);
    }
  }

  async function saveSex() {
    setSavingSex(true);
    try {
      const updated = await updateProfileApi({ sex });
      setUser(updated);
      setEditingSex(false);
    } finally {
      setSavingSex(false);
    }
  }

  const age = (() => {
    if (!user?.date_of_birth) return null;
    const birth = new Date(user.date_of_birth);
    let a = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
    return a;
  })();
  const inputCls = 'h-10 w-full rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10';

  return (
    <section className="rounded-3xl bg-white/60 border border-stone-200 overflow-hidden">
      <header className="px-6 pt-6 pb-5 bg-white border-b border-stone-200">
        <h2 className="text-xl font-serif font-bold tracking-tight text-[#1E1B18]">Profile</h2>
        <p className="mt-1 text-[13px] text-stone-500">How shops and riders see you, and how we reach you about your orders.</p>
      </header>

      <div className="p-6 space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-5 p-4 rounded-2xl bg-white border border-stone-200">
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
            className="relative shrink-0 rounded-full group" aria-label="Change profile photo">
            <UserAvatar firstName={user?.first_name ?? ''} lastName={user?.last_name ?? ''} avatarUrl={user?.avatar_url} size="xl" />
            <span className="absolute inset-0 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-5 h-5" />}
            </span>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarFileChange} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-stone-900">Profile photo</p>
            <p className="text-[12px] text-stone-500 mt-0.5">JPG or PNG up to 5 MB. You can crop it before saving.</p>
          </div>
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
            className="h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 disabled:opacity-50 transition-colors shrink-0">
            {uploadingAvatar ? 'Uploading…' : user?.avatar_url ? 'Change' : 'Upload'}
          </button>
        </div>

        {avatarMessage && (
          <p role={avatarMessage.ok ? 'status' : 'alert'} className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${avatarMessage.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{avatarMessage.text}</p>
        )}
        {savedMessage && <p role="status" className="rounded-xl border bg-emerald-50 border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-800">{savedMessage}</p>}
        {cropFile && <AvatarCropModal file={cropFile} onConfirm={handleCropConfirm} onCancel={() => setCropFile(null)} />}

        <div className="grid sm:grid-cols-2 gap-3">
          <InfoRow
            label="Full name"
            display={[user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ')}
            editing={editingName}
            onEdit={() => { setFirstName(user?.first_name ?? ''); setMiddleName(user?.middle_name ?? ''); setLastName(user?.last_name ?? ''); setEditingName(true); }}
            onCancel={() => { setEditingName(false); setNameError(''); }}
            onSave={saveName}
            saving={savingName}
          >
            <div className="grid sm:grid-cols-3 gap-2">
              <input placeholder="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
              <input placeholder="Middle name (optional)" value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={inputCls} />
              <input placeholder="Last name *" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
            </div>
            {nameError && <p className="text-xs text-red-600">{nameError}</p>}
          </InfoRow>

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">Birthday</p>
            <p className="mt-1.5 text-[15px] font-medium text-stone-900">{displayDob() || <span className="text-stone-400 font-normal">Not set</span>}</p>
            <p className="mt-1 text-[12px] text-stone-500">{age != null ? `${age} years old · ` : ''}Set at registration and can&apos;t be changed.</p>
          </div>

          <InfoRow
            label="Sex"
            display={user?.sex ? displaySex() : ''}
            editing={editingSex}
            onEdit={() => { setSex(user?.sex ?? ''); setEditingSex(true); }}
            onCancel={() => setEditingSex(false)}
            onSave={saveSex}
            saving={savingSex}
          >
            <div className="sm:max-w-xs">
              <CustomSelect value={sex} onChange={setSex} options={SEX_OPTIONS} placeholder="Select sex" />
            </div>
          </InfoRow>
        </div>

        <div className="pt-2">
          <h3 className="text-[13px] font-semibold text-stone-900">Sign-in and security</h3>
          <p className="text-[12px] text-stone-500 mb-3">Changing your email or mobile number needs a code we send to your email.</p>
          <AccountSecurity />
        </div>
      </div>
    </section>
  );
}

// ─── Address Book ───────────────────────────────────────────────────────────

const EMPTY_FORM = {
  full_name: '',
  phone: '',
  address: '',
  floor_unit: '',
  region: '',
  region_code: '',
  province: '',
  district: '',
  ward: '',
  province_code: '',
  city_code: '',
  barangay_code: '',
  label: 'home' as AddressLabel,
};

type AddressFormData = typeof EMPTY_FORM;
const PSGC = 'https://psgc.gitlab.io/api';
const NCR = '130000000';
const byName = (list: PsgcItem[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

/**
 * One address (B2, A30): region, then province (NCR has none), then city, then barangay; each list holds only the
 * places under the one above, and changing a level clears the levels below it. The mobile number is a PH mobile
 * (09XXXXXXXXX or +639XXXXXXXXX).
 */
function AddressForm({ initial, onSave, onCancel, saving, serverErrors }: {
  initial: AddressFormData;
  onSave: (data: AddressFormData) => void;
  onCancel: () => void;
  saving: boolean;
  serverErrors?: Record<string, string>;
}) {
  const [form, setForm] = useState<AddressFormData>({ ...initial, region_code: initial.region_code || (initial.province_code?.startsWith('13') ? NCR : '') });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loading, setLoading] = useState<'province' | 'city' | 'barangay' | null>(null);
  const set = (k: keyof AddressFormData, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const isNcr = form.region_code === NCR;
  const shown = { ...errors, ...(serverErrors ?? {}) };

  const loadCities = (url: string) => {
    setLoading('city');
    return fetch(url).then((r) => r.json()).then((d: PsgcItem[]) => { setCities(byName(d)); return byName(d); }).catch(() => [] as PsgcItem[]).finally(() => setLoading(null));
  };
  const loadBarangays = (cityCode: string) => {
    setLoading('barangay');
    return fetch(`${PSGC}/cities-municipalities/${cityCode}/barangays/`).then((r) => r.json()).then((d: PsgcItem[]) => { setBarangays(byName(d)); return byName(d); }).catch(() => [] as PsgcItem[]).finally(() => setLoading(null));
  };

  // Editing: load the saved region's lists so the saved choices show.
  useEffect(() => {
    const region = form.region_code;
    if (!region) return;
    (async () => {
      if (region === NCR) {
        await loadCities(`${PSGC}/regions/${NCR}/cities-municipalities/`);
      } else {
        setLoading('province');
        const list = await fetch(`${PSGC}/regions/${region}/provinces/`).then((r) => r.json()).then(byName).catch(() => [] as PsgcItem[]);
        setProvinces(list);
        setLoading(null);
        if (form.province_code) await loadCities(`${PSGC}/provinces/${form.province_code}/cities-municipalities/`);
      }
      if (form.city_code) await loadBarangays(form.city_code);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRegion(code: string) {
    setForm((f) => ({ ...f, region_code: code, region: regionName(code), province_code: code === NCR ? NCR : '', province: code === NCR ? 'Metro Manila' : '', city_code: '', district: '', barangay_code: '', ward: '' }));
    setProvinces([]); setCities([]); setBarangays([]);
    if (!code) return;
    if (code === NCR) { void loadCities(`${PSGC}/regions/${NCR}/cities-municipalities/`); return; }
    setLoading('province');
    fetch(`${PSGC}/regions/${code}/provinces/`).then((r) => r.json()).then((d: PsgcItem[]) => setProvinces(byName(d))).catch(() => {}).finally(() => setLoading(null));
  }
  function handleProvince(code: string) {
    setForm((f) => ({ ...f, province_code: code, province: provinces.find((p) => p.code === code)?.name ?? '', city_code: '', district: '', barangay_code: '', ward: '' }));
    setCities([]); setBarangays([]);
    if (code) void loadCities(`${PSGC}/provinces/${code}/cities-municipalities/`);
  }
  function handleCity(code: string) {
    setForm((f) => ({ ...f, city_code: code, district: cities.find((c) => c.code === code)?.name ?? '', barangay_code: '', ward: '' }));
    setBarangays([]);
    if (code) void loadBarangays(code);
  }

  function save() {
    const e: Record<string, string> = {};
    const name = validateName(form.full_name, 'Full name');
    if (name) e.full_name = name;
    const phone = phoneError(form.phone);
    if (phone) e.phone = phone;
    if (!form.address.trim()) e.address = 'Enter the street, house or building.';
    if (!form.region_code) e.region_code = 'Choose the region.';
    if (!isNcr && !form.province_code) e.province_code = 'Choose the province.';
    if (!form.city_code) e.city_code = 'Choose the city or municipality.';
    if (!form.barangay_code) e.barangay_code = 'Choose the barangay.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, ward: barangays.find((b) => b.code === form.barangay_code)?.name ?? form.ward });
  }

  const inputCls = (err?: string) => [
    'min-h-[44px] w-full rounded-lg border px-4 py-2.5 text-sm bg-white text-brand-black placeholder-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent transition-colors duration-150',
    err ? 'border-brand-red' : 'border-gray-300',
  ].join(' ');
  const Err = ({ k }: { k: string }) => (shown[k] ? <p role="alert" className="text-[12px] font-medium text-brand-red">{shown[k]}</p> : null);

  return (
    <div className="space-y-4">
      {shown.address_limit && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">{shown.address_limit}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="addr-name" className="text-xs font-medium text-gray-500 uppercase tracking-wide">Full Name <span className="text-brand-red">*</span></label>
          <input id="addr-name" className={inputCls(shown.full_name)} placeholder="e.g. Maria Santos" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          <Err k="full_name" />
        </div>
        <div className="flex flex-col gap-1">
          <PhoneInput id="addr-phone" label="Mobile number" required value={form.phone} onChange={(v) => set('phone', v)} error={shown.phone} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="addr-street" className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address <span className="text-brand-red">*</span></label>
        <input id="addr-street" maxLength={255} className={inputCls(shown.address)} placeholder="House/Lot No., Street Name" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <Err k="address" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="addr-unit" className="text-xs font-medium text-gray-500 uppercase tracking-wide">Floor / Unit <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
        <input id="addr-unit" maxLength={100} className={inputCls()} placeholder="e.g. Unit 3B, 2nd Floor" value={form.floor_unit ?? ''} onChange={(e) => set('floor_unit', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <CustomSelect label="Region" required value={form.region_code} onChange={handleRegion} error={shown.region_code}
            options={PH_REGIONS.map((r) => ({ value: r.code, label: r.name }))} placeholder="Select region" />
        </div>
        {!isNcr && (
          <div>
            <CustomSelect label="Province" required value={form.province_code} onChange={handleProvince} error={shown.province_code}
              options={provinces.map((p) => ({ value: p.code, label: p.name }))}
              placeholder={loading === 'province' ? 'Loading…' : form.region_code ? 'Select province' : 'Select region first'}
              disabled={!form.region_code || loading === 'province'} />
          </div>
        )}
        <div>
          <CustomSelect label="City / Municipality" required value={form.city_code} onChange={handleCity} error={shown.city_code}
            options={cities.map((c) => ({ value: c.code, label: c.name }))}
            placeholder={loading === 'city' ? 'Loading…' : (isNcr ? form.region_code : form.province_code) ? 'Select city/municipality' : isNcr ? 'Select region first' : 'Select province first'}
            disabled={(isNcr ? !form.region_code : !form.province_code) || loading === 'city'} />
        </div>
        <div>
          <CustomSelect label="Barangay" required value={form.barangay_code} onChange={(v) => { set('barangay_code', v); set('ward', barangays.find((b) => b.code === v)?.name ?? ''); }} error={shown.barangay_code}
            options={barangays.map((b) => ({ value: b.code, label: b.name }))}
            placeholder={loading === 'barangay' ? 'Loading…' : form.city_code ? 'Select barangay' : 'Select city first'}
            disabled={!form.city_code || loading === 'barangay'} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address Label</span>
        <div className="flex gap-2">
          {(['home', 'office'] as AddressLabel[]).map((lbl) => (
            <button key={lbl} type="button" onClick={() => set('label', lbl)} aria-pressed={form.label === lbl}
              className={['flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-150',
                form.label === lbl ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'].join(' ')}>
              {lbl === 'home' ? <Home className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
              {lbl === 'home' ? 'Home' : 'Office'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-40">
          <Check className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Address'}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

function AddressCard({ addr, onEdit, onDelete, onSetDefault, error }: {
  addr: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  error?: string;
}) {
  const needsUpdate = addr.address_needs_update ?? (!addr.barangay_code);
  const [confirming, setConfirming] = useState(false);
  const isHome = addr.label === 'home';
  const LabelIcon = isHome ? Home : Briefcase;

  return (
    <article className={[
      'relative flex flex-col rounded-2xl bg-white border p-4 transition-colors',
      addr.is_default ? 'border-brand-red/50 ring-1 ring-brand-red/25' : needsUpdate ? 'border-amber-300' : 'border-stone-200 hover:border-stone-300',
    ].join(' ')}>
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${addr.is_default ? 'bg-brand-red text-white' : 'bg-stone-100 text-stone-600'}`}>
          <LabelIcon className="w-4 h-4" />
        </span>
        <span className="text-[13px] font-semibold text-stone-900">{isHome ? 'Home' : 'Office'}</span>
        {addr.is_default && <span className="ml-auto text-[11px] font-semibold text-brand-red">Default address</span>}
        {needsUpdate && !addr.is_default && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><AlertTriangle className="w-3 h-3" /> Needs an update</span>}
      </div>
      <div className="mt-3 flex-1">
        <p className="text-[14px] font-semibold text-stone-900">{addr.full_name}</p>
        <p className="text-[13px] text-stone-500">{localPhMobile(addr.phone)}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-700">
          {addr.address}{addr.floor_unit ? `, ${addr.floor_unit}` : ''}<br />
          {[addr.ward, addr.district, addr.province].filter(Boolean).join(', ')}
        </p>
        {needsUpdate && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
            Pick the region, city and barangay again with <span className="font-semibold">Edit</span>, so couriers can route your parcels.
          </p>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1">
        {confirming ? (
          <>
            <span className="text-[12.5px] text-stone-700 mr-auto">Delete this address?</span>
            <button type="button" onClick={() => setConfirming(false)} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-600 hover:bg-stone-100">Keep</button>
            <button type="button" onClick={() => { setConfirming(false); onDelete(); }} className="h-8 px-3 rounded-full bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-semibold">Delete</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-700 hover:bg-stone-100 inline-flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            <button type="button" onClick={() => setConfirming(true)} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-500 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            {!addr.is_default && (
              <button type="button" onClick={onSetDefault} className="ml-auto h-8 px-3 rounded-full border border-stone-300 text-[12.5px] font-semibold text-stone-800 hover:border-stone-900">Set as default</button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

const MAX_ADDRESSES = 10;

function AddressBookPanel() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<AddressFormData>(EMPTY_FORM);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [cardError, setCardError] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    getAddressesApi().then(setAddresses).finally(() => setLoading(false));
  }, []);

  function addrToForm(a: Address): AddressFormData {
    return {
      full_name: a.full_name || a.recipient_name || '',
      phone: localPhMobile(a.phone || a.phone_number || ''),
      address: a.address || a.street_address || '',
      floor_unit: a.floor_unit ?? '',
      region: a.region ?? '',
      region_code: a.region_code ?? '',
      province: a.province || a.province_name || '',
      district: a.district || a.city_name || '',
      ward: a.ward || a.barangay_name || '',
      province_code: a.province_code || '',
      city_code: a.city_code || '',
      barangay_code: a.barangay_code || '',
      label: a.label || 'home',
    };
  }

  const mapErrors = (e: unknown) => {
    const p = apiProblem(e, 'The address could not be saved.');
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.fields)) f[k === 'address' && p.status === 422 && /up to/.test(v) ? 'address_limit' : k] = v;
    if (!Object.keys(f).length) f.address_limit = p.message;
    setServerErrors(f);
  };

  async function handleSaveNew(data: AddressFormData) {
    setSaving(true);
    setServerErrors({});
    try {
      const created = await createAddressApi({ ...data, floor_unit: data.floor_unit || null } as never);
      setAddresses((prev) => [...(created.is_default ? prev.map((a) => ({ ...a, is_default: false })) : prev), created]);
      setShowForm(false);
    } catch (e) { mapErrors(e); } finally { setSaving(false); }
  }

  async function handleSaveEdit(data: AddressFormData) {
    if (editingId === null) return;
    setSaving(true);
    setServerErrors({});
    try {
      const updated = await updateAddressApi(editingId, { ...data, floor_unit: data.floor_unit || null } as never);
      setAddresses((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      setEditingId(null);
    } catch (e) { mapErrors(e); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setCardError(null);
    try {
      await deleteAddressApi(id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setCardError({ id, message: apiErrorMessage(e, 'The address could not be deleted.') });
    }
  }

  async function handleSetDefault(id: number) {
    const updated = await setDefaultAddressApi(id);
    setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : { ...a, is_default: false })));
    setCardError(null);
  }

  const sorted = [...addresses].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));
  const busy = showForm || editingId !== null;
  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <PanelShell
      title="Addresses"
      subtitle={`Where we deliver your parcels. Up to ${MAX_ADDRESSES} addresses; couriers route each one by its barangay.`}
      action={!busy && addresses.length > 0 && (
        <button type="button" onClick={() => { setShowForm(true); setServerErrors({}); }} disabled={full}
          title={full ? `You can save up to ${MAX_ADDRESSES} addresses.` : undefined}
          className="h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> Add address
        </button>
      )}
    >
      {full && !busy && <p className="mb-3 text-[12.5px] text-stone-500 tabular-nums">{addresses.length}/{MAX_ADDRESSES} addresses saved. Delete one to add another.</p>}
      {showForm && (
        <div className="mb-4 rounded-2xl bg-white border border-stone-200 p-5">
          <p className="text-[15px] font-semibold text-stone-900 mb-4">New address</p>
          <AddressForm initial={EMPTY_FORM} onSave={handleSaveNew} onCancel={() => setShowForm(false)} saving={saving} serverErrors={serverErrors} />
        </div>
      )}

      {loading ? <PanelSpinner /> : addresses.length === 0 && !showForm ? (
        <PanelEmpty
          icon={MapPin}
          title="No addresses yet"
          hint="Add where you want your orders delivered. You can keep a home and an office address."
          action={<button type="button" onClick={() => setShowForm(true)} className="mt-4 h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add an address</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {sorted.map((addr) =>
            editingId === addr.id ? (
              <div key={addr.id} className="sm:col-span-2 rounded-2xl bg-white border border-stone-300 p-5">
                <p className="text-[15px] font-semibold text-stone-900 mb-4">Edit address</p>
                <AddressForm initial={editForm} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} saving={saving} serverErrors={serverErrors} />
              </div>
            ) : (
              <AddressCard
                key={addr.id}
                addr={addr}
                error={cardError?.id === addr.id ? cardError.message : undefined}
                onEdit={() => { setEditingId(addr.id); setEditForm(addrToForm(addr)); setShowForm(false); setServerErrors({}); }}
                onDelete={() => handleDelete(addr.id)}
                onSetDefault={() => handleSetDefault(addr.id)}
              />
            ),
          )}
          {!busy && !full && (
            <button type="button" onClick={() => { setShowForm(true); setServerErrors({}); }}
              className="min-h-[180px] rounded-2xl border-2 border-dashed border-stone-300 hover:border-brand-red hover:bg-white text-stone-500 hover:text-brand-red flex flex-col items-center justify-center gap-2 transition-colors">
              <span className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center"><Plus className="w-5 h-5" /></span>
              <span className="text-[13px] font-semibold">Add a new address</span>
            </button>
          )}
        </div>
      )}
    </PanelShell>
  );
}

// ─── My Orders ──────────────────────────────────────────────────────────────

type OrderTabKey = 'all' | BuyerOrderTab;

/** A10: each order is in exactly one tab; the counts come from the server for every order, not one page. */
const ORDER_TABS: { key: OrderTabKey; label: string }[] = [
  { key: 'all',           label: 'All' },
  { key: 'to_pay',        label: 'To pay' },
  { key: 'to_ship',       label: 'To ship' },
  { key: 'to_receive',    label: 'To receive' },
  { key: 'completed',     label: 'Completed' },
  { key: 'cancelled',     label: 'Cancelled' },
  { key: 'return_refund', label: 'Return / refund' },
];

function OrdersPanel({ fixedTab, title = 'Orders', subtitle = 'Everything you bought, from checkout to your door. Each shop ships its own parcel.', emptyHint }: {
  fixedTab?: BuyerOrderTab; title?: string; subtitle?: string; emptyHint?: string;
}) {
  const location = useLocation();
  const fromUrl = new URLSearchParams(location.search).get('tab') as OrderTabKey | null;
  const [tab, setTab] = useState<OrderTabKey>(fixedTab ?? (fromUrl && ORDER_TABS.some((t) => t.key === fromUrl) ? fromUrl : 'all'));
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  // ?q= opens the list searched for one order (the chat's order cards link here).
  const fromQuery = new URLSearchParams(location.search).get('q') ?? '';
  const [search, setSearch] = useState(fromQuery);
  const [query, setQuery] = useState(fromQuery);

  useEffect(() => {
    const t = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setOrders(null);
    getBuyerOrdersPageApi({ tab: tab === 'all' ? undefined : tab, page, search: query || undefined })
      .then((res) => {
        if (!alive) return;
        setOrders(res.data);
        setCounts(res.counts);
        setLastPage(res.meta.last_page);
      })
      .catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, [tab, page, query]);

  const multiShop = useMemo(() => {
    const c: Record<string, number> = {};
    (orders ?? []).forEach((o) => { if (o.checkout_group_id) c[o.checkout_group_id] = (c[o.checkout_group_id] || 0) + 1; });
    return new Set(Object.keys(c).filter((k) => c[k] > 1));
  }, [orders]);

  return (
    <PanelShell
      title={title}
      subtitle={subtitle}
      action={(
        <label className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number or product" aria-label="Search orders"
            className="w-full h-10 pl-10 pr-3 rounded-full bg-stone-100 border border-transparent text-[13px] outline-none focus:bg-white focus:border-stone-300 placeholder:text-stone-400" />
        </label>
      )}
      tabs={fixedTab ? undefined : <PanelTabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} label="Order status" options={ORDER_TABS.map((t) => ({ ...t, count: counts[t.key] }))} />}
      bodyClassName="p-4 sm:p-6 space-y-3"
    >
      {orders === null ? <PanelSpinner /> : orders.length === 0 ? (
        <PanelEmpty
          icon={fixedTab === 'cancelled' ? XCircle : fixedTab === 'return_refund' ? RotateCcw : Package}
          title={query || tab !== 'all' ? 'No orders here' : 'No orders yet'}
          hint={emptyHint ?? (query || tab !== 'all' ? 'Try another tab or search word.' : 'When you check out, your orders show up here with their tracking.')}
          action={!query && tab === 'all' ? <Link to="/" className="mt-4 h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center">Start shopping</Link> : undefined}
        />
      ) : (
        <>
          {orders.map((order) => (
            <BuyerOrderCard key={order.id} order={order} multiShop={Boolean(order.checkout_group_id && multiShop.has(order.checkout_group_id))}
              onUpdated={(updated) => setOrders((prev) => (prev ?? []).map((o) => (o.id === updated.id ? updated : o)))} />
          ))}
          <Pager page={page} lastPage={lastPage} onPage={setPage} />
        </>
      )}
    </PanelShell>
  );
}

// ─── My Vouchers ────────────────────────────────────────────────────────────

/**
 * My Vouchers (B7): the vouchers claimed and still usable, with their rule and end date; Loved-IT's vouchers to
 * collect; and a box to add a code a shop gave out. A voucher used on a cancelled order comes back here (A21).
 */
function VouchersPanel() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'mine' | 'collect'>('mine');
  const [wallet, setWallet] = useState<WalletVoucher[] | null>(null);
  const [collect, setCollect] = useState<WalletVoucher[] | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busy, setBusy] = useState<number | 'code' | null>(null);

  const load = () => {
    getWalletApi().then(setWallet).catch(() => setWallet([]));
    getPlatformVouchersApi().then(setCollect).catch(() => setCollect([]));
  };
  useEffect(load, []);

  const claim = async (by: { voucher_id?: number; code?: string }, key: number | 'code') => {
    setBusy(key);
    setCodeError('');
    try {
      const res = await claimVoucherApi(by);
      showToast(res.message, 'success');
      setCode('');
      load();
    } catch (e) {
      const msg = apiErrorMessage(e, 'The voucher could not be added.');
      if (key === 'code') setCodeError(msg); else showToast(msg, 'error');
    } finally { setBusy(null); }
  };

  const list = tab === 'mine' ? wallet : collect;

  return (
    <PanelShell
      title="My vouchers"
      subtitle="Vouchers you claimed, ready to use at checkout. One shop voucher per shop, one platform and one shipping voucher per order."
      tabs={<PanelTabs value={tab} onChange={setTab} label="Vouchers" options={[
        { key: 'mine', label: 'My vouchers', count: wallet?.length },
        { key: 'collect', label: 'Loved-IT vouchers', count: collect?.filter((v) => !v.claimed).length },
      ]} />}
      bodyClassName="p-4 sm:p-6 space-y-4"
    >
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) claim({ code: code.trim() }, 'code'); }}>
        <label className="sr-only" htmlFor="voucher-code">Voucher code</label>
        <input id="voucher-code" value={code} onChange={(e) => { setCode(e.target.value); setCodeError(''); }} placeholder="Have a code? Enter it here"
          aria-invalid={!!codeError}
          className={`flex-1 min-w-[200px] h-10 px-4 rounded-full border text-[13px] uppercase outline-none focus:border-brand-red ${codeError ? 'border-brand-red' : 'border-stone-300'}`} />
        <button type="submit" disabled={busy === 'code' || !code.trim()} className="h-10 px-5 rounded-full bg-stone-900 text-white text-[13px] font-semibold disabled:opacity-50">Add</button>
        {codeError && <p role="alert" className="w-full text-[12px] font-medium text-brand-red">{codeError}</p>}
      </form>

      {list === null ? <PanelSpinner /> : list.length === 0 ? (
        <PanelEmpty icon={Ticket} title={tab === 'mine' ? 'No vouchers yet' : 'Nothing to collect right now'}
          hint={tab === 'mine' ? 'Claim vouchers on shop and product pages, or add a code above.' : 'Loved-IT vouchers appear here when a promotion is running.'} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((v) => (
            <VoucherTicket key={v.id} voucher={v}
              action={tab === 'mine' ? 'use' : v.used_up_by_you ? 'used' : v.claimed ? 'claimed' : 'claim'}
              busy={busy === v.id}
              onAction={tab === 'mine' ? () => navigate(v.seller?.shop_slug ? `/shop/${v.seller.shop_slug}` : '/search') : () => claim({ voucher_id: v.id }, v.id)} />
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ─── Wishlist & Followed Stores ──────────────────────────────────────────────

const WISHLIST_SORT_OPTIONS = [
  { value: 'recent',     label: 'Recently Added' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const STORE_SORT_OPTIONS = [
  { value: 'recent',        label: 'Recently Followed' },
  { value: 'highest_rated', label: 'Highest Rated' },
];

function fmtPrice(n: number) {
  return '\u20b1' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Pager({ page, lastPage, onPage }: { page: number; lastPage: number; onPage: (p: number) => void }) {
  if (lastPage <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="h-9 px-4 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-700 hover:border-stone-900 disabled:opacity-40">Previous</button>
      <span className="text-[13px] text-stone-500 tabular-nums">{page} / {lastPage}</span>
      <button type="button" onClick={() => onPage(Math.min(lastPage, page + 1))} disabled={page === lastPage} className="h-9 px-4 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-700 hover:border-stone-900 disabled:opacity-40">Next</button>
    </div>
  );
}

function WishlistCard({ item, removing, onRemove }: { item: WishlistItem; removing: boolean; onRemove: () => void }) {
  const p = item.product;
  const { addItem } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const variants = p.variants ?? [];
  const single = variants.length === 1 ? variants[0] : null;
  const availability = p.availability ?? (p.status !== 'active' ? 'unavailable' : p.total_stock === 0 ? 'sold_out' : 'available');
  const outOfStock = availability !== 'available';
  const badge = { unavailable: 'No longer available', sold_out: 'Sold out', on_vacation: 'Shop on vacation', available: '' }[availability];
  const onSale = p.original_price != null && p.original_price > p.base_price;
  const discount = onSale ? Math.round((1 - p.base_price / p.original_price!) * 100) : 0;

  // One variant goes straight into the cart; a product with options opens its page to pick one.
  async function add() {
    if (outOfStock) return;
    if (!single) { navigate(`/products/${p.id}`); return; }
    setAdding(true);
    try {
      await addItem({
        variantId: single.id, productId: p.id, name: p.name,
        variant: single.label && single.label !== 'Default' && single.label !== 'Standard' ? single.label : '',
        price: single.price, image: p.thumbnail_url ?? '', sellerId: p.seller.id, shopName: p.seller.shop_name,
      });
      showToast('Added to cart.');
    } catch {
      showToast('Could not add to cart. Try again.', 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className={`group flex flex-col rounded-2xl bg-white border border-stone-200 overflow-hidden transition-shadow hover:shadow-[0_14px_32px_-18px_rgba(28,25,23,0.35)] ${outOfStock ? 'opacity-70' : ''}`}>
      <div className="relative aspect-square bg-stone-100 overflow-hidden">
        <Link to={`/products/${p.id}`} className="block w-full h-full">
          {p.thumbnail_url
            ? <img src={p.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            : <span className="w-full h-full flex items-center justify-center text-stone-300"><Package className="w-8 h-8" /></span>}
        </Link>
        {onSale && !outOfStock && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-brand-red text-white text-[11px] font-bold">-{discount}%</span>}
        {outOfStock && <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[11px] font-semibold">{badge}</span>}
        <button type="button" onClick={onRemove} disabled={removing} aria-label="Remove from wishlist" title="Remove"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 ring-1 ring-stone-200 flex items-center justify-center text-brand-red hover:bg-white disabled:opacity-50">
          {removing ? <span className="w-3.5 h-3.5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /> : <Heart className="w-4 h-4 fill-brand-red" />}
        </button>
      </div>
      <div className="flex flex-col flex-1 p-3">
        <Link to={`/products/${p.id}`} className="text-[13px] font-medium leading-snug text-stone-900 line-clamp-2 hover:text-brand-red">{p.name}</Link>
        <Link to={p.seller.shop_slug ? `/shop/${p.seller.shop_slug}` : `/products/${p.id}`} className="mt-0.5 text-[11.5px] text-stone-500 truncate hover:text-stone-800">{p.seller.shop_name}</Link>
        <div className="flex items-baseline gap-1.5 mt-auto pt-2">
          <span className="text-[15px] font-bold text-brand-red tabular-nums">{fmtPrice(p.base_price)}</span>
          {onSale && <span className="text-[11.5px] text-stone-400 line-through tabular-nums">{fmtPrice(p.original_price!)}</span>}
        </div>
        <button type="button" onClick={add} disabled={outOfStock || adding}
          className="mt-2 h-9 rounded-full border border-stone-300 text-[12.5px] font-semibold text-stone-800 hover:border-brand-red hover:text-brand-red inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:hover:border-stone-300 disabled:hover:text-stone-800">
          {adding ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : outOfStock ? badge
            : <><ShoppingCart className="w-3.5 h-3.5" /> {single ? 'Add to cart' : 'Choose options'}</>}
        </button>
      </div>
    </article>
  );
}

function WishlistTabContent() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [removing, setRemoving] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    getWishlistApi({ sort, page })
      .then((res) => { setItems(res.data); setLastPage(res.meta.last_page); setTotal(res.meta.total); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [sort, page]);

  async function handleRemove(productId: number, itemId: number) {
    setRemoving((s) => new Set(s).add(itemId));
    try {
      await removeFromWishlistApi(productId);
      setItems((prev) => prev.filter((i) => i.wishlist_item_id !== itemId));
      setTotal((t) => t - 1);
    } finally {
      setRemoving((s) => { const n = new Set(s); n.delete(itemId); return n; });
    }
  }

  if (loading && items.length === 0) return <PanelSpinner />;
  if (!loading && items.length === 0) {
    return (
      <PanelEmpty icon={Heart} title="Nothing saved yet" hint="Tap the heart on any product to keep it here for later."
        action={<Link to="/search" className="mt-4 h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center">Browse products</Link>} />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-stone-500">{total} saved item{total !== 1 ? 's' : ''}</p>
        <div className="w-52"><CustomSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={WISHLIST_SORT_OPTIONS} /></div>
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {items.map((item) => (
          <WishlistCard key={item.wishlist_item_id} item={item} removing={removing.has(item.wishlist_item_id)} onRemove={() => handleRemove(item.product.id, item.wishlist_item_id)} />
        ))}
      </div>
      <Pager page={page} lastPage={lastPage} onPage={setPage} />
    </div>
  );
}

function FollowedStoresTabContent() {
  const [stores, setStores] = useState<FollowedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unfollowing, setUnfollowing] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    getFollowedStoresApi({ sort, page })
      .then((res) => { setStores(res.data); setLastPage(res.meta.last_page); setTotal(res.meta.total); })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, [sort, page]);

  async function handleUnfollow(followId: number, sellerId: number) {
    setUnfollowing((s) => new Set(s).add(followId));
    try {
      await toggleStoreFollowApi(sellerId);
      setStores((prev) => prev.filter((f) => f.follow_id !== followId));
      setTotal((t) => t - 1);
    } finally {
      setUnfollowing((s) => { const n = new Set(s); n.delete(followId); return n; });
    }
  }

  if (loading && stores.length === 0) return <PanelSpinner />;
  if (!loading && stores.length === 0) {
    return (
      <PanelEmpty icon={Store} title="You are not following any shops" hint="Follow a shop from its page to see it here and keep up with what it adds."
        action={<Link to="/search" className="mt-4 h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center">Find shops</Link>} />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-stone-500">{total} shop{total !== 1 ? 's' : ''}</p>
        <div className="w-52"><CustomSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={STORE_SORT_OPTIONS} /></div>
      </div>
      <div className={`grid sm:grid-cols-2 gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {stores.map((f) => {
          const s = f.seller;
          const href = s.shop_slug ? `/shop/${s.shop_slug}` : `/store/${s.id}`;
          const initials = s.shop_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
          return (
            <article key={f.follow_id} className="flex items-center gap-3.5 rounded-2xl bg-white border border-stone-200 p-4 hover:border-stone-300 transition-colors">
              <Link to={href} className="shrink-0">
                {s.logo_url
                  ? <img src={s.logo_url} alt="" className="w-14 h-14 rounded-full object-cover ring-1 ring-stone-200" />
                  : <span className="w-14 h-14 rounded-full bg-[#1E1B18] text-[#FAF8F5] text-[15px] font-bold flex items-center justify-center">{initials}</span>}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={href} className="block text-[14px] font-semibold text-stone-900 truncate hover:text-brand-red">{s.shop_name}</Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-stone-500">
                  {s.avg_rating ? <span className="inline-flex items-center gap-0.5 text-stone-700"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{s.avg_rating.toFixed(1)}</span> : null}
                  <span>{s.product_count} product{s.product_count !== 1 ? 's' : ''}</span>
                  {s.has_sale && <span className="font-semibold text-brand-red">On sale now</span>}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch gap-1.5 shrink-0">
                <Link to={href} className="h-8 px-3 rounded-full bg-stone-900 hover:bg-black text-white text-[12px] font-semibold inline-flex items-center justify-center">Visit</Link>
                <button type="button" onClick={() => handleUnfollow(f.follow_id, s.id)} disabled={unfollowing.has(f.follow_id)}
                  className="h-8 px-3 rounded-full border border-stone-300 text-[12px] font-semibold text-stone-700 hover:border-red-300 hover:text-red-700 disabled:opacity-50">
                  {unfollowing.has(f.follow_id) ? '…' : 'Unfollow'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <Pager page={page} lastPage={lastPage} onPage={setPage} />
    </div>
  );
}

type ActiveWishlistTab = 'wishlist' | 'stores';

function WishlistPanel() {
  const [tab, setTab] = useState<ActiveWishlistTab>('wishlist');
  return (
    <PanelShell
      title="Wishlist & stores"
      subtitle="Products you saved for later and the shops you follow."
      tabs={<PanelTabs value={tab} onChange={setTab} label="Saved" options={[{ key: 'wishlist', label: 'Saved items' }, { key: 'stores', label: 'Followed shops' }]} />}
    >
      {tab === 'wishlist' ? <WishlistTabContent /> : <FollowedStoresTabContent />}
    </PanelShell>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function SettingsLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />
      <AccountBand />

      <div className="flex-1 max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 lg:py-8 flex flex-col lg:flex-row gap-5 lg:gap-10">
        <SettingsNav />
        <main className="flex-1 min-w-0 max-w-5xl">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}

// ─── Sub-page exports ─────────────────────────────────────────────────────────

export function SettingsAccount()       { return <AccountPanel />; }
export function SettingsAddresses()     { return <AddressBookPanel />; }
export function SettingsOrders()        { return <OrdersPanel />; }
export function SettingsReturns() {
  return (
    <OrdersPanel fixedTab="return_refund" title="Returns and refunds"
      subtitle="Return requests, what the shop answered, escalations and refunds."
      emptyHint="Something wrong with an order? Request a return from My Orders within 7 days of delivery." />
  );
}
export function SettingsCancellations() {
  return (
    <OrdersPanel fixedTab="cancelled" title="Cancellations"
      subtitle="Orders cancelled by you, by the shop, or because they were not paid in time."
      emptyHint="You can cancel an order from My Orders until the shop marks it Ready for Pickup." />
  );
}
export function SettingsReviews()       { return <ReviewsPanel />; }
export function SettingsVouchers()      { return <VouchersPanel />; }
export function SettingsWishlist()      { return <WishlistPanel />; }
