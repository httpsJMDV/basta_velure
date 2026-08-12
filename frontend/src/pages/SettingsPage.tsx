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
} from '../api/client';
import CustomSelect from '../components/ui/CustomSelect';
import PhoneInput from '../components/ui/PhoneInput';
import Button from '../components/ui/Button';
import UserAvatar from '../components/ui/UserAvatar';
import AvatarCropModal from '../components/ui/AvatarCropModal';
import { uploadAvatarApi } from '../api/client';
import type { Address, AddressLabel, Order, OrderStatus } from '../types';
import { PH_PROVINCES, PH_DISTRICTS } from '../data/ph-locations';
import {
  User, MapPin, Package, RotateCcw, XCircle,
  Star, Heart, Store, ChevronRight, ArrowLeft, Pencil, Check, X,
  Plus, Trash2, Home, Briefcase, Star as StarIcon,
  Search, ShoppingBag, Camera,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';

// ─── Sidebar ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: User,      label: 'Manage Account',            to: '/settings' },
  { icon: MapPin,    label: 'Address Book',               to: '/settings/addresses' },
  { icon: Package,   label: 'My Orders',                  to: '/settings/orders' },
  { icon: RotateCcw, label: 'My Returns',                 to: '/settings/returns' },
  { icon: XCircle,   label: 'My Cancellations',           to: '/settings/cancellations' },
  { icon: Star,      label: 'My Reviews',                 to: '/settings/reviews' },
  { icon: Heart,     label: 'Wishlist & Followed Stores', to: '/settings/wishlist' },
  { icon: Store,     label: 'Sell in Velure',             to: '/register/seller', highlight: true },
];

function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <aside className="w-full lg:w-64 shrink-0">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-3">
        <div className="flex items-center gap-3">
          <UserAvatar
            firstName={user?.first_name ?? ''}
            lastName={user?.last_name ?? ''}
            avatarUrl={user?.avatar_url}
            size="lg"
          />
          <div className="min-w-0">
            <p className="font-semibold text-brand-black truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      <nav className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {NAV_ITEMS.map(({ icon: Icon, label, to, highlight }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={[
                'flex items-center gap-3 px-4 py-3.5 text-sm transition-colors border-b border-gray-50 last:border-0',
                active
                  ? 'bg-red-50 text-brand-red font-semibold'
                  : highlight
                  ? 'text-brand-red font-semibold hover:bg-red-50'
                  : 'text-brand-gray-mid hover:bg-gray-50',
              ].join(' ')}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

// ─── Birthday dropdown helpers ───────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
].map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }));

const DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return { value: d, label: String(i + 1) };
});

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => {
  const y = String(currentYear - i);
  return { value: y, label: y };
});

