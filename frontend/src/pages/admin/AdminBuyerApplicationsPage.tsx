import { useEffect, useState, useCallback } from 'react';
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
import { X, ZoomIn, Clock, CalendarDays, CalendarRange, UserCheck, IdCard, Phone, MapPin, ArrowRight } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  type ListMeta, FilterPanel, SearchField, ListCard, ListPager, ListEmpty, ListError, Avatar, RowAction,
  SkeletonRows, SkeletonCards, SkeletonTiles, TH, TD, ROW, rowKeys, relativeTime, useDebouncedSearch, useViewMode, ViewToggle,
  RailCard, Checklist, WaitingBadge, DocChip, CardGrid, TileShell,
} from '../../components/admin/listKit';

const PER_PAGE_OPTIONS = [30, 50, 100];

const REQUIRES_BACK_ID_TYPES = new Set([
  'drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id',
]);

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

function calcAge(dob: string | null): string {
  if (!dob) return '—';
  return String(Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
}

function formatIdType(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

const BUYER_CHECKLIST = [
  'The ID photo is sharp and every word on it can be read.',
  'The name on the ID matches the name on the account.',
  'The birthday on the ID matches the one the buyer entered.',
  'The back of the ID is uploaded when that ID type has one.',
];

export default function AdminBuyerApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const searchParam  = searchParams.get('search') ?? '';
  const sortParam    = searchParams.get('sort') ?? 'newest';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = Number(searchParams.get('per_page') ?? 30);

  const [applications, setApplications] = useState<User[]>([]);
  const [summary,      setSummary]      = useState<BuyerApplicationSummary | null>(null);
  const [meta,         setMeta]         = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null });
  const [loading,      setLoading]      = useState(true);
  const [failed,       setFailed]       = useState(false);
  const [selected,     setSelected]     = useState<User | null>(null);
  const [view, setView] = useViewMode('buyer_applications');

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getBuyerApplicationsApi({
        status:   'pending',
        search:   searchParam || undefined,
        sort:     sortParam,
        page:     pageParam,
        per_page: perPageParam,
      });
      setApplications(res.data);
      setMeta(res.meta as ListMeta);
      setSummary(res.summary);
    } catch {
      setFailed(true);
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

  const [searchInput, setSearchInput] = useDebouncedSearch(searchParam, (v) => setParam('search', v));

  function removeDecided(id: number) {
    setSelected(null);
    setApplications((prev) => prev.filter((u) => u.id !== id));
    setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    setSummary((prev) => prev && ({ ...prev, pending_total: Math.max(0, prev.pending_total - 1) }));
  }

  const fullName = (u: User) => `${u.first_name} ${u.last_name}`.trim();
  const clearSearch = () => { setSearchInput(''); setParam('search', ''); };
  const empty = (
    <ListEmpty icon={UserCheck} title="No pending applications" hint="All caught up. New buyer registrations appear here for review."
      filtered={Boolean(searchParam)} onClear={clearSearch} />
  );

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={UserCheck} eyebrow="Applications" title="Buyer Applications" subtitle="Check each buyer's government ID before they can shop" />

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ── Rail ── */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {!summary ? (
              [1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard compact icon={Clock} label="Pending review" value={summary.pending_total} subtext="Waiting for an ID check" iconBg="bg-amber-50" iconColor="text-amber-600" />
                <StatCard compact icon={CalendarDays} label="Submitted today" value={summary.today} subtext="New today" iconBg="bg-sky-50" iconColor="text-sky-600" />
                <StatCard compact icon={CalendarRange} label="This week" value={summary.this_week} subtext="Rolling 7 days" iconBg="bg-violet-50" iconColor="text-violet-600" />
              </>
            )}
          </div>
          <RailCard title="What to check">
            <Checklist items={BUYER_CHECKLIST} />
          </RailCard>
        </aside>

        {/* ── Queue ── */}
        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search buyer applications" placeholder="Search name, email or phone…" />
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
            <ListError message="The buyer applications could not be loaded." onRetry={load} />
          ) : (
            <ListCard title="Review queue" count={meta.total} busy={loading}>
              {view === 'grid' ? (
                applications.length === 0 && !loading ? empty : (
                  <CardGrid>
                    {loading && applications.length === 0 && <SkeletonTiles />}
                    {applications.map((user) => (
                      <TileShell key={user.id} onOpen={() => setSelected(user)} dimmed={loading}>
                        <div className="flex items-start gap-3 p-4">
                          <Avatar name={fullName(user)} src={user.avatar_url} size="xl" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{fullName(user)}</p>
                            <p className="text-[11px] text-gray-400 truncate mt-0.5">{user.email}</p>
                            <div className="mt-2"><WaitingBadge since={user.created_at} /></div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                          <DocChip icon={IdCard} label={formatIdType(user.government_id_type ?? null)} ok={Boolean(user.government_id_type)} />
                          {REQUIRES_BACK_ID_TYPES.has(user.government_id_type ?? '') && <DocChip icon={IdCard} label="Back of ID" ok={Boolean(user.government_id_image_back_url)} />}
                          {user.phone && <DocChip icon={Phone} label={user.phone} />}
                          {user.default_address && <DocChip icon={MapPin} label={user.default_address.city_municipality} />}
                        </div>
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                          <span className="text-[11px] text-gray-500">Submitted {formatDate(user.created_at)}</span>
                          <RowAction onClick={() => setSelected(user)} label={`Review ${fullName(user)}`}>Review <ArrowRight className="w-3 h-3" aria-hidden="true" /></RowAction>
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
                          <th scope="col" className={TH}>Applicant</th>
                          <th scope="col" className={`${TH} hidden lg:table-cell`}>Phone</th>
                          <th scope="col" className={TH}>Government ID</th>
                          <th scope="col" className={TH}>Submitted</th>
                          <th scope="col" className={TH}>Waiting</th>
                          <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loading && applications.length === 0 && <SkeletonRows cols={6} />}
                        {!loading && applications.length === 0 && <tr><td colSpan={6}>{empty}</td></tr>}
                        {applications.map((user) => (
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
                            <td className={`${TD} hidden lg:table-cell text-gray-600 tabular-nums`}>{user.phone || <span className="text-gray-300">—</span>}</td>
                            <td className={`${TD} text-gray-700`}>{formatIdType(user.government_id_type ?? null)}</td>
                            <td className={`${TD} text-gray-600 whitespace-nowrap`}>{formatDate(user.created_at)}</td>
                            <td className={TD}><WaitingBadge since={user.created_at} /></td>
                            <td className={`${TD} text-right`}><RowAction onClick={() => setSelected(user)} label={`Review ${fullName(user)}`}>Review</RowAction></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-gray-100 md:hidden">
                    {loading && applications.length === 0 && <SkeletonCards />}
                    {!loading && applications.length === 0 && empty}
                    {applications.map((user) => (
                      <div key={user.id} {...rowKeys(() => setSelected(user))} className={`flex items-center gap-3 p-3 ${ROW}`}>
                        <Avatar name={fullName(user)} src={user.avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate text-brand-black">{fullName(user)}</p>
                          <p className="text-[11px] text-gray-400 truncate">{relativeTime(user.created_at)}</p>
                        </div>
                        <RowAction onClick={() => setSelected(user)}>Review</RowAction>
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
          user={selected}
          onClose={() => setSelected(null)}
          onApproved={removeDecided}
          onRejected={removeDecided}
        />,
        document.body
      )}
    </div>
  );
}
