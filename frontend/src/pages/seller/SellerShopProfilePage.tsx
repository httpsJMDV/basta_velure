import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, Store, MapPin, CheckCircle2, AlertTriangle,
  Loader2, Pencil, X, Phone, Clock, Shield, Copy, Check,
  ExternalLink, Palmtree, Bell, BadgeCheck,
} from 'lucide-react';
import PhoneInput from '../../components/ui/PhoneInput';
import { fileError, phoneError, postalError, shopNameError } from '../../utils/accountRules';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useAuth } from '../../hooks/useAuth';
import { shopUrl, shopUrlLabel } from '../../utils/shopLink';
import { Link } from 'react-router-dom';
import {
  getSellerShopProfileApi,
  getStorefrontCategoriesApi,
  updateSellerShopProfileApi,
  type SellerShopProfile,
} from '../../api/client';
import PsgcCascadingAddress, { type HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import CustomSelect from '../../components/ui/CustomSelect';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function formatJoinDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}{required && <span className="text-brand-red ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

const inputCls = (err?: string) =>
  `w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none transition-all bg-gray-50 focus:bg-white ${
    err
      ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 focus:border-brand-red focus:ring-2 focus:ring-red-100'
  }`;

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, action }: {
  icon?: React.ElementType; title: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2.5">
        {Icon && <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-gray-900" /></div>}
        <h2 className="text-[14px] font-bold text-gray-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ type, message, onDismiss }: {
  type: 'success' | 'error'; message: string; onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
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

// ─── Inline-edit textarea card (About / Policies) ─────────────────────────────

function EditableTextCard({
  icon: Icon, title, subtitle, value,
  onChange, placeholder,
  maxLen, error, rows = 4,
}: {
  icon?: React.ElementType; title: string; subtitle?: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  maxLen: number; error?: string; rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader
        icon={Icon}
        title={title}
        action={
          <button type="button" onClick={() => setEditing((e) => !e)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
            <Pencil className="w-3.5 h-3.5" />
            {editing ? 'Done' : 'Edit'}
          </button>
        }
      />
      <div className="px-6 py-5 space-y-2">
        {subtitle && <p className="text-[12px] text-gray-500 leading-relaxed">{subtitle}</p>}
        {editing ? (
          <div className="relative">
            <textarea
              rows={rows}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={maxLen}
              placeholder={placeholder}
              className={`${inputCls(error)} resize-none`}
              autoFocus
            />
            <span className={`absolute bottom-2.5 right-3 text-[10px] font-medium ${value.length > maxLen - 50 ? 'text-amber-500' : 'text-gray-300'}`}>
              {value.length}/{maxLen}
            </span>
            {error && <p className="text-[11px] text-red-500 font-medium mt-1">{error}</p>}
          </div>
        ) : (
          <p className={`text-[13px] leading-relaxed ${value ? 'text-gray-700' : 'text-gray-400 italic'}`}>
            {value || placeholder}
          </p>
        )}
      </div>
    </Card>
  );
}


// ─── Inline bio (header card) ─────────────────────────────────────────────────

function InlineBio({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const MAX = 100;
  return (
    <div className="mt-2">
      {editing ? (
        <div className="relative">
          <textarea
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={MAX}
            placeholder="Write a short bio for your shop…"
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-xl outline-none resize-none bg-gray-50 focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all"
            autoFocus
          />
          <span className={`absolute bottom-2.5 right-3 text-[10px] font-medium ${value.length > MAX - 30 ? 'text-amber-500' : 'text-gray-300'}`}>
            {value.length}/{MAX}
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-1 text-[11px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <div
          className="group flex items-start gap-1.5 cursor-pointer"
          onClick={() => setEditing(true)}
        >
          <p className={`text-[16px] leading-relaxed ${value ? 'text-gray-600' : 'text-gray-400 italic'}`}>
            {value || 'Add a short bio for your shop…'}
          </p>
          <Pencil className="w-3 h-3 text-gray-300 group-hover:text-brand-red transition-colors shrink-0 mt-1" />
        </div>
      )}
    </div>
  );
}

// ─── About section (read/edit toggle, no icon) ─────────────────────────────────────────────

function AboutSection({ value, onChange, error }: {
  value: string; onChange: (v: string) => void; error?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const MAX = 500;
  return editing ? (
    <div className="relative">
      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX}
        placeholder="Tell buyers about your shop — what you sell, your story, what makes you different…"
        className={`${inputCls(error)} resize-none`}
        autoFocus
      />
      <span className={`absolute bottom-2.5 right-3 text-[10px] font-medium ${value.length > MAX - 50 ? 'text-amber-500' : 'text-gray-300'}`}>
        {value.length}/{MAX}
      </span>
      {error && <p className="text-[11px] text-red-500 font-medium mt-1">{error}</p>}
      <button type="button" onClick={() => setEditing(false)}
        className="mt-2 text-[11px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
        Done
      </button>
    </div>
  ) : (
    <div className="group flex items-start gap-2 cursor-pointer" onClick={() => setEditing(true)}>
      <p className={`text-[13px] leading-relaxed flex-1 ${value ? 'text-gray-700' : 'text-gray-400 italic'}`}>
        {value || 'Tell buyers about your shop…'}
      </p>
      <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-red transition-colors shrink-0 mt-0.5" />
    </div>
  );
}

const RESPONSE_TIME_OPTIONS = [
  { value: 'within_1_hour', label: 'Within 1 hour' },
  { value: 'within_few_hours', label: 'Within a few hours' },
  { value: 'within_24_hours', label: 'Within 24 hours' },
  { value: 'within_2_days', label: 'Within 2 days' },
];


// ─── Location display (resolves PSGC codes to names) ────────────────────────

function LocationDisplay({ address }: { address: HubAddressValue }) {
  const parts = [address.barangayName, address.cityName, address.provinceName].filter(Boolean);
  const label = parts.length > 0 ? parts.join(', ') : [address.barangay, address.city, address.province].filter(Boolean).join(', ');

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Location</p>
      <p className="text-[13px] text-gray-700 font-medium truncate">
        {label || <span className="text-gray-400 italic">Not set</span>}
      </p>
      {address.street && (
        <p className="text-[12px] text-gray-400 truncate">{address.street}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SellerShopProfilePage() {
  const pageRef = useMountAnim();
  const { user } = useAuth();

  const [profile, setProfile] = useState<SellerShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // edit-panel toggles
  const [editingContact, setEditingContact] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);

  // form state
  const [shopName, setShopName] = useState('');
  const [shopCategory, setShopCategory] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [shopBio, setShopBio] = useState('');
  const [shopContactNumber, setShopContactNumber] = useState('');
  const [returnPolicy, setReturnPolicy] = useState('');
  const [shippingPolicy, setShippingPolicy] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [responseTime, setResponseTime] = useState('');
  const [lowStockLevel, setLowStockLevel] = useState('5');
  const [postalCode, setPostalCode] = useState('');
  const [onVacation, setOnVacation] = useState(false);
  const [vacationBusy, setVacationBusy] = useState(false);
  const [psgcAddress, setPsgcAddress] = useState<HubAddressValue>({
    region: '',
    regionName: '',
    province: '',
    provinceName: '',
    city: '',
    cityName: '',
    barangay: '',
    barangayName: '',
    street: '',
  });

  // image state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const shopInfoRef = useRef<HTMLDivElement>(null);

  // The line of business is one of the platform's main categories, the same list as the seller application.
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    getStorefrontCategoriesApi()
      .then((list) => setCategoryOptions(list.map((c) => ({ value: c.name, label: c.name }))))
      .catch(() => setCategoryOptions([]));
  }, []);

  useEffect(() => {
    getSellerShopProfileApi()
      .then((p) => {
        setProfile(p);
        setShopName(p.shop_name ?? '');
        setShopCategory(p.shop_category ?? '');
        setShopDescription(p.shop_description ?? '');
        setShopBio(p.shop_bio ?? '');
        setShopContactNumber(p.shop_contact_number ?? '');
        setReturnPolicy(p.return_policy ?? '');
        setShippingPolicy(p.shipping_policy ?? '');
        setBusinessHours(p.business_hours ?? '');
        setResponseTime(p.response_time ?? '');
        setLowStockLevel(String(p.low_stock_threshold ?? 5));
        setPostalCode(p.address_postal_code ?? '');
        setOnVacation(!!p.on_vacation);
        setPsgcAddress({
          region: p.address_region_code ?? '',
          regionName: p.address_region ?? '',
          province: p.address_province_code ?? '',
          provinceName: p.address_province ?? '',
          city: p.address_city_code ?? '',
          cityName: p.address_city ?? '',
          barangay: p.address_barangay_code ?? '',
          barangayName: p.address_barangay ?? '',
          street: p.address_street ?? '',
        });
      })
      .catch(() => setToast({ type: 'error', message: 'Failed to load shop profile.' }))
      .finally(() => setLoading(false));
  }, []);

  const handleImagePick = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File) => void,
    setPreview: (s: string) => void,
    field: 'logo' | 'banner',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // JPG or PNG up to 5 MB (A10); the server checks the content again.
    const problem = fileError(file, field === 'logo' ? 'the logo' : 'the banner', { required: false });
    setErrors((prev) => { const next = { ...prev }; if (problem) next[field] = problem; else delete next[field]; return next; });
    e.target.value = '';
    if (problem) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  // Vacation mode is saved at once: buyers keep browsing the shop but cannot order until it is turned off.
  const toggleVacation = async () => {
    const next = !onVacation;
    setVacationBusy(true);
    const fd = new FormData();
    fd.append('on_vacation', next ? '1' : '0');
    try {
      const updated = await updateSellerShopProfileApi(fd);
      setProfile(updated);
      setOnVacation(!!updated.on_vacation);
      setToast({ type: 'success', message: next ? 'Vacation mode is on. Buyers can browse your shop but cannot order.' : 'Vacation mode is off. Buyers can order again.' });
    } catch {
      setToast({ type: 'error', message: 'Vacation mode could not be changed. Please try again.' });
    } finally {
      setVacationBusy(false);
    }
  };

  const validateForm = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const nameProblem = shopNameError(shopName);
    if (nameProblem) e.shop_name = nameProblem;
    if (!shopContactNumber.trim()) e.shop_contact_number = 'Contact number is required.';
    else { const phone = phoneError(shopContactNumber); if (phone) e.shop_contact_number = phone; }
    if (shopDescription.trim().length > 500) e.shop_description = 'The store description can be at most 500 characters.';
    if (!psgcAddress.province) e.address_province = 'Province is required.';
    if (!psgcAddress.city) e.address_city = 'City / Municipality is required.';
    if (!psgcAddress.barangay) e.address_barangay = 'Barangay is required.';
    if (!psgcAddress.street.trim()) e.address_street = 'Street address is required.';
    if (postalCode.trim()) { const p = postalError(postalCode); if (p) e.address_postal_code = p; }
    if (!/^\d+$/.test(lowStockLevel.trim()) || Number(lowStockLevel) > 999) e.low_stock_threshold = 'Enter a whole number from 0 to 999.';
    if (errors.logo) e.logo = errors.logo;
    if (errors.banner) e.banner = errors.banner;
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = validateForm();
    setErrors(problems);
    if (Object.keys(problems).length) {
      if (problems.shop_contact_number) setEditingContact(true);
      if (Object.keys(problems).some((k) => k.startsWith('address_'))) setEditingLocation(true);
      setToast({ type: 'error', message: 'Please fix the highlighted fields.' });
      return;
    }
    const form = new FormData();
    form.append('shop_name', shopName.trim());
    form.append('shop_category', shopCategory.trim());
    form.append('shop_description', shopDescription.trim());
    form.append('shop_bio', shopBio.trim());
    form.append('shop_contact_number', shopContactNumber.trim());
    form.append('return_policy', returnPolicy.trim());
    form.append('shipping_policy', shippingPolicy.trim());
    form.append('business_hours', businessHours.trim());
    form.append('response_time', responseTime);
    form.append('low_stock_threshold', lowStockLevel.trim());
    form.append('address_province', psgcAddress.provinceName || psgcAddress.province);
    form.append('address_city', psgcAddress.cityName || psgcAddress.city);
    form.append('address_barangay', psgcAddress.barangayName || psgcAddress.barangay);
    form.append('address_street', psgcAddress.street.trim());
    form.append('address_region', psgcAddress.regionName);
    form.append('address_region_code', psgcAddress.region);
    form.append('address_postal_code', postalCode.trim());
    if (psgcAddress.province) form.append('address_province_code', psgcAddress.province);
    if (psgcAddress.city) form.append('address_city_code', psgcAddress.city);
    if (psgcAddress.barangay) form.append('address_barangay_code', psgcAddress.barangay);
    if (logoFile) form.append('logo', logoFile);
    if (bannerFile) form.append('banner', bannerFile);

    setSaving(true);
    try {
      const updated = await updateSellerShopProfileApi(form);
      setProfile(updated);
      setLogoFile(null);
      setBannerFile(null);
      setToast({ type: 'success', message: 'Shop profile saved successfully.' });
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data;
      if (data?.errors) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.errors)) mapped[k] = v[0];
        setErrors(mapped);
        if (mapped.shop_contact_number) setEditingContact(true);
        if (Object.keys(mapped).some((k) => k.startsWith('address_'))) setEditingLocation(true);
        setToast({ type: 'error', message: Object.values(mapped)[0] ?? 'Please fix the highlighted fields.' });
      } else {
        setToast({ type: 'error', message: 'Failed to save. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopySlug = () => {
    const slug = profile?.shop_slug ?? '';
    void navigator.clipboard?.writeText(shopUrl(slug)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const logoSrc = logoPreview ?? profile?.logo_url ?? null;
  const bannerSrc = bannerPreview ?? profile?.banner_url ?? null;
  const isApproved = profile?.application_status === 'approved';

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-56 bg-gray-100 rounded-2xl" />
        <div className="h-20 bg-gray-100 rounded-2xl" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
        <div className="h-48 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const placeLabel = [psgcAddress.cityName, psgcAddress.provinceName].filter(Boolean).join(', ');
  const stats = [
    { label: 'Product rating', value: profile?.avg_rating ? `${Number(profile.avg_rating).toFixed(1)} ★` : 'No reviews yet' },
    { label: 'Followers', value: (profile?.follower_count ?? 0).toLocaleString() },
    { label: 'Products', value: String(profile?.total_products ?? 0) },
    { label: 'Usually replies', value: RESPONSE_TIME_OPTIONS.find((o) => o.value === responseTime)?.label ?? '—' },
    { label: 'On Loved-IT since', value: formatJoinDate(profile?.created_at ?? null) },
  ];

  return (
    <div ref={pageRef} className="max-w-6xl mx-auto">

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="hidden"
        onChange={(e) => handleImagePick(e, setLogoFile, setLogoPreview, 'logo')} />
      <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="hidden"
        onChange={(e) => handleImagePick(e, setBannerFile, setBannerPreview, 'banner')} />

      <div className="mb-5">
        <h1 className="text-2xl font-black text-gray-900">Shop profile</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">This is how buyers see your shop. Click the banner or the logo to change them.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="min-w-0 space-y-5">

          {(errors.logo || errors.banner) && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-2xl text-[13px] text-red-700">
              {errors.logo && <p>{errors.logo}</p>}
              {errors.banner && <p>{errors.banner}</p>}
            </div>
          )}

          {profile?.address_needs_update && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Pickup address update required</p>
                <p className="text-xs text-amber-700 mt-0.5">Re-select your shop address so couriers can match your pickup area.</p>
              </div>
              <button type="button" onClick={() => setEditingLocation(true)} className="text-xs font-semibold text-brand-red hover:underline shrink-0">
                Edit address &rarr;
              </button>
            </div>
          )}

          {/* The storefront header, as buyers see it */}
          <Card className="overflow-hidden">
            <div className="relative h-32 sm:h-44 bg-[#EDE6DC] cursor-pointer group" onClick={() => bannerInputRef.current?.click()}>
              {bannerSrc
                ? <img src={bannerSrc} alt="Shop banner" className="w-full h-full object-cover" />
                : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-stone-500">
                    <Camera className="w-6 h-6" />
                    <span className="text-[12px] font-semibold">Add a banner · JPG or PNG, up to 5 MB</span>
                  </div>
                )}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <button type="button" onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-white/95 hover:bg-white text-stone-800 text-[11.5px] font-semibold px-3 py-1.5 rounded-full shadow-sm transition-colors">
                <Camera className="w-3.5 h-3.5" /> Change banner
              </button>
              {bannerFile && <span className="absolute top-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">New, not saved yet</span>}
            </div>

            <div className="p-5 sm:p-6 flex items-start gap-4 sm:gap-5">
              <button type="button" onClick={() => logoInputRef.current?.click()} aria-label="Change the logo"
                className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-stone-200 bg-white shrink-0">
                {logoSrc
                  ? <img src={logoSrc} alt="Shop logo" className="w-full h-full object-cover" />
                  : <span className="w-full h-full bg-[#1E1B18] text-[#FAF8F5] font-serif text-2xl font-bold flex items-center justify-center">{initials(shopName.split(' ')[0] ?? '', shopName.split(' ')[1] ?? '') || initials(user?.first_name ?? '', user?.last_name ?? '')}</span>}
                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="w-5 h-5 text-white" /></span>
                {logoFile && <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-serif text-[24px] sm:text-[30px] font-bold tracking-tight leading-tight text-[#1E1B18] break-words">{shopName || 'Your shop name'}</h2>
                  <button type="button" onClick={() => shopInfoRef.current?.scrollIntoView({ behavior: 'smooth' })} aria-label="Edit the shop name"
                    className="text-stone-300 hover:text-brand-red transition-colors shrink-0">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-stone-500">
                  {isApproved
                    ? <span className="inline-flex items-center gap-1 font-semibold text-stone-800"><BadgeCheck className="w-4 h-4 text-brand-red" /> Verified shop</span>
                    : <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Clock className="w-3.5 h-3.5" /> Under review</span>}
                  <span>{shopCategory || 'Line of business'}</span>
                  {placeLabel && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{placeLabel}</span>}
                </p>
                <InlineBio value={shopBio} onChange={setShopBio} />
              </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-5 border-t border-gray-100 [&>div]:border-gray-100 [&>div]:border-b sm:[&>div]:border-b-0 [&>div:not(:first-child)]:sm:border-l">
              {stats.map((s) => (
                <div key={s.label} className="px-5 py-4 min-w-0">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">{s.label}</dt>
                  <dd className="mt-1 text-[13.5px] font-semibold text-gray-900 truncate">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* About */}
          <Card>
            <CardHeader title="About the shop" />
            <div className="px-6 py-5">
              <AboutSection value={shopDescription} onChange={setShopDescription} error={errors.shop_description} />
            </div>
          </Card>

          {/* Returns and shipping */}
          <Card>
            <CardHeader icon={Shield} title="Returns and shipping" />
            <div className="px-6 py-5 space-y-5">
              <div className="p-4 bg-[#FAF8F5] border border-stone-200 rounded-2xl">
                <p className="text-[13px] font-semibold text-stone-900">7-day returns on Loved-IT (every shop)</p>
                <p className="mt-1 text-[12.5px] text-stone-600 leading-relaxed">
                  Buyers can return an eligible item within 7 days of delivery if it is damaged or not as described. Food and made-to-order items are excluded. Your terms below add to this; they cannot shorten it.
                </p>
              </div>
              <EditableTextCard
                icon={undefined}
                title="Your return terms"
                subtitle="Extra terms for your shop, such as keeping the original packaging."
                value={returnPolicy}
                onChange={setReturnPolicy}
                placeholder="e.g. Items must be returned in the original box with all accessories."
                maxLen={500}
                error={errors.return_policy}
                rows={3}
              />
              <EditableTextCard
                icon={undefined}
                title="Shipping notes"
                subtitle="When you ship, and anything buyers should know about packing or pickup."
                value={shippingPolicy}
                onChange={setShippingPolicy}
                placeholder="e.g. Orders placed before 2 PM are packed the same day."
                maxLen={500}
                error={errors.shipping_policy}
                rows={3}
              />
            </div>
          </Card>

          {/* Hours and replies */}
          <Card>
            <CardHeader icon={Clock} title="Hours and replies" />
            <div className="px-6 py-5 grid sm:grid-cols-2 gap-5">
              <Field label="Business hours" error={errors.business_hours}>
                <input type="text" value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="e.g. Mon–Sat, 9 AM–6 PM" maxLength={100} className={inputCls(errors.business_hours)} />
              </Field>
              <Field label="You usually reply" error={errors.response_time}>
                <CustomSelect options={RESPONSE_TIME_OPTIONS} value={responseTime} onChange={setResponseTime} placeholder="Select" />
              </Field>
            </div>
          </Card>

          {/* Stock alerts (A29) */}
          <Card>
            <CardHeader icon={Bell} title="Stock alerts" />
            <div className="px-6 py-5 grid gap-5 sm:grid-cols-[minmax(0,220px)_1fr] items-start">
              <Field label="Low-stock level" error={errors.low_stock_threshold}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={999} step={1} inputMode="numeric" value={lowStockLevel} onChange={(e) => setLowStockLevel(e.target.value)}
                    aria-label="Low-stock level" className={`${inputCls(errors.low_stock_threshold)} !w-28`} />
                  <span className="text-[12.5px] text-gray-500">units or fewer</span>
                </div>
              </Field>
              <div className="text-[12.5px] leading-relaxed text-gray-600 space-y-1.5">
                <p>
                  You get one notification when a product's stock falls to this level, and again only after you restock above it.
                  {' '}<b className="font-semibold text-gray-800">0</b> means you hear about a product only when it sells out.
                </p>
                <p className="text-gray-500">A grocery that sells fast might use 20; a shop of big appliances, 2. Each product can also use its own level, or none, in its Sales section.</p>
              </div>
            </div>
          </Card>

          {/* Contact and location */}
          <Card>
            <CardHeader
              icon={MapPin}
              title="Contact and location"
              action={
                <div className="flex items-center gap-3">
                  {!editingContact && (
                    <button type="button" onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Phone
                    </button>
                  )}
                  {!editingLocation && (
                    <button type="button" onClick={() => setEditingLocation(true)} className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Address
                    </button>
                  )}
                </div>
              }
            />
            <div className="px-6 py-5 space-y-5">
              {editingContact ? (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <PhoneInput
                      id="shop-contact"
                      label="Shop contact number"
                      required
                      value={shopContactNumber}
                      onChange={(v) => { setShopContactNumber(v); setErrors((prev) => { const n = { ...prev }; delete n.shop_contact_number; return n; }); }}
                      error={errors.shop_contact_number}
                      hint="Buyers and couriers call this number."
                    />
                  </div>
                  <button type="button" onClick={() => setEditingContact(false)} aria-label="Close" className="mt-8 shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Contact</p>
                    <p className="text-[13px] text-gray-700 font-medium truncate">{shopContactNumber || <span className="text-gray-400 italic">Not set</span>}</p>
                  </div>
                </div>
              )}

              {editingLocation ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Shop address</p>
                    <button type="button" onClick={() => setEditingLocation(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <PsgcCascadingAddress
                    value={psgcAddress}
                    onChange={setPsgcAddress}
                    errors={{
                      province: errors.address_province || errors.address_province_code,
                      city: errors.address_city || errors.address_city_code,
                      barangay: errors.address_barangay || errors.address_barangay_code,
                      street: errors.address_street,
                    }}
                  />
                  <Field label="Postal code" error={errors.address_postal_code}>
                    <input type="text" inputMode="numeric" placeholder="e.g. 1100" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputCls(errors.address_postal_code) + ' max-w-[160px]'} />
                  </Field>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <LocationDisplay address={psgcAddress} />
                </div>
              )}
            </div>
          </Card>

          {/* Shop information (the header's pencil scrolls here) */}
          <div ref={shopInfoRef} className="scroll-mt-24">
            <Card>
              <CardHeader icon={Store} title="Shop name and line of business" />
              <div className="px-6 py-5 grid sm:grid-cols-2 gap-5">
                <Field label="Shop name" required error={errors.shop_name}>
                  <input type="text" value={shopName} maxLength={30} placeholder="Your shop name" className={inputCls(errors.shop_name)}
                    onChange={(e) => { setShopName(e.target.value); setErrors((prev) => { const n = { ...prev }; delete n.shop_name; return n; }); }} />
                  {!errors.shop_name && <p className="mt-1 text-[11px] text-gray-400 tabular-nums">3 to 30 characters, unique on Loved-IT · {shopName.trim().length}/30</p>}
                </Field>
                <Field label="Line of business" error={errors.shop_category}>
                  <CustomSelect
                    options={categoryOptions}
                    value={shopCategory}
                    onChange={(v) => { setShopCategory(v); setErrors((prev) => { const n = { ...prev }; delete n.shop_category; return n; }); }}
                    placeholder={categoryOptions.length ? 'Select your line of business' : 'Loading…'}
                    error={errors.shop_category}
                  />
                </Field>
              </div>
            </Card>
          </div>

          {/* Account */}
          <Card>
            <CardHeader icon={Shield} title="Account" />
            <div className="px-6 py-5 space-y-3">
              {[
                { label: 'Full name', value: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() },
                { label: 'Email', value: user?.email ?? '—' },
                { label: 'Phone', value: user?.phone ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <p className="w-24 shrink-0 text-[11px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                  <p className="text-[13px] text-gray-700 font-medium flex-1 truncate">{value || '—'}</p>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <Link to="/seller/account" className="text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
                  Edit your name, phone or photo in Account settings
                </Link>
              </div>
            </div>
          </Card>
        </div>

        {/* The rail: the public page, vacation mode and Save, always in view */}
        <aside className="lg:sticky lg:top-6 space-y-4">
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">Your shop page</p>
            {profile?.shop_slug ? (
              <>
                <a href={shopUrl(profile.shop_slug)} target="_blank" rel="noopener noreferrer" className="mt-2 block text-[12.5px] font-mono text-gray-700 truncate hover:text-brand-red" title={shopUrl(profile.shop_slug)}>
                  {shopUrlLabel(profile.shop_slug)}
                </a>
                <div className="mt-3 flex gap-2">
                  <a href={shopUrl(profile.shop_slug)} target="_blank" rel="noopener noreferrer"
                    className="flex-1 min-h-10 rounded-full border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-800 hover:border-gray-900 inline-flex items-center justify-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> View as a buyer
                  </a>
                  <button type="button" onClick={handleCopySlug} aria-label="Copy the shop link" title={copied ? 'Copied' : 'Copy link'}
                    className="w-10 h-10 rounded-full border border-gray-300 bg-white text-gray-600 hover:border-gray-900 flex items-center justify-center">
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </>
            ) : <p className="mt-2 text-[12.5px] text-gray-500">Your link appears once the shop is approved.</p>}
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-gray-900">
                  <Palmtree className={`w-4 h-4 ${onVacation ? 'text-amber-600' : 'text-gray-400'}`} /> Vacation mode
                </p>
                <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                  {onVacation
                    ? `On since ${profile?.vacation_started_at ? new Date(profile.vacation_started_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'today'}. Buyers can browse but not order.`
                    : 'Going away? Buyers keep browsing; ordering pauses until you turn it off.'}
                </p>
              </div>
              <button type="button" role="switch" aria-checked={onVacation} onClick={toggleVacation} disabled={vacationBusy}
                className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 shrink-0 ${onVacation ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <span className="sr-only">Vacation mode</span>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${onVacation ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 text-white text-[13px] font-bold px-6 rounded-full transition-colors min-h-[44px]">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save changes'}
            </button>
            <p className="mt-2 text-[11.5px] text-gray-500 text-center">Buyers see the changes on your shop page once saved.</p>
          </Card>
        </aside>
      </form>

      {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}
    </div>
  );
}
