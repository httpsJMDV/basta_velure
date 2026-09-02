import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  getAdminProductApi,
  approveAdminProductApi,
  rejectAdminProductApi,
  archiveAdminProductApi,
  reactivateAdminProductApi,
  getAdminProductDocBlobUrl,
  type AdminProduct,
} from '../../api/client';
import {
  ChevronLeft, Package, CheckCircle2, XCircle, FileText,
  Store, Mail, Phone, Calendar, ShieldCheck,
  AlertTriangle, Eye, Download, X, Layers, ExternalLink,
  Box, AlertCircle, RotateCcw, Archive, FileCheck,
  Loader2
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  pending_review: { badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending Review' },
  active:         { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Active' },
  rejected:       { badge: 'bg-red-50 text-red-700 border-red-200', label: 'Rejected' },
  draft:          { badge: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Draft' },
  archived:       { badge: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Archived' },
};

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  productName,
  onConfirm,
  onCancel,
  submitting,
}: {
  productName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
              <XCircle className="w-5 h-5" />
            </div>
            <p className="text-[16px] font-bold text-gray-900">Reject Product</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <p className="text-[13px] text-gray-600">
          Rejecting <span className="font-semibold text-gray-800">"{productName}"</span>. Please provide a clear feedback note so the seller can make corrections and resubmit.
        </p>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. FDA documentation is unclear or expired, product description lacks required ingredients list…"
          className="w-full px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 resize-none"
        />
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim() || submitting}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Archive Modal ───────────────────────────────────────────────────────────

function ArchiveModal({
  productName,
  onConfirm,
  onCancel,
  submitting,
}: {
  productName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState('');
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
              <Archive className="w-4 h-4" />
            </div>
            <p className="text-[16px] font-bold text-gray-900">Archive Product</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <p className="text-[13px] text-gray-600">
          Archiving <span className="font-semibold text-gray-800">"{productName}"</span> will hide it from the marketplace storefront.
        </p>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for archiving (visible to seller)…"
          className="w-full px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 resize-none"
        />
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim() || submitting}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 py-2.5 rounded-xl bg-gray-800 text-white text-[13px] font-bold hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Archive
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────

function DocumentViewerModal({
  docTitle,
  blobUrl,
  mimeType,
  onClose,
}: {
  docTitle: string;
  blobUrl: string;
  mimeType: string;
  onClose: () => void;
}) {
  const isPdf = mimeType.includes('pdf') || blobUrl.endsWith('.pdf');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-brand-red flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-gray-900">{docTitle}</p>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">{isPdf ? 'PDF Document' : 'Image Document'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={blobUrl}
              download={docTitle.replace(/\s+/g, '_').toLowerCase()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-semibold hover:bg-gray-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100 flex items-center justify-center min-h-[500px]">
          {isPdf ? (
            <iframe
              src={blobUrl}
              title={docTitle}
              className="w-full h-[70vh] rounded-xl border border-gray-200 shadow-sm bg-white"
            />
          ) : (
            <img
              src={blobUrl}
              alt={docTitle}
              className="max-w-full max-h-[75vh] rounded-xl object-contain shadow-md bg-white p-2 border border-gray-200"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main AdminProductReviewPage Component ───────────────────────────────────

export default function AdminProductReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pageRef = useMountAnim();

  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);

  // Gallery
  const [activeImgIdx, setActiveImgIdx] = useState(0);

  // Modals
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // Document Viewer
  const [activeDoc, setActiveDoc] = useState<{ title: string; blobUrl: string; mimeType: string } | null>(null);
  const [loadingDocType, setLoadingDocType] = useState<'fda-lto' | 'fda-cpr' | null>(null);

  // Fetch product
  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminProductApi(Number(id));
      setProduct(data);
    } catch {
      setError('Product not found or unable to load details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  // Actions
  const handleApprove = async () => {
    if (!product) return;
    setActioning(true);
    try {
      const updated = await approveAdminProductApi(product.id);
      setProduct(updated);
    } catch {
      alert('Failed to approve product. Please try again.');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!product) return;
    setActioning(true);
    try {
      const updated = await rejectAdminProductApi(product.id, reason);
      setProduct(updated);
      setShowRejectModal(false);
    } catch {
      alert('Failed to reject product. Please try again.');
    } finally {
      setActioning(false);
    }
  };

  const handleArchive = async (reason: string) => {
    if (!product) return;
    setActioning(true);
    try {
      const updated = await archiveAdminProductApi(product.id, reason);
      setProduct(updated);
      setShowArchiveModal(false);
    } catch {
      alert('Failed to archive product. Please try again.');
    } finally {
      setActioning(false);
    }
  };

  const handleReactivate = async () => {
    if (!product) return;
    setActioning(true);
    try {
      const updated = await reactivateAdminProductApi(product.id);
      setProduct(updated);
    } catch {
      alert('Failed to reactivate product. Please try again.');
    } finally {
      setActioning(false);
    }
  };

  // Preview Document
  const handleViewDoc = async (docType: 'fda-lto' | 'fda-cpr', title: string) => {
    if (!product) return;
    setLoadingDocType(docType);
    try {
      const { url, type } = await getAdminProductDocBlobUrl(product.id, docType);
      setActiveDoc({ title, blobUrl: url, mimeType: type });
    } catch {
      alert(`Could not load ${title}. File may not exist on server.`);
    } finally {
      setLoadingDocType(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div className="h-10 w-48 bg-gray-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-80 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse" />
            <div className="h-60 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-64 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse" />
            <div className="h-48 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-brand-red flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Product Not Found</h2>
        <p className="text-gray-500 text-sm">{error ?? 'The requested product could not be loaded.'}</p>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-red-dark transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Products
        </Link>
      </div>
    );
  }

  const images = product.images.length > 0 ? product.images : [];
  const statusInfo = STATUS_STYLES[product.status] ?? { badge: 'bg-gray-100 text-gray-700', label: product.status };

  return (
    <div ref={pageRef} className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* ── Luxury Hero Band / Navigation ── */}
      <div
        className="rounded-3xl p-6 sm:p-7 relative overflow-hidden shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-start gap-4 min-w-0">
          <button
            onClick={() => navigate('/admin/products')}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-colors shrink-0 mt-0.5"
            title="Back to Products"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.badge}`}>
                {statusInfo.label}
              </span>
              {product.category && (
                <span className="text-[12px] text-white/70 font-medium flex items-center gap-1.5">
                  <span>·</span>
                  <span className="text-white/90 font-semibold">{product.category.name}</span>
                </span>
              )}
              <span className="text-[12px] text-white/50">· ID #{product.id}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">{product.name}</h1>
            <p className="text-xs text-white/60">
              Submitted by <span className="text-white/90 font-semibold">{product.seller?.shop_name || 'Seller'}</span> · Base Price: <span className="text-white font-bold">{fmt(Number(product.base_price))}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {product.status === 'pending_review' && (
            <>
              <button
                disabled={actioning}
                onClick={() => setShowRejectModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-red-500/20 text-red-200 border border-red-400/30 text-xs font-bold transition-all disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 text-red-400" /> Reject
              </button>
              <button
                disabled={actioning}
                onClick={handleApprove}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve Product
              </button>
            </>
          )}

          {product.status === 'active' && (
            <button
              disabled={actioning}
              onClick={() => setShowArchiveModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition-colors disabled:opacity-50"
            >
              <Archive className="w-4 h-4" /> Archive Product
            </button>
          )}

          {(product.status === 'archived' || product.status === 'rejected') && (
            <button
              disabled={actioning}
              onClick={handleReactivate}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-md"
            >
              <RotateCcw className="w-4 h-4" /> Reactivate / Approve
            </button>
          )}
        </div>
      </div>

      {/* ── Status Alerts (Rejection / Archive reason) ── */}
      {product.status === 'rejected' && product.rejection_reason && (
        <div className="bg-red-50/80 border border-red-200 rounded-2xl p-4.5 flex items-start gap-3.5">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-[13px]">
            <p className="font-bold text-red-900">Product Rejected Reason</p>
            <p className="text-red-700 mt-0.5 leading-relaxed">{product.rejection_reason}</p>
          </div>
        </div>
      )}

      {product.status === 'archived' && product.archive_reason && (
        <div className="bg-gray-100 border border-gray-200 rounded-2xl p-4.5 flex items-start gap-3.5">
          <Archive className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div className="text-[13px]">
            <p className="font-bold text-gray-800">
              Archived by {product.archived_by === 'admin' ? 'Administrator' : 'Seller'}
            </p>
            <p className="text-gray-600 mt-0.5 leading-relaxed">{product.archive_reason}</p>
          </div>
        </div>
      )}

      {/* ── 2-Column Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN (Product Photos, Rich Description, Variants, Specs) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Image Gallery Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-red" /> Product Images ({images.length})
              </h2>
            </div>

            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="w-full h-80 sm:h-96 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={images[activeImgIdx]?.url}
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                {images.length > 1 && (
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setActiveImgIdx(i)}
                        className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                          i === activeImgIdx ? 'border-brand-red ring-2 ring-red-100' : 'border-gray-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                        {img.is_primary && (
                          <span className="absolute bottom-0 inset-x-0 bg-brand-red text-white text-[8px] font-bold text-center py-0.2">
                            MAIN
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 rounded-2xl bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Package className="w-8 h-8 text-gray-300" />
                <p className="text-[13px]">No product photos uploaded.</p>
              </div>
            )}
          </div>

          {/* 2. Rich HTML Description Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
            <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-red" /> Formatted Description
            </h2>

            {product.description ? (
              <div className="rounded-2xl bg-gray-50/60 p-5 border border-gray-100">
                <div
                  className="prose prose-sm max-w-none text-gray-700 leading-relaxed [&_img]:rounded-xl [&_img]:max-w-full [&_img]:shadow-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h2]:text-base [&_p]:mb-2.5 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            ) : (
              <p className="text-[13px] text-gray-400 italic py-4">No description provided by seller.</p>
            )}
          </div>

          {/* 3. Variants & Inventory Card (Full width table) */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-red" /> Variants &amp; Inventory ({product.variants.length})
              </h2>
            </div>

            {product.variants.length > 0 ? (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-left">
                      <th className="px-4 py-3 font-bold text-gray-400 text-[11px] uppercase tracking-wider">Option Combination</th>
                      <th className="px-4 py-3 font-bold text-gray-400 text-[11px] uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-3 font-bold text-gray-400 text-[11px] uppercase tracking-wider">Price (₱)</th>
                      <th className="px-4 py-3 font-bold text-gray-400 text-[11px] uppercase tracking-wider">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {product.variants.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-800">{v.label}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[12px]">{v.sku || '—'}</td>
                        <td className="px-4 py-3 font-bold text-brand-red">{fmt(v.price)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            v.stock_quantity > 10
                              ? 'bg-emerald-50 text-emerald-700'
                              : v.stock_quantity > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {v.stock_quantity} in stock
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold text-gray-800">Standard Single Product</p>
                  <p className="text-[12px] text-gray-400">Base Price: {fmt(product.base_price)}</p>
                </div>
              </div>
            )}
          </div>

          {/* 4. Food & Health Safety Specifications */}
          {(product.ingredients || product.allergen_info || product.expiry_best_before || product.net_weight_volume || product.storage_instructions) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-red" /> Safety &amp; Regulatory Specifications
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {product.net_weight_volume && (
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Net Weight / Volume</p>
                    <p className="text-[13px] font-semibold text-gray-800 mt-1">{product.net_weight_volume}</p>
                  </div>
                )}
                {product.expiry_best_before && (
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Expiry / Best Before</p>
                    <p className="text-[13px] font-semibold text-gray-800 mt-1">{product.expiry_best_before}</p>
                  </div>
                )}
                {product.storage_instructions && (
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 sm:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Storage Instructions</p>
                    <p className="text-[13px] font-semibold text-gray-800 mt-1">{product.storage_instructions}</p>
                  </div>
                )}
                {product.ingredients && (
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 sm:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Ingredients</p>
                    <p className="text-[13px] text-gray-700 mt-1 leading-relaxed">{product.ingredients}</p>
                  </div>
                )}
                {product.allergen_info && (
                  <div className="bg-amber-50/70 rounded-xl p-3.5 border border-amber-200/80 sm:col-span-2 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Allergen Information</p>
                      <p className="text-[13px] text-amber-900 font-semibold mt-0.5 leading-relaxed">{product.allergen_info}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT COLUMN (Compliance Docs, Seller Info, Logistics) ── */}
        <div className="space-y-6">

          {/* 1. Compliance & FDA Documents Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-brand-red" /> Compliance Documents
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 bg-red-50 text-brand-red rounded-full">
                Regulatory
              </span>
            </div>

            <div className="space-y-3">
              {/* FDA LTO */}
              <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold text-gray-800">FDA License to Operate (LTO)</p>
                    <p className="text-[11px] text-gray-400">Required for food, supplements &amp; cosmetics</p>
                  </div>
                  {product.fda_lto_on_file ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md shrink-0">
                      ON FILE ✓
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-200 text-gray-600 rounded-md shrink-0">
                      NOT UPLOADED
                    </span>
                  )}
                </div>

                {product.fda_lto_on_file ? (
                  <button
                    type="button"
                    disabled={loadingDocType === 'fda-lto'}
                    onClick={() => handleViewDoc('fda-lto', `FDA LTO - ${product.name}`)}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-gray-200 hover:border-brand-red hover:text-brand-red text-gray-700 text-[12px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    {loadingDocType === 'fda-lto' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-red" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    Preview FDA LTO Document
                  </button>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">No LTO document submitted for this product.</p>
                )}
              </div>

              {/* FDA CPR */}
              <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold text-gray-800">Certificate of Product Reg. (CPR)</p>
                    <p className="text-[11px] text-gray-400">Product-specific registration license</p>
                  </div>
                  {product.fda_cpr_on_file ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md shrink-0">
                      ON FILE ✓
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-200 text-gray-600 rounded-md shrink-0">
                      NOT UPLOADED
                    </span>
                  )}
                </div>

                {product.fda_cpr_on_file ? (
                  <button
                    type="button"
                    disabled={loadingDocType === 'fda-cpr'}
                    onClick={() => handleViewDoc('fda-cpr', `FDA CPR - ${product.name}`)}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-gray-200 hover:border-brand-red hover:text-brand-red text-gray-700 text-[12px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    {loadingDocType === 'fda-cpr' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-red" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    Preview FDA CPR Document
                  </button>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">No CPR document submitted for this product.</p>
                )}
              </div>
            </div>
          </div>

          {/* 2. Seller Details Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h2 className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
                <Store className="w-4 h-4 text-brand-red" /> Seller Information
              </h2>
              {product.seller?.shop_slug && (
                <Link
                  to={`/shop/${product.seller.shop_slug}`}
                  target="_blank"
                  className="text-[11px] font-bold text-brand-red hover:underline flex items-center gap-1"
                >
                  View Storefront <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>

            {product.seller ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-red to-brand-red-dark text-white font-bold flex items-center justify-center text-[13px] shrink-0 overflow-hidden">
                    {product.seller.avatar_url ? (
                      <img src={product.seller.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{product.seller.full_name?.[0] ?? 'S'}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-800 truncate">{product.seller.shop_name || product.seller.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">Owner: {product.seller.full_name}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-50 space-y-1.5 text-[12px]">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{product.seller.email}</span>
                  </div>
                  {product.seller.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{product.seller.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Submitted: {fmtDate(product.created_at)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400 italic">No seller account tied.</p>
            )}
          </div>

          {/* 3. Logistics & Parcel Dimensions Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3.5">
            <h2 className="text-[14px] font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <Box className="w-4 h-4 text-brand-red" /> Logistics &amp; Package
            </h2>

            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Base Price</p>
                <p className="text-[14px] font-black text-gray-900 mt-0.5">{fmt(product.base_price)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Units Sold</p>
                <p className="text-[14px] font-black text-gray-900 mt-0.5">{product.units_sold}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Package Weight</p>
                <p className="text-[13px] font-bold text-gray-800 mt-0.5">
                  {product.weight_kg ? `${product.weight_kg} kg` : '—'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dimensions</p>
                <p className="text-[12px] font-bold text-gray-800 mt-0.5">
                  {product.dimension_l_cm && product.dimension_w_cm && product.dimension_h_cm
                    ? `${product.dimension_l_cm} × ${product.dimension_w_cm} × ${product.dimension_h_cm} cm`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Modals */}
      {showRejectModal && (
        <RejectModal
          productName={product.name}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
          submitting={actioning}
        />
      )}

      {showArchiveModal && (
        <ArchiveModal
          productName={product.name}
          onConfirm={handleArchive}
          onCancel={() => setShowArchiveModal(false)}
          submitting={actioning}
        />
      )}

      {activeDoc && (
        <DocumentViewerModal
          docTitle={activeDoc.title}
          blobUrl={activeDoc.blobUrl}
          mimeType={activeDoc.mimeType}
          onClose={() => {
            URL.revokeObjectURL(activeDoc.blobUrl);
            setActiveDoc(null);
          }}
        />
      )}
    </div>
  );
}