const GENDER_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// ─── Editable row ────────────────────────────────────────────────────────────

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
    <div className="py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
          {editing ? (
            <div className="flex flex-col gap-3 mt-2">
              {children}
              <div className="flex gap-2">
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white text-xs font-semibold rounded-lg hover:bg-brand-red-dark transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-black font-medium">{display || '—'}</p>
          )}
        </div>
        {!editing && (
          <button
            onClick={onEdit}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors mt-0.5"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
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

  // Phone edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Birthday edit state
  const splitDob = (dob: string | null) => {
    if (!dob) return { month: '', day: '', year: '' };
    const [y, m, d] = dob.split('-');
    return { month: m, day: d, year: y };
  };
  const [editingDob, setEditingDob] = useState(false);
  const [dob, setDob] = useState(splitDob(user?.date_of_birth ?? null));
  const [savingDob, setSavingDob] = useState(false);

  // Gender edit state
  const [editingGender, setEditingGender] = useState(false);
  const [gender, setGender] = useState(user?.gender ?? '');
  const [savingGender, setSavingGender] = useState(false);

  const formatDob = (d: typeof dob) =>
    d.year && d.month && d.day ? `${d.year}-${d.month}-${d.day}` : '';

  const displayDob = () => {
    if (!user?.date_of_birth) return '—';
    const { month, day, year } = splitDob(user.date_of_birth);
    const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? month;
    return `${monthLabel} ${parseInt(day)}, ${year}`;
  };

  const displayGender = () =>
    GENDER_OPTIONS.find((g) => g.value === user?.gender)?.label ?? '—';

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

  async function saveDob() {
    setSavingDob(true);
    try {
      const updated = await updateProfileApi({ date_of_birth: formatDob(dob) });
      setUser(updated);
      setEditingDob(false);
    } finally {
      setSavingDob(false);
    }
  }

  async function saveGender() {
    setSavingGender(true);
    try {
      const updated = await updateProfileApi({ gender });
      setUser(updated);
      setEditingGender(false);
    } finally {
      setSavingGender(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="font-bold text-brand-black text-lg">Manage Account</h2>
        <p className="text-xs text-gray-400 mt-0.5">Update your personal information</p>
      </div>

      <div className="px-6">
        {/* Avatar */}
        <div className="py-5 border-b border-gray-50 flex items-center gap-4">
          <div className="relative shrink-0">
            <UserAvatar
              firstName={user?.first_name ?? ''}
              lastName={user?.last_name ?? ''}
              avatarUrl={user?.avatar_url}
              size="xl"
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shadow-sm hover:border-brand-red hover:text-brand-red transition-colors disabled:opacity-50"
              aria-label="Change profile photo"
            >
              {uploadingAvatar
                ? <div className="w-3 h-3 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-3.5 h-3.5 text-gray-500" />}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-black">{user?.first_name} {user?.last_name}</p>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="text-xs text-brand-red hover:text-brand-red-dark font-medium mt-0.5 transition-colors disabled:opacity-50"
            >
              {user?.avatar_url ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
        </div>

        {cropFile && (
          <AvatarCropModal
            file={cropFile}
            onConfirm={handleCropConfirm}
            onCancel={() => setCropFile(null)}
          />
        )}

        {/* Read-only fields */}
        <div className="py-4 border-b border-gray-50">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Full Name</p>
          <p className="text-sm text-brand-black font-medium">
            {user?.first_name} {user?.middle_name ? user.middle_name + ' ' : ''}{user?.last_name}
          </p>
        </div>

        <div className="py-4 border-b border-gray-50">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Email</p>
          <p className="text-sm text-brand-black font-medium">{user?.email}</p>
        </div>

        {/* Editable: Phone */}
        <InfoRow
          label="Phone Number"
          display={user?.phone ?? ''}
          editing={editingPhone}
          onEdit={() => { setPhone(user?.phone ?? ''); setEditingPhone(true); }}
          onCancel={() => { setEditingPhone(false); setPhoneError(''); }}
          onSave={savePhone}
          saving={savingPhone}
        >
          <PhoneInput value={phone} onChange={setPhone} error={phoneError} />
        </InfoRow>

        {/* Editable: Birthday */}
        <InfoRow
          label="Birthday"
          display={displayDob()}
          editing={editingDob}
          onEdit={() => { setDob(splitDob(user?.date_of_birth ?? null)); setEditingDob(true); }}
          onCancel={() => setEditingDob(false)}
          onSave={saveDob}
          saving={savingDob}
        >
          <div className="grid grid-cols-3 gap-2">
            <CustomSelect
              value={dob.month}
              onChange={(v) => setDob((d) => ({ ...d, month: v }))}
              options={MONTHS}
              placeholder="Month"
            />
            <CustomSelect
              value={dob.day}
              onChange={(v) => setDob((d) => ({ ...d, day: v }))}
              options={DAYS}
              placeholder="Day"
            />
            <CustomSelect
              value={dob.year}
              onChange={(v) => setDob((d) => ({ ...d, year: v }))}
              options={YEARS}
              placeholder="Year"
            />
          </div>
        </InfoRow>

        {/* Editable: Gender */}
        <InfoRow
          label="Gender"
          display={displayGender()}
          editing={editingGender}
          onEdit={() => { setGender(user?.gender ?? ''); setEditingGender(true); }}
          onCancel={() => setEditingGender(false)}
          onSave={saveGender}
          saving={savingGender}
        >
          <CustomSelect
            value={gender}
            onChange={setGender}
            options={GENDER_OPTIONS}
            placeholder="Select gender"
          />
        </InfoRow>
      </div>
    </div>
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
  label: 'home' as AddressLabel,
};

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
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const districtOptions = form.province ? (PH_DISTRICTS[form.province] ?? []) : [];

  function handleProvince(v: string) {
    setForm((f) => ({ ...f, province: v, district: '' }));
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
          value={form.floor_unit}
          onChange={(e) => set('floor_unit', e.target.value)}
        />
      </div>

      {/* Province + District */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CustomSelect
          label="Province"
          required
          value={form.province}
          onChange={handleProvince}
          options={PH_PROVINCES}
          placeholder="Select province"
        />
        <CustomSelect
          label="District / City"
          required
          value={form.district}
          onChange={(v) => set('district', v)}
          options={districtOptions}
          placeholder={form.province ? 'Select district' : 'Select province first'}
          disabled={!form.province}
        />
      </div>

      {/* Ward — free text */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Barangay / Ward <span className="text-brand-red">*</span></label>
        <input
          className={inputCls}
          placeholder="e.g. Brgy. Poblacion II"
          value={form.ward}
          onChange={(e) => set('ward', e.target.value)}
        />
        <p className="text-xs text-gray-400">Type your barangay name (e.g. Brgy. San Antonio, Brgy. 123)</p>
      </div>

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
          onClick={() => onSave(form)}
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
  const provinceName = PH_PROVINCES.find((p) => p.value === addr.province)?.label ?? addr.province;
  const districtName = (PH_DISTRICTS[addr.province] ?? []).find((d) => d.value === addr.district)?.label ?? addr.district;

  return (
    <div className={[
      'relative rounded-2xl border-2 p-5 transition-all',
      addr.is_default ? 'border-brand-red bg-red-50/40' : 'border-gray-100 bg-white',
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
      </div>

      <p className="font-semibold text-brand-black text-sm">{addr.full_name}</p>
      <p className="text-sm text-gray-500 mt-0.5">{addr.phone}</p>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed">
        {addr.address}{addr.floor_unit ? `, ${addr.floor_unit}` : ''}<br />
        {addr.ward}, {districtName}, {provinceName}
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
      full_name: a.full_name,
      phone: a.phone,
      address: a.address,
      floor_unit: a.floor_unit ?? '',
      province: a.province,
      district: a.district,
      ward: a.ward,
      label: a.label,
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

type OrderFilter = 'all' | 'to_pay' | 'to_ship' | 'to_receive' | 'to_review';

const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'to_pay',     label: 'To Pay' },
  { key: 'to_ship',    label: 'To Ship' },
  { key: 'to_receive', label: 'To Receive' },
  { key: 'to_review',  label: 'To Review' },
];

const FILTER_STATUSES: Record<OrderFilter, OrderStatus[]> = {
  all:        [],
  to_pay:     ['pending'],
  to_ship:    ['confirmed', 'packed'],
  to_receive: ['shipped', 'out_for_delivery'],
  to_review:  ['delivered'],
};

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  pending:          { label: 'Pending Payment',   cls: 'bg-amber-50 text-amber-600' },
  confirmed:        { label: 'Confirmed',          cls: 'bg-blue-50 text-blue-600' },
  packed:           { label: 'Packed',             cls: 'bg-blue-50 text-blue-600' },
  shipped:          { label: 'Shipped',            cls: 'bg-indigo-50 text-indigo-600' },
  out_for_delivery: { label: 'Out for Delivery',   cls: 'bg-purple-50 text-purple-600' },
  delivered:        { label: 'Delivered',          cls: 'bg-green-50 text-green-600' },
  cancelled:        { label: 'Cancelled',          cls: 'bg-gray-100 text-gray-500' },
  returned:         { label: 'Returned',           cls: 'bg-red-50 text-brand-red' },
};

function OrderCard({ order }: { order: Order }) {
  const badge = STATUS_BADGE[order.status];
  const firstItem = order.items[0];
  const extraCount = order.items.length - 1;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-brand-black tracking-wide">{order.order_number}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">
            {new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {firstItem && (
        <div className="flex items-center gap-3 mb-3">
          <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
            {firstItem.image_url
              ? <img src={firstItem.image_url} alt={firstItem.product_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-gray-300" /></div>
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-black truncate">{firstItem.product_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{firstItem.variant_label} · x{firstItem.quantity}</p>
            {extraCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">+{extraCount} more item{extraCount > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
        <span className="text-xs text-gray-400">
          {order.payment_method === 'gcash' ? 'GCash' : 'Cash on Delivery'}
        </span>
        <span className="text-sm font-bold text-brand-black">
          ₱{order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </span>
      </div>
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
    if (statuses.length) result = result.filter((o) => statuses.includes(o.status));
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
          <OrderCard key={order.id} order={order} />
        ))}
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
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-brand-gray-soft">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo1.png" alt="Velure" className="w-7 h-7 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-lg tracking-tight">Velure</span>
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <span className="text-sm font-semibold text-brand-black">My Account</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-black transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex flex-col lg:flex-row gap-5">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-page exports ─────────────────────────────────────────────────────────

export function SettingsAccount()       { return <AccountPanel />; }
export function SettingsAddresses()     { return <AddressBookPanel />; }
export function SettingsOrders()        { return <OrdersPanel />; }
export function SettingsReturns()       { return <ComingSoon label="My Returns" />; }
export function SettingsCancellations() { return <ComingSoon label="My Cancellations" />; }
export function SettingsReviews()       { return <ComingSoon label="My Reviews" />; }
export function SettingsWishlist()      { return <ComingSoon label="Wishlist & Followed Stores" />; }
