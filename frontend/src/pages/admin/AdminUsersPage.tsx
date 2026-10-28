import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useLocation } from 'react-router-dom';
import { getAdminUsersApi, suspendUserApi, reactivateUserApi } from '../../api/client';
import type { User, Role, UserStatus, RiderStatus } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { X, ZoomIn, Users, ShieldOff, CalendarDays, UserCheck, Store, Bike, Phone, MapPin, Warehouse, ArrowRight } from 'lucide-react';
import { getBuyerIdImageUrl, getBuyerIdImageBackUrl } from '../../api/client';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  type ListMeta, FilterPanel, SearchField, ListCard, ListPager, ListEmpty, ListError, Pill, Avatar, RowAction,
  SkeletonRows, SkeletonCards, SkeletonTiles, TH, TD, ROW, rowKeys, formatShortDate, useDebouncedSearch, useViewMode, ViewToggle,
  RailCard, SplitBar, CardGrid, TileShell,
} from '../../components/admin/listKit';

const STATUS_BADGE: Record<UserStatus, 'approved' | 'rejected' | 'pending'> = {
  active:    'approved',
  suspended: 'rejected',
  unverified: 'pending',
  pending_activation: 'pending',
};

/** The account pill: only an admin's suspension reads "Suspended"; an unfinished sign-up is not one. */
const STATUS_PILL: Record<UserStatus, { label: string; tone: 'emerald' | 'red' | 'amber' }> = {
  active: { label: 'Active', tone: 'emerald' },
  suspended: { label: 'Suspended', tone: 'red' },
  unverified: { label: 'Unverified', tone: 'amber' },
  pending_activation: { label: 'Not activated', tone: 'amber' },
};

/** A buyer's government ID check: orders open once it is approved (Buyer Applications). */
const ID_PILL: Record<'approved' | 'pending' | 'rejected' | 'none', { label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }> = {
  approved: { label: 'ID verified', tone: 'emerald' },
  pending: { label: 'ID pending', tone: 'amber' },
  rejected: { label: 'ID rejected', tone: 'red' },
  none: { label: 'No ID yet', tone: 'gray' },
};

/** What the admin sees instead of Suspend / Reactivate for an account that has not finished signing up. */
const NOT_FINISHED: Partial<Record<UserStatus, string>> = {
  unverified: 'Waiting for the email code',
  pending_activation: 'Waiting for the activation link',
};

const RIDER_STATUS_LABEL: Record<RiderStatus, string> = {
  PENDING: 'Waiting for verification',
  ACTIVE: 'Active',
  DISAPPROVED: 'Not approved',
  PENDING_ACTIVATION: 'Pending activation',
  SUSPENDED: 'Suspended by courier',
};

const RIDER_STATUS_TONE: Record<RiderStatus, 'amber' | 'emerald' | 'red'> = {
  PENDING: 'amber',
  ACTIVE: 'emerald',
  DISAPPROVED: 'red',
  PENDING_ACTIVATION: 'amber',
  SUSPENDED: 'red',
};

const REQUIRES_BACK_ID_TYPES = new Set([
  'drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id',
]);

const PER_PAGE_OPTIONS = [30, 50, 100];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function calcAge(dob: string | null): string {
  if (!dob) return '—';
  const diff = Date.now() - new Date(dob).getTime();
  return String(Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)));
}

function formatIdType(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── ID Lightbox ───────────────────────────────────────────────────────────────

function IdLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-medium"
        >
          <X className="w-4 h-4" /> Close
        </button>
        <img
          src={url}
          alt="Government ID"
          className="w-full rounded-xl object-contain max-h-[80vh] bg-white shadow-2xl"
        />
      </div>
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        {title && <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>}
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="ghost" className="!min-h-[38px] !px-4 text-sm" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} className="!min-h-[38px] !px-4 text-sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Info helpers ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value || '—'}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold text-brand-red uppercase tracking-[0.12em] mb-3 mt-1">
      {children}
    </h3>
  );
}

// ── ID Image Row ──────────────────────────────────────────────────────────────

function IdImageRow({
  label, idType, blobUrl, onView,
}: {
  label: string;
  idType: string | null | undefined;
  blobUrl: string | null | undefined;
  onView: (url: string) => void;
}) {
  if (blobUrl === undefined) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 animate-pulse" />
        <p className="text-xs text-gray-400 italic">Loading {label.toLowerCase()}…</p>
      </div>
    );
  }
  if (!blobUrl) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-400 italic">No {label.toLowerCase()} uploaded.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <ZoomIn className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          {idType && <p className="text-[11px] text-gray-400">{formatIdType(idType)}</p>}
        </div>
      </div>
      <button
        onClick={() => onView(blobUrl)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red border border-brand-red/30 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <ZoomIn className="w-3.5 h-3.5" /> View
      </button>
    </div>
  );
}

