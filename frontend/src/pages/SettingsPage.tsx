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
  addToCartApi,
} from '../api/client';
import CustomSelect from '../components/ui/CustomSelect';
import PhoneInput from '../components/ui/PhoneInput';
import UserAvatar from '../components/ui/UserAvatar';
import AvatarCropModal from '../components/ui/AvatarCropModal';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { uploadAvatarApi, requestBuyerOrderReturnApi } from '../api/client';
import type { Address, AddressLabel, Order, OrderStatus, WishlistItem, FollowedStore } from '../types';
import { getStatusLabel, getStatusBadgeClass, BUYER_FILTER_GROUPS, normalizeOrderStatus } from '../utils/orderStatus';
import OrderStatusTimeline from '../components/orders/OrderStatusTimeline';
import BuyerReceiptConfirm from '../components/orders/BuyerReceiptConfirm';
import { useState, useEffect, useMemo, useRef } from 'react';
import TrackPackageButton from '../components/tracking/TrackPackageButton';
import {
  User, MapPin, Package, RotateCcw, XCircle, Star, Heart, Store,
  ChevronRight, Camera, Pencil, Check, X, Home, Briefcase, Plus,
  Trash2, Search, ShoppingBag, ShoppingCart, MessageSquare, AlertTriangle,
} from 'lucide-react';

const StarIcon = Star;

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

// ─── Manage Account panel ────────────────────────────────────────────────────

function AccountPanel() {
  const { user, setUser } = useAuth();

  // Avatar state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatarApi(blob);
      setUser(updated);
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

  // Phone edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

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
    if (!firstName.trim() || !lastName.trim()) { setNameError('First and last name are required.'); return; }
    setNameError('');
    setSavingName(true);
    try {
      const updated = await updateProfileApi({ first_name: firstName.trim(), middle_name: middleName.trim() || undefined, last_name: lastName.trim() });
      setUser(updated);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  async function savePhone() {
    setPhoneError('');
    setSavingPhone(true);
    try {
      const updated = await updateProfileApi({ phone });
      setUser(updated);
      setEditingPhone(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { errors?: { phone?: string[] } } } })
        ?.response?.data?.errors?.phone?.[0] ?? 'Failed to update phone.';
      setPhoneError(msg);
    } finally {
      setSavingPhone(false);
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
            <p className="text-[12px] text-stone-500 mt-0.5">JPG or PNG. You can crop it before saving.</p>
          </div>
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}
            className="h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 disabled:opacity-50 transition-colors shrink-0">
            {uploadingAvatar ? 'Uploading…' : user?.avatar_url ? 'Change' : 'Upload'}
          </button>
        </div>

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

          <InfoRow
            label="Phone number"
            display={user?.phone ?? ''}
            editing={editingPhone}
            onEdit={() => { setPhone(user?.phone ?? ''); setEditingPhone(true); }}
            onCancel={() => { setEditingPhone(false); setPhoneError(''); }}
            onSave={savePhone}
            saving={savingPhone}
          >
            <PhoneInput value={phone} onChange={setPhone} error={phoneError} />
          </InfoRow>

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-400">Email</p>
            <p className="mt-1.5 text-[15px] font-medium text-stone-900 break-all">{user?.email}</p>
            <p className="mt-1 text-[12px] text-stone-500">Used to sign in and for order updates.</p>
          </div>

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

  return (
    <div className={[
      'relative rounded-2xl border-2 p-5 transition-all',
      addr.is_default
        ? 'border-brand-red bg-red-50/40'
        : needsUpdate
        ? 'border-amber-200 bg-amber-50/20'
        : 'border-gray-100 bg-white',
    ].join(' ')}>
      {addr.is_default && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-brand-red bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
          <StarIcon className="w-2.5 h-2.5" /> Default
        </span>
      )}

      <div className="flex items-center gap-2 mb-2">
        <span className={[
          'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
          addr.label === 'home' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600',
        ].join(' ')}>
          {addr.label === 'home' ? <Home className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
          {addr.label === 'home' ? 'Home' : 'Office'}
        </span>
        {needsUpdate && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
            <AlertTriangle className="w-2.5 h-2.5" /> Needs Update
          </span>
        )}
      </div>

      {needsUpdate && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold">Standard area codes missing</p>
            <p className="text-amber-700 mt-0.5">
              Please click <strong>Edit</strong> to re-select your province, city, and barangay with standard PSGC codes so riders and hubs can deliver to you.
            </p>
          </div>
        </div>
      )}

      <p className="font-semibold text-brand-black text-sm">{addr.full_name}</p>
      <p className="text-sm text-gray-500 mt-0.5">{addr.phone}</p>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed">
        {addr.address}{addr.floor_unit ? `, ${addr.floor_unit}` : ''}<br />
        {addr.ward}, {addr.district}, {addr.province}
      </p>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
        {!addr.is_default && (
          <button
            onClick={onSetDefault}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-brand-red hover:text-brand-red-dark transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Set as Default
          </button>
        )}
      </div>
    </div>
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
    setAddresses((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : { ...a, is_default: false }))
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-brand-black text-lg">Address Book</h2>
          <p className="text-xs text-gray-400 mt-0.5">Manage your delivery addresses</p>
        </div>
        {!showForm && editingId === null && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Add New
          </button>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Add new form */}
        {showForm && (
          <div className="rounded-2xl border-2 border-dashed border-brand-red/30 bg-red-50/20 p-5">
            <p className="text-sm font-semibold text-brand-black mb-4">New Address</p>
            <AddressForm
              initial={EMPTY_FORM}
              onSave={handleSaveNew}
              onCancel={() => setShowForm(false)}
              saving={saving}
            />
          </div>
        )}

        {loading && (
          <div className="py-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && addresses.length === 0 && !showForm && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-gray-300" />
            </div>
            <p className="font-semibold text-brand-black">No addresses yet</p>
            <p className="text-sm text-gray-400">Add a delivery address to get started.</p>
          </div>
        )}

        {/* Address cards */}
        {addresses.map((addr) =>
          editingId === addr.id ? (
            <div key={addr.id} className="rounded-2xl border-2 border-brand-red/30 bg-red-50/20 p-5">
              <p className="text-sm font-semibold text-brand-black mb-4">Edit Address</p>
              <AddressForm
                initial={editForm}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                saving={saving}
              />
            </div>
          ) : (
            <AddressCard
              key={addr.id}
              addr={addr}
              onEdit={() => { setEditingId(addr.id); setEditForm(addrToForm(addr)); setShowForm(false); }}
              onDelete={() => handleDelete(addr.id)}
              onSetDefault={() => handleSetDefault(addr.id)}
            />
          )
        )}
      </div>
    </div>
  );
}

