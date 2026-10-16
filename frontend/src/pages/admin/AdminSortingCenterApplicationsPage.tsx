import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getSortingCenterApplicationsApi,
  getSortingCenterApplicationDetailApi,
  approveSortingCenterApplicationApi,
  rejectSortingCenterApplicationApi,
  getSortingCenterDtiPermitUrl,
  getSortingCenterIdImageUrl,
  getSortingCenterIdImageBackUrl,
} from '../../api/client';
import type {
  SortingCenterStatus,
  SortingCenterApplicationSummaryItem,
  SortingCenterApplicationDetail,
} from '../../types';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import {
  X,
  ZoomIn,
  Clock,
  CheckCircle,
  Warehouse,
  MapPin,
  Building2,
  FileText,
  ExternalLink,
  AlertCircle,
  RotateCw,
  Layers,
  ShieldCheck,
  Mail,
  User as UserIcon,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton, HERO_BUTTON } from '../../components/admin/dashboardKit';
import {
  type ListMeta, FilterPanel, SearchField, ListCard, ListPager, ListEmpty, ListError, Pill, Avatar, RowAction,
  SkeletonRows, SkeletonCards, SkeletonTiles, TH, TD, ROW, rowKeys, useDebouncedSearch, useViewMode, ViewToggle,
  RailCard, Checklist, WaitingBadge, DocChip, CardGrid, TileShell,
} from '../../components/admin/listKit';

const PER_PAGE_OPTIONS = [20, 30, 50, 100];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function calcAge(dob: string | null | undefined): string {
  if (!dob) return '—';
  return String(Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)));
}

function formatIdType(raw: string | null | undefined): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function HubStatusBadge({ status }: { status: SortingCenterStatus }) {
  switch (status) {
    case 'PENDING':   return <Pill tone="amber">Pending review</Pill>;
    case 'APPROVED':  return <Pill tone="emerald">Approved</Pill>;
    case 'REJECTED':  return <Pill tone="red">Rejected</Pill>;
    case 'SUSPENDED': return <Pill tone="gray">Suspended</Pill>;
    default:          return <Pill tone="gray">{status}</Pill>;
  }
}


// ── ID & Permit Lightbox ──────────────────────────────────────────────────────

function ImageLightbox({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 text-white">
          <span className="text-sm font-bold truncate">{title}</span>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" /> Close (Esc)
          </button>
        </div>
        <img
          src={url}
          alt={title}
          className="w-full rounded-2xl object-contain max-h-[82vh] bg-stone-900 shadow-2xl border border-white/10"
        />
      </div>
    </div>
  );
}

// ── Detail Information Subcomponents ──────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs sm:text-sm text-gray-800 font-semibold break-words">{value || '—'}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold text-brand-red uppercase tracking-[0.12em] mb-3 flex items-center gap-1.5">
      {children}
    </h3>
  );
}

// ── Secure Private Document Row ───────────────────────────────────────────────

interface DocItemProps {
  label: string;
  subtitle?: string | null;
  urlEndpoint: string;
  onViewImage: (url: string, title: string) => void;
}