// ── Buyer Details Modal ───────────────────────────────────────────────────────

function BuyerDetailsModal({
  user,
  onClose,
  onSuspend,
  onActivate,
  acting,
}: {
  user: User;
  onClose: () => void;
  onSuspend: (u: User) => void;
  onActivate: (u: User) => void;
  acting: boolean;
}) {
  const [lightboxUrl,  setLightboxUrl]  = useState<string | null>(null);
  const [confirm,      setConfirm]      = useState<'suspend' | 'activate' | null>(null);
  const [frontBlobUrl, setFrontBlobUrl] = useState<string | null | undefined>(undefined);
  const [backBlobUrl,  setBackBlobUrl]  = useState<string | null | undefined>(undefined);

  const isRider = user.role === 'rider';

  // Fetch front ID image (riders have none here: their documents are reviewed by their hub)
  useEffect(() => {
    if (isRider) { setFrontBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getBuyerIdImageUrl(user.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setFrontBlobUrl(objectUrl); })
      .catch(() => setFrontBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user.id, isRider]);

  // Fetch back ID image only if the ID type requires it
  useEffect(() => {
    if (isRider || !REQUIRES_BACK_ID_TYPES.has(user.government_id_type ?? '')) { setBackBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getBuyerIdImageBackUrl(user.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBackBlobUrl(objectUrl); })
      .catch(() => setBackBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user.id, user.government_id_type, isRider]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightboxUrl && !confirm) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, lightboxUrl, confirm]);

  const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{isRider ? 'Rider Details' : 'Buyer Details'}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{isRider ? 'Account and courier profile' : 'Registered account information'}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                label={user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                variant={STATUS_BADGE[user.status]}
              />
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Meta strip */}
          <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100 flex items-center gap-4">
            <p className="text-sm font-bold text-gray-800">{fullName}</p>
            <span className="w-px h-4 bg-gray-300 shrink-0" />
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 font-medium">Registered</span>
              <span className="text-xs font-semibold text-gray-700">
                {new Date(user.created_at ?? '').toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Body — two columns */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT — Personal Info + Avatar */}
              <div className="space-y-5">
                <div>
                  <SectionHeading>Personal Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Last Name"      value={user.last_name} />
                    <InfoRow label="First Name"     value={user.first_name} />
                    <InfoRow label="Middle Initial" value={user.middle_name} />
                    <InfoRow label="Sex"            value={user.sex ? user.sex.charAt(0).toUpperCase() + user.sex.slice(1) : null} />
                    <InfoRow label="Birthday"       value={user.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : null} />
                    <InfoRow label="Age"            value={user.date_of_birth ? String(Math.floor((Date.now() - new Date(user.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))) : null} />
                  </div>
                </div>

                {/* Avatar */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Profile Photo</p>
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={fullName}
                      className="w-full aspect-square rounded-2xl object-cover border border-gray-200 shadow-sm"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-2xl bg-gray-100 border border-gray-200 flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-brand-red/10 flex items-center justify-center">
                        <span className="text-3xl font-black text-brand-red">
                          {user.first_name?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-medium">No photo uploaded</p>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Contact + Address + ID + Account */}
              <div className="space-y-5">
                <div>
                  <SectionHeading>Contact Information</SectionHeading>
                  <div className="grid grid-cols-1 gap-4">
                    <InfoRow label="Email"          value={user.email} />
                    <InfoRow label="Contact Number" value={user.phone} />
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>Address</SectionHeading>
                  {user.default_address ? (
                    <div className="grid grid-cols-1 gap-4">
                      <InfoRow label="Province"            value={user.default_address.province} />
                      <InfoRow label="City / Municipality" value={user.default_address.city_municipality} />
                      <InfoRow label="Barangay"            value={user.default_address.barangay} />
                      <InfoRow label="Street Address"      value={user.default_address.street_address} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No address on file.</p>
                  )}
                </div>

                <div className="border-t border-gray-100" />

                {isRider && user.rider ? (
                  <div>
                    <SectionHeading>Courier Profile</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                      <InfoRow label="Logistics Hub" value={user.rider.hub_name} />
                      <InfoRow label="Hub Application" value={RIDER_STATUS_LABEL[user.rider.status]} />
                      <InfoRow label="Vehicle" value={user.rider.vehicle_type} />
                      <InfoRow label="Plate Number" value={user.rider.plate_number} />
                    </div>
                    <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                      A rider is approved by the logistics hub they chose, which also reviews their documents. The admin
                      can only suspend or reactivate the account.
                    </p>
                  </div>
                ) : isRider ? (
                  <p className="text-sm text-gray-400 italic">No courier profile on file.</p>
                ) : (
                <div>
                  <SectionHeading>ID Verification</SectionHeading>
                  <div className="space-y-3">
                    <IdImageRow
                      label="Front of ID"
                      idType={user.government_id_type}
                      blobUrl={frontBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
                    {REQUIRES_BACK_ID_TYPES.has(user.government_id_type ?? '') && (
                      <IdImageRow
                        label="Back of ID"
                        idType={user.government_id_type}
                        blobUrl={backBlobUrl}
                        onView={(url) => setLightboxUrl(url)}
                      />
                    )}
                  </div>
                </div>
                )}

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>Account Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Role"   value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} />
                    <InfoRow label="Status" value={user.status.charAt(0).toUpperCase() + user.status.slice(1)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
            <Button variant="ghost" className="!min-h-[38px] !px-5 text-sm" onClick={onClose}>
              Close
            </Button>
            {user.status === 'active' ? (
              <Button
                variant="danger"
                className="!min-h-[38px] !px-5 text-sm"
                loading={acting}
                onClick={() => setConfirm('suspend')}
              >
                Suspend Account
              </Button>
            ) : user.status === 'suspended' ? (
              <Button
                variant="secondary"
                className="!min-h-[38px] !px-5 text-sm"
                loading={acting}
                onClick={() => setConfirm('activate')}
              >
                Activate Account
              </Button>
            ) : (
              // Not suspended: they have not finished signing up (email code, or a rider's activation link).
              <span className="text-[12.5px] text-gray-500">{NOT_FINISHED[user.status] ?? ''}</span>
            )}
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <IdLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {confirm === 'suspend' && (
        <ConfirmDialog
          title="Suspend Account?"
          message={`${fullName}'s account will be suspended. They will not be able to log in until reactivated.`}
          confirmLabel="Suspend Account"
          confirmVariant="danger"
          onConfirm={() => { setConfirm(null); onSuspend(user); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'activate' && (
        <ConfirmDialog
          title="Activate Account?"
          message={`${fullName}'s account will be reactivated and they will be able to log in again.`}
          confirmLabel="Activate Account"
          confirmVariant="primary"
          onConfirm={() => { setConfirm(null); onActivate(user); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface PageConfig { title: string; noun: [string, string]; icon: React.ElementType; subtitle: string }

const PAGE_CONFIG: Record<'seller' | 'buyer' | 'rider' | 'all', PageConfig> = {
  seller: { title: 'Sellers',   noun: ['seller', 'sellers'], icon: Store, subtitle: 'Approved shops and the accounts behind them' },
  buyer:  { title: 'Buyers',    noun: ['buyer', 'buyers'],   icon: Users, subtitle: 'Shopper accounts registered on the platform' },
  rider:  { title: 'Riders',    noun: ['rider', 'riders'],   icon: Bike,  subtitle: 'Couriers, approved by the logistics hub they chose' },
  all:    { title: 'All Users', noun: ['user', 'users'],     icon: Users, subtitle: 'Every account on the platform' },
};

interface Counts { all: number; active: number; suspended: number }

/** A label over a value, for the details grid on a profile card. */
function Meta({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
        <Icon className="w-3 h-3" aria-hidden="true" />{label}
      </dt>
      <dd className="mt-0.5 text-[12px] font-medium text-gray-800 truncate">{children}</dd>
    </div>
  );
}

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const pathRole: 'seller' | 'buyer' | 'rider' | 'all' =
    location.pathname === '/admin/sellers' ? 'seller' :
    location.pathname === '/admin/buyers'  ? 'buyer'  :
    location.pathname === '/admin/riders'  ? 'rider'  : 'all';
  const config = PAGE_CONFIG[pathRole];

  const statusParam  = (searchParams.get('status') ?? '') as UserStatus | '';
  const searchParam  = searchParams.get('search') ?? '';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 30);

  const [users,    setUsers]    = useState<User[]>([]);
  const [meta,     setMeta]     = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [counts,   setCounts]   = useState<Counts | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [failed,   setFailed]   = useState(false);
  const [acting,   setActing]   = useState<number | null>(null);
  const [selected,      setSelected]      = useState<User | null>(null);
  const [quickConfirm,  setQuickConfirm]  = useState<{ user: User; action: 'suspend' | 'activate' } | null>(null);
  const [view, setView] = useViewMode(`people_${pathRole}`);

  const role = pathRole !== 'all' ? (pathRole as Role) : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getAdminUsersApi({
        role,
        status:   statusParam || undefined,
        search:   searchParam || undefined,
        page:     pageParam,
        per_page: perPageParam,
      });
      setUsers(res.data);
      setMeta(res.meta as ListMeta);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [role, statusParam, searchParam, pageParam, perPageParam]);

  // Totals for the whole role, not just the page on screen.
  const loadCounts = useCallback(async () => {
    try {
      const [all, active, suspended] = await Promise.all([
        getAdminUsersApi({ role, per_page: 1 }),
        getAdminUsersApi({ role, status: 'active', per_page: 1 }),
        getAdminUsersApi({ role, status: 'suspended', per_page: 1 }),
      ]);
      setCounts({ all: all.meta.total, active: active.meta.total, suspended: suspended.meta.total });
    } catch {
      setCounts(null);
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCounts(null); loadCounts(); }, [loadCounts]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  function setPerPage(n: number) {
    const next = new URLSearchParams(searchParams);
    next.set('per_page', String(n));
    next.delete('page');
    setSearchParams(next);
  }

  const [searchInput, setSearchInput] = useDebouncedSearch(searchParam, (v) => setParam('search', v));

  async function handleSuspend(user: User) {
    setActing(user.id);
    try {
      const updated = await suspendUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      loadCounts();
    } finally { setActing(null); }
  }

  async function handleReactivate(user: User) {
    setActing(user.id);
    try {
      const updated = await reactivateUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      loadCounts();
    } finally { setActing(null); }
  }

  const isSeller = pathRole === 'seller';
  const isRider  = pathRole === 'rider';
  const isAll    = pathRole === 'all';
  const colCount = 5 + (isSeller ? 1 : 0) + (isRider ? 2 : 0) + (isAll ? 1 : 0);

  const fullName = (u: User) => `${u.first_name} ${u.last_name}`.trim();

  const actionFor = (user: User) => user.status === 'active' ? (
    <RowAction tone="danger" loading={acting === user.id} onClick={() => setQuickConfirm({ user, action: 'suspend' })} label={`Suspend ${fullName(user)}`}>
      <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" /> Suspend
    </RowAction>
  ) : user.status === 'suspended' ? (
    <RowAction tone="success" loading={acting === user.id} onClick={() => setQuickConfirm({ user, action: 'activate' })} label={`Reactivate ${fullName(user)}`}>
      <UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> Reactivate
    </RowAction>
  ) : (
    // An account that has not finished signing up is not suspended: reactivating it would skip the email code.
    <span className="text-[12px] text-gray-400">{NOT_FINISHED[user.status] ?? ''}</span>
  );

  const accountPill = (status: UserStatus) => <Pill tone={STATUS_PILL[status].tone}>{STATUS_PILL[status].label}</Pill>;
  // On the Buyers page: whether the buyer can order yet (their ID check), next to the account status.
  const idPill = (user: User) => {
    if (pathRole !== 'buyer') return null;
    const p = ID_PILL[(user.buyer_application_status as 'approved' | 'pending' | 'rejected' | null) ?? 'none'] ?? ID_PILL.none;
    return <Pill tone={p.tone}>{p.label}</Pill>;
  };

  const filtered = Boolean(searchParam || statusParam);
  const clearAll = () => { setSearchInput(''); const next = new URLSearchParams(searchParams); next.delete('search'); next.delete('status'); next.delete('page'); setSearchParams(next); };
  const empty = (
    <ListEmpty icon={config.icon} title={`No ${config.noun[1]} yet`} hint="Accounts appear here as soon as they register." filtered={filtered} onClear={clearAll} />
  );

  const listHeading = statusParam === 'active' ? `Active ${config.noun[1]}` : statusParam === 'suspended' ? `Suspended ${config.noun[1]}` : `All ${config.noun[1]}`;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={config.icon} eyebrow="People" title={config.title} subtitle={config.subtitle}>
        {counts && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/10 text-white/80 border border-white/10">
            <Users className="w-3 h-3" aria-hidden="true" />
            {counts.all} {counts.all === 1 ? config.noun[0] : config.noun[1]}
          </span>
        )}
      </PageHero>

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ── Overview rail ── */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {!counts ? (
              [1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard compact icon={config.icon} label={`All ${config.noun[1]}`} value={counts.all} subtext="Registered"
                  iconBg="bg-violet-50" iconColor="text-violet-600" onClick={() => setParam('status', '')} active={statusParam === ''} />
                <StatCard compact icon={UserCheck} label="Active" value={counts.active} subtext="Can sign in"
                  iconBg="bg-emerald-50" iconColor="text-emerald-600" onClick={() => setParam('status', 'active')} active={statusParam === 'active'} />
                <StatCard compact icon={ShieldOff} label="Suspended" value={counts.suspended} subtext="Blocked"
                  iconBg="bg-red-50" iconColor="text-red-600" onClick={() => setParam('status', 'suspended')} active={statusParam === 'suspended'} />
              </>
            )}
          </div>
          {counts && (
            <RailCard title="Account health">
              <SplitBar parts={[
                { label: 'Active', value: counts.active, color: 'bg-emerald-500' },
                { label: 'Suspended', value: counts.suspended, color: 'bg-red-500' },
              ]} />
            </RailCard>
          )}
          {isRider && (
            <RailCard title="Who approves riders">
              <p className="text-[11px] leading-relaxed text-gray-500">
                A rider is approved by the logistics hub they chose, which also checks their documents. Here you can only
                suspend or reactivate the account.
              </p>
            </RailCard>
          )}
        </aside>

        {/* ── Directory ── */}
        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex items-center gap-2">
              <SearchField
                value={searchInput}
                onChange={setSearchInput}
                label={`Search ${config.noun[1]}`}
                placeholder={isSeller ? 'Search name, email, phone or shop…' : 'Search name, email or phone…'}
              />
              <ViewToggle value={view} onChange={setView} />
            </div>
          </FilterPanel>

          {failed ? (
            <ListError message={`The ${config.noun[1]} could not be loaded.`} onRetry={load} />
          ) : (
            <ListCard title={listHeading} count={meta.total} busy={loading}>
              {view === 'grid' ? (
                users.length === 0 && !loading ? empty : (
                  <CardGrid>
                    {loading && users.length === 0 && <SkeletonTiles />}
                    {users.map((user) => (
                      <TileShell key={user.id} onOpen={() => setSelected(user)} dimmed={loading}>
                        <div className="flex items-start gap-3 p-4">
                          <Avatar name={fullName(user)} src={user.avatar_url} size="lg" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{fullName(user)}</p>
                              {accountPill(user.status)}
                            </div>
                            <p className="text-[11px] text-gray-400 truncate mt-0.5">{user.email}</p>
                            {pathRole === 'buyer' && <div className="mt-1.5">{idPill(user)}</div>}
                            {isSeller && user.seller_profile && (
                              <p className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-red-50 text-brand-red text-[11px] font-semibold max-w-full">
                                <Store className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="truncate">{user.seller_profile.shop_name}</span>
                              </p>
                            )}
                            {isAll && <p className="mt-1 text-[11px] font-semibold text-gray-500 capitalize">{user.role}</p>}
                          </div>
                        </div>

                        <dl className="grid grid-cols-2 px-4 pb-3 gap-x-3 gap-y-2.5">
                          <Meta icon={Phone} label="Phone">{user.phone || '—'}</Meta>
                          <Meta icon={CalendarDays} label="Joined">{formatShortDate(user.created_at)}</Meta>
                          {isRider && <Meta icon={Warehouse} label="Hub">{user.rider?.hub_name ?? '—'}</Meta>}
                          {isRider && <Meta icon={Bike} label="Vehicle">{user.rider ? `${user.rider.vehicle_type} · ${user.rider.plate_number}` : '—'}</Meta>}
                          {!isRider && user.default_address && (
                            <Meta icon={MapPin} label="Location">{user.default_address.city_municipality}, {user.default_address.province}</Meta>
                          )}
                        </dl>

                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                          {isRider && user.rider ? (
                            <Pill tone={RIDER_STATUS_TONE[user.rider.status]}>{RIDER_STATUS_LABEL[user.rider.status]}</Pill>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 group-hover:text-brand-red">
                              View profile <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </span>
                          )}
                          {actionFor(user)}
                        </div>
                      </TileShell>
                    ))}
                  </CardGrid>
                )
              ) : (
                <>
                  <div className="hidden md:block max-h-[68vh] overflow-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr>
                          <th scope="col" className={TH}>{config.noun[0]}</th>
                          {isSeller && <th scope="col" className={TH}>Shop</th>}
                          {isAll && <th scope="col" className={TH}>Role</th>}
                          {isRider && <th scope="col" className={TH}>Hub</th>}
                          {isRider && <th scope="col" className={TH}>Hub application</th>}
                          <th scope="col" className={`${TH} hidden lg:table-cell`}>Phone</th>
                          <th scope="col" className={TH}>Account</th>
                          <th scope="col" className={TH}>Joined</th>
                          <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loading && users.length === 0 && <SkeletonRows cols={colCount} />}
                        {!loading && users.length === 0 && <tr><td colSpan={colCount}>{empty}</td></tr>}
                        {users.map((user) => (
                          <tr key={user.id} {...rowKeys(() => setSelected(user))} className={`${ROW} ${loading ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={fullName(user)} src={user.avatar_url} size="md" />
                                <div className="min-w-0">
                                  <p className="font-semibold truncate text-brand-black">{fullName(user)}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            {isSeller && <td className={`${TD} text-gray-700`}>{user.seller_profile?.shop_name ?? <span className="text-gray-300">—</span>}</td>}
                            {isAll && <td className={`${TD} capitalize text-gray-700`}>{user.role}</td>}
                            {isRider && <td className={`${TD} text-gray-700`}>{user.rider?.hub_name ?? <span className="text-gray-300">—</span>}</td>}
                            {isRider && (
                              <td className={TD}>
                                {user.rider ? <Pill tone={RIDER_STATUS_TONE[user.rider.status]}>{RIDER_STATUS_LABEL[user.rider.status]}</Pill> : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                            <td className={`${TD} hidden lg:table-cell text-gray-600 tabular-nums`}>{user.phone || <span className="text-gray-300">—</span>}</td>
                            <td className={TD}><div className="flex flex-wrap gap-1">{accountPill(user.status)}{idPill(user)}</div></td>
                            <td className={`${TD} text-gray-500 whitespace-nowrap`}>{formatShortDate(user.created_at)}</td>
                            <td className={`${TD} text-right`}>{actionFor(user)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Below md the list view falls back to compact rows */}
                  <div className="divide-y divide-gray-100 md:hidden">
                    {loading && users.length === 0 && <SkeletonCards />}
                    {!loading && users.length === 0 && empty}
                    {users.map((user) => (
                      <div key={user.id} {...rowKeys(() => setSelected(user))} className={`flex items-center gap-3 p-3 ${ROW} ${loading ? 'opacity-60' : ''}`}>
                        <Avatar name={fullName(user)} src={user.avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate text-brand-black">{fullName(user)}</p>
                          <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                        </div>
                        {accountPill(user.status)}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <ListPager meta={meta} perPage={perPageParam} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={setPerPage} noun={config.noun} />
            </ListCard>
          )}
        </section>
      </div>

      {/* Standalone confirm — triggered from the row and card buttons */}
      {quickConfirm && createPortal(
        <ConfirmDialog
          title={quickConfirm.action === 'suspend' ? 'Suspend account?' : 'Reactivate account?'}
          message={
            quickConfirm.action === 'suspend'
              ? `${fullName(quickConfirm.user)} will not be able to sign in until the account is reactivated.`
              : `${fullName(quickConfirm.user)} will be able to sign in again.`
          }
          confirmLabel={quickConfirm.action === 'suspend' ? 'Suspend Account' : 'Reactivate Account'}
          confirmVariant={quickConfirm.action === 'suspend' ? 'danger' : 'primary'}
          onConfirm={() => {
            const { user, action } = quickConfirm;
            setQuickConfirm(null);
            if (action === 'suspend') handleSuspend(user);
            else handleReactivate(user);
          }}
          onCancel={() => setQuickConfirm(null)}
        />
      , document.body)}

      {/* Details Modal — has its own internal confirm */}
      {selected && createPortal(
        <BuyerDetailsModal
          user={selected}
          onClose={() => setSelected(null)}
          onSuspend={handleSuspend}
          onActivate={handleReactivate}
          acting={acting === selected.id}
        />
      , document.body)}
    </div>
  );
}
