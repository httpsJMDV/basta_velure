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
  Loader2, TrendingUp, Image as ImageIcon
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { PageHero, StatCard, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { Pill, Avatar, type PillTone } from '../../components/admin/listKit';

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

// ─── Small pieces of the page ────────────────────────────────────────────────

type DetailTab = 'description' | 'variants' | 'safety' | 'shipping';

/** A white card of the right rail, with the brand-red tick heading the dashboard uses. */
function RailSection({ icon: Icon, title, aside, children }: { icon: React.ElementType; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-brand-red" />
          <Icon className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
          <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One label / value pair in a spec grid. */
function Spec({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`p-3 rounded-xl bg-gray-50 border border-gray-100 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-gray-800 leading-relaxed">{children}</dd>
    </div>
  );
}

function stockTone(qty: number): PillTone {
  return qty > 10 ? 'emerald' : qty > 0 ? 'amber' : 'red';
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
  const [actionError, setActionError] = useState('');

  // Gallery and detail tabs
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [tab, setTab] = useState<DetailTab>('description');

  // Modals
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // Document Viewer
  const [activeDoc, setActiveDoc] = useState<{ title: string; blobUrl: string; mimeType: string } | null>(null);
  const [loadingDocType, setLoadingDocType] = useState<'fda-lto' | 'fda-cpr' | null>(null);

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminProductApi(Number(id));
      setProduct(data);
      setActiveImgIdx(Math.max(0, data.images.findIndex((img) => img.is_primary)));
    } catch {
      setError('Product not found or unable to load details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  /** Runs one moderation action and keeps the page on its result, showing any failure in the page. */
  async function act(run: () => Promise<AdminProduct>, failure: string, after?: () => void) {
    setActioning(true);
    setActionError('');
    try {
      setProduct(await run());
      after?.();
    } catch {
      setActionError(failure);
    } finally {
      setActioning(false);
    }
  }

  const handleApprove = () => product && act(() => approveAdminProductApi(product.id), 'The product could not be approved. Please try again.');
  const handleReject = (reason: string) => product && act(() => rejectAdminProductApi(product.id, reason), 'The product could not be rejected. Please try again.', () => setShowRejectModal(false));
  const handleArchive = (reason: string) => product && act(() => archiveAdminProductApi(product.id, reason), 'The product could not be archived. Please try again.', () => setShowArchiveModal(false));
  const handleReactivate = () => product && act(() => reactivateAdminProductApi(product.id), 'The product could not be reactivated. Please try again.');

  const handleViewDoc = async (docType: 'fda-lto' | 'fda-cpr', title: string) => {
    if (!product) return;
    setLoadingDocType(docType);
    setActionError('');
    try {
      const { url, type } = await getAdminProductDocBlobUrl(product.id, docType);
      setActiveDoc({ title, blobUrl: url, mimeType: type });
    } catch {
      setActionError(`${title} could not be loaded. The file may be missing on the server.`);
    } finally {
      setLoadingDocType(null);
    }
  };

  if (loading) {
    return (
      <div className="pb-8 space-y-3">
        <div className="h-[72px] rounded-2xl bg-neutral-800 animate-pulse" />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="bg-white border h-[420px] rounded-2xl border-gray-200/80 animate-pulse" />
            <div className="h-64 bg-white border rounded-2xl border-gray-200/80 animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-44 bg-white border rounded-2xl border-gray-200/80 animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl py-16 mx-auto space-y-4 text-center">
        <div className="flex items-center justify-center mx-auto w-14 h-14 rounded-2xl bg-red-50 text-brand-red">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Product Not Found</h2>
        <p className="text-sm text-gray-500">{error ?? 'The requested product could not be loaded.'}</p>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-red-dark transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Products
        </Link>
      </div>
    );
  }

  const images = product.images;
  const statusInfo = STATUS_STYLES[product.status] ?? { badge: '', label: product.status };
  const prices = product.variants.map((v) => Number(v.price));
  const minPrice = prices.length ? Math.min(...prices) : Number(product.base_price);
  const maxPrice = prices.length ? Math.max(...prices) : Number(product.base_price);
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
  const outOfStock = product.variants.filter((v) => v.stock_quantity === 0).length;
  const hasSafety = Boolean(product.ingredients || product.allergen_info || product.expiry_best_before || product.net_weight_volume || product.storage_instructions);
  const docsOnFile = Number(Boolean(product.fda_lto_on_file)) + Number(Boolean(product.fda_cpr_on_file));
  const dims = product.dimension_l_cm && product.dimension_w_cm && product.dimension_h_cm
    ? `${product.dimension_l_cm} × ${product.dimension_w_cm} × ${product.dimension_h_cm} cm`
    : null;

  const tabs: { key: DetailTab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'description', label: 'Description', icon: FileText },
    { key: 'variants', label: 'Variants & stock', icon: Layers, count: product.variants.length },
    ...(hasSafety ? [{ key: 'safety' as const, label: 'Safety specs', icon: ShieldCheck }] : []),
    { key: 'shipping', label: 'Shipping', icon: Box },
  ];
  const shownTab = tabs.some((t) => t.key === tab) ? tab : 'description';

  const docs: { type: 'fda-lto' | 'fda-cpr'; name: string; hint: string; onFile: boolean }[] = [
    { type: 'fda-lto', name: 'FDA License to Operate (LTO)', hint: 'Food, supplements & cosmetics', onFile: Boolean(product.fda_lto_on_file) },
    { type: 'fda-cpr', name: 'Certificate of Product Registration (CPR)', hint: 'Product-specific registration', onFile: Boolean(product.fda_cpr_on_file) },
  ];

  return (
    <div ref={pageRef} className="pb-10 space-y-3">
      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-[12px] text-gray-500" aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/admin/products')} className="inline-flex items-center gap-1 font-semibold hover:text-brand-red">
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> Products
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-400">#{product.id}</span>
      </nav>

      {/* ── Hero: identity, status and the moderation actions ── */}
      <PageHero
        icon={Package}
        eyebrow={`Catalog${product.category ? ` · ${product.category.name}` : ''}`}
        title={product.name}
        subtitle={<>Submitted by <span className="font-semibold text-white/90">{product.seller?.shop_name || 'Seller'}</span> · {fmtDate(product.created_at)}</>}
      >
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusInfo.badge}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
          {statusInfo.label}
        </span>
        {product.status === 'pending_review' && (
          <>
            <button type="button" disabled={actioning} onClick={() => setShowRejectModal(true)} className={`${HERO_BUTTON} text-red-200 hover:bg-red-500/20`}>
              <XCircle className="w-4 h-4 text-red-300" aria-hidden="true" /> Reject
            </button>
            <button
              type="button"
              disabled={actioning}
              onClick={handleApprove}
              className="min-h-11 inline-flex items-center gap-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {actioning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
              Approve
            </button>
          </>
        )}
        {product.status === 'active' && (
          <button type="button" disabled={actioning} onClick={() => setShowArchiveModal(true)} className={HERO_BUTTON}>
            <Archive className="w-4 h-4" aria-hidden="true" /> Archive
          </button>
        )}
        {(product.status === 'archived' || product.status === 'rejected') && (
          <button
            type="button"
            disabled={actioning}
            onClick={handleReactivate}
            className="min-h-11 inline-flex items-center gap-2 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            {actioning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
            Reactivate
          </button>
        )}
      </PageHero>

      {actionError && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label="Dismiss" className="p-1 rounded hover:bg-red-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ═══ Main column ═══ */}
        <div className="min-w-0 space-y-3">
          {/* ── Overview: gallery + summary ── */}
          <section className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
            <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* Gallery: thumbnail rail beside the stage */}
              <div className="flex gap-3 p-4 border-b border-gray-100 md:border-b-0 md:border-r">
                {images.length > 1 && (
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[380px] pr-0.5" style={{ scrollbarWidth: 'none' }}>
                    {images.map((img, i) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setActiveImgIdx(i)}
                        aria-label={`Show photo ${i + 1}`}
                        aria-current={i === activeImgIdx}
                        className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                          i === activeImgIdx ? 'border-brand-red' : 'border-gray-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img.url} alt="" className="object-cover w-full h-full" />
                        {img.is_primary && <span className="absolute inset-x-0 bottom-0 bg-brand-red text-white text-[8px] font-bold text-center">MAIN</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative flex items-center justify-center flex-1 overflow-hidden border border-gray-100 aspect-square rounded-xl bg-gray-50">
                  {images.length > 0 ? (
                    <>
                      <img src={images[activeImgIdx]?.url} alt={product.name} className="object-contain w-full h-full" />
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold">
                        {activeImgIdx + 1} / {images.length}
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Package className="w-8 h-8 text-gray-300" aria-hidden="true" />
                      <p className="text-[12px]">No product photos uploaded.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="flex flex-col gap-4 p-5">
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Price</p>
                  <p className="text-2xl font-black tracking-tight text-gray-900">
                    {minPrice === maxPrice ? fmt(minPrice) : `${fmt(minPrice)} – ${fmt(maxPrice)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {product.category && <Pill tone="violet">{product.category.name}</Pill>}
                    {product.sku && <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-mono">SKU {product.sku}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StatCard compact icon={Layers} label="Variants" value={product.variants.length} iconBg="bg-violet-50" iconColor="text-violet-600" />
                  <StatCard compact icon={Package} label="Units in stock" value={totalStock} subtext={outOfStock ? `${outOfStock} sold out` : undefined} iconBg="bg-sky-50" iconColor="text-sky-600" />
                  <StatCard compact icon={TrendingUp} label="Units sold" value={product.units_sold} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                  <StatCard compact icon={ImageIcon} label="Photos" value={images.length} iconBg="bg-rose-50" iconColor="text-brand-red" />
                </div>

                {product.status === 'rejected' && product.rejection_reason && (
                  <div className="flex items-start gap-2.5 p-3 border border-red-200 rounded-xl bg-red-50">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[12px]">
                      <p className="font-bold text-red-900">Rejection reason</p>
                      <p className="mt-0.5 leading-relaxed text-red-700">{product.rejection_reason}</p>
                    </div>
                  </div>
                )}
                {product.status === 'archived' && product.archive_reason && (
                  <div className="flex items-start gap-2.5 p-3 border border-gray-200 rounded-xl bg-gray-50">
                    <Archive className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[12px]">
                      <p className="font-bold text-gray-800">Archived by {product.archived_by === 'admin' ? 'an administrator' : 'the seller'}</p>
                      <p className="mt-0.5 leading-relaxed text-gray-600">{product.archive_reason}</p>
                    </div>
                  </div>
                )}
                {product.allergen_info && (
                  <div className="flex items-start gap-2.5 p-3 border rounded-xl bg-amber-50/70 border-amber-200/80">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-[12px] text-amber-900"><span className="font-bold">Allergens:</span> {product.allergen_info}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Details, as tabs ── */}
          <section className="bg-white border shadow-xs border-gray-200/80 rounded-2xl">
            <div className="flex gap-1 px-3 pt-3 overflow-x-auto border-b border-gray-100" role="tablist" aria-label="Product details" style={{ scrollbarWidth: 'none' }}>
              {tabs.map((t) => {
                const active = t.key === shownTab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px border-b-2 text-xs font-bold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red rounded-t-lg ${
                      active ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {t.label}
                    {t.count !== undefined && <span className={`px-1.5 rounded-full text-[10px] ${active ? 'bg-red-50' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>}
                  </button>
                );
              })}
            </div>

            <div className="p-5" role="tabpanel">
              {shownTab === 'description' && (
                product.description ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed [&_img]:rounded-xl [&_img]:max-w-full [&_img]:shadow-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h2]:text-base [&_p]:mb-2.5 [&_li]:mb-1"
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                ) : (
                  <p className="py-6 text-[13px] text-center text-gray-400">No description provided by the seller.</p>
                )
              )}

              {shownTab === 'variants' && (
                product.variants.length > 0 ? (
                  <div className="overflow-hidden border border-gray-100 rounded-xl">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left bg-gray-50">
                          {['Option', 'SKU', 'Price', 'Stock'].map((h) => (
                            <th key={h} scope="col" className={`px-4 py-2.5 text-[10px] font-bold tracking-wide text-gray-500 uppercase ${h === 'Price' ? 'text-right' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {product.variants.map((v) => (
                          <tr key={v.id} className="hover:bg-gray-50/60">
                            <td className="px-4 py-2.5 font-semibold text-gray-800">{v.label}</td>
                            <td className="px-4 py-2.5 font-mono text-[12px] text-gray-500">{v.sku || '—'}</td>
                            <td className="px-4 py-2.5 font-bold text-right text-gray-900 tabular-nums">{fmt(v.price)}</td>
                            <td className="px-4 py-2.5"><Pill tone={stockTone(v.stock_quantity)}>{v.stock_quantity === 0 ? 'Sold out' : `${v.stock_quantity} in stock`}</Pill></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50/60 text-[12px]">
                          <td className="px-4 py-2.5 font-bold text-gray-600" colSpan={3}>Total stock</td>
                          <td className="px-4 py-2.5 font-black text-gray-900 tabular-nums">{totalStock}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="py-6 text-[13px] text-center text-gray-400">A single product without variants, at {fmt(product.base_price)}.</p>
                )
              )}

              {shownTab === 'safety' && (
                <dl className="grid gap-2.5 sm:grid-cols-2">
                  {product.net_weight_volume && <Spec label="Net weight / volume">{product.net_weight_volume}</Spec>}
                  {product.expiry_best_before && <Spec label="Expiry / best before">{product.expiry_best_before}</Spec>}
                  {product.storage_instructions && <Spec label="Storage instructions" wide>{product.storage_instructions}</Spec>}
                  {product.ingredients && <Spec label="Ingredients" wide>{product.ingredients}</Spec>}
                  {product.allergen_info && <Spec label="Allergen information" wide>{product.allergen_info}</Spec>}
                </dl>
              )}

              {shownTab === 'shipping' && (
                <dl className="grid gap-2.5 sm:grid-cols-3">
                  <Spec label="Package weight">{product.weight_kg ? `${product.weight_kg} kg` : '—'}</Spec>
                  <Spec label="Dimensions (L × W × H)">{dims ?? '—'}</Spec>
                  <Spec label="Base price">{fmt(product.base_price)}</Spec>
                </dl>
              )}
            </div>
          </section>
        </div>

        {/* ═══ Right rail ═══ */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <RailSection
            icon={FileCheck}
            title="Compliance"
            aside={<Pill tone={docsOnFile === 2 ? 'emerald' : docsOnFile === 1 ? 'amber' : 'gray'}>{docsOnFile}/2 on file</Pill>}
          >
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.type} className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl bg-gray-50/70">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${d.onFile ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                    <FileText className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold leading-tight text-gray-800">{d.name}</p>
                    <p className="text-[10px] text-gray-400">{d.onFile ? d.hint : 'Not uploaded'}</p>
                  </div>
                  {d.onFile && (
                    <button
                      type="button"
                      disabled={loadingDocType === d.type}
                      onClick={() => handleViewDoc(d.type, `${d.type === 'fda-lto' ? 'FDA LTO' : 'FDA CPR'} - ${product.name}`)}
                      aria-label={`Preview ${d.name}`}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[30px] rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-gray-700 hover:border-brand-red hover:text-brand-red transition-colors"
                    >
                      {loadingDocType === d.type ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-red" /> : <Eye className="w-3.5 h-3.5" />}
                      View
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </RailSection>

          <RailSection
            icon={Store}
            title="Seller"
            aside={product.seller?.shop_slug ? (
              <Link to={`/shop/${product.seller.shop_slug}`} target="_blank" className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-red hover:underline">
                Storefront <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </Link>
            ) : undefined}
          >
            {product.seller ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={product.seller.full_name} src={product.seller.avatar_url} size="lg" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{product.seller.shop_name || product.seller.full_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">Owner · {product.seller.full_name}</p>
                  </div>
                </div>
                <ul className="space-y-1.5 text-[12px] text-gray-600">
                  <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" /><span className="truncate">{product.seller.email}</span></li>
                  {product.seller.phone && <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />{product.seller.phone}</li>}
                </ul>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400">No seller account tied to this product.</p>
            )}
          </RailSection>

          <RailSection icon={Calendar} title="Timeline">
            <ol className="relative space-y-3 pl-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-gray-200">
              <li className="relative">
                <span className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white" aria-hidden="true" />
                <p className="text-[12px] font-bold text-gray-800">Submitted</p>
                <p className="text-[11px] text-gray-400">{fmtDate(product.created_at)}</p>
              </li>
              <li className="relative">
                <span className={`absolute -left-4 top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                  { pending_review: 'bg-amber-500', active: 'bg-emerald-500', rejected: 'bg-red-500', archived: 'bg-gray-400', draft: 'bg-blue-500' }[product.status] ?? 'bg-gray-400'
                }`} aria-hidden="true" />
                <p className="text-[12px] font-bold text-gray-800">Now: {statusInfo.label}</p>
                <p className="text-[11px] text-gray-400">
                  {product.status === 'pending_review' ? 'Waiting for an admin decision' : product.status === 'active' ? 'Visible to buyers in the store' : product.status === 'draft' ? 'Not submitted for review yet' : 'Hidden from buyers'}
                </p>
              </li>
            </ol>
          </RailSection>
        </aside>
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
