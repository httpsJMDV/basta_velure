import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useLocation } from 'react-router-dom';
import { getAdminUsersApi, suspendUserApi, reactivateUserApi } from '../../api/client';
import type { User, Role, UserStatus } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CustomSelect from '../../components/ui/CustomSelect';
import { Search, X, ChevronLeft, ChevronRight, ZoomIn, Users, ShieldOff, CalendarDays } from 'lucide-react';
import { getBuyerIdImageUrl, getBuyerIdImageBackUrl } from '../../api/client';

const STATUS_BADGE: Record<UserStatus, 'approved' | 'rejected'> = {
  active:    'approved',
  suspended: 'rejected',
};

const REQUIRES_BACK_ID_TYPES = new Set([
  'drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id',
]);

const PER_PAGE_OPTIONS = [30, 50, 100];

interface Meta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function calcAge(dob: string | null): string {
  if (!dob) return '—';
  const diff = Date.now() - new Date(dob).getTime();
  return String(Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)));
}

// ── Count-up animation ───────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from = 0;
    const run = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(run);
    };
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Mount fade-slide animation ───────────────────────────────────────────────

function useMountAnim() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
    const id = requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return ref;
}

function formatIdType(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Pagination ────────────────────────────────────────────────────────────────

function PaginationBar({
  meta,
  perPage,
  onPage,
  onPerPage,
}: {
  meta: Meta;
  perPage: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
}) {
  const { current_page, last_page, total, from, to } = meta;

  const pages: (number | '…')[] = [];
  if (last_page <= 7) {
    for (let i = 1; i <= last_page; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current_page > 3) pages.push('…');
    for (let i = Math.max(2, current_page - 1); i <= Math.min(last_page - 1, current_page + 1); i++) {
      pages.push(i);
    }
    if (current_page < last_page - 2) pages.push('…');
    pages.push(last_page);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <p className="text-sm font-semibold text-gray-700">
        {total === 0
          ? 'No results'
          : <>Showing <span className="text-brand-red">{from ?? 0}–{to ?? 0}</span> of <span className="text-brand-red">{total}</span> {total === 1 ? 'buyer' : 'buyers'}</> }
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600">Rows per page:</span>
          <CustomSelect
            value={String(perPage)}
            onChange={(v) => onPerPage(Number(v))}
            options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            className="w-24"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(current_page - 1)}
            disabled={current_page <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p as number)}
                className={[
                  'w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors',
                  p === current_page
                    ? 'bg-brand-red text-white'
                    : 'border border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red',
                ].join(' ')}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => onPage(current_page + 1)}
            disabled={current_page >= last_page}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
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

  // Fetch front ID image
  useEffect(() => {
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getBuyerIdImageUrl(user.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setFrontBlobUrl(objectUrl); })
      .catch(() => setFrontBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user.id]);

  // Fetch back ID image only if the ID type requires it
  useEffect(() => {
    if (!REQUIRES_BACK_ID_TYPES.has(user.government_id_type ?? '')) { setBackBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getBuyerIdImageBackUrl(user.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBackBlobUrl(objectUrl); })
      .catch(() => setBackBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [user.id, user.government_id_type]);

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
              <h2 className="text-lg font-bold text-gray-900">Buyer Details</h2>
              <p className="text-xs text-gray-400 mt-0.5">Registered account information</p>
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
            ) : (
              <Button
                variant="secondary"
                className="!min-h-[38px] !px-5 text-sm"
                loading={acting}
                onClick={() => setConfirm('activate')}
              >
                Activate Account
              </Button>
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

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const pathRole: Role | 'all' =
    location.pathname === '/admin/sellers' ? 'seller' :
    location.pathname === '/admin/buyers'  ? 'buyer'  :
    location.pathname === '/admin/riders'  ? 'rider'  : 'all';

  const statusParam  = (searchParams.get('status') ?? '') as UserStatus | '';
  const searchParam  = searchParams.get('search') ?? '';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 30);

  const [users,    setUsers]    = useState<User[]>([]);
  const [meta,     setMeta]     = useState<Meta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState(searchParam);
  const [acting,   setActing]   = useState<number | null>(null);
  const [selected,      setSelected]      = useState<User | null>(null);
  const [quickConfirm,  setQuickConfirm]  = useState<{ user: User; action: 'suspend' | 'activate' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminUsersApi({
        role:     pathRole !== 'all' ? pathRole : undefined,
        status:   statusParam || undefined,
        search:   searchParam || undefined,
        page:     pageParam,
        per_page: perPageParam,
      });
      setUsers(res.data);
      setMeta(res.meta as Meta);
    } finally {
      setLoading(false);
    }
  }, [pathRole, statusParam, searchParam, pageParam, perPageParam]);

  useEffect(() => { load(); }, [load]);

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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam('search', search);
  }

  async function handleSuspend(user: User) {
    setActing(user.id);
    try {
      const updated = await suspendUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    } finally { setActing(null); }
  }

  async function handleReactivate(user: User) {
    setActing(user.id);
    try {
      const updated = await reactivateUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    } finally { setActing(null); }
  }

  const pageTitle =
    pathRole === 'buyer'  ? 'Buyers'  :
    pathRole === 'seller' ? 'Sellers' :
    pathRole === 'rider'  ? 'Riders'  : 'All Users';

  const activeCount    = useMemo(() => users.filter(u => u.status === 'active').length,    [users]);
  const suspendedCount = useMemo(() => users.filter(u => u.status === 'suspended').length, [users]);

  const animatedTotal     = useCountUp(meta.total);
  const animatedActive    = useCountUp(activeCount);
  const animatedSuspended = useCountUp(suspendedCount);

  const pageRef = useMountAnim();

  return (
    <div ref={pageRef} className="space-y-6">
      {/* Page header band */}
      <div
        className="rounded-2xl px-7 py-6 flex items-center justify-between gap-6 overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="relative z-10">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1">
            User Management
          </p>
          <h1 className="text-[26px] font-black text-white leading-tight tracking-tight">{pageTitle}</h1>
          <p className="text-[12px] text-white/50 mt-1.5">
            <span className="text-white font-bold">{animatedTotal}</span>
            {' '}registered {meta.total === 1 ? pageTitle.slice(0, -1).toLowerCase() : pageTitle.toLowerCase()} on the platform
          </p>
        </div>

        <div className="relative z-10 hidden sm:flex items-center gap-4">
          <div className="flex flex-col items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[22px] font-black text-white leading-none">
                {animatedActive}
              </span>
            </div>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Active</p>
          </div>
          <div className="flex flex-col items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3">
            <div className="flex items-center gap-1.5">
              <ShieldOff className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[22px] font-black text-white leading-none">
                {animatedSuspended}
              </span>
            </div>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Suspended</p>
          </div>
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={submitSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>
          <Button type="submit" variant="primary" className="shrink-0">Search</Button>
        </form>

        <CustomSelect
          value={statusParam}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
          className="sm:w-44"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/60">
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">User</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Phone</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden lg:table-cell">Registered</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(user)}
                    className="hover:bg-red-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-brand-black group-hover:text-brand-red transition-colors">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="capitalize text-gray-600">{user.role}</span>
                      {user.seller_profile && (
                        <p className="text-xs text-gray-400 mt-0.5">{user.seller_profile.shop_name}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        label={user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                        variant={STATUS_BADGE[user.status]}
                      />
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-gray-500">{user.phone || '—'}</td>
                    <td className="px-5 py-4 hidden lg:table-cell text-gray-500 text-xs">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      {user.status === 'active' ? (
                        <Button
                          variant="danger"
                          className="!min-h-[36px] !px-3 text-xs"
                          loading={acting === user.id}
                          onClick={() => setQuickConfirm({ user, action: 'suspend' })}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="!min-h-[36px] !px-3 text-xs"
                          loading={acting === user.id}
                          onClick={() => setQuickConfirm({ user, action: 'activate' })}
                        >
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && meta.total > 0 && (
        <PaginationBar
          meta={meta}
          perPage={perPageParam}
          onPage={setPage}
          onPerPage={setPerPage}
        />
      )}

      {/* Standalone confirm — triggered from table row buttons only */}
      {quickConfirm && createPortal(
        <ConfirmDialog
          message={
            quickConfirm.action === 'suspend'
              ? `Suspend ${quickConfirm.user.first_name} ${quickConfirm.user.last_name}'s account? They will not be able to log in until reactivated.`
              : `Reactivate ${quickConfirm.user.first_name} ${quickConfirm.user.last_name}'s account?`
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

      {/* Buyer Details Modal — row click only, has its own internal confirm */}
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
