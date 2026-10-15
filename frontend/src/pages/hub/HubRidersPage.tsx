import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getHubRidersApi,
  getHubRiderDetailApi,
  approveHubRiderApi,
  disapproveHubRiderApi,
  getHubCoverageOptionsApi,
  createHubRiderAreaApi,
  updateHubRiderAreaApi,
  deactivateHubRiderAreaApi,
} from '../../api/client';
import type {
  RiderStatus,
  HubRiderSummaryItem,
  HubRiderDetailItem,
  RiderAreaAssignmentItem,
  HubCoverageOptions,
} from '../../types';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import {
  Bike,
  Truck,
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  MapPin,
  Layers,
  Search,
  RefreshCw,
  Eye,
  Plus,
  Edit2,
  Trash2,
  X,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  User,
  Check,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import axios from 'axios';
import { PageHero, StatCard, LiveStamp } from '../../components/admin/dashboardKit';

const PRESET_AREA_LABELS = [
  'Area A - Central District',
  'Area B - North Sector',
  'Area C - South Sector',
  'Area D - East Sector',
  'Area E - Commercial Bins',
];

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

function calcAge(dob: string | null | undefined): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} yrs old`;
}

// ── Status Badges ─────────────────────────────────────────────────────────────

function RiderStatusBadge({ status }: { status: RiderStatus }) {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Pending Review
        </span>
      );
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          Active Courier
        </span>
      );
    case 'DISAPPROVED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          <XCircle className="w-3 h-3 text-red-600" />
          Disapproved
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
}

// ── Secure Private Document Viewer ────────────────────────────────────────────

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

function SecureDocRow({
  label,
  urlEndpoint,
  onViewImage,
}: {
  label: string;
  urlEndpoint: string | null;
  onViewImage: (url: string, title: string) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null | undefined>(undefined);
  const [isPdf, setIsPdf] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    if (!urlEndpoint) {
      setBlobUrl(null);
      return;
    }

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

  if (!urlEndpoint) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 text-xs text-gray-400">
        <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
        <span>No {label} document uploaded.</span>
      </div>
    );
  }

  if (blobUrl === undefined) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5">
        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0 animate-pulse" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          <p className="text-[11px] text-gray-400 italic">Verifying credentials & loading file…</p>
        </div>
      </div>
    );
  }

  if (fetchError || !blobUrl) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/60 p-3.5">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-800">{label}</p>
            <p className="text-[11px] text-red-600">{fetchError || 'Unable to retrieve document.'}</p>
          </div>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="text-xs font-bold text-red-700 hover:text-red-900 bg-red-100/80 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xs hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
          {isPdf ? <FileText className="w-5 h-5 text-red-500" /> : <ShieldCheck className="w-5 h-5 text-blue-600" />}
        </div>
        <div className="truncate">
          <p className="text-xs font-bold text-gray-900 truncate">{label}</p>
          <p className="text-[11px] text-gray-500">
            {isPdf ? 'PDF Verification Document' : 'Official Image Scan'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isPdf ? (
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open PDF</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onViewImage(blobUrl, label)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-red text-white hover:bg-brand-red-dark transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Inspect</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function HubRidersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const currentTab = (searchParams.get('tab') || 'PENDING').toUpperCase() as RiderStatus | 'ALL';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const currentPerPage = parseInt(searchParams.get('per_page') || '20', 10);
  const currentSearch = searchParams.get('search') || '';

  // State
  const [riders, setRiders] = useState<HubRiderSummaryItem[]>([]);
  const [counts, setCounts] = useState<{ pending: number; active: number; disapproved: number; all: number }>({
    pending: 0,
    active: 0,
    disapproved: 0,
    all: 0,
  });
  const [meta, setMeta] = useState<Meta>({
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
    from: null,
    to: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search input with debounce
  const [searchInputValue, setSearchInputValue] = useState(currentSearch);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected detail modal
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<HubRiderDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Image Lightbox
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  // Action Modals State
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveAreaLabel, setApproveAreaLabel] = useState('');
  const [approveSelectedBarangays, setApproveSelectedBarangays] = useState<string[]>([]);
  const [approving, setApproving] = useState(false);

  const [disapproveModalOpen, setDisapproveModalOpen] = useState(false);
  const [disapproveReason, setDisapproveReason] = useState('');
  const [disapproving, setDisapproving] = useState(false);
  const [disapproveError, setDisapproveError] = useState<string | null>(null);

  // Area Mapping Modal State (for ACTIVE riders)
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<RiderAreaAssignmentItem | null>(null);
  const [areaFormLabel, setAreaFormLabel] = useState('');
  const [areaFormBarangays, setAreaFormBarangays] = useState<string[]>([]);
  const [savingArea, setSavingArea] = useState(false);
  const [areaFormError, setAreaFormError] = useState<string | null>(null);

  // Hub Coverage Options
  const [hubCoverage, setHubCoverage] = useState<HubCoverageOptions | null>(null);

  // Fetch Hub Coverage Options once
  useEffect(() => {
    getHubCoverageOptionsApi()
      .then(setHubCoverage)
      .catch((err) => console.error('Failed to load hub coverage options:', err));
  }, []);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch riders list
  const fetchRiders = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    getHubRidersApi({
      status: currentTab === 'ALL' ? 'all' : currentTab,
      search: currentSearch || undefined,
      page: currentPage,
      per_page: currentPerPage,
    })
      .then((res) => {
        setRiders(res.data || []);
        setCounts(res.counts || { pending: 0, active: 0, disapproved: 0, all: 0 });
        setMeta(res.meta);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (silent) return; // a quiet refresh that fails just tries again next time
        console.error('Failed to load couriers:', err);
        setError('Failed to load courier applications. Please check your connection and try again.');
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [currentTab, currentSearch, currentPage, currentPerPage]);

  useEffect(() => {
    fetchRiders();
  }, [fetchRiders]);

  // Live: applications and approvals from other screens show up on their own, with no refresh button.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') fetchRiders(true);
    };
    const timer = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [fetchRiders]);

  // Handle Search Input Change
  function handleSearchChange(val: string) {
    setSearchInputValue(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (val.trim()) next.set('search', val.trim());
        else next.delete('search');
        next.set('page', '1');
        return next;
      });
    }, 350);
  }

  // Handle Tab Change
  function handleTabChange(tab: RiderStatus | 'ALL') {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      next.set('page', '1');
      return next;
    });
  }

  // Load Rider Detail
  function openDetail(riderId: number) {
    setSelectedRiderId(riderId);
    setDetailLoading(true);
    setDetailData(null);

    getHubRiderDetailApi(riderId)
      .then((data) => {
        setDetailData(data);
      })
      .catch((err) => {
        console.error('Failed to load rider details:', err);
        showToast('Could not load courier details.', 'error');
        setSelectedRiderId(null);
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }

  function closeDetail() {
    setSelectedRiderId(null);
    setDetailData(null);
    setApproveConfirmOpen(false);
    setDisapproveModalOpen(false);
    setAreaModalOpen(false);
  }

  // ─── Approve Action ────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!detailData) return;
    setApproving(true);

    const payload = approveAreaLabel.trim() && approveSelectedBarangays.length > 0
      ? { area_label: approveAreaLabel.trim(), coverage_barangays: approveSelectedBarangays }
      : undefined;

    try {
      const res = await approveHubRiderApi(detailData.id, payload);
      showToast(res.message || 'Courier application approved.', 'success');
      setApproveConfirmOpen(false);
      setDetailData(res.data);
      fetchRiders();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 422) {
          showToast(err.response.data?.message || 'Approval state conflict or validation error.', 'error');
        } else {
          showToast('Failed to approve courier application.', 'error');
        }
      }
      fetchRiders();
    } finally {
      setApproving(false);
    }
  }

  // ─── Disapprove Action ─────────────────────────────────────────────────────
  async function handleDisapprove() {
    if (!detailData) return;
    setDisapproveError(null);

    if (!disapproveReason.trim()) {
      setDisapproveError('Please enter a disapproval reason for the applicant.');
      return;
    }

    setDisapproving(true);

    try {
      const res = await disapproveHubRiderApi(detailData.id, disapproveReason.trim());
      showToast(res.message || 'Courier application disapproved.', 'success');
      setDisapproveModalOpen(false);
      setDisapproveReason('');
      setDetailData(res.data);
      fetchRiders();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.errors?.reason) {
        setDisapproveError(err.response.data.errors.reason[0]);
      } else {
        showToast('Failed to disapprove courier application.', 'error');
      }
    } finally {
      setDisapproving(false);
    }
  }

  // ─── Area Assignment Actions ───────────────────────────────────────────────
  function openCreateAreaModal() {
    setEditingArea(null);
    setAreaFormLabel('Area A - Central District');
    setAreaFormBarangays([]);
    setAreaFormError(null);
    setAreaModalOpen(true);
  }

  function openEditAreaModal(area: RiderAreaAssignmentItem) {
    setEditingArea(area);
    setAreaFormLabel(area.area_label);
    setAreaFormBarangays(area.coverage_barangays || []);
    setAreaFormError(null);
    setAreaModalOpen(true);
  }

  async function handleSaveArea() {
    if (!detailData) return;
    setAreaFormError(null);

    if (!areaFormLabel.trim()) {
      setAreaFormError('Area label is required.');
      return;
    }

    if (areaFormBarangays.length === 0) {
      setAreaFormError('Please select at least one barangay for this delivery area.');
      return;
    }

    setSavingArea(true);

    try {
      if (editingArea) {
        await updateHubRiderAreaApi(detailData.id, editingArea.id, {
          area_label: areaFormLabel.trim(),
          coverage_barangays: areaFormBarangays,
        });
        showToast('Area assignment updated successfully.', 'success');
      } else {
        await createHubRiderAreaApi(detailData.id, {
          area_label: areaFormLabel.trim(),
          coverage_barangays: areaFormBarangays,
        });
        showToast('New delivery area assigned successfully.', 'success');
      }

      // Refresh rider detail and table list
      const freshDetail = await getHubRiderDetailApi(detailData.id);
      setDetailData(freshDetail);
      setAreaModalOpen(false);
      fetchRiders();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.errors) {
        const errors = err.response.data.errors;
        const msg = errors.area_label?.[0] || errors.coverage_barangays?.[0] || err.response.data.message;
        setAreaFormError(msg);
      } else {
        setAreaFormError('Failed to save area assignment.');
      }
    } finally {
      setSavingArea(false);
    }
  }

  async function handleDeactivateArea(areaId: number) {
    if (!detailData) return;
    if (!confirm('Are you sure you want to deactivate this delivery area assignment?')) return;

    try {
      await deactivateHubRiderAreaApi(detailData.id, areaId);
      showToast('Area assignment deactivated.', 'success');
      const freshDetail = await getHubRiderDetailApi(detailData.id);
      setDetailData(freshDetail);
      fetchRiders();
    } catch (err) {
      console.error('Failed to deactivate area:', err);
      showToast('Could not deactivate area assignment.', 'error');
    }
  }

  // Toggle barangay in area selector
  function toggleBarangay(code: string) {
    setAreaFormBarangays((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function toggleApproveBarangay(code: string) {
    setApproveSelectedBarangays((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={Bike}
        eyebrow="People"
        title="Riders & Fleet"
        subtitle="Review courier applications, verify their documents, and map active couriers to the barangays they deliver in."
      >
        <LiveStamp updatedAt={lastUpdated} />
      </PageHero>
      {/* ─── Summary: each card is also the filter ─────────────────── */}
      <section aria-label="Courier summary" className="grid grid-cols-3 gap-2.5">
        <StatCard compact icon={Clock} label="Pending couriers" value={counts.pending} subtext="Awaiting your review" iconBg="bg-amber-50" iconColor="text-amber-600" onClick={() => handleTabChange('PENDING')} active={currentTab === 'PENDING'} />
        <StatCard compact icon={CheckCircle} label="Active couriers" value={counts.active} subtext="Authorized fleet" iconBg="bg-emerald-50" iconColor="text-emerald-600" onClick={() => handleTabChange('ACTIVE')} active={currentTab === 'ACTIVE'} />
        <StatCard compact icon={XCircle} label="Disapproved" value={counts.disapproved} subtext="Declined applications" iconBg="bg-stone-100" iconColor="text-stone-600" onClick={() => handleTabChange('DISAPPROVED')} active={currentTab === 'DISAPPROVED'} />
      </section>
      {/* ─── Controls Bar: Status Tabs and Search ─────────── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-3 shadow-xs space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl overflow-x-auto">
          {[
            { key: 'PENDING', label: 'Pending', count: counts.pending },
            { key: 'ACTIVE', label: 'Active', count: counts.active },
            { key: 'DISAPPROVED', label: 'Disapproved', count: counts.disapproved },
            { key: 'ALL', label: 'All Fleet', count: counts.all },
          ].map(({ key, label, count }) => {
            const isActive = currentTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleTabChange(key as RiderStatus | 'ALL')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? 'bg-white text-brand-red shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-red-100 text-brand-red-dark' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchInputValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search name, phone, plate..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-colors"
            />
          </div>

        </div>
      </div>

      {/* ─── Main Content: Couriers Table & Mobile Cards ───────────── */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-xs space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-red mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Loading courier applications…</p>
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-xs space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm font-bold text-gray-900">Failed to load couriers</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => fetchRiders()}
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors mt-2"
          >
            Retry Loading
          </button>
        </div>
      ) : riders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-xs space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
            <Bike className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-gray-900">No courier applications found</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {currentSearch
              ? `No records match your search query "${currentSearch}".`
              : `There are currently no ${currentTab.toLowerCase()} couriers in this sorting center.`}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Courier Name & Contact</th>
                  <th className="py-3 px-4 font-bold">Vehicle & Plate</th>
                  <th className="py-3 px-4 font-bold">Applied On</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Assigned Areas</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {riders.map((r) => {
                  const needsArea = r.status === 'ACTIVE' && r.active_areas_count === 0;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm text-gray-900">
                          {r.user.first_name} {r.user.last_name}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {r.user.email} &bull; {r.user.phone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{r.vehicle_type}</span>
                        </div>
                        <div className="font-mono text-[11px] text-brand-red font-medium">
                          {r.plate_number}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-600">
                        {formatDate(r.submitted_at || r.created_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        <RiderStatusBadge status={r.status} />
                      </td>
                      <td className="py-3.5 px-4">
                        {needsArea ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Needs Area
                          </span>
                        ) : (
                          <span className="text-gray-700 font-medium">
                            {r.active_areas_count} {r.active_areas_count === 1 ? 'Area' : 'Areas'} active
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openDetail(r.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold shadow-2xs hover:border-gray-300 transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          <span>Review</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile & Tablet Card View */}
          <div className="md:hidden divide-y divide-gray-100">
            {riders.map((r) => {
              const needsArea = r.status === 'ACTIVE' && r.active_areas_count === 0;
              return (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900">
                        {r.user.first_name} {r.user.last_name}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">{r.user.email}</p>
                    </div>
                    <RiderStatusBadge status={r.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 p-2.5 rounded-xl">
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold">Vehicle / Plate</span>
                      <p className="font-medium text-gray-800">
                        {r.vehicle_type} ({r.plate_number})
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase font-bold">Areas Assigned</span>
                      <p className="font-medium text-gray-800">
                        {needsArea ? (
                          <span className="text-amber-700 font-semibold text-[11px]">Needs Area</span>
                        ) : (
                          `${r.active_areas_count} active`
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-400">
                      Applied {formatDate(r.submitted_at || r.created_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openDetail(r.id)}
                      className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Review</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {meta.last_page > 1 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <div>
                Showing <strong>{meta.from || 0}</strong> to <strong>{meta.to || 0}</strong> of{' '}
                <strong>{meta.total}</strong> applications
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set('page', String(Math.max(meta.current_page - 1, 1)));
                      return next;
                    })
                  }
                  disabled={meta.current_page <= 1}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-bold text-gray-700">
                  {meta.current_page} / {meta.last_page}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set('page', String(Math.min(meta.current_page + 1, meta.last_page)));
                      return next;
                    })
                  }
                  disabled={meta.current_page >= meta.last_page}
                  className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Detail Modal / Drawer ──────────────────────────────────── */}
      {selectedRiderId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={closeDetail}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl relative space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {detailLoading
                      ? 'Loading Application…'
                      : detailData
                      ? `${detailData.user.first_name} ${detailData.user.last_name}`
                      : 'Courier Details'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    Application ID: #{selectedRiderId} &bull; Registered Courier
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-16 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-brand-red" />
                <span>Loading application profile and verification documents…</span>
              </div>
            ) : !detailData ? (
              <div className="py-12 text-center text-xs text-red-500">
                Could not load application data.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Status Bar */}
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">Current Status:</span>
                    <RiderStatusBadge status={detailData.status} />
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Submitted: {formatDateTime(detailData.submitted_at || detailData.created_at)}
                  </span>
                </div>

                {/* Disapproval Notice if applicable */}
                {detailData.status === 'DISAPPROVED' && detailData.rejection_reason && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                      <XCircle className="w-4 h-4 text-red-600" />
                      Disapproval Reason Recorded:
                    </div>
                    <p className="text-xs text-red-700 italic pl-5">
                      &ldquo;{detailData.rejection_reason}&rdquo;
                    </p>
                    {detailData.reviewer_name && (
                      <p className="text-[10px] text-red-500 pl-5">
                        Reviewed by {detailData.reviewer_name} on {formatDate(detailData.reviewed_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Section 1: Personal & Residential Info */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-brand-red uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Personal Credentials
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Email</span>
                      <span className="font-semibold text-gray-900 break-all">{detailData.user.email}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Mobile Number</span>
                      <span className="font-semibold text-gray-900">{detailData.user.phone}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Biological Sex</span>
                      <span className="font-semibold text-gray-900 capitalize">{detailData.user.sex || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Date of Birth & Age</span>
                      <span className="font-semibold text-gray-900">
                        {formatDate(detailData.user.date_of_birth)} ({calcAge(detailData.user.date_of_birth)})
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Residential Address</span>
                      <span className="font-semibold text-gray-900">
                        {detailData.address
                          ? `${detailData.address.street || ''}, Brgy. ${detailData.address.barangay}, ${detailData.address.city}, ${detailData.address.province}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Vehicle Information */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-brand-red uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" /> Delivery Vehicle
                  </h3>
                  <div className="grid grid-cols-2 gap-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">Vehicle Type</span>
                      <span className="font-bold text-gray-900">{detailData.vehicle_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] block font-semibold uppercase">License Plate Number</span>
                      <span className="font-mono font-bold text-blue-700">{detailData.plate_number}</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Verification Documents */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-brand-red uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Document Verification
                  </h3>
                  <div className="space-y-2">
                    <SecureDocRow
                      label="Official Receipt / Certificate of Registration (OR/CR)"
                      urlEndpoint={detailData.documents.or_cr_url}
                      onViewImage={(url, title) => setLightbox({ url, title })}
                    />
                    <SecureDocRow
                      label="Driver's License / Official ID"
                      urlEndpoint={detailData.documents.drivers_license_url}
                      onViewImage={(url, title) => setLightbox({ url, title })}
                    />
                  </div>
                </div>

                {/* Section 4: Delivery Area Assignments (For ACTIVE or PENDING) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-brand-red uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" /> Delivery Area Coverage
                    </h3>
                    {detailData.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={openCreateAreaModal}
                        className="text-xs font-bold text-brand-red hover:text-brand-red-dark flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Assign Delivery Area
                      </button>
                    )}
                  </div>

                  {detailData.area_assignments && detailData.area_assignments.length > 0 ? (
                    <div className="space-y-2">
                      {detailData.area_assignments.map((area) => (
                        <div
                          key={area.id}
                          className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                            area.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{area.area_label}</span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                                  area.is_active
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                {area.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {area.coverage_barangays.map((bgy) => (
                                <span
                                  key={bgy}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-800 border border-blue-100"
                                >
                                  PSGC {bgy}
                                </span>
                              ))}
                            </div>
                          </div>

                          {detailData.status === 'ACTIVE' && area.is_active && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditAreaModal(area)}
                                className="p-1.5 text-gray-500 hover:text-brand-red rounded-lg hover:bg-gray-100 transition-colors"
                                title="Edit Area"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeactivateArea(area.id)}
                                className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100 transition-colors"
                                title="Deactivate Area"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-xs text-gray-400">
                      {detailData.status === 'ACTIVE'
                        ? 'No delivery areas assigned yet. Click "Assign Delivery Area" to designate coverage.'
                        : 'Areas will be designated upon or after application approval.'}
                    </div>
                  )}
                </div>

                {/* Section 5: Decision Controls (PENDING applications only) */}
                {detailData.status === 'PENDING' && (
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={approving || disapproving}
                      onClick={() => {
                        setDisapproveReason('');
                        setDisapproveError(null);
                        setDisapproveModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      Disapprove Application
                    </button>

                    <Button
                      type="button"
                      disabled={approving || disapproving}
                      onClick={() => {
                        setApproveAreaLabel('Area A - Central District');
                        setApproveSelectedBarangays([]);
                        setApproveConfirmOpen(true);
                      }}
                      className="px-5 py-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve Courier</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Approve Confirmation Modal (With Optional Initial Area) ─ */}
      {approveConfirmOpen && detailData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => !approving && setApproveConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900">Approve Courier Application</h3>
                <p className="text-xs text-gray-500">
                  {detailData.user.first_name} {detailData.user.last_name} &bull; {detailData.plate_number}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Authorizing this courier will change their status to <strong>ACTIVE</strong> and send an official approval email. They will gain immediate access to report for dispatch.
            </p>

            {/* Optional Initial Area Assignment */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Initial Area Assignment (Optional)
                </span>
                <span className="text-[10px] text-blue-700">Can also be added later</span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                  Area Label
                </label>
                <input
                  type="text"
                  value={approveAreaLabel}
                  onChange={(e) => setApproveAreaLabel(e.target.value)}
                  placeholder="e.g. Area A - Central District"
                  className="w-full h-8 px-2.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-900"
                />
              </div>

              {hubCoverage && hubCoverage.coverage_barangays.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                    Select Barangays within Hub Jurisdiction ({hubCoverage.coverage_barangays.length} available)
                  </label>
                  <div className="max-h-28 overflow-y-auto p-2 bg-white border border-gray-200 rounded-lg flex flex-wrap gap-1.5">
                    {hubCoverage.coverage_barangays.map((bgy) => {
                      const selected = approveSelectedBarangays.includes(bgy);
                      return (
                        <button
                          key={bgy}
                          type="button"
                          onClick={() => toggleApproveBarangay(bgy)}
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-all ${
                            selected
                              ? 'bg-brand-red text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {bgy} {selected && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={approving}
                onClick={() => setApproveConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                disabled={approving}
                onClick={handleApprove}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {approving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Approving…</span>
                  </>
                ) : (
                  <span>Confirm Approval</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Disapprove Reason Modal ─────────────────────────────────── */}
      {disapproveModalOpen && detailData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
          onClick={() => !disapproving && setDisapproveModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900">Disapprove Application</h3>
                <p className="text-xs text-gray-500">
                  {detailData.user.first_name} {detailData.user.last_name}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600">
              Please state the specific reason for declining this courier application. This explanation will be delivered directly to the applicant&apos;s registered email.
            </p>

            <div>
              <textarea
                value={disapproveReason}
                onChange={(e) => {
                  setDisapproveReason(e.target.value);
                  if (disapproveError) setDisapproveError(null);
                }}
                maxLength={500}
                rows={4}
                placeholder="e.g. Land Transportation Office (LTO) driver's license image is expired or unreadable..."
                className="w-full p-3 text-xs bg-white border border-gray-200 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-none transition-colors"
              />
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                <span>{disapproveError ? <span className="text-red-600">{disapproveError}</span> : 'Required field'}</span>
                <span>{disapproveReason.length} / 500</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={disapproving}
                onClick={() => setDisapproveModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                disabled={disapproving}
                onClick={handleDisapprove}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {disapproving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Disapproving…</span>
                  </>
                ) : (
                  <span>Send Disapproval</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Area Assignment Edit/Create Modal (Part 3) ─────────────── */}
      {areaModalOpen && detailData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => !savingArea && setAreaModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">
                    {editingArea ? 'Edit Delivery Area' : 'Assign Delivery Area'}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Courier: {detailData.user.first_name} {detailData.user.last_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAreaModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {areaFormError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{areaFormError}</span>
              </div>
            )}

            {/* Area Label Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Area Label / Sector Name</label>
              <input
                type="text"
                value={areaFormLabel}
                onChange={(e) => setAreaFormLabel(e.target.value)}
                placeholder="e.g. Area A - Central District"
                className="w-full h-9 px-3 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-gray-400 self-center">Presets:</span>
                {PRESET_AREA_LABELS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAreaFormLabel(preset)}
                    className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600 transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Barangay Multi-Select Chips */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">
                  Designated Barangays ({areaFormBarangays.length} selected)
                </label>
                {hubCoverage && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setAreaFormBarangays(hubCoverage.coverage_barangays)}
                      className="text-brand-red hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAreaFormBarangays([])}
                      className="text-gray-500 hover:underline font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {hubCoverage && hubCoverage.coverage_barangays.length > 0 ? (
                <div className="max-h-48 overflow-y-auto p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex flex-wrap gap-1.5">
                  {hubCoverage.coverage_barangays.map((code) => {
                    const isSelected = areaFormBarangays.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleBarangay(code)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                          isSelected
                            ? 'bg-brand-red text-white shadow-2xs'
                            : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {code} {isSelected && '✓'}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No hub coverage barangays found.</p>
              )}
              <p className="text-[11px] text-gray-400">
                Only barangays officially assigned to this sorting center hub jurisdiction can be dispatched.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                disabled={savingArea}
                onClick={() => setAreaModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                disabled={savingArea}
                onClick={handleSaveArea}
                className="text-xs bg-brand-red hover:bg-brand-red-dark text-white font-bold"
              >
                {savingArea ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Area…</span>
                  </>
                ) : (
                  <span>Save Area Assignment</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Image Lightbox ─────────────────────────────────────────── */}
      {lightbox && (
        <ImageLightbox
          url={lightbox.url}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
