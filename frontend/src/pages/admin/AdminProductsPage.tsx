import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomSelect from '../../components/ui/CustomSelect';
import { createPortal } from 'react-dom';
import {
  getAdminProductsApi, getAdminProductStatsApi,
  approveAdminProductApi, rejectAdminProductApi, archiveAdminProductApi,
  reactivateAdminProductApi,
  type AdminProduct,
} from '../../api/client';
import type { PaginatedResponse } from '../../types';
import { Search, ChevronLeft, ChevronRight, Package, CheckCircle2, XCircle, Eye, X, Clock, ShieldCheck, Ban, Archive, RotateCcw } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_TABS = [
  { value: '',               label: 'All',            statsKey: null },
  { value: 'pending_review', label: 'Pending Review', statsKey: 'pending_review' as const },
  { value: 'active',         label: 'Active',         statsKey: 'active'         as const },
  { value: 'draft',          label: 'Drafts',         statsKey: 'draft'          as const },
  { value: 'rejected',       label: 'Rejected',       statsKey: 'rejected'       as const },
  { value: 'archived',       label: 'Archived',       statsKey: 'archived'       as const },
];

const STATUS_STYLES: Record<string, string> = {
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
  active:         'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected:       'bg-red-50 text-red-700 border-red-100',
  draft:          'bg-blue-50 text-blue-600 border-blue-100',
  archived:       'bg-gray-50 text-gray-400 border-gray-100',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

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

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  product,
  onConfirm,
  onCancel,
}: {
  product: AdminProduct;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-gray-900">Reject Product</p>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <p className="text-[13px] text-gray-500">
          Rejecting <span className="font-semibold text-gray-700">"{product.name}"</span>. The seller will see this reason.
        </p>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this product is being rejected…"
          className="w-full px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 resize-none"
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Archive Modal ───────────────────────────────────────────────────────────

function ArchiveModal({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-gray-900">Archive Product</p>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <p className="text-[13px] text-gray-500">
          Archiving <span className="font-semibold text-gray-700">"{name}"</span>. The seller will be notified with this reason and must edit &amp; resubmit to restore it.
        </p>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this product is being archived…"
          className="w-full px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 resize-none"
        />
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 text-white text-[13px] font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Product View Modal (read-only) ──────────────────────────────────────────

function ProductViewModal({
  product,
  onClose,
  onApprove,
  onReject,
  onArchive,
  onReactivate,
  actioning,
}: {
  product: AdminProduct;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onArchive: () => void;
  onReactivate: () => void;
  actioning: boolean;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = product.images.length > 0 ? product.images : [];

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  function InfoBlock({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
        <div className="text-[13px] font-semibold text-gray-800">{value}</div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
            <div className="min-w-0 pr-4">
              <h2 className="text-[16px] font-black text-gray-900 leading-tight truncate">{product.name}</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">
                by <span className="font-semibold text-gray-600">{product.seller?.full_name ?? '—'}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                {product.seller?.email ?? ''}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <StatusBadge status={product.status} />
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT — images */}
              <div className="space-y-3">
                {images.length > 0 ? (
                  <>
                    <div className="w-full aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-100">
                      <img
                        src={images[imgIdx]?.url}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {images.length > 1 && (
                      <div className="flex gap-2 flex-wrap">
                        {images.map((img, i) => (
                          <button
                            key={img.id}
                            onClick={() => setImgIdx(i)}
                            className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors ${
                              i === imgIdx ? 'border-brand-red' : 'border-gray-100 hover:border-gray-300'
                            }`}
                          >
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full aspect-square rounded-2xl bg-gray-100 border border-gray-100 flex items-center justify-center">
                    <Package className="w-12 h-12 text-gray-300" />
                  </div>
                )}
              </div>

              {/* RIGHT — details */}
              <div className="space-y-4">
                {/* Key info grid */}
                <div className="grid grid-cols-2 gap-2">
                  <InfoBlock label="Base Price" value={fmt(product.base_price)} />
                  <InfoBlock label="Submitted" value={fmtDate(product.created_at)} />
                  <InfoBlock label="Units Sold" value={product.units_sold} />
                  <InfoBlock label="Variants" value={`${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''}`} />
                </div>

                {/* Description */}
                {product.description && (
                  <div>
                    <p className="text-[10px] font-bold text-brand-red uppercase tracking-[0.12em] mb-2">Description</p>
                    <div
                      className="text-[13px] text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3 prose prose-sm max-w-none [&_img]:rounded-xl [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                      dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                  </div>
                )}

                {/* Rejection / archive reason */}
                {product.rejection_reason && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">Rejection Reason</p>
                    <p className="text-[13px] text-red-700 leading-relaxed">{product.rejection_reason}</p>
                  </div>
                )}
                {product.archive_reason && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Archive Reason</p>
                    <p className="text-[13px] text-gray-600 leading-relaxed">{product.archive_reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Variants table — full width below */}
            {product.variants.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] font-bold text-brand-red uppercase tracking-[0.12em] mb-2">Variants</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Label</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Price</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Stock</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">SKU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {product.variants.map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{v.label}</td>
                          <td className="px-4 py-2.5 text-gray-600">{fmt(v.price)}</td>
                          <td className="px-4 py-2.5 text-gray-600">{v.stock_quantity}</td>
                          <td className="px-4 py-2.5 text-gray-400">{v.sku ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors min-h-[40px]"
            >
              Close
            </button>
            <div className="flex gap-2">
              {product.status === 'pending_review' && (
                <>
                  <button
                    disabled={actioning}
                    onClick={onReject}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-[13px] font-bold hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[40px]"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button
                    disabled={actioning}
                    onClick={onApprove}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 min-h-[40px]"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                </>
              )}
              {(product.status === 'active' || product.status === 'draft' ||
                (product.status === 'archived' && product.archived_by === 'seller')) && (
                <button
                  disabled={actioning}
                  onClick={onArchive}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 text-[13px] font-bold hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-[40px]"
                >
                  <Archive className="w-4 h-4" /> Archive
                </button>
              )}
              {product.status === 'archived' && product.archived_by === 'admin' && (
                <button
                  disabled={actioning}
                  onClick={onReactivate}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 min-h-[40px]"
                >
                  <RotateCcw className="w-4 h-4" /> Reactivate
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminProductsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedResponse<AdminProduct> | null>(null);
  const [stats, setStats] = useState<{ pending_review: number; active: number; rejected: number; archived: number; draft?: number } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminProduct | null>(null);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('pending_review');
  const [page, setPage]         = useState(1);
  const [perPage, setPerPage]   = useState('50');
  const [actioning, setActioning] = useState(false);
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminProductsApi({
        status: status || undefined,
        search: search || undefined,
        page,
        per_page: Number(perPage),
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [status, search, page, perPage]);

  useEffect(() => { load(); }, [load]);

  const refreshStats = () => getAdminProductStatsApi().then(setStats).catch(() => null);
  useEffect(() => { refreshStats(); }, []);

  const handleAdminArchive = async (product: AdminProduct, reason: string) => {
    setActioning(true);
    try {
      const updated = await archiveAdminProductApi(product.id, reason);
      setData((prev) => prev ? {
        ...prev,
        data: prev.data.map((p) => p.id === updated.id ? updated : p),
      } : prev);
      if (selected?.id === updated.id) setSelected(updated);
      setArchiveTarget(null);
      refreshStats();
    } finally {
      setActioning(false);
    }
  };

  const handleApprove = async (product: AdminProduct) => {
    setActioning(true);
    try {
      const updated = await approveAdminProductApi(product.id);
      setData((prev) => prev ? {
        ...prev,
        data: prev.data.map((p) => p.id === updated.id ? updated : p),
      } : prev);
      if (selected?.id === updated.id) setSelected(updated);
      refreshStats();
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (product: AdminProduct, reason: string) => {
    setActioning(true);
    try {
      const updated = await rejectAdminProductApi(product.id, reason);
      setData((prev) => prev ? {
        ...prev,
        data: prev.data.map((p) => p.id === updated.id ? updated : p),
      } : prev);
      if (selected?.id === updated.id) setSelected(updated);
      setRejectTarget(null);
      refreshStats();
    } finally {
      setActioning(false);
    }
  };

  const handleReactivate = async (product: AdminProduct) => {
    setActioning(true);
    try {
      const updated = await reactivateAdminProductApi(product.id);
      setData((prev) => prev ? {
        ...prev,
        data: prev.data.map((p) => p.id === updated.id ? updated : p),
      } : prev);
      if (selected?.id === updated.id) setSelected(updated);
      refreshStats();
    } finally {
      setActioning(false);
    }
  };

  const products = data?.data ?? [];
  const meta = data?.meta;

  const cntPending  = useCountUp(stats?.pending_review ?? 0);
  const cntActive   = useCountUp(stats?.active ?? 0);
  const cntRejected = useCountUp(stats?.rejected ?? 0);
  const cntArchived = useCountUp(stats?.archived ?? 0);

  const pageRef = useMountAnim();

  return (
    <div ref={pageRef} className="space-y-6">
      {/* Hero band */}
      <div
        className="rounded-2xl px-7 py-6 overflow-hidden relative"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1">
          Admin / Catalog
        </p>
        <h1 className="text-[26px] font-black text-white leading-tight tracking-tight">
          Products
        </h1>
        <p className="text-[12px] text-white/50 mt-1.5">
          Review submitted products and manage the marketplace catalog
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pending Review', value: cntPending,  icon: Clock,       color: 'text-amber-500',   bg: 'bg-amber-50'   },
            { label: 'Active',         value: cntActive,   icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Rejected',       value: cntRejected, icon: Ban,         color: 'text-red-500',     bg: 'bg-red-50'     },
            { label: 'Archived',       value: cntArchived, icon: Archive,     color: 'text-gray-400',    bg: 'bg-gray-50'    },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className={`text-[22px] font-black leading-none ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + search */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">All Products</h2>
        </div>
        <div className="flex items-center gap-0.5 px-4 pt-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map((tab) => {
            const active = status === tab.value;
            const count = tab.statsKey ? (stats?.[tab.statsKey] ?? 0) : null;
            return (
              <button
                key={tab.value}
                onClick={() => { setStatus(tab.value); setPage(1); }}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[12.5px] font-semibold whitespace-nowrap transition-all border-b-2',
                  active
                    ? 'text-brand-red border-brand-red bg-red-50/50'
                    : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50',
                ].join(' ')}
              >
                {tab.label}
                {count != null && count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none ${
                    tab.statsKey === 'pending_review'
                      ? active ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'
                      : active ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by product, seller, price, status, date…"
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 bg-gray-50 focus:bg-white transition-all"
            />
          </div>
          <CustomSelect
            value={perPage}
            onChange={(v) => { setPerPage(v); setPage(1); }}
            options={[
              { value: '50',  label: '50 / page' },
              { value: '100', label: '100 / page' },
            ]}
            className="w-32"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-t border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide w-12" />
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Product</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Seller</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Price</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <Package className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-[14px] font-bold text-gray-700">No products found</p>
                    <p className="text-[12px] text-gray-400 mt-1">Try adjusting your filters or search query.</p>
                  </td>
                </tr>
              )}
              {!loading && products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/admin/products/${p.id}/review`)}
                  className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-100 shrink-0">
                      {p.thumbnail_url
                        ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="font-semibold text-gray-800 hover:text-brand-red transition-colors truncate max-w-[180px] mx-auto">{p.name}</p>
                    <p className="text-[11px] text-gray-400">{p.variants.length} variant{p.variants.length !== 1 ? 's' : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-center hidden sm:table-cell">
                    <p className="truncate max-w-[140px] mx-auto">{p.seller?.full_name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-700 text-center hidden md:table-cell">{fmt(p.base_price)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-gray-400 text-center hidden lg:table-cell">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => navigate(`/admin/products/${p.id}/review`)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                          p.status === 'pending_review'
                            ? 'bg-brand-red text-white hover:bg-brand-red-dark'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {p.status === 'pending_review' ? 'Review' : 'View'}
                      </button>
                      {p.status === 'pending_review' && (
                        <>
                          <button
                            disabled={actioning}
                            onClick={() => handleApprove(p)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            disabled={actioning}
                            onClick={() => setRejectTarget(p)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {(p.status === 'active' || p.status === 'draft' ||
                        (p.status === 'archived' && p.archived_by === 'seller')) && (
                        <button
                          disabled={actioning}
                          onClick={() => setArchiveTarget(p)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                      )}
                      {p.status === 'archived' && p.archived_by === 'admin' && (
                        <button
                          disabled={actioning}
                          onClick={() => handleReactivate(p)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <p className="text-[12px] font-semibold text-gray-500">
              {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} products
            </p>
            {meta.last_page > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40 hover:border-brand-red hover:text-brand-red transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[12px] font-medium text-gray-600 px-1">{page} / {meta.last_page}</span>
                <button
                  disabled={page >= meta.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40 hover:border-brand-red hover:text-brand-red transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product view modal */}
      {selected && createPortal(
        <ProductViewModal
          product={selected}
          onClose={() => setSelected(null)}
          onApprove={() => handleApprove(selected)}
          onReject={() => setRejectTarget(selected)}
          onArchive={() => setArchiveTarget(selected)}
          onReactivate={() => handleReactivate(selected)}
          actioning={actioning}
        />,
        document.body
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          product={rejectTarget}
          onConfirm={(reason) => handleReject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* Archive modal */}
      {archiveTarget && (
        <ArchiveModal
          name={archiveTarget.name}
          onConfirm={(reason) => handleAdminArchive(archiveTarget, reason)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
