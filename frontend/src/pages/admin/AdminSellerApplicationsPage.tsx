import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getSellerApplicationsApi,
  approveSellerApi,
  rejectSellerApi,
  getSellerIdImageUrl,
  getSellerIdImageBackUrl,
  getSellerSelfieUrl,
  getSellerBusinessPermitUrl,
  getSellerDtiSecRegistrationUrl,
} from '../../api/client';
import type { ApplicationStatus, SellerApplication } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CustomSelect from '../../components/ui/CustomSelect';
import { X, ZoomIn, Clock, Store, CheckCircle, XCircle, IdCard, Camera, FileText, ArrowRight } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  type ListMeta, type PillTone, FilterPanel, SearchField, ListCard, ListPager, ListEmpty, ListError, Pill, Avatar, RowAction,
  SkeletonRows, SkeletonCards, SkeletonTiles, TH, TD, ROW, rowKeys, useDebouncedSearch, useViewMode, ViewToggle,
  RailCard, Checklist, WaitingBadge, DocChip, CardGrid, TileShell,
} from '../../components/admin/listKit';

const PER_PAGE_OPTIONS = [20, 30, 50];

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

const SELLER_TYPE_LABEL: Record<string, string> = {
  individual: 'Individual',
  sole_proprietorship: 'Sole Proprietorship',
  corporation: 'Corporation',
};

