import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getSellerApplicationsApi,
  approveSellerApi,
  rejectSellerApi,
  getSellerIdImageUrl,
  getSellerIdImageBackUrl,
  getSellerBusinessPermitUrl,
} from '../../api/client';
import type { ApplicationStatus, SellerApplication } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CustomSelect from '../../components/ui/CustomSelect';
import { Search, X, ChevronLeft, ChevronRight, ZoomIn, Clock, Store, CheckCircle } from 'lucide-react';

const PER_PAGE_OPTIONS = [20, 30, 50];

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

function SummaryCards({ counts }: { counts: { pending: number; approved: number; rejected: number } }) {
  const pending  = useCountUp(counts.pending);
  const approved = useCountUp(counts.approved);
  const rejected = useCountUp(counts.rejected);

  const cards = [
    { label: 'Pending Review',  value: pending,  icon: Clock,        color: 'text-amber-500',  bg: 'bg-amber-50'  },
    { label: 'Approved',        value: approved, icon: CheckCircle,  color: 'text-green-500',  bg: 'bg-green-50'  },
    { label: 'Active Sellers',  value: rejected, icon: Store,        color: 'text-violet-500', bg: 'bg-violet-50' },
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
          alt="Document"
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

// ── Document Image Row ────────────────────────────────────────────────────────

function DocImageRow({
  label, subtitle, blobUrl, onView,
}: {
  label: string;
  subtitle?: string | null;
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
          {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
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
  app,
  onClose,
  onApproved,
  onRejected,
}: {
  app: SellerApplication;
  onClose: () => void;
  onApproved: (id: number) => void;
  onRejected: (id: number) => void;
}) {
  const [lightboxUrl,      setLightboxUrl]      = useState<string | null>(null);
  const [dialog,           setDialog]           = useState<'approve' | 'reject' | null>(null);
  const [rejectReason,     setRejectReason]     = useState('');
  const [acting,           setActing]           = useState(false);
  const [frontBlobUrl,     setFrontBlobUrl]     = useState<string | null | undefined>(undefined);
  const [backBlobUrl,      setBackBlobUrl]      = useState<string | null | undefined>(undefined);
  const [permitBlobUrl,    setPermitBlobUrl]    = useState<string | null | undefined>(undefined);

  const isPending = app.application_status === 'pending';

  // Fetch front ID
  useEffect(() => {
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getSellerIdImageUrl(app.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setFrontBlobUrl(objectUrl); })
      .catch(() => setFrontBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id]);

  // Fetch back ID
  useEffect(() => {
    if (!app.government_id_image_back_url) { setBackBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getSellerIdImageBackUrl(app.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBackBlobUrl(objectUrl); })
      .catch(() => setBackBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id, app.government_id_image_back_url]);

  // Fetch business permit
  useEffect(() => {
    if (!app.business_permit_url) { setPermitBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getSellerBusinessPermitUrl(app.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setPermitBlobUrl(objectUrl); })
      .catch(() => setPermitBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id, app.business_permit_url]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightboxUrl && !dialog) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, lightboxUrl, dialog]);

  const fullName = [app.user.first_name, app.user.middle_name, app.user.last_name].filter(Boolean).join(' ');

  async function handleApprove() {
    setActing(true);
    try { await approveSellerApi(app.id); onApproved(app.id); }
    finally { setActing(false); }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setActing(true);
    try { await rejectSellerApi(app.id, rejectReason); onRejected(app.id); }
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
              <h2 className="text-lg font-bold text-gray-900">Seller Application</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review shop details before making a decision</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge label={app.application_status} variant={app.application_status} />
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Applicant meta strip */}
          <div className="px-6 py-3 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-sm font-bold text-gray-800">{fullName}</p>
            <span className="w-px h-4 bg-gray-300 shrink-0 hidden sm:block" />
            <p className="text-xs text-gray-500 font-medium">
              Submitted <span className="font-semibold text-gray-700">{formatDateTime(app.submitted_at)}</span>
            </p>
            {app.rejection_reason && (
              <p className="text-xs text-red-600 font-medium w-full mt-0.5">
                Rejection reason: {app.rejection_reason}
              </p>
            )}
          </div>

          {/* Body — two columns */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT — Shop + Personal */}
              <div className="space-y-5">
                <div>
                  <SectionHeading>Shop Information</SectionHeading>
                  <div className="grid grid-cols-1 gap-4">
                    <InfoRow label="Shop Name"        value={app.shop_name} />
                    <InfoRow label="Line of Business" value={app.shop_category} />
                    <InfoRow label="Description"      value={app.shop_description} />
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>Personal Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Last Name"  value={app.user.last_name} />
                    <InfoRow label="First Name" value={app.user.first_name} />
                    <InfoRow label="Middle Name" value={app.user.middle_name} />
                    <InfoRow label="Sex"        value={app.user.sex ? app.user.sex.charAt(0).toUpperCase() + app.user.sex.slice(1) : null} />
                    <InfoRow label="Birthday"   value={formatDate(app.date_of_birth)} />
                    <InfoRow label="Age"        value={calcAge(app.date_of_birth)} />
                  </div>
                </div>
              </div>

              {/* RIGHT — Contact + GCash + Documents */}
              <div className="space-y-5">
                <div>
                  <SectionHeading>Contact Information</SectionHeading>
                  <div className="grid grid-cols-1 gap-4">
                    <InfoRow label="Email"          value={app.user.email} />
                    <InfoRow label="Contact Number" value={app.user.phone} />
                    <InfoRow label="GCash Number"   value={app.payout_gcash_number} />
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>Documents</SectionHeading>
                  <div className="space-y-3">
                    <DocImageRow
                      label="Government ID (Front)"
                      subtitle={formatIdType(app.government_id_type)}
                      blobUrl={frontBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
                    {!!app.government_id_image_back_url && (
                      <DocImageRow
                        label="Government ID (Back)"
                        blobUrl={backBlobUrl}
                        onView={(url) => setLightboxUrl(url)}
                      />
                    )}
                    <DocImageRow
                      label="Business Permit"
                      blobUrl={permitBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
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
            {isPending && (
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
                  loading={acting}
                  onClick={() => setDialog('approve')}
                >
                  Approve Application
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <IdLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {dialog === 'approve' && (
        <ConfirmDialog
          title="Approve Seller Application?"
          message="This seller will be approved and notified by email."
          confirmLabel={acting ? 'Approving…' : 'Approve'}
          confirmVariant="primary"
          onConfirm={handleApprove}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog === 'reject' && (
        <ConfirmDialog
          title="Reject Seller Application"
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

const TABS: { label: string; value: ApplicationStatus }[] = [
  { label: 'Pending',  value: 'pending'  },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

export default function AdminSellerApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam     = (searchParams.get('status') ?? 'pending') as ApplicationStatus;
  const searchParam  = searchParams.get('search') ?? '';
  const sortParam    = searchParams.get('sort') ?? 'newest';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 20);

  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [meta,         setMeta]         = useState<Meta>({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null });
  const [counts,       setCounts]       = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState(searchParam);
  const [selected,     setSelected]     = useState<SellerApplication | null>(null);

  const pageRef = useMountAnim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSellerApplicationsApi({
        status:   tabParam,
        search:   searchParam || undefined,
        sort:     sortParam,
        page:     pageParam,
        per_page: perPageParam,
      });
      setApplications(res.data);
      setMeta(res.meta as Meta);
    } finally {
      setLoading(false);
    }
  }, [tabParam, searchParam, sortParam, pageParam, perPageParam]);

  // Load counts for summary cards once on mount
  useEffect(() => {
    Promise.all([
      getSellerApplicationsApi({ status: 'pending',  per_page: 1 }),
      getSellerApplicationsApi({ status: 'approved', per_page: 1 }),
      getSellerApplicationsApi({ status: 'rejected', per_page: 1 }),
    ]).then(([p, a, r]) => {
      setCounts({ pending: p.meta.total, approved: a.meta.total, rejected: r.meta.total });
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  function setTab(value: ApplicationStatus) {
    const next = new URLSearchParams();
    next.set('status', value);
    setSearchParams(next);
    setSearch('');
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
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setCounts((prev) => ({ ...prev, pending: Math.max(0, prev.pending - 1), approved: prev.approved + 1 }));
    setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
  }

  function handleRejected(id: number) {
    setSelected(null);
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setCounts((prev) => ({ ...prev, pending: Math.max(0, prev.pending - 1), rejected: prev.rejected + 1 }));
    setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
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
          Seller Applications
        </h1>
        <p className="text-[12px] text-white/50 mt-1.5">
          Review and verify pending seller registrations
        </p>
      </div>

      {/* Summary cards */}
      <SummaryCards counts={counts} />

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 w-fit shadow-sm border border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={[
              'min-h-[40px] px-5 rounded-lg text-sm font-semibold transition-colors',
              tabParam === t.value ? 'bg-brand-red text-white' : 'text-gray-500 hover:text-brand-black',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={submitSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shop name, name, email…"
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
          <h2 className="text-sm font-bold text-gray-800 capitalize">{tabParam} Applications</h2>
          {!loading && (
            <span className="text-xs text-gray-400 font-medium">{meta.total} total</span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : applications.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-gray-500">No {tabParam} applications</p>
            <p className="text-xs text-gray-400 mt-1">Nothing here yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left bg-gray-50/60">
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Shop</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Applicant</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Submitted</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => setSelected(app)}
                    className="hover:bg-red-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900 group-hover:text-brand-red transition-colors">
                        {app.shop_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{app.shop_category || '—'}</p>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <p className="text-sm text-gray-700">{app.user.first_name} {app.user.last_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{app.user.email}</p>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-sm text-gray-700">{formatDate(app.submitted_at)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{relativeTime(app.submitted_at)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge label={app.application_status} variant={app.application_status} />
                    </td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="primary"
                        className="!min-h-[34px] !px-4 text-xs"
                        onClick={() => setSelected(app)}
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
          app={selected}
          onClose={() => setSelected(null)}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />,
        document.body
      )}
    </div>
  );
}