// ─── My Orders ──────────────────────────────────────────────────────────────

type OrderFilter = 'all' | 'to_pay' | 'to_ship' | 'to_receive' | 'to_review' | 'returns_cancelled';

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all',               label: 'All' },
  { key: 'to_pay',            label: 'To Pay' },
  { key: 'to_ship',           label: 'To Ship' },
  { key: 'to_receive',        label: 'To Receive' },
  { key: 'to_review',         label: 'To Review' },
  { key: 'returns_cancelled', label: 'Returns & Cancelled' },
];

const FILTER_STATUSES: Record<OrderFilter, OrderStatus[]> = {
  all:               [],
  to_pay:            BUYER_FILTER_GROUPS.to_pay,
  to_ship:           BUYER_FILTER_GROUPS.to_ship,
  to_receive:        BUYER_FILTER_GROUPS.to_receive,
  to_review:         BUYER_FILTER_GROUPS.to_review,
  returns_cancelled: BUYER_FILTER_GROUPS.returns,
};

function OrderCard({ order, onUpdated, isPartOfMultiShopCheckout }: { order: Order; onUpdated?: (updated: Order) => void; isPartOfMultiShopCheckout?: boolean }) {
  const normStatus = normalizeOrderStatus(order.status);
  const badgeCls = getStatusBadgeClass(normStatus);
  const statusLabel = getStatusLabel(normStatus);
  const firstItem = order.items[0];
  const extraCount = order.items.length - 1;

  const [showTimeline, setShowTimeline] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('Defective / Damaged');
  const [returnDesc, setReturnDesc] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const isGcashPending = order.payment_method === 'gcash' && order.payment_status === 'pending_verification';
  const isFailed = order.payment_status === 'verification_failed';

  const handleRequestReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnDesc.trim()) return;
    setSubmittingReturn(true);
    try {
      const res = await requestBuyerOrderReturnApi(order.id, {
        reason: returnReason,
        description: returnDesc.trim(),
      });
      setShowReturnModal(false);
      if (onUpdated) {
        onUpdated(res.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to submit return request.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-brand-black tracking-wide">{order.order_number}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">
            {order.created_at ? new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          </span>
          {order.tracking_number && (
            <span className="text-[10px] font-mono font-medium text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
              Track: {order.tracking_number}
            </span>
          )}
          {order.tracking_number && ['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'DELIVERY_FAILED'].includes(String(order.status)) && (
            <TrackPackageButton trackingNumber={order.tracking_number} />
          )}
          {isPartOfMultiShopCheckout && (
            <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              Part of a multi-shop checkout
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isGcashPending && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
              Verifying GCash
            </span>
          )}
          {isFailed && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
              Payment Not Received
            </span>
          )}
          {!isGcashPending && !isFailed && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeCls}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {firstItem && (
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
            {firstItem.image_url
              ? <img src={firstItem.image_url} alt={firstItem.product_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-gray-300" /></div>
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-black truncate">{firstItem.product_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {firstItem.variant_label ? `${firstItem.variant_label} · ` : ''}x{firstItem.quantity}
            </p>
            {extraCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">+{extraCount} more item{extraCount > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
      )}

      {isFailed && order.rejection_reason && (
        <div className="p-2.5 bg-red-50 rounded-xl border border-red-100 text-xs text-red-700">
          <span className="font-semibold">Seller note: </span>{order.rejection_reason}
        </div>
      )}

      {/* Feature 2.8: delivered orders wait for the buyer to confirm receipt */}
      {normStatus === 'DELIVERED' && <BuyerReceiptConfirm order={order} onUpdated={onUpdated} />}

      {/* Action / Timeline buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-50 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTimeline(!showTimeline)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showTimeline ? 'Hide Tracking Timeline ▲' : 'View Tracking Timeline ▼'}
          </button>

          {normStatus === 'DELIVERED' && (
            <button
              type="button"
              onClick={() => setShowReturnModal(true)}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
            >
              Request Return / Refund
            </button>
          )}

          {normStatus === 'DISPUTED' && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Return Request Under Review
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {order.payment_method === 'gcash' ? (
              <span>GCash {order.payment_reference ? `(Ref: ${order.payment_reference})` : ''}</span>
            ) : (
              'Cash on Delivery'
            )}
          </span>
          <span className="text-sm font-bold text-brand-black">
            ₱{Number(order.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Timeline Expansion */}
      {showTimeline && (
        <div className="pt-3 border-t border-gray-100 animate-in fade-in">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Order Tracking History</p>
          <OrderStatusTimeline history={order.status_history} currentStatus={order.status} />
        </div>
      )}

      {/* Return Request Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-gray-900">Request Return for #{order.order_number}</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleRequestReturn} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Return Reason</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                >
                  <option value="Defective / Damaged">Defective / Damaged Item</option>
                  <option value="Wrong Item Received">Wrong Item Received</option>
                  <option value="Item Not as Described">Item Not as Described</option>
                  <option value="Missing Parts / Accessories">Missing Parts / Accessories</option>
                  <option value="Change of Mind">Change of Mind (Subject to Seller Policy)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Detailed Explanation</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why you wish to return this item..."
                  value={returnDesc}
                  onChange={(e) => setReturnDesc(e.target.value)}
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn || !returnDesc.trim()}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-brand-red hover:bg-red-700 rounded-xl disabled:opacity-50"
                >
                  {submittingReturn ? 'Submitting…' : 'Submit Return Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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

  const filtered = useMemo(() => {
    let result = orders;
    const statuses = FILTER_STATUSES[filter];
    if (statuses.length) result = result.filter((o) => statuses.includes(normalizeOrderStatus(o.status)));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.items.some((i) => i.product_name.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [orders, filter, search]);

  const multiCheckoutGroupIds = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.checkout_group_id) {
        counts[o.checkout_group_id] = (counts[o.checkout_group_id] || 0) + 1;
      }
    });
    return new Set(Object.keys(counts).filter((id) => counts[id] > 1));
  }, [orders]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="font-bold text-brand-black text-lg">My Orders</h2>
        <p className="text-xs text-gray-400 mt-0.5">Track and manage your purchases</p>
      </div>

      {/* Search */}
      <div className="px-6 pt-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by order number or product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={[
              'w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm',
              'bg-gray-50 text-brand-black placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent focus:bg-white',
              'transition-all duration-150',
            ].join(' ')}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-6 pt-4 pb-1">
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
          {ORDER_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={[
                'flex-1 py-2 px-1 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap',
                filter === key
                  ? 'bg-white text-brand-red shadow-sm'
                  : 'text-gray-500 hover:text-brand-black',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="px-6 py-5 space-y-3">
        {loading && (
          <div className="py-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-14 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
              <Package className="w-6 h-6 text-gray-300" />
            </div>
            <p className="font-semibold text-brand-black">
              {search || filter !== 'all' ? 'No orders match your search' : 'No orders yet'}
            </p>
            <p className="text-sm text-gray-400">
              {search || filter !== 'all' ? 'Try a different keyword or filter.' : 'Your purchases will appear here.'}
            </p>
          </div>
        )}

        {!loading && filtered.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isPartOfMultiShopCheckout={Boolean(order.checkout_group_id && multiCheckoutGroupIds.has(order.checkout_group_id))}
            onUpdated={(updated) => setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))}
          />
        ))}
      </div>
    </div>
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
    <section className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
      <header className="px-6 pt-6 pb-5 border-b border-stone-200">
        <h2 className="text-xl font-serif font-bold tracking-tight text-[#1E1B18]">{title}</h2>
        <p className="mt-1 text-[13px] text-stone-500">{subtitle}</p>
      </header>
      <div className="p-6 space-y-3">
        {orders === null ? (
          <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>
        ) : mine.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center"><Icon className="w-6 h-6" /></span>
            <p className="mt-3 font-semibold text-stone-900">{emptyTitle}</p>
            <p className="mt-1 text-[13px] text-stone-500 max-w-sm">{emptyHint}</p>
            <Link to="/settings/orders" className="mt-4 h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 flex items-center">Go to my orders</Link>
          </div>
        ) : (
          mine.map((order) => (
            <OrderCard key={order.id} order={order} onUpdated={(updated) => setOrders((prev) => (prev ?? []).map((o) => (o.id === updated.id ? updated : o)))} />
          ))
        )}
      </div>
    </section>
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

function WishlistTabContent() {
  const navigate = useNavigate();
  const [items, setItems]       = useState<WishlistItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sort, setSort]         = useState('recent');
  const [page, setPage]         = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal]       = useState(0);
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const [addingCart, setAddingCart] = useState<Set<number>>(new Set());
  const [toast, setToast]       = useState('');

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

  async function handleAddToCart(productId: number) {
    setAddingCart((s) => new Set(s).add(productId));
    try {
      await addToCartApi(productId, 1);
      setToast('Added to cart!');
    } catch {
      setToast('Could not add to cart.');
    } finally {
      setAddingCart((s) => { const n = new Set(s); n.delete(productId); return n; });
      setTimeout(() => setToast(''), 2500);
    }
  }

  return (
    <div>
      {(items.length > 0 || !loading) && (
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <p className="text-sm text-gray-400">{total} item{total !== 1 ? 's' : ''}</p>
          <div className="w-52">
            <CustomSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={WISHLIST_SORT_OPTIONS} />
          </div>
        </div>
      )}

      {loading && <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && items.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center"><Heart className="w-7 h-7 text-gray-300" /></div>
          <p className="font-semibold text-brand-black">Your wishlist is empty</p>
          <p className="text-sm text-gray-400">Save items you love and find them here.</p>
          <button onClick={() => navigate('/search')} className="mt-1 px-5 py-2.5 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors">Browse Products</button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((item) => {
              const p = item.product;
              const outOfStock = p.total_stock === 0 || p.status !== 'active';
              const isOnSale   = p.original_price != null && p.original_price > p.base_price;
              const discount   = isOnSale ? Math.round((1 - p.base_price / p.original_price!) * 100) : 0;
              return (
                <div key={item.wishlist_item_id} className={['relative flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all', outOfStock ? 'opacity-60' : 'hover:shadow-md hover:-translate-y-0.5'].join(' ')}>
                  <Link to={`/products/${p.id}`} className="relative aspect-square bg-gray-100 block overflow-hidden">
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
                    }
                    {outOfStock && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-gray-800/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Out of Stock</span>
                      </span>
                    )}
                    {isOnSale && !outOfStock && <span className="absolute top-2 left-2 bg-brand-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">-{discount}%</span>}
                    <button
                      onClick={(e) => { e.preventDefault(); handleRemove(p.id, item.wishlist_item_id); }}
                      disabled={removing.has(item.wishlist_item_id)}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white transition-colors disabled:opacity-50"
                    >
                      {removing.has(item.wishlist_item_id)
                        ? <div className="w-3.5 h-3.5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                        : <Heart className="w-4 h-4 fill-brand-red text-brand-red" />}
                    </button>
                  </Link>
                  <div className="p-3 flex flex-col gap-1.5 flex-1">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{p.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{p.seller.shop_name}</p>
                    <div className="flex items-baseline gap-1.5 flex-wrap mt-auto">
                      <span className="text-base font-black text-brand-red">{fmtPrice(p.base_price)}</span>
                      {isOnSale && <span className="text-xs text-gray-400 line-through">{fmtPrice(p.original_price!)}</span>}
                    </div>
                    <button
                      onClick={() => handleAddToCart(p.id)}
                      disabled={outOfStock || addingCart.has(p.id)}
                      className={['mt-1 w-full min-h-[36px] flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors', outOfStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand-red text-white hover:bg-brand-red-dark'].join(' ')}
                    >
                      {addingCart.has(p.id)
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><ShoppingCart className="w-3.5 h-3.5" /> Add to Cart</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-40">Previous</button>
              <span className="text-sm text-gray-500">{page} / {lastPage}</span>
              <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">{toast}</div>}
    </div>
  );
}

function FollowedStoresTabContent() {
  const navigate = useNavigate();
  const [stores, setStores]     = useState<FollowedStore[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sort, setSort]         = useState('recent');
  const [page, setPage]         = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal]       = useState(0);
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

  return (
    <div>
      {(stores.length > 0 || !loading) && (
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <p className="text-sm text-gray-400">{total} store{total !== 1 ? 's' : ''}</p>
          <div className="w-52">
            <CustomSelect value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={STORE_SORT_OPTIONS} />
          </div>
        </div>
      )}

      {loading && <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && stores.length === 0 && (
        <div className="py-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center"><Store className="w-7 h-7 text-gray-300" /></div>
          <p className="font-semibold text-brand-black">You're not following any stores yet</p>
          <p className="text-sm text-gray-400">Follow stores to stay updated on their latest products.</p>
          <button onClick={() => navigate('/search')} className="mt-1 px-5 py-2.5 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors">Explore Sellers</button>
        </div>
      )}

      {!loading && stores.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {stores.map((f) => {
              const s = f.seller;
              const stars = s.avg_rating ? Math.round(s.avg_rating) : 0;
              return (
                <div key={f.follow_id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 hover:shadow-sm transition-all">
                  <div className="w-14 h-14 shrink-0 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                    {s.logo_url ? <img src={s.logo_url} alt={s.shop_name} className="w-full h-full object-cover" /> : <Store className="w-6 h-6 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-brand-black text-sm truncate">{s.shop_name}</p>
                      {s.has_sale && <span className="text-[10px] font-bold bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full whitespace-nowrap">🔥 On Sale</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {[1,2,3,4,5].map((i) => <Star key={i} className={`w-3 h-3 ${i <= stars ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`} />)}
                      <span className="text-[11px] text-gray-400 ml-1">{s.avg_rating ? s.avg_rating.toFixed(1) : 'No rating'} &middot; {s.product_count} product{s.product_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/search?seller_ids=${s.id}`} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:border-brand-red hover:text-brand-red transition-colors">Visit Store</Link>
                    <button
                      onClick={() => handleUnfollow(f.follow_id, s.id)}
                      disabled={unfollowing.has(f.follow_id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-red border-2 border-brand-red rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {unfollowing.has(f.follow_id) ? <div className="w-3.5 h-3.5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /> : 'Following'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {lastPage > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-40">Previous</button>
              <span className="text-sm text-gray-500">{page} / {lastPage}</span>
              <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-200 hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ActiveWishlistTab = 'wishlist' | 'stores';

function WishlistPanel() {
  const [tab, setTab] = useState<ActiveWishlistTab>('wishlist');
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="font-bold text-brand-black text-lg">Wishlist & Followed Stores</h2>
        <p className="text-xs text-gray-400 mt-0.5">Your saved products and followed stores</p>
      </div>
      <div className="px-6 pt-4">
        <div className="flex border-b border-gray-100">
          {(['wishlist', 'stores'] as ActiveWishlistTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={['pb-3 px-1 mr-6 text-sm font-semibold border-b-2 transition-all', tab === t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-400 hover:text-brand-black'].join(' ')}
            >
              {t === 'wishlist' ? 'Wishlist' : 'Followed Stores'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-6 py-5">
        {tab === 'wishlist' ? <WishlistTabContent /> : <FollowedStoresTabContent />}
      </div>
    </div>
  );
}

// ─── Coming soon placeholder ─────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
        <Package className="w-6 h-6 text-gray-300" />
      </div>
      <p className="font-semibold text-brand-black">{label}</p>
      <p className="text-sm text-gray-400">This section is coming soon.</p>
    </div>
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
export function SettingsReviews()       { return <ComingSoon label="My Reviews" />; }
export function SettingsWishlist()      { return <WishlistPanel />; }