function formatIdType(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Mount animation ───────────────────────────────────────────────────────────

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
  const [selfieBlobUrl,    setSelfieBlobUrl]    = useState<string | null | undefined>(undefined);
  const [permitBlobUrl,    setPermitBlobUrl]    = useState<string | null | undefined>(undefined);
  const [dtiSecBlobUrl,    setDtiSecBlobUrl]    = useState<string | null | undefined>(undefined);
  const [birBlobUrl,       setBirBlobUrl]       = useState<string | null | undefined>(undefined);

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

  // Fetch selfie with ID
  useEffect(() => {
    if (!app.selfie_with_id_url) { setSelfieBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getSellerSelfieUrl(app.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setSelfieBlobUrl(objectUrl); })
      .catch(() => setSelfieBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id, app.selfie_with_id_url]);

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

  // Fetch BIR Form 2303
  useEffect(() => {
    if (!app.bir_2303_url) { setBirBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(app.bir_2303_url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBirBlobUrl(objectUrl); })
      .catch(() => setBirBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id, app.bir_2303_url]);

  // Fetch DTI/SEC registration
  useEffect(() => {
    if (!app.dti_sec_registration_url) { setDtiSecBlobUrl(null); return; }
    const token = localStorage.getItem('token');
    let objectUrl: string;
    fetch(getSellerDtiSecRegistrationUrl(app.id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setDtiSecBlobUrl(objectUrl); })
      .catch(() => setDtiSecBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [app.id, app.dti_sec_registration_url]);

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
                    <InfoRow label="Shop Name"   value={app.shop_name} />
                    <InfoRow label="Shop Category" value={app.shop_category ?? null} />
                    <InfoRow label="Seller Type" value={app.seller_type ? SELLER_TYPE_LABEL[app.seller_type] : null} />
                    <InfoRow label="TIN" value={app.tin ?? null} />
                    <InfoRow label="Description" value={app.shop_description} />
                  </div>
                </div>

                <div className="border-t border-gray-100" />

                <div>
                  <SectionHeading>Business / Pickup Address</SectionHeading>
                  <div className="grid grid-cols-2 gap-4">
                    <InfoRow label="Region" value={app.address?.region ?? null} />
                    <InfoRow label="Province" value={app.address?.province ?? null} />
                    <InfoRow label="City / Municipality" value={app.address?.city ?? null} />
                    <InfoRow label="Barangay" value={app.address?.barangay ?? null} />
                    <InfoRow label="Street" value={app.address?.street ?? null} />
                    <InfoRow label="Postal Code" value={app.address?.postal_code ?? null} />
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
                        subtitle={formatIdType(app.government_id_type)}
                        blobUrl={backBlobUrl}
                        onView={(url) => setLightboxUrl(url)}
                      />
                    )}
                    <DocImageRow
                      label="Selfie with ID"
                      blobUrl={selfieBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
                    <DocImageRow
                      label="Business Permit (LGU)"
                      blobUrl={permitBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
                    <DocImageRow
                      label={app.seller_type === 'corporation' ? 'SEC Certificate' : 'DTI Certificate'}
                      blobUrl={dtiSecBlobUrl}
                      onView={(url) => setLightboxUrl(url)}
                    />
                    {!!app.bir_2303_url && (
                      <DocImageRow
                        label="BIR Form 2303"
                        blobUrl={birBlobUrl}
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

const STATUS_TONE: Record<ApplicationStatus, PillTone> = { pending: 'amber', approved: 'emerald', rejected: 'red' };
const STATUS_LABEL: Record<ApplicationStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

const SELLER_CHECKLIST = [
  'The ID and the selfie show the same person.',
  'The name on the ID matches the account.',
  'The business permit or DTI/SEC paper names this shop or owner.',
  'The shop name is not misleading or a copy of another brand.',
];

export default function AdminSellerApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam     = (searchParams.get('status') ?? 'pending') as ApplicationStatus;
  const searchParam  = searchParams.get('search') ?? '';
  const sortParam    = searchParams.get('sort') ?? 'newest';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 20);

  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [meta,         setMeta]         = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null });
  const [counts,       setCounts]       = useState<Record<ApplicationStatus, number> | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [failed,       setFailed]       = useState(false);
  const [selected,     setSelected]     = useState<SellerApplication | null>(null);
  const [view, setView] = useViewMode('seller_applications');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getSellerApplicationsApi({
        status:   tabParam,
        search:   searchParam || undefined,
        sort:     sortParam,
        page:     pageParam,
        per_page: perPageParam,
      });
      setApplications(res.data);
      setMeta(res.meta as ListMeta);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tabParam, searchParam, sortParam, pageParam, perPageParam]);

  // Counts for the rail.
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

  function handleDecided(id: number, outcome: 'approved' | 'rejected') {
    setSelected(null);
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setCounts((prev) => prev && ({ ...prev, pending: Math.max(0, prev.pending - 1), [outcome]: prev[outcome] + 1 }));
    setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
  }

  const clearSearch = () => { setSearchInput(''); setParam('search', ''); };
  const empty = (
    <ListEmpty icon={Store} title={`No ${tabParam} applications`}
      hint={tabParam === 'pending' ? 'All caught up. New shop applications appear here for review.' : 'Nothing here yet.'}
      filtered={Boolean(searchParam)} onClear={clearSearch} />
  );
  const applicant = (a: SellerApplication) => `${a.user.first_name} ${a.user.last_name}`.trim();
  const actionLabel = (a: SellerApplication) => (a.application_status === 'pending' ? 'Review' : 'View');

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Store} eyebrow="Applications" title="Seller Applications" subtitle="Check shop documents and IDs before a seller can list products" />

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ── Rail: the status cards are the tabs ── */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {!counts ? (
              [1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard compact icon={Clock} label="Pending review" value={counts.pending} subtext="Awaiting a decision" iconBg="bg-amber-50" iconColor="text-amber-600"
                  onClick={() => setTab('pending')} active={tabParam === 'pending'} />
                <StatCard compact icon={CheckCircle} label="Approved shops" value={counts.approved} subtext="Verified and selling" iconBg="bg-emerald-50" iconColor="text-emerald-600"
                  onClick={() => setTab('approved')} active={tabParam === 'approved'} />
                <StatCard compact icon={XCircle} label="Rejected" value={counts.rejected} subtext="Need to apply again" iconBg="bg-red-50" iconColor="text-red-600"
                  onClick={() => setTab('rejected')} active={tabParam === 'rejected'} />
              </>
            )}
          </div>
          <RailCard title="What to check">
            <Checklist items={SELLER_CHECKLIST} />
          </RailCard>
        </aside>

        {/* ── Queue ── */}
        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search seller applications" placeholder="Search shop, name or email…" />
              <div className="flex items-center gap-2">
                <CustomSelect
                  value={sortParam}
                  onChange={(v) => setParam('sort', v)}
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                  ]}
                  className="flex-1 sm:w-40"
                />
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>
          </FilterPanel>

          {failed ? (
            <ListError message="The seller applications could not be loaded." onRetry={load} />
          ) : (
            <ListCard title={`${STATUS_LABEL[tabParam]} applications`} count={meta.total} busy={loading}>
              {view === 'grid' ? (
                applications.length === 0 && !loading ? empty : (
                  <CardGrid>
                    {loading && applications.length === 0 && <SkeletonTiles />}
                    {applications.map((app) => (
                      <TileShell key={app.id} onOpen={() => setSelected(app)} dimmed={loading}>
                        <div className="flex items-start gap-3 p-4">
                          <div className="relative shrink-0">
                            <Avatar name={applicant(app)} src={app.user.avatar_url} size="xl" />
                            <span className="absolute flex items-center justify-center w-6 h-6 text-white border-2 border-white rounded-lg -bottom-1 -right-1 bg-brand-red" aria-hidden="true">
                              <Store className="w-3 h-3" />
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{app.shop_name}</p>
                              <Pill tone={STATUS_TONE[app.application_status]}>{STATUS_LABEL[app.application_status]}</Pill>
                            </div>
                            <p className="text-[12px] font-medium text-gray-700 truncate mt-0.5">{applicant(app)}</p>
                            <p className="text-[11px] text-gray-400 truncate">{app.user.email}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                          <DocChip icon={IdCard} label="ID" ok={Boolean(app.government_id_image_url)} />
                          <DocChip icon={Camera} label="Selfie" ok={Boolean(app.selfie_with_id_url)} />
                          <DocChip icon={FileText} label="Permit" ok={Boolean(app.business_permit_url)} />
                          <DocChip icon={FileText} label="DTI / SEC" ok={Boolean(app.dti_sec_registration_url)} />
                        </div>
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                          {app.application_status === 'pending'
                            ? <WaitingBadge since={app.submitted_at} />
                            : <span className="text-[11px] text-gray-500">Reviewed {formatDate(app.reviewed_at)}</span>}
                          <RowAction onClick={() => setSelected(app)} label={`${actionLabel(app)} ${app.shop_name}`}>{actionLabel(app)} <ArrowRight className="w-3 h-3" aria-hidden="true" /></RowAction>
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
                          <th scope="col" className={TH}>Shop and applicant</th>
                          <th scope="col" className={`${TH} hidden lg:table-cell`}>Documents</th>
                          <th scope="col" className={TH}>Submitted</th>
                          <th scope="col" className={TH}>Status</th>
                          <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loading && applications.length === 0 && <SkeletonRows cols={5} />}
                        {!loading && applications.length === 0 && <tr><td colSpan={5}>{empty}</td></tr>}
                        {applications.map((app) => (
                          <tr key={app.id} {...rowKeys(() => setSelected(app))} className={`${ROW} ${loading ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={applicant(app)} src={app.user.avatar_url} size="md" />
                                <div className="min-w-0">
                                  <p className="font-semibold truncate text-brand-black">{app.shop_name}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{applicant(app)} · {app.user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`${TD} hidden lg:table-cell`}>
                              <div className="flex flex-wrap gap-1">
                                <DocChip icon={IdCard} label="ID" ok={Boolean(app.government_id_image_url)} />
                                <DocChip icon={Camera} label="Selfie" ok={Boolean(app.selfie_with_id_url)} />
                                <DocChip icon={FileText} label="Permit" ok={Boolean(app.business_permit_url)} />
                              </div>
                            </td>
                            <td className={TD}>
                              <p className="text-gray-700 whitespace-nowrap">{formatDate(app.submitted_at)}</p>
                              <p className="text-[11px] text-gray-400">{relativeTime(app.submitted_at)}</p>
                            </td>
                            <td className={TD}><Pill tone={STATUS_TONE[app.application_status]}>{STATUS_LABEL[app.application_status]}</Pill></td>
                            <td className={`${TD} text-right`}><RowAction onClick={() => setSelected(app)} label={`${actionLabel(app)} ${app.shop_name}`}>{actionLabel(app)}</RowAction></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-gray-100 md:hidden">
                    {loading && applications.length === 0 && <SkeletonCards />}
                    {!loading && applications.length === 0 && empty}
                    {applications.map((app) => (
                      <div key={app.id} {...rowKeys(() => setSelected(app))} className={`flex items-center gap-3 p-3 ${ROW}`}>
                        <Avatar name={applicant(app)} src={app.user.avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate text-brand-black">{app.shop_name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{applicant(app)}</p>
                        </div>
                        <Pill tone={STATUS_TONE[app.application_status]}>{STATUS_LABEL[app.application_status]}</Pill>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <ListPager meta={meta} perPage={perPageParam} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={setPerPage} noun={['application', 'applications']} />
            </ListCard>
          )}
        </section>
      </div>

      {/* Review Modal */}
      {selected && createPortal(
        <ReviewModal
          app={selected}
          onClose={() => setSelected(null)}
          onApproved={(id) => handleDecided(id, 'approved')}
          onRejected={(id) => handleDecided(id, 'rejected')}
        />,
        document.body
      )}
    </div>
  );
}
