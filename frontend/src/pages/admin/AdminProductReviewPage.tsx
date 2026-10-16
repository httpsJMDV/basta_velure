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
  ChevronLeft, XCircle, Download, X, ExternalLink, Archive, FileCheck, Loader2,
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { Avatar } from '../../components/admin/listKit';

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

const STATUS_DOT: Record<string, string> = {
  pending_review: 'bg-amber-400', active: 'bg-emerald-400', rejected: 'bg-red-400', draft: 'bg-sky-400', archived: 'bg-neutral-400',
};

const STATUS_NOTE: Record<string, string> = {
  pending_review: 'Waiting for review',
  active: 'Visible to buyers',
  rejected: 'Hidden from buyers',
  draft: 'Not submitted yet',
  archived: 'Hidden from buyers',
};

/** A plain white panel with a hairline border; the heading is text, not an icon badge. */
function Panel({ title, action, children, flush }: { title: string; action?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
        {action}
      </header>
      <div className={flush ? '' : 'px-4 py-3'}>{children}</div>
    </section>
  );
}

/** One row of the spec sheet: the label on the left, the value right-aligned. */
function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <dt className="text-[13px] text-gray-500 shrink-0">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-[15px] font-bold text-gray-900' : 'text-[13px] font-medium text-gray-800'}`}>{children}</dd>
    </div>
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
  const [actionError, setActionError] = useState('');

  const [activeImgIdx, setActiveImgIdx] = useState(0);

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

  /** Runs one moderation action, keeps the page on its result and shows a failure in the page. */
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
      <div className="pb-10 space-y-6">
        <div className="h-[104px] rounded-xl bg-neutral-900 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <div className="h-[420px] bg-white border border-gray-200 rounded-xl animate-pulse" />
            <div className="h-48 bg-white border border-gray-200 rounded-xl animate-pulse" />
          </div>
          <div className="bg-white border border-gray-200 h-80 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-md py-20 mx-auto text-center">
        <h2 className="text-lg font-semibold text-gray-900">Product not found</h2>
        <p className="mt-1 text-sm text-gray-500">{error ?? 'The requested product could not be loaded.'}</p>
        <Link to="/admin/products" className="inline-flex items-center gap-1.5 mt-5 text-sm font-semibold text-brand-red hover:underline">
          <ChevronLeft className="w-4 h-4" /> Back to products
        </Link>
      </div>
    );
  }

  const images = product.images;
  const cover = images[activeImgIdx]?.url ?? product.thumbnail_url;
  const statusLabel = STATUS_STYLES[product.status]?.label ?? product.status;
  const prices = product.variants.map((v) => Number(v.price));
  const minPrice = prices.length ? Math.min(...prices) : Number(product.base_price);
  const maxPrice = prices.length ? Math.max(...prices) : Number(product.base_price);
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock_quantity, 0);
  const soldOut = product.variants.filter((v) => v.stock_quantity === 0).length;
  const dims = product.dimension_l_cm && product.dimension_w_cm && product.dimension_h_cm
    ? `${product.dimension_l_cm} × ${product.dimension_w_cm} × ${product.dimension_h_cm} cm`
    : null;
  const safety = [
    ['Net weight / volume', product.net_weight_volume],
    ['Expiry / best before', product.expiry_best_before],
    ['Storage', product.storage_instructions],
    ['Ingredients', product.ingredients],
  ].filter(([, v]) => Boolean(v)) as [string, string][];
  const docs: { type: 'fda-lto' | 'fda-cpr'; name: string; short: string; onFile: boolean }[] = [
    { type: 'fda-lto', name: 'License to Operate', short: 'FDA LTO', onFile: Boolean(product.fda_lto_on_file) },
    { type: 'fda-cpr', name: 'Certificate of Product Registration', short: 'FDA CPR', onFile: Boolean(product.fda_cpr_on_file) },
  ];

  const ghost = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-white/15 text-white/90 text-[13px] font-semibold hover:bg-white/10 transition-colors disabled:opacity-50';
  const solid = 'inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-white text-[13px] font-semibold transition-colors disabled:opacity-50';

  return (
    <div ref={pageRef} className="pb-12">
      {/* ── Header: the theme's dark band, typographic rather than decorated ── */}
      <header
        className="px-5 py-4 border rounded-xl border-neutral-800 sm:px-6"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <button type="button" onClick={() => navigate('/admin/products')} className="inline-flex items-center gap-1 text-[12px] text-white/50 hover:text-white">
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> Products
        </button>

        <div className="flex flex-col gap-4 mt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center min-w-0 gap-4">
            <div className="w-14 h-14 overflow-hidden bg-white rounded-lg shrink-0">
              {cover ? <img src={cover} alt="" className="object-cover w-full h-full" /> : <div className="w-full h-full bg-neutral-200" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight text-white truncate sm:text-2xl">{product.name}</h1>
              <p className="mt-1 text-[13px] text-white/55 truncate">
                {product.seller?.shop_name || 'Unknown shop'}
                {product.category && <> · {product.category.name}</>}
                <> · #{product.id}</>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-2 mr-2 text-[13px] text-white/80">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[product.status] ?? 'bg-neutral-400'}`} aria-hidden="true" />
              <span className="font-semibold text-white">{statusLabel}</span>
              <span className="hidden text-white/45 sm:inline">{STATUS_NOTE[product.status] ?? ''}</span>
            </span>
            {product.status === 'pending_review' && (
              <>
                <button type="button" disabled={actioning} onClick={() => setShowRejectModal(true)} className={ghost}>Reject</button>
                <button type="button" disabled={actioning} onClick={handleApprove} className={`${solid} bg-brand-red hover:bg-brand-red-dark`}>
                  {actioning && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Approve
                </button>
              </>
            )}
            {product.status === 'active' && (
              <button type="button" disabled={actioning} onClick={() => setShowArchiveModal(true)} className={ghost}>Archive</button>
            )}
            {(product.status === 'archived' || product.status === 'rejected') && (
              <button type="button" disabled={actioning} onClick={handleReactivate} className={`${solid} bg-brand-red hover:bg-brand-red-dark`}>
                {actioning && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Reactivate
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Notes that change what the admin does next ── */}
      <div className="mt-4 space-y-2 empty:hidden">
        {actionError && (
          <div role="alert" className="flex items-center justify-between gap-3 py-2.5 pl-4 pr-2 text-[13px] text-red-800 bg-red-50 border-l-2 border-red-500 rounded-r-lg">
            {actionError}
            <button type="button" onClick={() => setActionError('')} aria-label="Dismiss" className="p-1 rounded hover:bg-red-100"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {product.status === 'rejected' && product.rejection_reason && (
          <p className="py-2.5 px-4 text-[13px] text-red-800 bg-red-50 border-l-2 border-red-500 rounded-r-lg">
            <span className="font-semibold">Rejected:</span> {product.rejection_reason}
          </p>
        )}
        {product.status === 'archived' && product.archive_reason && (
          <p className="py-2.5 px-4 text-[13px] text-gray-700 bg-gray-100 border-l-2 border-gray-400 rounded-r-lg">
            <span className="font-semibold">Archived by {product.archived_by === 'admin' ? 'an administrator' : 'the seller'}:</span> {product.archive_reason}
          </p>
        )}
        {product.allergen_info && (
          <p className="py-2.5 px-4 text-[13px] text-amber-900 bg-amber-50 border-l-2 border-amber-500 rounded-r-lg">
            <span className="font-semibold">Allergens:</span> {product.allergen_info}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 mt-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ═══ Main column ═══ */}
        <div className="min-w-0 space-y-6">
          {/* Gallery: one stage, a filmstrip under it */}
          <section>
            <div className="flex items-center justify-center overflow-hidden bg-white border border-gray-200 rounded-xl aspect-[4/3]">
              {images.length > 0 ? (
                <img src={images[activeImgIdx]?.url} alt={product.name} className="object-contain w-full h-full p-4" />
              ) : (
                <p className="text-[13px] text-gray-400">No photos uploaded.</p>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImgIdx(i)}
                    aria-label={`Photo ${i + 1}${img.is_primary ? ' (main)' : ''}`}
                    aria-current={i === activeImgIdx}
                    className="relative pb-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red rounded-lg"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className={`w-16 h-16 rounded-lg object-cover border transition-opacity ${i === activeImgIdx ? 'border-gray-300' : 'border-gray-200 opacity-60 hover:opacity-100'}`}
                    />
                    <span className={`absolute left-2 right-2 bottom-0 h-0.5 rounded-full ${i === activeImgIdx ? 'bg-brand-red' : 'bg-transparent'}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <Panel title="Description">
            {product.description ? (
              <div
                className="max-w-prose py-1 text-[14px] text-gray-700 leading-7 [&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_li]:mb-1 [&_b]:text-gray-900 [&_strong]:text-gray-900"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <p className="py-2 text-[13px] text-gray-400">The seller did not write a description.</p>
            )}
          </Panel>

          <Panel title={`Variants · ${product.variants.length}`} flush>
            {product.variants.length > 0 ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th scope="col" className="px-4 py-2.5 font-medium">Option</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">SKU</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-right">Price</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{v.label}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-gray-500">{v.sku || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmt(v.price)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${v.stock_quantity === 0 ? 'text-red-600 font-semibold' : v.stock_quantity <= 10 ? 'text-amber-700' : 'text-gray-900'}`}>
                        {v.stock_quantity === 0 ? 'Sold out' : v.stock_quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={3} className="px-4 py-2.5 text-gray-500">Total in stock</td>
                    <td className="px-4 py-2.5 font-semibold text-right text-gray-900 tabular-nums">{totalStock}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="px-4 py-3 text-[13px] text-gray-500">Sold as a single item at {fmt(product.base_price)}.</p>
            )}
          </Panel>

          {safety.length > 0 && (
            <Panel title="Food & safety">
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {safety.map(([label, value]) => (
                  <div key={label} className="py-2.5 border-b border-gray-100 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                    <dt className="text-[12px] text-gray-500">{label}</dt>
                    <dd className="mt-0.5 text-[13px] text-gray-900 leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
        </div>

        {/* ═══ Side column ═══ */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <Panel title="Summary">
            <dl>
              <Row label="Price" strong>{minPrice === maxPrice ? fmt(minPrice) : `${fmt(minPrice)} – ${fmt(maxPrice)}`}</Row>
              <Row label="In stock">{totalStock}{soldOut > 0 && <span className="ml-1.5 text-red-600">({soldOut} sold out)</span>}</Row>
              <Row label="Sold">{product.units_sold}</Row>
              <Row label="Category">{product.category?.name ?? '—'}</Row>
              {product.sku && <Row label="SKU"><span className="font-mono text-[12px]">{product.sku}</span></Row>}
              <Row label="Weight">{product.weight_kg ? `${product.weight_kg} kg` : '—'}</Row>
              <Row label="Dimensions">{dims ?? '—'}</Row>
              <Row label="Submitted">{fmtDate(product.created_at)}</Row>
            </dl>
          </Panel>

          <Panel title="FDA documents" flush>
            <ul>
              {docs.map((d) => (
                <li key={d.type} className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 first:border-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">{d.short}</p>
                    <p className="text-[12px] text-gray-500 truncate">{d.name}</p>
                  </div>
                  {d.onFile ? (
                    <button
                      type="button"
                      disabled={loadingDocType === d.type}
                      onClick={() => handleViewDoc(d.type, `${d.short} - ${product.name}`)}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-red hover:underline disabled:opacity-50 shrink-0"
                    >
                      {loadingDocType === d.type && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                      View
                    </button>
                  ) : (
                    <span className="text-[12px] text-gray-400 shrink-0">Not uploaded</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Seller"
            action={product.seller?.shop_slug ? (
              <Link to={`/shop/${product.seller.shop_slug}`} target="_blank" className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-red hover:underline">
                Storefront <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </Link>
            ) : undefined}
          >
            {product.seller ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={product.seller.full_name} src={product.seller.avatar_url} size="md" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{product.seller.shop_name || product.seller.full_name}</p>
                    <p className="text-[12px] text-gray-500 truncate">{product.seller.full_name}</p>
                  </div>
                </div>
                <dl className="mt-3">
                  <Row label="Email"><a href={`mailto:${product.seller.email}`} className="hover:text-brand-red break-all">{product.seller.email}</a></Row>
                  {product.seller.phone && <Row label="Phone">{product.seller.phone}</Row>}
                </dl>
              </>
            ) : (
              <p className="text-[13px] text-gray-500">No seller account is tied to this product.</p>
            )}
          </Panel>
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