function SecureDocRow({ label, subtitle, urlEndpoint, onViewImage }: DocItemProps) {
  const [blobUrl, setBlobUrl] = useState<string | null | undefined>(undefined);
  const [isPdf, setIsPdf] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    const token = localStorage.getItem('token');

    setBlobUrl(undefined);
    setFetchError(null);

    fetch(urlEndpoint, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/pdf, image/*' } : {},
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('File not found on private storage.');
          if (res.status === 403 || res.status === 401) throw new Error('Unauthorized document access.');
          throw new Error('Failed to load document.');
        }
        const contentType = res.headers.get('content-type') || '';
        const blob = await res.blob();
        return { blob, contentType };
      })
      .then(({ blob, contentType }) => {
        if (!active) return;
        const pdf = contentType.includes('pdf') || blob.type.includes('pdf');
        setIsPdf(pdf);
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch((err: Error) => {
        if (!active) return;
        setFetchError(err.message || 'Could not load document.');
        setBlobUrl(null);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [urlEndpoint, reloadKey]);

  if (blobUrl === undefined) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 animate-pulse" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          <p className="text-[11px] text-gray-400 italic">Verifying credentials & fetching from private disk…</p>
        </div>
      </div>
    );
  }

  if (fetchError || !blobUrl) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/50 p-3.5">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-800">{label}</p>
            <p className="text-[11px] text-red-600">{fetchError || 'Document unavailable'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 border border-gray-300 bg-white px-2.5 py-1 rounded-md hover:bg-gray-50 transition-colors shadow-2xs"
        >
          <RotateCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xs hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isPdf ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {isPdf ? <FileText className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-xs font-bold text-gray-900">{label}</p>
          <p className="text-[11px] text-gray-500 font-medium">
            {subtitle ? `${subtitle} • ` : ''}
            {isPdf ? 'PDF Document' : 'Official Image'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isPdf ? (
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-red bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open PDF
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onViewImage(blobUrl, label)}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-red bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" /> Inspect
          </button>
        )}
      </div>
    </div>
  );
}

// ── Review Modal (Detail View + Actions) ──────────────────────────────────────

interface ReviewModalProps {
  appId: number;
  onClose: () => void;
  onApproved: (updatedHub: SortingCenterApplicationDetail) => void;
  onRejected: (updatedHub: SortingCenterApplicationDetail) => void;
}

function ReviewModal({ appId, onClose, onApproved, onRejected }: ReviewModalProps) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SortingCenterApplicationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dialogs
  const [showApproveDialog, setShowApproveDialog] = useState<boolean>(false);
  const [showRejectDialog, setShowRejectDialog] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectFieldError, setRejectFieldError] = useState<string | null>(null);
  const [acting, setActing] = useState<boolean>(false);

  // Lightbox for document inspection
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSortingCenterApplicationDetailApi(appId);
      setDetail(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load application details.';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Keyboard accessibility
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lightbox && !showApproveDialog && !showRejectDialog) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, lightbox, showApproveDialog, showRejectDialog]);

  // Handle Approve
  async function handleConfirmApprove() {
    if (!detail) return;
    setActing(true);
    try {
      const res = await approveSortingCenterApplicationApi(detail.id);
      showToast(res.message || 'Sorting center application approved successfully!', 'success');
      const updated: SortingCenterApplicationDetail = {
        ...detail,
        status: 'APPROVED',
        rejection_reason: null,
        reviewed_at: new Date().toISOString(),
      };
      setDetail(updated);
      setShowApproveDialog(false);
      onApproved(updated);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosErr.response?.status === 422 || axiosErr.response?.status === 409) {
        showToast(axiosErr.response.data?.message || 'Application has already been processed.', 'error');
        fetchDetail();
      } else {
        showToast(axiosErr.response?.data?.message || 'Failed to approve application.', 'error');
      }
    } finally {
      setActing(false);
    }
  }

  // Handle Reject
  async function handleConfirmReject() {
    if (!detail) return;
    const trimmed = rejectionReason.trim();
    if (!trimmed) {
      setRejectFieldError('A non-empty rejection reason is required.');
      return;
    }
    setActing(true);
    setRejectFieldError(null);
    try {
      const res = await rejectSortingCenterApplicationApi(detail.id, trimmed);
      showToast(res.message || 'Sorting center application rejected successfully.', 'success');
      const updated: SortingCenterApplicationDetail = {
        ...detail,
        status: 'REJECTED',
        rejection_reason: trimmed,
        reviewed_at: new Date().toISOString(),
      };
      setDetail(updated);
      setShowRejectDialog(false);
      onRejected(updated);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string; errors?: { reason?: string[] } } } };
      if (axiosErr.response?.data?.errors?.reason?.[0]) {
        setRejectFieldError(axiosErr.response.data.errors.reason[0]);
      } else if (axiosErr.response?.status === 422 || axiosErr.response?.status === 409) {
        showToast(axiosErr.response.data?.message || 'Application state conflict. Refreshing…', 'error');
        fetchDetail();
      } else {
        showToast(axiosErr.response?.data?.message || 'Failed to reject application.', 'error');
      }
    } finally {
      setActing(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-hub-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-red border border-red-200 flex items-center justify-center shrink-0">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="modal-hub-title" className="text-base sm:text-lg font-black text-gray-900 leading-tight">
                  {detail?.hub_name || 'Sorting Center Hub Application'}
                </h2>
                {detail && <HubStatusBadge status={detail.status} />}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Submitted {relativeTime(detail?.created_at)} • Application #{appId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-4 py-8">
              <div className="h-6 bg-gray-200 rounded-md w-1/3 animate-pulse" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              </div>
              <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            </div>
          ) : loadError || !detail ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-sm font-bold text-gray-800">{loadError || 'Unable to load details.'}</p>
              <Button variant="secondary" onClick={fetchDetail} className="!min-h-[36px] text-xs">
                Retry Loading
              </Button>
            </div>
          ) : (
            <>
              {/* Outcome Status Banner (When Not Pending) */}
              {detail.status === 'APPROVED' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5 text-emerald-900">
                    <p className="font-bold text-sm">Application Approved</p>
                    <p>
                      This sorting center hub is authorized and active in the Loved-IT logistics network.
                      {detail.reviewed_at && ` Reviewed on ${formatDateTime(detail.reviewed_at)}.`}
                    </p>
                  </div>
                </div>
              )}

              {detail.status === 'REJECTED' && (
                <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-red-900 space-y-1 flex-1">
                      <p className="font-bold text-sm">Application Rejected</p>
                      <p>
                        This application was declined.
                        {detail.reviewed_at && ` Reviewed on ${formatDateTime(detail.reviewed_at)}.`}
                      </p>
                    </div>
                  </div>
                  {detail.rejection_reason && (
                    <div className="ml-8 rounded-lg bg-white/80 border border-red-200 p-3 text-xs text-red-800">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-red-600 mb-1">
                        Recorded Administrative Reason:
                      </p>
                      <p className="italic leading-relaxed">{detail.rejection_reason}</p>
                    </div>
                  )}
                </div>
              )}

              {detail.status === 'SUSPENDED' && (
                <div className="rounded-xl border border-stone-300 bg-stone-100 p-4 flex items-start gap-3 text-xs text-stone-800">
                  <AlertCircle className="w-5 h-5 text-stone-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Hub Suspended</p>
                    <p>Operations for this sorting facility are temporarily suspended.</p>
                  </div>
                </div>
              )}

              {/* Two Column Layout for Hub & Applicant Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Hub Information */}
                <div className="space-y-4 rounded-xl border border-gray-200/90 bg-gray-50/50 p-4 sm:p-5">
                  <SectionHeading>
                    <Building2 className="w-3.5 h-3.5 text-brand-red" />
                    Hub Facility Information
                  </SectionHeading>

                  <div className="space-y-3 text-xs">
                    <InfoRow label="Facility Name" value={detail.hub_name} />
                    <InfoRow label="Province" value={detail.address_province} />
                    <InfoRow label="City / Municipality" value={detail.address_city} />
                    <InfoRow label="Barangay" value={detail.address_barangay} />
                    <InfoRow label="Street Address" value={detail.address_street} />
                  </div>

                  <div className="border-t border-gray-200/80 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <Layers className="w-3 h-3 text-brand-red" />
                        Designated Coverage Barangays
                      </span>
                      <span className="font-bold text-brand-red bg-red-100/70 px-2 py-0.5 rounded-full text-[10px]">
                        {detail.coverage_count} Barangays
                      </span>
                    </div>

                    {detail.coverage_barangays && detail.coverage_barangays.length > 0 ? (
                      <div className="max-h-36 overflow-y-auto p-2 rounded-lg border border-gray-200 bg-white flex flex-wrap gap-1.5">
                        {detail.coverage_barangays.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No coverage barangays specified.</p>
                    )}
                  </div>
                </div>

                {/* Applicant & Owner Information */}
                <div className="space-y-4 rounded-xl border border-gray-200/90 bg-gray-50/50 p-4 sm:p-5">
                  <SectionHeading>
                    <UserIcon className="w-3.5 h-3.5 text-brand-red" />
                    Applicant & Owner Profile
                  </SectionHeading>

                  {detail.applicant ? (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <InfoRow
                          label="Full Legal Name"
                          value={[
                            detail.applicant.first_name,
                            detail.applicant.middle_name,
                            detail.applicant.last_name,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        />
                        <InfoRow label="Sex" value={detail.applicant.sex} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <InfoRow label="Birthday" value={formatDate(detail.applicant.date_of_birth)} />
                        <InfoRow label="Age" value={calcAge(detail.applicant.date_of_birth)} />
                      </div>

                      <InfoRow label="Email Address" value={detail.applicant.email} />
                      <InfoRow label="Contact Phone" value={detail.applicant.phone} />
                      <InfoRow
                        label="Presented ID Type"
                        value={formatIdType(detail.applicant.government_id_type)}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No applicant record attached.</p>
                  )}
                </div>
              </div>

              {/* Documents Inspection Section */}
              <div className="space-y-3">
                <SectionHeading>
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-red" />
                  Submitted Verification Documents
                </SectionHeading>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* DTI Permit (contract guaranteed route) */}
                  <SecureDocRow
                    label="DTI / Mayor's Business Permit"
                    subtitle="Official Registration Certificate"
                    urlEndpoint={getSortingCenterDtiPermitUrl(detail.id)}
                    onViewImage={(url, title) => setLightbox({ url, title })}
                  />

                  {/* Applicant ID Front */}
                  <SecureDocRow
                    label="Government ID (Front)"
                    subtitle={formatIdType(detail.applicant?.government_id_type)}
                    urlEndpoint={getSortingCenterIdImageUrl(detail.id)}
                    onViewImage={(url, title) => setLightbox({ url, title })}
                  />

                  {/* Applicant ID Back (if provided) */}
                  {detail.applicant?.government_id_image_back_url && (
                    <SecureDocRow
                      label="Government ID (Back)"
                      subtitle={formatIdType(detail.applicant?.government_id_type)}
                      urlEndpoint={getSortingCenterIdImageBackUrl(detail.id)}
                      onViewImage={(url, title) => setLightbox({ url, title })}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer / Review Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50/90 shrink-0">
          <p className="text-xs text-gray-500">
            {detail?.status === 'PENDING' ? (
              <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                <Mail className="w-3.5 h-3.5" />
                Applicant will be automatically notified by email upon decision.
              </span>
            ) : (
              <span>Application is in read-only {detail?.status.toLowerCase()} state.</span>
            )}
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button variant="ghost" className="!min-h-[38px] text-xs font-semibold" onClick={onClose}>
              Close
            </Button>

            {detail?.status === 'PENDING' && (
              <>
                <Button
                  variant="danger"
                  className="!min-h-[38px] !px-4 text-xs font-bold"
                  disabled={acting}
                  onClick={() => {
                    setRejectionReason('');
                    setRejectFieldError(null);
                    setShowRejectDialog(true);
                  }}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Reject Hub
                </Button>

                <Button
                  variant="primary"
                  className="!min-h-[38px] !px-4 text-xs font-bold"
                  disabled={acting}
                  loading={acting}
                  onClick={() => setShowApproveDialog(true)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  Approve Hub
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Approve Confirmation Dialog */}
      {showApproveDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">Approve Sorting Center Application?</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Approving will grant <strong>{detail?.hub_name}</strong> authorized sorting center status, activate
                  the hub account, and automatically dispatch an approval confirmation email to the applicant.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2">
              <Button
                variant="ghost"
                className="!min-h-[36px] text-xs"
                disabled={acting}
                onClick={() => setShowApproveDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="!min-h-[36px] !px-4 text-xs font-bold"
                disabled={acting}
                loading={acting}
                onClick={handleConfirmApprove}
              >
                Yes, Approve Hub
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal with Reason Input */}
      {showRejectDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-brand-red border border-red-200 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Reject Sorting Center Application</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Specify the reason for rejection. This explanation will be recorded and emailed to the applicant.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rejection-reason-input" className="block text-xs font-bold text-gray-700">
                Reason for Rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rejection-reason-input"
                rows={4}
                maxLength={500}
                value={rejectionReason}
                disabled={acting}
                onChange={(e) => {
                  setRejectionReason(e.target.value);
                  if (rejectFieldError) setRejectFieldError(null);
                }}
                placeholder="E.g. DTI Business Registration certificate has expired, or jurisdiction address does not match submitted permits."
                className="w-full text-xs rounded-xl border border-gray-300 p-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red resize-none"
              />
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-red-600 font-medium">{rejectFieldError || ''}</span>
                <span className="text-gray-400 font-mono">
                  {rejectionReason.trim().length} / 500
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-1">
              <Button
                variant="ghost"
                className="!min-h-[36px] text-xs"
                disabled={acting}
                onClick={() => setShowRejectDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="!min-h-[36px] !px-4 text-xs font-bold"
                disabled={acting || rejectionReason.trim().length === 0}
                loading={acting}
                onClick={handleConfirmReject}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for Document Inspection */}
      {lightbox && (
        <ImageLightbox url={lightbox.url} title={lightbox.title} onClose={() => setLightbox(null)} />
      )}
    </div>,
    document.body
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────

type HubTab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';

const HUB_CHECKLIST = [
  'The DTI permit is readable and names this hub or its owner.',
  'The owner\'s ID matches the applicant\'s name.',
  'The address is a real place inside the barangays it will cover.',
  'The barangays it will cover are near enough for its riders to reach.',
];

export default function AdminSortingCenterApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam  = ((searchParams.get('status') as HubTab | null) || 'PENDING');
  const pageParam    = parseInt(searchParams.get('page') || '1', 10);
  const perPageParam = parseInt(searchParams.get('per_page') || '30', 10);
  const searchParam  = searchParams.get('search') || '';

  const [applications, setApplications] = useState<SortingCenterApplicationSummaryItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ current_page: 1, last_page: 1, per_page: perPageParam, total: 0, from: null, to: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number } | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [view, setView] = useViewMode('hub_applications');

  const [searchInput, setSearchInput] = useDebouncedSearch(searchParam, (v) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set('search', v); else next.delete('search');
      next.set('page', '1');
      return next;
    });
  });

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSortingCenterApplicationsApi({
        status: statusParam,
        search: searchParam || undefined,
        sort: 'newest',
        page: pageParam,
        per_page: perPageParam,
      });
      setApplications(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'The sorting center applications could not be loaded.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [statusParam, searchParam, pageParam, perPageParam]);

  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        getSortingCenterApplicationsApi({ status: 'PENDING', per_page: 1 }),
        getSortingCenterApplicationsApi({ status: 'APPROVED', per_page: 1 }),
        getSortingCenterApplicationsApi({ status: 'REJECTED', per_page: 1 }),
      ]);
      setCounts({ pending: pendingRes.meta.total, approved: approvedRes.meta.total, rejected: rejectedRes.meta.total });
    } catch {
      // Non-critical: the list still works without the counts.
    }
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const handleStatusChange = (newStatus: HubTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('status', newStatus);
      next.set('page', '1');
      return next;
    });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
  };

  const handlePerPageChange = (newPerPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('per_page', String(newPerPage));
      next.set('page', '1');
      return next;
    });
  };

  const handleActionComplete = (updatedHub: SortingCenterApplicationDetail) => {
    setApplications((prev) => prev.map((app) => (app.id === updatedHub.id ? { ...app, status: updatedHub.status } : app)));
    fetchCounts();
  };

  const location = (app: SortingCenterApplicationSummaryItem) => app.city_province || `${app.address_city}, ${app.address_province}`;
  const submitted = (app: SortingCenterApplicationSummaryItem) => app.submitted_date || app.created_at;
  const actionLabel = (app: SortingCenterApplicationSummaryItem) => (app.status === 'PENDING' ? 'Review' : 'View');
  const empty = (
    <ListEmpty icon={Warehouse} title="No applications found"
      hint={statusParam === 'PENDING' ? 'No sorting center hubs are waiting for review.' : 'Try another status.'}
      filtered={Boolean(searchParam)} onClear={() => setSearchInput('')} />
  );
  const heading = statusParam === 'all' ? 'All applications' : `${statusParam.charAt(0)}${statusParam.slice(1).toLowerCase()} applications`;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Warehouse} eyebrow="Applications · Logistics" title="Hub Applications" subtitle="Each courier company reviews the hubs that join it; you can step in on any of them">
        <button type="button" onClick={() => { fetchApplications(); fetchCounts(); }} disabled={loading} className={HERO_BUTTON}>
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </PageHero>

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ── Rail: the status cards are the tabs ── */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {!counts ? (
              [1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard compact icon={Clock} label="Pending hubs" value={counts.pending} subtext="Awaiting vetting" iconBg="bg-amber-50" iconColor="text-amber-600"
                  onClick={() => handleStatusChange('PENDING')} active={statusParam === 'PENDING'} />
                <StatCard compact icon={CheckCircle} label="Authorized hubs" value={counts.approved} subtext="Active sorting centers" iconBg="bg-emerald-50" iconColor="text-emerald-600"
                  onClick={() => handleStatusChange('APPROVED')} active={statusParam === 'APPROVED'} />
                <StatCard compact icon={XCircle} label="Declined" value={counts.rejected} subtext="Rejected submissions" iconBg="bg-red-50" iconColor="text-red-600"
                  onClick={() => handleStatusChange('REJECTED')} active={statusParam === 'REJECTED'} />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleStatusChange('all')}
            aria-pressed={statusParam === 'all'}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              statusParam === 'all' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" aria-hidden="true" />Show every application</span>
            {counts && <span className="tabular-nums">{counts.pending + counts.approved + counts.rejected}</span>}
          </button>
          <RailCard title="What to check">
            <Checklist items={HUB_CHECKLIST} />
          </RailCard>
        </aside>

        {/* ── Queue ── */}
        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex items-center gap-2">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search hub applications" placeholder="Search hub, city, province or applicant…" />
              <ViewToggle value={view} onChange={setView} />
            </div>
          </FilterPanel>

          {error ? (
            <ListError message={error} onRetry={fetchApplications} />
          ) : (
            <ListCard title={heading} count={meta.total} busy={loading}>
              {view === 'grid' ? (
                applications.length === 0 && !loading ? empty : (
                  <CardGrid>
                    {loading && applications.length === 0 && <SkeletonTiles />}
                    {applications.map((app) => (
                      <TileShell key={app.id} onOpen={() => setSelectedAppId(app.id)} dimmed={loading}>
                        <div className="flex items-start gap-3 p-4">
                          <div className="relative shrink-0">
                            <Avatar name={app.applicant_name || app.hub_name} src={app.applicant_avatar_url} size="xl" />
                            <span className="absolute flex items-center justify-center w-6 h-6 text-white border-2 border-white rounded-lg -bottom-1 -right-1 bg-neutral-800" aria-hidden="true">
                              <Warehouse className="w-3 h-3" />
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{app.hub_name}</p>
                              <HubStatusBadge status={app.status} />
                            </div>
                            <p className="text-[12px] font-medium text-gray-700 truncate mt-0.5">{app.applicant_name || '—'}</p>
                            <p className="text-[11px] text-gray-400 truncate">{app.applicant_email || '—'}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                          {app.courier && <DocChip icon={Layers} label={app.courier.name} />}
                          <DocChip icon={MapPin} label={location(app)} />
                          <DocChip icon={FileText} label="DTI permit" />
                          <DocChip icon={ShieldCheck} label="Owner ID" />
                          <span className="text-[10px] font-mono text-gray-400 self-center">#{app.id}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                          {app.status === 'PENDING'
                            ? <WaitingBadge since={submitted(app)} />
                            : <span className="text-[11px] text-gray-500" title={formatDateTime(submitted(app))}>Submitted {formatDate(submitted(app))}</span>}
                          <RowAction onClick={() => setSelectedAppId(app.id)} label={`${actionLabel(app)} ${app.hub_name}`}>{actionLabel(app)} <ArrowRight className="w-3 h-3" aria-hidden="true" /></RowAction>
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
                          <th scope="col" className={TH}>Hub and applicant</th>
                          <th scope="col" className={TH}>Location</th>
                          <th scope="col" className={TH}>Submitted</th>
                          <th scope="col" className={TH}>Status</th>
                          <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loading && applications.length === 0 && <SkeletonRows cols={5} />}
                        {!loading && applications.length === 0 && <tr><td colSpan={5}>{empty}</td></tr>}
                        {applications.map((app) => (
                          <tr key={app.id} {...rowKeys(() => setSelectedAppId(app.id))} className={`${ROW} ${loading ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar name={app.applicant_name || app.hub_name} src={app.applicant_avatar_url} size="md" />
                                <div className="min-w-0">
                                  <p className="font-semibold truncate text-brand-black">{app.hub_name}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{app.applicant_name || '—'} · {app.applicant_email || '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`${TD} text-gray-700`}>
                              <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />{location(app)}</span>
                            </td>
                            <td className={TD}>
                              <p className="text-gray-700 whitespace-nowrap">{formatDate(submitted(app))}</p>
                              <p className="text-[11px] text-gray-400">{relativeTime(submitted(app))}</p>
                            </td>
                            <td className={TD}><HubStatusBadge status={app.status} /></td>
                            <td className={`${TD} text-right`}><RowAction onClick={() => setSelectedAppId(app.id)} label={`${actionLabel(app)} ${app.hub_name}`}>{actionLabel(app)}</RowAction></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-gray-100 md:hidden">
                    {loading && applications.length === 0 && <SkeletonCards />}
                    {!loading && applications.length === 0 && empty}
                    {applications.map((app) => (
                      <div key={app.id} {...rowKeys(() => setSelectedAppId(app.id))} className={`flex items-center gap-3 p-3 ${ROW}`}>
                        <Avatar name={app.applicant_name || app.hub_name} src={app.applicant_avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate text-brand-black">{app.hub_name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{location(app)}</p>
                        </div>
                        <HubStatusBadge status={app.status} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <ListPager meta={meta} perPage={perPageParam} perPageOptions={PER_PAGE_OPTIONS} onPage={handlePageChange} onPerPage={handlePerPageChange} noun={['application', 'applications']} />
            </ListCard>
          )}
        </section>
      </div>

      {/* Review Modal Dialog */}
      {selectedAppId !== null && (
        <ReviewModal
          appId={selectedAppId}
          onClose={() => setSelectedAppId(null)}
          onApproved={handleActionComplete}
          onRejected={handleActionComplete}
        />
      )}
    </div>
  );
}
