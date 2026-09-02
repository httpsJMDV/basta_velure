import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolveBarangayName, resolveCityName, resolveProvinceName } from '../../utils/psgc';
import {
  Camera, Store, MapPin, CheckCircle2, AlertTriangle,
  Loader2, Pencil, X, Phone, Clock, Shield, Copy, Check,
  Star, Package, Users, MessageCircle, ExternalLink,
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useAuth } from '../../hooks/useAuth';
import {
  getSellerShopProfileApi,
  updateSellerShopProfileApi,
  type SellerShopProfile,
} from '../../api/client';
import AddressFields, { type AddressValue } from '../../components/ui/AddressFields';
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

function LocationDisplay({ address }: { address: AddressValue }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!address.province && !address.city_municipality && !address.barangay) {
      setLabel('');
      return;
    }
    Promise.all([
      address.barangay ? resolveBarangayName(address.barangay) : Promise.resolve(''),
      address.city_municipality ? resolveCityName(address.city_municipality) : Promise.resolve(''),
      address.province ? resolveProvinceName(address.province) : Promise.resolve(''),
    ]).then(([brgy, city, prov]) => {
      setLabel([brgy, city, prov].filter(Boolean).join(', '));
    });
  }, [address.province, address.city_municipality, address.barangay]);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Location</p>
      <p className="text-[13px] text-gray-700 font-medium truncate">
        {label || <span className="text-gray-400 italic">Not set</span>}
      </p>
      {address.street_address && (
        <p className="text-[12px] text-gray-400 truncate">{address.street_address}</p>
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
  const [address, setAddress] = useState<AddressValue>({
    province: '', city_municipality: '', barangay: '', street_address: '',
  });

  // image state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const shopInfoRef = useRef<HTMLDivElement>(null);

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
        setAddress({
          province: p.address_province ?? '',
          city_municipality: p.address_city ?? '',
          barangay: p.address_barangay ?? '',
          street_address: p.address_street ?? '',
        });
      })
      .catch(() => setToast({ type: 'error', message: 'Failed to load shop profile.' }))
      .finally(() => setLoading(false));
  }, []);

  const handleImagePick = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File) => void,
    setPreview: (s: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
    e.target.value = '';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
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
    form.append('address_province', address.province);
    form.append('address_city', address.city_municipality);
    form.append('address_barangay', address.barangay);
    form.append('address_street', address.street_address.trim());
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
      } else {
        setToast({ type: 'error', message: 'Failed to save. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopySlug = () => {
    const slug = profile?.shop_slug ?? '';
    navigator.clipboard.writeText(`velure.com/shop/${slug}`);
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

  return (
    <div ref={pageRef} className="max-w-3xl mx-auto space-y-5">

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleImagePick(e, setLogoFile, setLogoPreview)} />
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleImagePick(e, setBannerFile, setBannerPreview)} />

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Profile Header Card ── */}
        <Card className="overflow-hidden">

          {/* Banner — avatar is absolutely pinned to its bottom-left, LinkedIn-style */}
          <div className="relative h-36 bg-gradient-to-br from-gray-100 to-gray-200 cursor-pointer group"
            onClick={() => bannerInputRef.current?.click()}>
            {bannerSrc
              ? <img src={bannerSrc} alt="Shop banner" className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300">
                  <Camera className="w-8 h-8" />
                  <span className="text-[12px] font-semibold">Click to upload banner</span>
                </div>
              )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <button type="button" onClick={(e) => { e.stopPropagation(); bannerInputRef.current?.click(); }}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-colors">
              <Camera className="w-3 h-3" /> Edit Banner
            </button>
            {bannerFile && (
              <span className="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">New</span>
            )}
            {/* Avatar pinned to bottom-left of banner, half overlapping */}
            <div className="absolute -bottom-10 left-6 group/avatar w-28 h-28 rounded-full border-4 border-white shadow-lg bg-gray-100 cursor-pointer overflow-hidden z-10"
              onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}>
              {logoSrc
                ? <img src={logoSrc} alt="Shop logo" className="w-full h-full object-cover" />
                : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-red to-brand-red-dark text-white text-3xl font-black">
                    {initials(user?.first_name ?? '', user?.last_name ?? '')}
                  </div>
                )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-full">
                <Pencil className="w-5 h-5 text-white" />
              </div>
              {logoFile && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
              )}
            </div>
          </div>
          {/* Identity */}
          <div className="px-6 pt-14 pb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-black text-gray-900 leading-tight">
                {shopName || 'Your Shop Name'}
              </h1>
              {isApproved && (
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> Verified Seller
                </span>
              )}
              <button type="button"
                onClick={() => { shopInfoRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="text-gray-300 hover:text-brand-red transition-colors shrink-0">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{shopCategory || 'Line of business'}</p>
            <InlineBio value={shopBio} onChange={setShopBio} />
            {profile?.shop_slug && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[11px] text-gray-400 truncate">velure.com/shop/{profile.shop_slug}</span>
                <button type="button" onClick={handleCopySlug} className="text-gray-300 hover:text-brand-red transition-colors shrink-0">
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Stats Row ── */}
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-gray-100">
            {[
              {
                icon: Star,
                label: 'Rating',
                value: profile?.avg_rating ? `${profile.avg_rating} ★` : '—',
                color: 'text-amber-500',
              },
              {
                icon: Users,
                label: 'Followers',
                value: profile?.follower_count ? profile.follower_count.toLocaleString() : '0',
                color: 'text-gray-400',
              },
              {
                icon: Package,
                label: 'Products',
                value: profile?.total_products?.toString() ?? '0',
                color: 'text-gray-400',
              },
              {
                icon: MessageCircle,
                label: 'Response',
                value: RESPONSE_TIME_OPTIONS.find((o) => o.value === profile?.response_time)?.label ?? '—',
                color: 'text-gray-400',
              },
              {
                icon: ExternalLink,
                label: 'Member Since',
                value: formatJoinDate(profile?.created_at ?? null),
                color: 'text-gray-400',
              },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex flex-col items-center justify-center py-3 px-2 gap-0.5">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <p className="text-[12px] font-bold text-gray-800 text-center leading-tight">{value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </Card>


        {/* ── About ── */}
        <Card>
          <CardHeader title="About" />
          <div className="px-6 py-5">
            <AboutSection value={shopDescription} onChange={setShopDescription} error={errors.shop_description} />
          </div>
        </Card>

        {/* ── Shop Policies ── */}
        <Card>
          <CardHeader icon={Shield} title="Shop Policies & Returns" />
          <div className="px-6 py-5 space-y-5">
            {/* Platform Baseline Policy Banner */}
            <div className="p-4 bg-rose-50/60 border border-brand-red/20 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-brand-red">
                <Shield className="w-4 h-4 text-brand-red" />
                <span>Velure Guaranteed Platform Policy (Active & Platform-Enforced)</span>
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed">
                All shops operate under Velure's 7-day standard return baseline for eligible items upon delivery (exceptions: Food & Groceries and custom-made items). Velure provides binding dispute mediation if returns are contested.
              </p>
            </div>

            <EditableTextCard
              icon={undefined}
              title="Additional Return Terms"
              subtitle="Add extra terms specific to your shop (e.g. original packaging requirements, inspection notes). Note: These supplement and cannot override Velure's baseline return window."
              value={returnPolicy}
              onChange={setReturnPolicy}
              placeholder="e.g. Items must be returned in original branded box with all accessories intact..."
              maxLen={500}
              error={errors.return_policy}
              rows={3}
            />
            <EditableTextCard
              icon={undefined}
              title="Shipping Details"
              subtitle="Specify your dispatch handling time, preferred couriers, or local pickup guidelines."
              value={shippingPolicy}
              onChange={setShippingPolicy}
              placeholder="e.g. Orders placed before 2PM ship the same day via standard logistics..."
              maxLen={500}
              error={errors.shipping_policy}
              rows={3}
            />
          </div>
        </Card>

        {/* ── Business Hours & Response Time ── */}
        <Card>
          <CardHeader icon={Clock} title="Business Hours & Response Time" />
          <div className="px-6 py-5 grid sm:grid-cols-2 gap-5">
            <Field label="Business Hours" error={errors.business_hours}>
              <input
                type="text"
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                placeholder="e.g. Mon–Sat, 9AM–6PM"
                maxLength={100}
                className={inputCls(errors.business_hours)}
              />
            </Field>
            <Field label="Response Time" error={errors.response_time}>
              <CustomSelect
                options={RESPONSE_TIME_OPTIONS}
                value={responseTime}
                onChange={setResponseTime}
                placeholder="Select response time"
              />
            </Field>
          </div>
        </Card>

        {/* ── Contact & Location ── */}
        <Card>
          <CardHeader
            icon={MapPin}
            title="Contact & Location"
            action={
              <div className="flex items-center gap-2">
                {!editingContact && (
                  <button type="button" onClick={() => setEditingContact(true)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {!editingLocation && (
                  <button type="button" onClick={() => setEditingLocation(true)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-brand-red transition-colors">
                    <MapPin className="w-3.5 h-3.5" /> Address
                  </button>
                )}
              </div>
            }
          />
          <div className="px-6 py-5 space-y-5">
            {/* Contact number */}
            {editingContact ? (
              <div className="space-y-3">
                <Field label="Shop Contact Number" error={errors.shop_contact_number}>
                  <div className="flex items-center gap-2">
                    <input
                      type="tel"
                      value={shopContactNumber}
                      onChange={(e) => setShopContactNumber(e.target.value.replace(/[^0-9+]/g, ''))}
                      placeholder="+63 9XX XXX XXXX"
                      maxLength={20}
                      className={inputCls(errors.shop_contact_number)}
                    />
                    <button type="button" onClick={() => setEditingContact(false)}
                      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </Field>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Contact</p>
                  <p className="text-[13px] text-gray-700 font-medium truncate">
                    {shopContactNumber || <span className="text-gray-400 italic">Not set</span>}
                  </p>
                </div>
                <button type="button" onClick={() => setEditingContact(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-brand-red">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Address */}
            {editingLocation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Shop Address</p>
                  <button type="button" onClick={() => setEditingLocation(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <AddressFields value={address} onChange={setAddress} errors={errors} />
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <LocationDisplay address={address} />
                <button type="button" onClick={() => setEditingLocation(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-brand-red">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Shop Information (hidden anchor for scroll-to) ── */}
        <div ref={shopInfoRef}>
          <Card>
            <CardHeader icon={Store} title="Shop Information" />
            <div className="px-6 py-5 space-y-5">
              <Field label="Shop Name" required error={errors.shop_name}>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="Your shop name"
                  maxLength={100}
                  className={inputCls(errors.shop_name)}
                />
              </Field>
              <Field label="Line of Business / Category" error={errors.shop_category}>
                <CustomSelect
                  options={[{"value":"Electronics & Gadgets","label":"Electronics & Gadgets"},{"value":"Fashion & Apparel","label":"Fashion & Apparel"},{"value":"Food & Beverage","label":"Food & Beverage"},{"value":"Health & Beauty","label":"Health & Beauty"},{"value":"Home & Living","label":"Home & Living"},{"value":"Sports & Outdoors","label":"Sports & Outdoors"},{"value":"Toys & Hobbies","label":"Toys & Hobbies"},{"value":"Books & Stationery","label":"Books & Stationery"},{"value":"Automotive","label":"Automotive"},{"value":"Pet Supplies","label":"Pet Supplies"},{"value":"Services","label":"Services"},{"value":"Other","label":"Other"}]}
                  value={shopCategory}
                  onChange={setShopCategory}
                  placeholder="Select your line of business"
                  error={errors.shop_category}
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* ── Account Information ── */}
        <Card>
          <CardHeader icon={Shield} title="Account Information" />
          <div className="px-6 py-5 space-y-4">
            {[
              { label: 'Full Name', value: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() },
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Phone', value: user?.phone ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                </div>
                <p className="text-[13px] text-gray-700 font-medium flex-1 truncate">{value || '—'}</p>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Status</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle2 className="w-3 h-3" /> Approved Seller
              </span>
            </div>
            <div className="pt-1 border-t border-gray-100">
              <a href="/seller/account-settings"
                className="text-[12px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
                Edit name, phone or photo → Account Settings
              </a>
            </div>
          </div>
        </Card>

        {/* ── Save Bar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-[12px] text-gray-400 hidden sm:block">
              Changes are saved to your shop profile and visible to buyers.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="ml-auto flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 text-white text-[13px] font-bold px-6 py-2.5 rounded-xl transition-colors min-h-[44px]"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Changes'}
            </button>
          </div>
        </div>

      </form>

      {/* ── Toast ── */}
      {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}

    </div>
  );
}
