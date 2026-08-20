import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getBuyerApplicationsApi,
  approveBuyerApi,
  rejectBuyerApi,
  getBuyerIdImageUrl,
  getBuyerIdImageBackUrl,
} from '../../api/client';
import type { User, BuyerApplicationSummary } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CustomSelect from '../../components/ui/CustomSelect';
import { Search, X, ChevronLeft, ChevronRight, ZoomIn, Clock, CalendarDays, Users } from 'lucide-react';

const PER_PAGE_OPTIONS = [30, 50, 100];

const REQUIRES_BACK_ID_TYPES = new Set([
  'drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id',
]);

interface Meta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function calcAge(dob: string | null): string {
  if (!dob) return '—';
  return String(Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
}

function formatIdType(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Mount animation ───────────────────────────────────────────────────────────

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

// ── Count-up ──────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const run = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(run);
    };
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return value;
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: BuyerApplicationSummary }) {
  const pending = useCountUp(summary.pending_total);
  const today   = useCountUp(summary.today);
  const week    = useCountUp(summary.this_week);

  const cards = [
    { label: 'Pending Applications', value: pending, icon: Clock,        color: 'text-amber-500',  bg: 'bg-amber-50'  },
    { label: 'Submitted Today',       value: today,   icon: CalendarDays, color: 'text-sky-500',    bg: 'bg-sky-50'    },
    { label: 'Submitted This Week',   value: week,    icon: Users,        color: 'text-violet-500', bg: 'bg-violet-50' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div>
            <p className="text-[22px] font-black text-gray-900 leading-none">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function PaginationBar({
  meta, perPage, onPage, onPerPage,
}: {
  meta: Meta; perPage: number;
  onPage: (p: number) => void; onPerPage: (n: number) => void;
}) {
  const { current_page, last_page, total, from, to } = meta;
  const pages: (number | '…')[] = [];
  if (last_page <= 7) {
    for (let i = 1; i <= last_page; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current_page > 3) pages.push('…');
    for (let i = Math.max(2, current_page - 1); i <= Math.min(last_page - 1, current_page + 1); i++) pages.push(i);
    if (current_page < last_page - 2) pages.push('…');
    pages.push(last_page);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <p className="text-sm font-semibold text-gray-700">
        {total === 0 ? 'No results' : (
          <>Showing <span className="text-brand-red">{from ?? 0}–{to ?? 0}</span> of <span className="text-brand-red">{total}</span> {total === 1 ? 'application' : 'applications'}</>
        )}
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
              <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">…</span>
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
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
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
  title, message, confirmLabel, confirmVariant, onConfirm, onCancel, children,
}: {
  title: string; message: string; confirmLabel: string;
  confirmVariant: 'primary' | 'danger';
  onConfirm: () => void; onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        {children}
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

// ── ID Image Row ─────────────────────────────────────────────────────────────

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

// ── Review Modal ──────────────────────────────────────────────────────────────

function ReviewModal({
  user,
  onClose,
  onApproved,
  onRejected,
}: {
  user: User;
  onClose: () => void;
  onApproved: (id: number) => void;
  onRejected: (id: number) => void;
}) {
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null);
  const [dialog,        setDialog]        = useState<'approve' | 'reject' | null>(null);
  const [rejectReason,  setRejectReason]  = useState('');
  const [acting,        setActing]        = useState(false);
  const [frontBlobUrl,  setFrontBlobUrl]  = useState<string | null | undefined>(undefined);
  const [backBlobUrl,   setBackBlobUrl]   = useState<string | null | undefined>(undefined);

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

  // Fetch back ID image (only if the ID type requires a back)
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
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightboxUrl && !dialog) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, lightboxUrl, dialog]);

  const fullName = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ');

  async function handleApprove() {
    setActing(true);
    try { await approveBuyerApi(user.id); onApproved(user.id); }
    finally { setActing(false); }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setActing(true);
    try { await rejectBuyerApi(user.id, rejectReason); onRejected(user.id); }
    finally { setActing(false); }
  }

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
              <h2 className="text-lg font-bold text-gray-900">Buyer Application</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review registration before making a decision</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge label="Pending" variant="pending" />
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Applicant meta strip */}
          <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100 flex items-center gap-4">
            <p className="text-sm font-bold text-gray-800">{fullName}</p>
            <span className="w-px h-4 bg-gray-300 shrink-0" />
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 font-medium">Submitted</span>
              <span className="text-xs font-semibold text-gray-700">{formatDateTime(user.created_at)}</span>
            </div>
          </div>

          {/* Body — two columns */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT — Personal Information */}
              <div className="space-y-5">
                <div>
                  <SectionHeading>Personal Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Last Name"      value={user.last_name} />
                    <InfoRow label="First Name"     value={user.first_name} />
                    <InfoRow label="Middle Initial" value={user.middle_name} />
                    <InfoRow label="Sex"            value={user.sex ? user.sex.charAt(0).toUpperCase() + user.sex.slice(1) : null} />
                    <InfoRow label="Birthday"       value={formatDate(user.date_of_birth)} />
                    <InfoRow label="Age"            value={calcAge(user.date_of_birth)} />
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

              {/* RIGHT — Contact + Address + ID Verification */}
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
                      <InfoRow label="Province"         value={user.default_address.province} />
                      <InfoRow label="City / Municipality" value={user.default_address.city_municipality} />
                      <InfoRow label="Barangay"         value={user.default_address.barangay} />
                      <InfoRow label="Street Address"   value={user.default_address.street_address} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No address on file.</p>
                  )}
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>ID Verification</SectionHeading>

                  <div className="space-y-3">
                    {/* Front */}
                    <IdImageRow
                      label="Front of ID"
                      idType={user.government_id_type}
                      blobUrl={frontBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />

                    {/* Back — shown when back url exists OR when the ID type requires a back */}
                    {(!!user.government_id_image_back_url || REQUIRES_BACK_ID_TYPES.has(user.government_id_type ?? '')) && (
                      <IdImageRow
                        label="Back of ID"
                        idType={user.government_id_type}
                        blobUrl={backBlobUrl}
                        onView={(url) => setLightboxUrl(url)}
                      />
                    )}
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
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="!min-h-[38px] !px-5 text-sm"
                onClick={() => setDialog('reject')}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                className="!min-h-[38px] !px-5 text-sm"
                onClick={() => setDialog('approve')}
              >
                Approve Application
              </Button>
            </div>
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <IdLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Approve confirm */}
      {dialog === 'approve' && (
        <ConfirmDialog
          title="Approve Buyer Application?"
          message="This buyer will be approved and notified by email."
          confirmLabel="Approve"
          confirmVariant="primary"
          onConfirm={handleApprove}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* Reject confirm */}
      {dialog === 'reject' && (
        <ConfirmDialog
          title="Reject Buyer Application"
          message="Please provide a reason for rejecting this application."
          confirmLabel={acting ? 'Rejecting…' : 'Reject Application'}
          confirmVariant="danger"
          onConfirm={handleReject}
          onCancel={() => { setDialog(null); setRejectReason(''); }}
        >
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red resize-none"
          />
        </ConfirmDialog>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminBuyerApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchParam  = searchParams.get('search') ?? '';
  const sortParam    = searchParams.get('sort') ?? 'newest';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 30);

  const [applications, setApplications] = useState<User[]>([]);
  const [summary,      setSummary]      = useState<BuyerApplicationSummary>({ pending_total: 0, today: 0, this_week: 0 });
  const [meta,         setMeta]         = useState<Meta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState(searchParam);
  const [selected,     setSelected]     = useState<User | null>(null);

  const pageRef = useMountAnim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBuyerApplicationsApi({
        status:   'pending',
        search:   searchParam || undefined,
        sort:     sortParam,
        page:     pageParam,
        per_page: perPageParam,
      });
      setApplications(res.data);
      setMeta(res.meta as Meta);
      setSummary(res.summary);
    } finally {
      setLoading(false);
    }
  }, [searchParam, sortParam, pageParam, perPageParam]);

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

  function handleApproved(id: number) {
    setSelected(null);
    setApplications((prev) => prev.filter((u) => u.id !== id));
    setSummary((prev) => ({ ...prev, pending_total: Math.max(0, prev.pending_total - 1) }));
  }

  function handleRejected(id: number) {
    setSelected(null);
    setApplications((prev) => prev.filter((u) => u.id !== id));
    setSummary((prev) => ({ ...prev, pending_total: Math.max(0, prev.pending_total - 1) }));
  }

  return (
    <div ref={pageRef} className="space-y-6">

      {/* Page header */}
      <div
        className="rounded-2xl px-7 py-6 overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1">
          Admin / Applications
        </p>
        <h1 className="text-[26px] font-black text-white leading-tight tracking-tight">
          Buyer Applications
        </h1>
        <p className="text-[12px] text-white/50 mt-1.5">
          Review and verify pending buyer registrations
        </p>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} />

      {/* Search + sort toolbar */}
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
          value={sortParam}
          onChange={(v) => setParam('sort', v)}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first' },
          ]}
          className="sm:w-44"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Pending Applications</h2>
          {!loading && (
            <span className="text-xs text-gray-400 font-medium">{meta.total} total</span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-gray-500">No pending applications</p>
            <p className="text-xs text-gray-400 mt-1">All caught up — no applications waiting for review.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/60">
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Applicant</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Submitted</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {applications.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(user)}
                    className="hover:bg-red-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900 group-hover:text-brand-red transition-colors">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell text-gray-500 text-sm">
                      {user.phone || '—'}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-sm text-gray-700">{formatDate(user.created_at)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{relativeTime(user.created_at)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge label="Pending" variant="pending" />
                    </td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="primary"
                        className="!min-h-[34px] !px-4 text-xs"
                        onClick={() => setSelected(user)}
                      >
                        Review
                      </Button>
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

      {/* Review Modal */}
      {selected && createPortal(
        <ReviewModal
          user={selected}
          onClose={() => setSelected(null)}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />,
        document.body
      )}
    </div>
  );
}
