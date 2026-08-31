import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SellerEditProductModal from './SellerEditProductModal';
import {
  Plus, Search, Package, Pencil, Archive,
  AlertTriangle, ChevronRight, RotateCcw,
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { CATEGORY_TREE, LEAF_MAP, LEAF_PARENT_MAP } from '../../data/categories';
import CustomSelect from '../../components/ui/CustomSelect';
import type { SellerProduct, SellerProductStatus, SellerProductCounts } from '../../types';
import { computeCounts } from './mockSellerProducts';
import {
  getSellerProductsApi,
  updateSellerProductStockApi,
  updateSellerProductPriceApi,
  archiveSellerProductApi,
  submitSellerProductForReviewApi,
} from '../../api/client';

const LOW_STOCK_THRESHOLD = 5;

type SortKey = 'newest' | 'best_selling' | 'low_stock' | 'price_high' | 'price_low';

const STATUS_TABS: { key: SellerProductStatus | 'all' | 'draft'; label: string }[] = [
  { key: 'all',           label: 'All' },
  { key: 'active',        label: 'Active' },
  { key: 'draft',         label: 'Drafts' },
  { key: 'pending_review',label: 'Pending Review' },
  { key: 'rejected',      label: 'Rejected' },
  { key: 'out_of_stock',  label: 'Out of Stock' },
  { key: 'archived',      label: 'Archived' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',       label: 'Newest' },
  { value: 'best_selling', label: 'Best Selling' },
  { value: 'low_stock',    label: 'Low Stock First' },
  { value: 'price_high',   label: 'Price: High to Low' },
  { value: 'price_low',    label: 'Price: Low to High' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function resolveStatus(p: SellerProduct): SellerProductStatus | 'draft' {
  if (p.status === 'draft') return 'draft';
  if (p.total_stock === 0 && p.status === 'active') return 'out_of_stock';
  return p.status;
}

function sortProducts(products: SellerProduct[], sort: SortKey): SellerProduct[] {
  const arr = [...products];
  switch (sort) {
    case 'best_selling': return arr.sort((a, b) => b.units_sold - a.units_sold);
    case 'low_stock':    return arr.sort((a, b) => a.total_stock - b.total_stock);
    case 'price_high':   return arr.sort((a, b) => b.base_price - a.base_price);
    case 'price_low':    return arr.sort((a, b) => a.base_price - b.base_price);
    default:             return arr.sort((a, b) => b.id - a.id);
  }
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<SellerProductStatus | 'draft', string> = {
  draft:          'bg-blue-50 text-blue-600 border-blue-100',
  active:         'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
  rejected:       'bg-red-50 text-red-700 border-red-100',
  out_of_stock:   'bg-gray-100 text-gray-500 border-gray-200',
  archived:       'bg-gray-50 text-gray-400 border-gray-100',
};

const STATUS_LABELS: Record<SellerProductStatus | 'draft', string> = {
  draft:          'Draft',
  active:         'Active',
  pending_review: 'Pending Review',
  rejected:       'Rejected',
  out_of_stock:   'Out of Stock',
  archived:       'Archived',
};

function StatusBadge({ status }: { status: SellerProductStatus | 'draft' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── PriceCell ────────────────────────────────────────────────────────────────

function PriceCell({ price, onSave }: { price: number; onSave: (val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(price));
  const [flash, setFlash] = useState(false);

  const commit = useCallback(() => {
    const parsed = parseFloat(draft);
    const next = isNaN(parsed) || parsed <= 0 ? price : parsed;
    setEditing(false);
    if (next !== price) {
      onSave(next);
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    }
  }, [draft, price, onSave]);

  if (editing) {
    return (
      <input
        type="number" min="0.01" step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="w-24 px-2 py-1 text-sm border border-brand-red rounded-lg outline-none ring-2 ring-red-100 text-center"
      />
    );
  }

  return (
    <button
      onClick={() => { setEditing(true); setDraft(String(price)); }}
      className={`group flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100 ${flash ? 'bg-emerald-50' : ''}`}
    >
      <span className={`text-[13px] font-bold tabular-nums ${flash ? 'text-emerald-600' : 'text-gray-800'}`}>
        {fmt(price)}
      </span>
      <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </button>
  );
}

// ─── LockedCell ───────────────────────────────────────────────────────────────

function LockedCell({ value }: { value: string }) {
  return (
    <div className="group relative inline-flex items-center gap-1 cursor-default">
      <span className="text-[13px] text-gray-500 tabular-nums">{value}</span>
      <AlertTriangle className="w-3 h-3 text-gray-300 shrink-0" />
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl bg-gray-900 px-3 py-2 text-[11px] text-white leading-snug opacity-0 group-hover:opacity-100 transition-opacity z-10 text-center shadow-lg">
        This product has multiple variants. Edit price &amp; stock inside the Edit modal.
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  );
}

function StockCell({
  stock,
  onSave,
}: {
  stock: number;
  onSave: (val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(stock));
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const parsed = parseInt(draft, 10);
    const next = isNaN(parsed) || parsed < 0 ? stock : parsed;
    setEditing(false);
    if (next !== stock) {
      onSave(next);
      setFlash(true);
      setTimeout(() => setFlash(false), 800);
    }
  }, [draft, stock, onSave]);

  const stockColor =
    stock === 0
      ? 'text-red-600 font-bold'
      : stock <= LOW_STOCK_THRESHOLD
      ? 'text-amber-600 font-semibold'
      : 'text-gray-800 font-medium';

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="w-20 px-2 py-1 text-sm border border-brand-red rounded-lg outline-none ring-2 ring-red-100 text-center"
      />
    );
  }

  return (
    <button
      onClick={() => { setEditing(true); setDraft(String(stock)); }}
      className={`group flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100 ${flash ? 'bg-emerald-50' : ''}`}
    >
      <span className={`text-sm tabular-nums ${stockColor} ${flash ? '!text-emerald-600' : ''}`}>
        {stock}
      </span>
      {stock <= LOW_STOCK_THRESHOLD && stock > 0 && (
        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
      )}
      <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </button>
  );
}

// ─── StockCell ────────────────────────────────────────────────────────────────

function DeleteModal({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 space-y-4">
        <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-gray-900">Delete product?</p>
          <p className="text-[13px] text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">"{name}"</span> will be permanently removed. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-bold hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-gray-50">
      <td className="px-4 py-3"><div className="w-10 h-10 rounded-xl bg-gray-100" /></td>
      <td className="px-4 py-3">
        <div className="h-3.5 bg-gray-100 rounded-full w-36 mb-1.5" />
        <div className="h-2.5 bg-gray-100 rounded-full w-20" />
      </td>
      <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-16 mx-auto" /></td>
      <td className="px-4 py-3 hidden md:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-12 mx-auto" /></td>
      <td className="px-4 py-3 hidden md:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-10 mx-auto" /></td>
      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-5 bg-gray-100 rounded-full w-20 mx-auto" /></td>
      <td className="px-4 py-3"><div className="h-7 bg-gray-100 rounded-lg w-16 ml-auto" /></td>
    </tr>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
        <Package className="w-7 h-7 text-gray-300" />
      </div>
      <p className="text-[15px] font-bold text-gray-800 mt-1">
        {filtered ? 'No products match your filters' : 'No products yet'}
      </p>
      <p className="text-[13px] text-gray-400 max-w-xs">
        {filtered
          ? 'Try adjusting your search or filter criteria.'
          : 'List your first product to start selling on Velure.'}
      </p>
      {!filtered && (
        <Link
          to="/seller/products/new"
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      )}
    </div>
  );
}

// ─── ProductRow ───────────────────────────────────────────────────────────────

function ProductRow({
  product,
  onStockSave,
  onPriceSave,
  onArchive,
  onUnarchive,
  onSubmitForReview,
  onEditRequest,
}: {
  product: SellerProduct;
  onStockSave: (id: number, stock: number) => void;
  onPriceSave: (id: number, price: number) => void;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onSubmitForReview: (id: number) => void;
  onEditRequest: (p: SellerProduct) => void;
}) {
  const status = resolveStatus(product);
  const leaf = LEAF_MAP.get(product.category_id);
  const parent = LEAF_PARENT_MAP.get(product.category_id);
  const categoryLabel = leaf?.label ?? product.category_id;
  const parentLabel = parent?.label;
  const isSingleVariant =
    product.variants.length === 1 && product.variants[0].label === 'Default';

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
        {/* Thumbnail */}
        <td className="px-4 py-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-100 shrink-0">
            {product.thumbnail_url ? (
              <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>
            )}
          </div>
        </td>

        {/* Name + category */}
        <td className="px-4 py-3">
          <p className="text-[13px] font-semibold text-gray-800 truncate max-w-[200px]">{product.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            {parentLabel && <span className="text-[10px] text-gray-400">{parentLabel}</span>}
            {parentLabel && <ChevronRight className="w-2.5 h-2.5 text-gray-300 shrink-0" />}
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{categoryLabel}</span>
          </div>
          {/* Mobile: price + status inline */}
          <div className="flex items-center gap-2 mt-1 sm:hidden">
            <span className="text-[11px] font-bold text-gray-700">{fmt(product.base_price)}</span>
            <span className="text-gray-300">·</span>
            {!isSingleVariant && <span className="text-[10px] text-gray-400">{product.variants.length} variants</span>}
            {!isSingleVariant && <span className="text-gray-300">·</span>}
            <StatusBadge status={status} />
          </div>
          {/* Rejection reason inline */}
          {status === 'rejected' && product.rejection_reason && (
            <div className="mt-2 flex items-start gap-1.5 max-w-[260px]">
              <span className="mt-px shrink-0 w-3.5 h-3.5 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-2 h-2 text-red-500" />
              </span>
              <p className="text-[11px] text-red-600 leading-snug line-clamp-2">
                <span className="font-semibold">Rejected: </span>{product.rejection_reason}
              </p>
            </div>
          )}
          {/* Admin archive reason inline */}
          {status === 'archived' && product.archived_by === 'admin' && product.archive_reason && (
            <div className="mt-2 flex items-start gap-1.5 max-w-[260px]">
              <span className="mt-px shrink-0 w-3.5 h-3.5 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-2 h-2 text-amber-500" />
              </span>
              <p className="text-[11px] text-amber-700 leading-snug line-clamp-2">
                <span className="font-semibold">Archived by admin: </span>{product.archive_reason}
              </p>
            </div>
          )}
        </td>

        {/* Price */}
        <td className="px-4 py-3 text-center hidden sm:table-cell">
          <div className="flex justify-center">
            {isSingleVariant
              ? <PriceCell price={product.base_price} onSave={(val) => onPriceSave(product.id, val)} />
              : <LockedCell value={fmt(product.base_price)} />}
          </div>
        </td>

        {/* Stock */}
        <td className="px-4 py-3 text-center hidden md:table-cell">
          <div className="flex justify-center">
            {isSingleVariant
              ? <StockCell stock={product.total_stock} onSave={(val) => onStockSave(product.id, val)} />
              : <LockedCell value={`${product.total_stock}`} />}
          </div>
        </td>

        {/* Units sold */}
        <td className="px-4 py-3 text-center hidden md:table-cell">
          <p className="text-[12px] text-gray-500">{product.units_sold} sold</p>
        </td>

        {/* Status */}
        <td className="px-4 py-3 text-center hidden lg:table-cell">
          <StatusBadge status={status} />
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            {/* Edit button — always shown, label changes for rejected */}
            {status === 'rejected' ? (
              <button
                type="button"
                onClick={() => onEditRequest(product)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-red text-white text-[11px] font-bold hover:bg-brand-red-dark transition-colors whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" /> Edit &amp; Resubmit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onEditRequest(product)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}

            {/* Draft → Submit for Review */}
            {status === 'draft' && (
              <button
                type="button"
                onClick={() => onSubmitForReview(product.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 transition-colors whitespace-nowrap"
                title="Submit for Review"
              >
                Submit
              </button>
            )}

            {/* Active / out_of_stock → Archive */}
            {(status === 'active' || status === 'out_of_stock') && (
              <button
                type="button"
                onClick={() => onArchive(product.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Archive"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}

            {/* Archived → Unarchive (seller-archived only) or Edit & Resubmit (admin-archived) */}
            {status === 'archived' && product.archived_by !== 'admin' && (
              <button
                type="button"
                onClick={() => onUnarchive(product.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Unarchive"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {status === 'archived' && product.archived_by === 'admin' && (
              <button
                type="button"
                onClick={() => onEditRequest(product)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-red text-white text-[11px] font-bold hover:bg-brand-red-dark transition-colors whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" /> Edit &amp; Resubmit
              </button>
            )}

            {/* pending_review → no archive, nothing extra */}
          </div>
        </td>
      </tr>

    </>
  );
}

// ─── SellerProductsPage ───────────────────────────────────────────────────────

export default function SellerProductsPage() {
  const pageRef = useMountAnim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [activeTab, setActiveTab] = useState<SellerProductStatus | 'all' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [parentFilter, setParentFilter] = useState('');
  const [leafFilter, setLeafFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [editTarget, setEditTarget] = useState<SellerProduct | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSellerProductsApi()
      .then(setProducts)
      .catch(() => setError('Failed to load products. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const counts: SellerProductCounts & { draft: number } = {
    ...computeCounts(products),
    draft: products.filter((p) => p.status === 'draft').length,
  };

  const filtered = sortProducts(
    products.filter((p) => {
      const status = resolveStatus(p);
      if (activeTab !== 'all' && status !== activeTab) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.variants.some((v) => v.sku?.toLowerCase().includes(q));
        if (!matchName && !matchSku) return false;
      }
      if (leafFilter && p.category_id !== leafFilter) return false;
      else if (parentFilter && !leafFilter) {
        const parent = LEAF_PARENT_MAP.get(p.category_id);
        if (parent?.id !== parentFilter) return false;
      }
      return true;
    }),
    sort,
  );

  const handleStockSave = async (id: number, stock: number) => {
    setProducts((prev) =>
      prev.map((p) => p.id === id ? { ...p, total_stock: stock } : p)
    );
    try {
      await updateSellerProductStockApi(id, stock);
    } catch {
      getSellerProductsApi().then(setProducts).catch(() => null);
    }
  };

  const handlePriceSave = async (id: number, price: number) => {
    setProducts((prev) =>
      prev.map((p) => p.id === id ? { ...p, base_price: price } : p)
    );
    try {
      await updateSellerProductPriceApi(id, price);
    } catch {
      getSellerProductsApi().then(setProducts).catch(() => null);
    }
  };

  const handleArchive = async (id: number) => {
    // optimistic update first so UI feels instant
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, status: 'archived' as const, archived_by: 'seller' as const } : p));
    try {
      const updated = await archiveSellerProductApi(id, 'archived');
      setProducts((prev) => prev.map((p) => p.id === id ? updated : p));
    } catch {
      getSellerProductsApi().then(setProducts).catch(() => null);
    }
  };

  const handleUnarchive = async (id: number) => {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, status: 'active' as const, archived_by: null } : p));
    try {
      const updated = await archiveSellerProductApi(id, 'active');
      setProducts((prev) => prev.map((p) => p.id === id ? updated : p));
    } catch {
      getSellerProductsApi().then(setProducts).catch(() => null);
    }
  };

  const handleSubmitForReview = async (id: number) => {
    try {
      const updated = await submitSellerProductForReviewApi(id);
      setProducts((prev) => prev.map((p) => p.id === id ? updated : p));
    } catch {
      getSellerProductsApi().then(setProducts).catch(() => null);
    }
  };

  const parentNode = CATEGORY_TREE.find((n) => n.id === parentFilter);
  const isFiltered = !!search || !!parentFilter || !!leafFilter || activeTab !== 'all';

  const parentOptions = [
    { value: '', label: 'All Categories' },
    ...CATEGORY_TREE.map((n) => ({ value: n.id, label: n.label })),
  ];

  const leafOptions = parentNode
    ? [
        { value: '', label: `All in ${parentNode.label}` },
        ...parentNode.children.map((c) => ({ value: c.id, label: c.label })),
      ]
    : [];

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-gray-900">Products</h1>
          <span className="text-[13px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
            {counts.all}
          </span>
        </div>
        <Link
          to="/seller/products/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Status tabs */}
        <div className="flex items-center gap-0.5 px-4 pt-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {STATUS_TABS.map(({ key, label }) => {
            const count = key === 'all'
              ? counts.all
              : key === 'draft'
              ? counts.draft
              : counts[key as keyof SellerProductCounts];
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[12.5px] font-semibold whitespace-nowrap transition-all border-b-2',
                  active
                    ? 'text-brand-red border-brand-red bg-red-50/50'
                    : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50',
                ].join(' ')}
              >
                {label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-100" />

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all bg-gray-50 focus:bg-white"
            />
          </div>

          {/* Parent category */}
          <div className="w-48">
            <CustomSelect
              value={parentFilter}
              onChange={(v) => { setParentFilter(v); setLeafFilter(''); }}
              options={parentOptions}
            />
          </div>

          {/* Leaf category */}
          {parentNode && (
            <div className="w-48">
              <CustomSelect
                value={leafFilter}
                onChange={setLeafFilter}
                options={leafOptions}
              />
            </div>
          )}

          {/* Sort */}
          <div className="w-44 ml-auto">
            <CustomSelect
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={SORT_OPTIONS}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-t border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-12" />
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Product</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Price</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Stock</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Sold</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyState filtered={isFiltered} /></td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    onStockSave={handleStockSave}
                    onPriceSave={handlePriceSave}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onSubmitForReview={handleSubmitForReview}
                    onEditRequest={setEditTarget}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit wizard modal */}
      {editTarget && (
        <SellerEditProductModal
          product={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setProducts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
