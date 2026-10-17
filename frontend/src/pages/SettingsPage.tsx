import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  updateProfileApi,
  getAddressesApi,
  createAddressApi,
  updateAddressApi,
  deleteAddressApi,
  setDefaultAddressApi,
  getOrdersApi,
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
import { fileError, nameError as validateName } from '../utils/accountRules';
import UserAvatar from '../components/ui/UserAvatar';
import AvatarCropModal from '../components/ui/AvatarCropModal';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { uploadAvatarApi, requestBuyerOrderReturnApi } from '../api/client';
import type { Address, AddressLabel, Order, OrderStatus, WishlistItem, FollowedStore } from '../types';
import { getStatusLabel, getStatusBadgeClass, BUYER_FILTER_GROUPS, normalizeOrderStatus } from '../utils/orderStatus';
import OrderStatusTimeline from '../components/orders/OrderStatusTimeline';
import BuyerReceiptConfirm from '../components/orders/BuyerReceiptConfirm';
import ReviewsPanel from '../components/reviews/ReviewsPanel';
import { useState, useEffect, useMemo, useRef } from 'react';
import TrackPackageButton from '../components/tracking/TrackPackageButton';
import {
  User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store,
  ChevronRight, Camera, Pencil, Check, X, Home, Briefcase, Plus,
  Trash2, Search, ShoppingBag, ShoppingCart, MessageSquare, AlertTriangle,
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
  phone: '+63',
  address: '',
  floor_unit: '',
  province: '',
  district: '',
  ward: '',
  province_code: '',
  city_code: '',
  barangay_code: '',
  label: 'home' as AddressLabel,
};

// Internal form uses PSGC codes; initial may contain plain names (from saved addresses)
interface AddressFormInternal {
  full_name: string;
  phone: string;
  address: string;
  floor_unit: string;
  province: string;  // PSGC code while editing
  district: string;  // PSGC code while editing
  ward: string;      // PSGC code while editing
  province_code: string;
  city_code: string;
  barangay_code: string;
  label: AddressLabel;
}

function AddressForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  // Internal state uses PSGC codes for province/district/ward
  const [form, setForm] = useState<AddressFormInternal>({
    ...initial,
    province: initial.province_code || '',
    district: initial.city_code || '',
    ward: initial.barangay_code || '',
    province_code: initial.province_code || '',
    city_code: initial.city_code || '',
    barangay_code: initial.barangay_code || '',
  });
  const set = (k: keyof AddressFormInternal, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // PSGC cascading dropdowns
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBrgy, setLoadingBrgy] = useState(false);

  // Load provinces, then resolve stored plain names or codes for pre-selection
  useEffect(() => {
    fetch('https://psgc.gitlab.io/api/provinces/')
      .then((r) => r.json())
      .then((data: PsgcItem[]) => {
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setProvinces(sorted);

        const targetProvince = initial.province_code || initial.province;
        if (!targetProvince) return;
        // Try to match stored code or name
        const match = sorted.find(
          (p) => p.code === targetProvince || p.name.toLowerCase() === targetProvince.toLowerCase()
        );
        if (!match) return;
        setForm((f) => ({ ...f, province: match.code, province_code: match.code }));

        // Pre-load cities
        setLoadingCities(true);
        fetch(`https://psgc.gitlab.io/api/provinces/${match.code}/cities-municipalities/`)
          .then((r) => r.json())
          .then((cityData: PsgcItem[]) => {
            const sortedCities = [...cityData].sort((a, b) => a.name.localeCompare(b.name));
            setCities(sortedCities);

            const targetCity = initial.city_code || initial.district;
            if (!targetCity) return;
            const cityMatch = sortedCities.find(
              (c) => c.code === targetCity || c.name.toLowerCase() === targetCity.toLowerCase()
            );
            if (!cityMatch) return;
            setForm((f) => ({ ...f, district: cityMatch.code, city_code: cityMatch.code }));

            // Pre-load barangays
            setLoadingBrgy(true);
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityMatch.code}/barangays/`)
              .then((r) => r.json())
              .then((brgyData: PsgcItem[]) => {
                const sortedBrgy = [...brgyData].sort((a, b) => a.name.localeCompare(b.name));
                setBarangays(sortedBrgy);

                const targetWard = initial.barangay_code || initial.ward;
                if (!targetWard) return;
                const brgyMatch = sortedBrgy.find(
                  (b) => b.code === targetWard || b.name.toLowerCase() === targetWard.toLowerCase()
                );
                if (brgyMatch) setForm((f) => ({ ...f, ward: brgyMatch.code, barangay_code: brgyMatch.code }));
              })
              .catch(() => {})
              .finally(() => setLoadingBrgy(false));
          })
          .catch(() => {})
          .finally(() => setLoadingCities(false));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProvince(v: string) {
    setForm((f) => ({
      ...f,
      province: v,
      province_code: v,
      district: '',
      city_code: '',
      ward: '',
      barangay_code: '',
    }));
    setCities([]);
    setBarangays([]);
    if (!v) return;
    setLoadingCities(true);
    fetch(`https://psgc.gitlab.io/api/provinces/${v}/cities-municipalities/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => setCities([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingCities(false));
  }

  function handleCity(v: string) {
    setForm((f) => ({
      ...f,
      district: v,
      city_code: v,
      ward: '',
      barangay_code: '',
    }));
    setBarangays([]);
    if (!v) return;
    setLoadingBrgy(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${v}/barangays/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => setBarangays([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingBrgy(false));
  }

  // Resolve codes → names before saving
  function handleSave() {
    onSave({
      ...form,
      province: provinces.find((p) => p.code === form.province)?.name ?? form.province,
      district: cities.find((c) => c.code === form.district)?.name ?? form.district,
      ward:     barangays.find((b) => b.code === form.ward)?.name ?? form.ward,
      province_code: form.province,
      city_code: form.district,
      barangay_code: form.ward,
    });
  }

  const inputCls = [
    'min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm',
    'bg-white text-brand-black placeholder-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
    'transition-colors duration-150',
  ].join(' ');

  return (
    <div className="space-y-4">
      {/* Full name + phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Full Name <span className="text-brand-red">*</span></label>
          <input
            className={inputCls}
            placeholder="e.g. Maria Santos"
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone Number <span className="text-brand-red">*</span></label>
          <PhoneInput value={form.phone} onChange={(v) => set('phone', v)} />
        </div>
      </div>

      {/* Address */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address <span className="text-brand-red">*</span></label>
        <input
          className={inputCls}
          placeholder="House/Lot No., Street Name"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />
      </div>

      {/* Floor / Unit */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Floor / Unit <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
        <input
          className={inputCls}
          placeholder="e.g. Unit 3B, 2nd Floor"
          value={form.floor_unit ?? ''}
          onChange={(e) => set('floor_unit', e.target.value)}
        />
      </div>

      {/* Province + City + Barangay */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CustomSelect
          label="Province"
          required
          value={form.province}
          onChange={handleProvince}
          options={provinces.map((p) => ({ value: p.code, label: p.name }))}
          placeholder={provinces.length === 0 ? 'Loading…' : 'Select province'}
        />
        <CustomSelect
          label="City / Municipality"
          required
          value={form.district}
          onChange={handleCity}
          options={cities.map((c) => ({ value: c.code, label: c.name }))}
          placeholder={loadingCities ? 'Loading…' : form.province ? 'Select city/municipality' : 'Select province first'}
          disabled={!form.province || loadingCities}
        />
      </div>

      <CustomSelect
        label="Barangay"
        required
        value={form.ward}
        onChange={(v) => set('ward', v)}
        options={barangays.map((b) => ({ value: b.code, label: b.name }))}
        placeholder={loadingBrgy ? 'Loading…' : form.district ? 'Select barangay' : 'Select city first'}
        disabled={!form.district || loadingBrgy}
      />

      {/* Label toggle */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address Label</label>
        <div className="flex gap-2">
          {(['home', 'office'] as AddressLabel[]).map((lbl) => (
            <button
              key={lbl}
              type="button"
              onClick={() => set('label', lbl)}
              className={[
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-150',
                form.label === lbl
                  ? 'border-brand-red bg-red-50 text-brand-red'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
              ].join(' ')}
            >
              {lbl === 'home' ? <Home className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
              {lbl === 'home' ? 'Home' : 'Office'}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving || !form.full_name || !form.address || !form.province || !form.district || !form.ward}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors disabled:opacity-40"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Address'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

function AddressCard({
  addr,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  addr: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
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
        <p className="text-[13px] text-stone-500">{addr.phone}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-700">
          {addr.address}{addr.floor_unit ? `, ${addr.floor_unit}` : ''}<br />
          {[addr.ward, addr.district, addr.province].filter(Boolean).join(', ')}
        </p>
        {needsUpdate && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
            Pick the province, city and barangay again with <span className="font-semibold">Edit</span>, so couriers can route your parcels.
          </p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1">
        {confirming ? (
          <>
            <span className="text-[12.5px] text-stone-700 mr-auto">Delete this address?</span>
            <button type="button" onClick={() => setConfirming(false)} className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-600 hover:bg-stone-100">Keep</button>
            <button type="button" onClick={onDelete} className="h-8 px-3 rounded-full bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-semibold">Delete</button>
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

function AddressBookPanel() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  useEffect(() => {
    getAddressesApi().then(setAddresses).finally(() => setLoading(false));
  }, []);

  function addrToForm(a: Address): typeof EMPTY_FORM {
    return {
      full_name: a.full_name || a.recipient_name || '',
      phone: a.phone || a.phone_number || '',
      address: a.address || a.street_address || '',
      floor_unit: a.floor_unit ?? '',
      province: a.province || a.province_name || '',
      district: a.district || a.city_name || '',
      ward: a.ward || a.barangay_name || '',
      province_code: a.province_code || '',
      city_code: a.city_code || '',
      barangay_code: a.barangay_code || '',
      label: a.label || 'home',
    };
  }

  async function handleSaveNew(data: typeof EMPTY_FORM) {
    setSaving(true);
    try {
      const created = await createAddressApi({ ...data, floor_unit: data.floor_unit || null } as never);
      setAddresses((prev) => [...prev, created]);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(data: typeof EMPTY_FORM) {
    if (editingId === null) return;
    setSaving(true);
    try {
      const updated = await updateAddressApi(editingId, { ...data, floor_unit: data.floor_unit || null } as never);
      setAddresses((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteAddressApi(id);
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSetDefault(id: number) {
    const updated = await setDefaultAddressApi(id);
    setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : { ...a, is_default: false })));
  }

  // The default address first, then the rest as they were added.
  const sorted = [...addresses].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));
  const busy = showForm || editingId !== null;

  return (
    <PanelShell
      title="Addresses"
      subtitle="Where we deliver your parcels. Couriers route each one by its barangay."
      action={!busy && addresses.length > 0 && (
        <button type="button" onClick={() => setShowForm(true)} className="h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors">
          <Plus className="w-4 h-4" /> Add address
        </button>
      )}
    >
      {showForm && (
        <div className="mb-4 rounded-2xl bg-white border border-stone-200 p-5">
          <p className="text-[15px] font-semibold text-stone-900 mb-4">New address</p>
          <AddressForm initial={EMPTY_FORM} onSave={handleSaveNew} onCancel={() => setShowForm(false)} saving={saving} />
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
                <AddressForm initial={editForm} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} saving={saving} />
              </div>
            ) : (
              <AddressCard
                key={addr.id}
                addr={addr}
                onEdit={() => { setEditingId(addr.id); setEditForm(addrToForm(addr)); setShowForm(false); }}
                onDelete={() => handleDelete(addr.id)}
                onSetDefault={() => handleSetDefault(addr.id)}
              />
            ),
          )}
          {!busy && (
            <button type="button" onClick={() => setShowForm(true)}
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

type OrderFilter = 'all' | 'to_pay' | 'to_ship' | 'to_receive' | 'to_review' | 'returns_cancelled';

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all',               label: 'All' },
  { key: 'to_pay',            label: 'To pay' },
  { key: 'to_ship',           label: 'To ship' },
  { key: 'to_receive',        label: 'To receive' },
  { key: 'to_review',         label: 'To review' },
  { key: 'returns_cancelled', label: 'Returns & cancelled' },
];

const FILTER_STATUSES: Record<OrderFilter, OrderStatus[]> = {
  all:               [],
  to_pay:            BUYER_FILTER_GROUPS.to_pay,
  to_ship:           BUYER_FILTER_GROUPS.to_ship,
  to_receive:        BUYER_FILTER_GROUPS.to_receive,
  to_review:         BUYER_FILTER_GROUPS.to_review,
  returns_cancelled: BUYER_FILTER_GROUPS.returns,
};

const RETURN_REASONS = [
  { value: 'Defective / Damaged', label: 'Defective or damaged item' },
  { value: 'Wrong Item Received', label: 'Wrong item received' },
  { value: 'Item Not as Described', label: 'Item not as described' },
  { value: 'Missing Parts / Accessories', label: 'Missing parts or accessories' },
  { value: 'Change of Mind', label: 'Change of mind (if the shop allows it)' },
];

function orderDay(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function OrderCard({ order, onUpdated, isPartOfMultiShopCheckout }: { order: Order; onUpdated?: (updated: Order) => void; isPartOfMultiShopCheckout?: boolean }) {
  const normStatus = normalizeOrderStatus(order.status);
  const badgeCls = getStatusBadgeClass(normStatus);
  const statusLabel = getStatusLabel(normStatus);
  const shopName = order.items[0]?.shop_name;
  const shown = order.items.slice(0, 2);
  const extraCount = order.items.length - shown.length;

  const [showTimeline, setShowTimeline] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('Defective / Damaged');
  const [returnDesc, setReturnDesc] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');

  const isGcashPending = order.payment_method === 'gcash' && order.payment_status === 'pending_verification';
  const isFailed = order.payment_status === 'verification_failed';
  const trackable = order.tracking_number && ['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'DELIVERY_FAILED'].includes(String(order.status));

  const handleRequestReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnDesc.trim()) return;
    setSubmittingReturn(true);
    setReturnError('');
    try {
      const res = await requestBuyerOrderReturnApi(order.id, { reason: returnReason, description: returnDesc.trim() });
      setShowReturnModal(false);
      onUpdated?.(res.data);
    } catch (err: any) {
      setReturnError(err.response?.data?.message || 'The return request was not sent. Try again.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  return (
    <article className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
      {/* Shop, order number and where it stands */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-b border-stone-100">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-900 min-w-0">
          <Store className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="truncate max-w-[220px]">{shopName ?? 'Shop'}</span>
        </span>
        <span className="text-[12px] text-stone-400">
          <span className="font-mono">#{order.order_number}</span> · {orderDay(order.created_at)}
        </span>
        <span className="ml-auto">
          {isGcashPending ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-amber-50 text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Shop is checking your GCash</span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-red-50 text-red-700"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Payment not received</span>
          ) : (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${badgeCls}`}>{statusLabel}</span>
          )}
        </span>
      </header>

      {/* What was ordered */}
      <ul className="px-4 divide-y divide-stone-100">
        {shown.map((item) => {
          const inner = (
            <>
              <span className="w-16 h-16 rounded-xl bg-stone-100 overflow-hidden shrink-0 ring-1 ring-stone-200">
                {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-stone-300"><ShoppingBag className="w-5 h-5" /></span>}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium text-stone-900 leading-snug line-clamp-2">{item.product_name}</span>
                <span className="block mt-0.5 text-[12px] text-stone-500">{[item.variant_label, `× ${item.quantity}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">₱{Number(item.subtotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.product_id
                ? <Link to={`/products/${item.product_id}`} className="flex items-center gap-3 py-3 group hover:[&_span.line-clamp-2]:text-brand-red">{inner}</Link>
                : <div className="flex items-center gap-3 py-3">{inner}</div>}
            </li>
          );
        })}
        {extraCount > 0 && <li className="py-2.5 text-[12.5px] text-stone-500">and {extraCount} more item{extraCount > 1 ? 's' : ''}</li>}
      </ul>

      {/* Notices */}
      {(isFailed && order.rejection_reason) || isPartOfMultiShopCheckout || normStatus === 'DISPUTED' ? (
        <div className="px-4 pb-3 space-y-2">
          {isFailed && order.rejection_reason && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-800"><span className="font-semibold">From the shop: </span>{order.rejection_reason}</p>
          )}
          {normStatus === 'DISPUTED' && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Your return request is being reviewed. We will message you with the decision.</p>
          )}
          {isPartOfMultiShopCheckout && (
            <p className="text-[12px] text-stone-500">Part of a checkout with several shops; each shop ships its own parcel.</p>
          )}
        </div>
      ) : null}

      {/* Feature 2.8: delivered orders wait for the buyer to confirm receipt */}
      {normStatus === 'DELIVERED' && <div className="px-4 pb-3"><BuyerReceiptConfirm order={order} onUpdated={onUpdated} /></div>}

      {/* Total, payment and actions */}
      <footer className="px-4 py-3 bg-stone-50/70 border-t border-stone-100 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 text-[12px] text-stone-500">
          <span className="font-semibold text-stone-700">{order.payment_method === 'gcash' ? 'GCash' : 'Cash on delivery'}</span>
          {order.payment_method === 'gcash' && order.payment_reference && <> · ref <span className="font-mono">{order.payment_reference}</span></>}
          {order.tracking_number && <> · tracking <span className="font-mono">{order.tracking_number}</span></>}
        </div>
        <div className="ml-auto text-right">
          <span className="text-[12px] text-stone-500 mr-1.5">Order total</span>
          <span className="text-[16px] font-bold text-stone-900 tabular-nums">₱{Number(order.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="w-full flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setShowTimeline((v) => !v)} aria-expanded={showTimeline}
            className="h-8 px-3 rounded-full text-[12.5px] font-semibold text-stone-600 hover:bg-white hover:text-stone-900">
            {showTimeline ? 'Hide history' : 'Order history'}
          </button>
          {trackable && <TrackPackageButton trackingNumber={order.tracking_number!} />}
          {normStatus === 'DELIVERED' && (
            <button type="button" onClick={() => setShowReturnModal(true)} className="h-8 px-3.5 rounded-full border border-stone-300 bg-white text-[12.5px] font-semibold text-stone-800 hover:border-stone-900">
              Return or refund
            </button>
          )}
          {(normStatus === 'DELIVERED' || normStatus === 'COMPLETED') && (
            <Link to={`/settings/reviews?order=${order.id}`} className="h-8 px-3.5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5" /> Rate items
            </Link>
          )}
        </div>
      </footer>

      {showTimeline && (
        <div className="px-4 py-4 border-t border-stone-100">
          <OrderStatusTimeline history={order.status_history} currentStatus={order.status} />
        </div>
      )}

      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Request a return">
          <div className="absolute inset-0 bg-stone-950/45" onClick={() => !submittingReturn && setShowReturnModal(false)} />
          <form onSubmit={handleRequestReturn} className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Order <span className="font-mono normal-case">#{order.order_number}</span></p>
                <h3 className="text-[16px] font-semibold text-stone-900">Request a return or refund</h3>
              </div>
              <button type="button" onClick={() => setShowReturnModal(false)} aria-label="Close" className="w-9 h-9 rounded-full text-stone-500 hover:bg-stone-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-stone-800 mb-2">What went wrong?</p>
                <div className="space-y-1.5">
                  {RETURN_REASONS.map((r) => (
                    <label key={r.value} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer text-[13px] transition-colors ${returnReason === r.value ? 'border-brand-red bg-rose-50/40 text-stone-900' : 'border-stone-200 text-stone-700 hover:border-stone-400'}`}>
                      <input type="radio" name={`reason-${order.id}`} value={r.value} checked={returnReason === r.value} onChange={() => setReturnReason(r.value)} className="accent-brand-red" />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor={`return-desc-${order.id}`} className="text-[13px] font-semibold text-stone-800">Tell us more</label>
                <textarea id={`return-desc-${order.id}`} rows={3} value={returnDesc} onChange={(e) => setReturnDesc(e.target.value)}
                  placeholder="What is wrong with the item? This helps the shop and our team decide quickly."
                  className="mt-1.5 w-full px-3.5 py-2.5 text-[13px] rounded-xl border border-stone-300 outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none" />
              </div>
              {returnError && <p role="alert" className="text-[12.5px] text-brand-red">{returnError}</p>}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button type="button" onClick={() => setShowReturnModal(false)} className="flex-1 h-11 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-700 hover:border-stone-900">Cancel</button>
              <button type="submit" disabled={submittingReturn || !returnDesc.trim()} className="flex-1 h-11 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-40">
                {submittingReturn ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getOrdersApi()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = {} as Record<OrderFilter, number>;
    for (const f of ORDER_FILTERS) {
      const statuses = FILTER_STATUSES[f.key];
      c[f.key] = statuses.length ? orders.filter((o) => statuses.includes(normalizeOrderStatus(o.status))).length : orders.length;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let result = orders;
    const statuses = FILTER_STATUSES[filter];
    if (statuses.length) result = result.filter((o) => statuses.includes(normalizeOrderStatus(o.status)));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => o.order_number.toLowerCase().includes(q) || o.items.some((i) => i.product_name.toLowerCase().includes(q) || (i.shop_name ?? '').toLowerCase().includes(q)));
    }
    return result;
  }, [orders, filter, search]);

  const multiCheckoutGroupIds = useMemo(() => {
    const groupCounts: Record<string, number> = {};
    orders.forEach((o) => { if (o.checkout_group_id) groupCounts[o.checkout_group_id] = (groupCounts[o.checkout_group_id] || 0) + 1; });
    return new Set(Object.keys(groupCounts).filter((id) => groupCounts[id] > 1));
  }, [orders]);

  return (
    <PanelShell
      title="Orders"
      subtitle="Everything you bought, from checkout to your door. Each shop ships its own parcel."
      action={(
        <label className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, product or shop" aria-label="Search orders"
            className="w-full h-10 pl-10 pr-3 rounded-full bg-stone-100 border border-transparent text-[13px] outline-none focus:bg-white focus:border-stone-300 placeholder:text-stone-400" />
        </label>
      )}
      tabs={<PanelTabs value={filter} onChange={setFilter} label="Order status" options={ORDER_FILTERS.map((f) => ({ ...f, count: f.key === 'all' ? undefined : counts[f.key] }))} />}
      bodyClassName="p-4 sm:p-6 space-y-3"
    >
      {loading ? <PanelSpinner /> : filtered.length === 0 ? (
        <PanelEmpty
          icon={Package}
          title={search || filter !== 'all' ? 'No orders here' : 'No orders yet'}
          hint={search || filter !== 'all' ? 'Try another filter or search word.' : 'When you check out, your orders show up here with their tracking.'}
          action={!search && filter === 'all' ? <Link to="/" className="mt-4 h-10 px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center">Start shopping</Link> : undefined}
        />
      ) : (
        filtered.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isPartOfMultiShopCheckout={Boolean(order.checkout_group_id && multiCheckoutGroupIds.has(order.checkout_group_id))}
            onUpdated={(updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))}
          />
        ))
      )}
    </PanelShell>
  );
}

// ─── Returns and cancellations ───────────────────────────────────────────────

/** The buyer's orders in some statuses (returns or cancellations), with the same order cards as My Orders. */
function StatusOrdersPanel({ title, subtitle, statuses, emptyTitle, emptyHint, icon: Icon }: {
  title: string; subtitle: string; statuses: OrderStatus[]; emptyTitle: string; emptyHint: string; icon: React.ElementType;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let alive = true;
    getOrdersApi().then((list) => { if (alive) setOrders(list); }).catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, []);

  const mine = (orders ?? []).filter((o) => statuses.includes(normalizeOrderStatus(o.status)));

  return (
    <PanelShell title={title} subtitle={subtitle} bodyClassName="p-4 sm:p-6 space-y-3">
      {orders === null ? <PanelSpinner /> : mine.length === 0 ? (
        <PanelEmpty
          icon={Icon}
          title={emptyTitle}
          hint={emptyHint}
          action={<Link to="/settings/orders" className="mt-4 h-9 px-4 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-800 hover:border-stone-900 flex items-center">Go to my orders</Link>}
        />
      ) : (
        mine.map((order) => (
          <OrderCard key={order.id} order={order} onUpdated={(updated) => setOrders((prev) => (prev ?? []).map((o) => (o.id === updated.id ? updated : o)))} />
        ))
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
  const outOfStock = p.status !== 'active' || p.total_stock === 0;
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
        {outOfStock && <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[11px] font-semibold">{p.status !== 'active' ? 'Unavailable' : 'Sold out'}</span>}
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
          {adding ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><ShoppingCart className="w-3.5 h-3.5" /> {single ? 'Add to cart' : 'Choose options'}</>}
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
    <StatusOrdersPanel
      icon={RotateCcw}
      title="Returns"
      subtitle="Orders you asked to return or disputed, failed deliveries, and parcels sent back to the shop."
      statuses={['DISPUTED', 'RETURNED', 'DELIVERY_FAILED']}
      emptyTitle="No returns"
      emptyHint="Something wrong with an order? Request a return from My Orders within 7 days of delivery."
    />
  );
}
export function SettingsCancellations() {
  return (
    <StatusOrdersPanel
      icon={XCircle}
      title="Cancellations"
      subtitle="Orders that were cancelled by you or by the shop."
      statuses={['CANCELLED']}
      emptyTitle="No cancelled orders"
      emptyHint="You can cancel an order from My Orders before the shop packs it."
    />
  );
}
export function SettingsReviews()       { return <ReviewsPanel />; }
export function SettingsWishlist()      { return <WishlistPanel />; }
