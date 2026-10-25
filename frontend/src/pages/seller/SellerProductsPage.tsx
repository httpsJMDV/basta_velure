import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Package, Pencil, AlertTriangle, ChevronRight, ChevronDown,
  RotateCcw, Trash2, Copy, EyeOff, Eye, Loader2, X,
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toast';
import { Dialog, BUTTON } from '../../components/ui/Overlay';
import { CATEGORY_TREE, LEAF_MAP, LEAF_PARENT_MAP } from '../../data/categories';
import CustomSelect from '../../components/ui/CustomSelect';
import type { SellerProduct, SellerProductVariant } from '../../types';
import { getSellerProductsApi, deleteSellerProductApi } from '../../api/client';
import {
  bulkSellerProductsApi, duplicateSellerProductApi, setSellerProductStatusApi,
  setVariantPriceApi, setVariantStockApi,
} from '../../api/sellerCatalog';
import type { BulkResult } from '../../api/sellerCatalog';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';

const LOW_STOCK_THRESHOLD = 5;

type SortKey = 'newest' | 'best_selling' | 'low_stock' | 'price_high' | 'price_low';
type View = 'live' | 'sold_out' | 'draft' | 'deactivated' | 'removed' | 'rejected' | 'pending_review';
type Tab = 'all' | 'live' | 'draft' | 'low_stock' | 'sold_out' | 'deactivated' | 'rejected' | 'pending_review';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',       label: 'Newest' },
  { value: 'best_selling', label: 'Best selling' },
  { value: 'low_stock',    label: 'Lowest stock first' },
  { value: 'price_high',   label: 'Price: high to low' },
  { value: 'price_low',    label: 'Price: low to high' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function viewOf(p: SellerProduct): View {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'archived') return p.archived_by === 'admin' ? 'removed' : 'deactivated';
  if (p.status === 'rejected') return 'rejected';
  if (p.status === 'pending_review') return 'pending_review';
  return p.total_stock === 0 ? 'sold_out' : 'live';
}

const isLow = (v: SellerProductVariant) => v.stock_quantity > 0 && (v.low_stock ?? v.stock_quantity <= LOW_STOCK_THRESHOLD);
const hasLowStock = (p: SellerProduct) => p.variants.some(isLow);
const isSimple = (p: SellerProduct) => p.variants.length === 1 && p.variants[0].label === 'Default';
const minPrice = (p: SellerProduct) => p.price_range?.min ?? p.base_price;

function sortProducts(products: SellerProduct[], sort: SortKey): SellerProduct[] {
  const arr = [...products];
  switch (sort) {
    case 'best_selling': return arr.sort((a, b) => b.units_sold - a.units_sold);
    case 'low_stock':    return arr.sort((a, b) => a.total_stock - b.total_stock);
    case 'price_high':   return arr.sort((a, b) => minPrice(b) - minPrice(a));
    case 'price_low':    return arr.sort((a, b) => minPrice(a) - minPrice(b));
    default:             return arr.sort((a, b) => b.id - a.id);
  }
}

function priceError(v: string): string | undefined {
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Use a number with at most 2 decimal places.';
  const n = Number(v);
  if (n < 1) return 'At least ₱1.00.';
  if (n > 1000000) return '₱1,000,000.00 or less.';
  return undefined;
}

function stockError(v: string): string | undefined {
  if (!/^\d+$/.test(v) || Number(v) > 99999) return 'A whole number from 0 to 99,999.';
  return undefined;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const VIEW_STYLES: Record<View, string> = {
  live:           'bg-emerald-50 text-emerald-700 border-emerald-100',
  sold_out:       'bg-gray-100 text-gray-600 border-gray-200',
  draft:          'bg-blue-50 text-blue-700 border-blue-100',
  deactivated:    'bg-gray-50 text-gray-500 border-gray-200',
  removed:        'bg-amber-50 text-amber-700 border-amber-100',
  rejected:       'bg-red-50 text-red-700 border-red-100',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-100',
};

const VIEW_LABELS: Record<View, string> = {
  live:           'Live',
  sold_out:       'Sold out',
  draft:          'Draft',
  deactivated:    'Deactivated',
  removed:        'Removed by Loved-IT',
  rejected:       'Rejected',
  pending_review: 'Pending review',
};

function StatusBadge({ view, checking = false }: { view: View; checking?: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${VIEW_STYLES[view]}`}>
      {view === 'pending_review' && checking ? 'Being checked' : VIEW_LABELS[view]}
    </span>
  );
}

// ─── Inline edit (price or stock of one variant) ─────────────────────────────

function InlineEdit({
  value, display, check, onSave, inputMode, label, tone,
}: {
  value: number;
  display: string;
  check: (v: string) => string | undefined;
  onSave: (v: string) => Promise<string | undefined>;
  inputMode: 'decimal' | 'numeric';
  label: string;
  tone?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const cancel = () => { setEditing(false); setError(''); };
  const commit = async () => {
    if (busy) return;
    const v = draft.trim();
    if (v === '' || Number(v) === value) { cancel(); return; }
    const problem = check(v);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const serverProblem = await onSave(v);
    setBusy(false);
    if (serverProblem) { setError(serverProblem); return; }
    cancel();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 900);
  };

  if (editing) {
    return (
      <div className="relative inline-flex flex-col items-center">
        <div className="relative">
          <input
            type="text" inputMode={inputMode} aria-label={label} autoFocus
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(''); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            className={[
              'w-24 px-2 py-1 text-[13px] text-center tabular-nums border rounded-lg outline-none ring-2',
              error ? 'border-red-400 ring-red-100' : 'border-brand-red ring-red-100',
            ].join(' ')}
          />
          {busy && <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-400" />}
        </div>
        {error && <p role="alert" className="mt-1 max-w-[150px] text-[10.5px] leading-snug text-red-600 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={`Change ${label.toLowerCase()}`}
      onClick={() => { setEditing(true); setDraft(String(value)); }}
      className={`group inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100 ${saved ? 'bg-emerald-50' : ''}`}
    >
      <span className={`text-[13px] tabular-nums ${saved ? 'text-emerald-700 font-semibold' : tone ?? 'text-gray-800 font-semibold'}`}>{display}</span>
      <Pencil className="w-3 h-3 text-gray-300 group-hover:text-gray-500 shrink-0" />
    </button>
  );
}

function stockTone(stock: number) {
  if (stock === 0) return 'text-red-600 font-bold';
  if (stock <= LOW_STOCK_THRESHOLD) return 'text-amber-700 font-semibold';
  return 'text-gray-800 font-medium';
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

interface RowActions {
  savePrice: (p: SellerProduct, v: SellerProductVariant | undefined, value: string) => Promise<string | undefined>;
  saveStock: (p: SellerProduct, v: SellerProductVariant | undefined, value: string) => Promise<string | undefined>;
  publish: (p: SellerProduct) => void;
  deactivate: (p: SellerProduct) => void;
  duplicate: (p: SellerProduct) => void;
  remove: (p: SellerProduct) => void;
}

function PriceSummary({ p }: { p: SellerProduct }) {
  const r = p.price_range;
  const now = r ? (r.min === r.max ? fmt(r.min) : `${fmt(r.min)} – ${fmt(r.max)}`) : fmt(p.base_price);
  return (
    <div className="text-center">
      <p className="text-[13px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">{now}</p>
      {p.original_price != null && (
        <p className="text-[10.5px] text-gray-400 tabular-nums">
          <span className="line-through">{fmt(p.original_price)}</span>
          <span className="ml-1 font-semibold text-brand-red no-underline">On sale</span>
        </p>
      )}
    </div>
  );
}

function IconAction({ title, onClick, children, danger, disabled }: {
  title: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={[
        'w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        danger ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-gray-800 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ProductRow({
  product: p, selected, onSelect, actions, approved, busy,
}: {
  product: SellerProduct;
  selected: boolean;
  onSelect: (on: boolean) => void;
  actions: RowActions;
  approved: boolean;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const view = viewOf(p);
  const simple = isSimple(p);
  const leaf = LEAF_MAP.get(p.category_id);
  const parent = LEAF_PARENT_MAP.get(p.category_id);
  const low = hasLowStock(p);
  const only = simple ? p.variants[0] : undefined;

  return (
    <Fragment>
      <tr className={`border-b border-gray-50 transition-colors ${selected ? 'bg-red-50/40' : 'hover:bg-gray-50/70'}`}>
        <td className="pl-4 pr-1 py-3 w-8">
          <input
            type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${p.name}`}
            className="w-4 h-4 rounded border-gray-300 accent-brand-red cursor-pointer"
          />
        </td>
        <td className="px-2 py-3 w-12">
          <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-100">
            {p.thumbnail_url
              ? <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>}
          </div>
        </td>

        <td className="px-3 py-3 min-w-[200px]">
          <Link to={`/seller/products/${p.id}/edit`} className="text-[13px] font-semibold text-gray-800 hover:text-brand-red line-clamp-1 max-w-[260px]">
            {p.name}
          </Link>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {parent && <span className="text-[10px] text-gray-400">{parent.label}</span>}
            {parent && <ChevronRight className="w-2.5 h-2.5 text-gray-300" />}
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{leaf?.label ?? (p.category_id || 'No category')}</span>
            {!simple && (
              <button
                type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                className="ml-1 inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-gray-500 hover:text-gray-900"
              >
                {p.variants.length} variants <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
            {low && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">
                <AlertTriangle className="w-2.5 h-2.5" /> Low stock
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 lg:hidden"><StatusBadge view={view} checking={p.ai_review_status === 'checking'} /></div>
          {(view === 'rejected' && p.rejection_reason) || (view === 'removed' && p.archive_reason) ? (
            <p className={`mt-1.5 max-w-[300px] text-[11px] leading-snug ${view === 'rejected' ? 'text-red-600' : 'text-amber-700'}`}>
              <span className="font-semibold">{view === 'rejected' ? 'Rejected: ' : 'Removed by Loved-IT: '}</span>
              {view === 'rejected' ? p.rejection_reason : p.archive_reason}
            </p>
          ) : null}
        </td>

        <td className="px-3 py-3 text-center hidden sm:table-cell">
          {simple && only && p.original_price == null
            ? <InlineEdit
                value={only.regular_price ?? only.price} display={fmt(only.regular_price ?? only.price)} label="Price"
                inputMode="decimal" check={priceError} onSave={(v) => actions.savePrice(p, only, v)} />
            : <PriceSummary p={p} />}
        </td>

        <td className="px-3 py-3 text-center hidden md:table-cell">
          {simple && only
            ? <InlineEdit
                value={only.stock_quantity} display={String(only.stock_quantity)} label="Stock"
                inputMode="numeric" check={stockError} tone={stockTone(only.stock_quantity)}
                onSave={(v) => actions.saveStock(p, only, v)} />
            : <span className={`text-[13px] tabular-nums ${stockTone(p.total_stock)}`}>{p.total_stock}</span>}
        </td>

        <td className="px-3 py-3 text-center hidden md:table-cell">
          <span className="text-[12px] text-gray-500 tabular-nums">{p.units_sold.toLocaleString()}</span>
        </td>

        <td className="px-3 py-3 text-center hidden lg:table-cell"><StatusBadge view={view} checking={p.ai_review_status === 'checking'} /></td>

        <td className="px-3 py-3">
          <div className="flex items-center gap-0.5 justify-end">
            {view === 'draft' && (
              <button
                type="button" disabled={!approved || busy} onClick={() => actions.publish(p)}
                title={approved ? 'Publish' : 'Publishing opens once your shop is approved.'}
                className="mr-1 px-2.5 py-1.5 rounded-lg bg-brand-red text-white text-[11px] font-bold hover:bg-brand-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Publish
              </button>
            )}
            {view === 'deactivated' && (
              <IconAction title={approved ? 'Reactivate' : 'Reactivating opens once your shop is approved.'} disabled={!approved || busy} onClick={() => actions.publish(p)}>
                <RotateCcw className="w-4 h-4" />
              </IconAction>
            )}
            <Link
              to={`/seller/products/${p.id}/edit`}
              title={view === 'rejected' || view === 'removed' ? 'Edit and fix' : 'Edit'}
              aria-label={`Edit ${p.name}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>
            <IconAction title="Duplicate as a draft" disabled={busy} onClick={() => actions.duplicate(p)}>
              <Copy className="w-4 h-4" />
            </IconAction>
            {(view === 'live' || view === 'sold_out') && (
              <IconAction title="Deactivate (hide from buyers)" disabled={busy} onClick={() => actions.deactivate(p)}>
                <EyeOff className="w-4 h-4" />
              </IconAction>
            )}
            <IconAction title="Delete" danger disabled={busy} onClick={() => actions.remove(p)}>
              <Trash2 className="w-4 h-4" />
            </IconAction>
          </div>
        </td>
      </tr>

      {open && !simple && (
        <tr className="bg-gray-50/60 border-b border-gray-100">
          <td colSpan={2} />
          <td colSpan={6} className="px-3 py-3">
            <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[460px]">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    <th className="text-left px-3 py-2">Variant</th>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-center px-3 py-2">Regular price</th>
                    <th className="text-center px-3 py-2">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-1.5 font-medium text-gray-700">
                        {v.label}
                        {isLow(v) && <span className="ml-2 text-[10px] font-semibold text-amber-700">Low</span>}
                        {v.stock_quantity === 0 && <span className="ml-2 text-[10px] font-semibold text-red-600">Sold out</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-gray-500">{v.sku || '—'}</td>
                      <td className="px-3 py-1.5 text-center">
                        <InlineEdit
                          value={v.regular_price ?? v.price} display={fmt(v.regular_price ?? v.price)} label={`Price of ${v.label}`}
                          inputMode="decimal" check={priceError} onSave={(val) => actions.savePrice(p, v, val)} />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <InlineEdit
                          value={v.stock_quantity} display={String(v.stock_quantity)} label={`Stock of ${v.label}`}
                          inputMode="numeric" check={stockError} tone={stockTone(v.stock_quantity)}
                          onSave={(val) => actions.saveStock(p, v, val)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-gray-50">
      <td className="pl-4 py-3"><div className="w-4 h-4 rounded bg-gray-100" /></td>
      <td className="px-2 py-3"><div className="w-10 h-10 rounded-lg bg-gray-100" /></td>
      <td className="px-3 py-3"><div className="h-3.5 bg-gray-100 rounded-full w-40 mb-1.5" /><div className="h-2.5 bg-gray-100 rounded-full w-24" /></td>
      <td className="px-3 py-3 hidden sm:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-16 mx-auto" /></td>
      <td className="px-3 py-3 hidden md:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-10 mx-auto" /></td>
      <td className="px-3 py-3 hidden md:table-cell"><div className="h-3.5 bg-gray-100 rounded-full w-8 mx-auto" /></td>
      <td className="px-3 py-3 hidden lg:table-cell"><div className="h-5 bg-gray-100 rounded-full w-16 mx-auto" /></td>
      <td className="px-3 py-3"><div className="h-7 bg-gray-100 rounded-lg w-24 ml-auto" /></td>
    </tr>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
        <Package className="w-7 h-7 text-gray-300" />
      </div>
      <p className="text-[15px] font-bold text-gray-800 mt-1">{filtered ? 'No products match these filters' : 'No products yet'}</p>
      <p className="text-[13px] text-gray-400 max-w-xs">
        {filtered ? 'Change the search or the filters to see more.' : 'List your first product to start selling on Loved-IT.'}
      </p>
      {!filtered && (
        <Link to="/seller/products/new" className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type BulkAction = 'activate' | 'deactivate' | 'delete';
const BULK_VERB: Record<BulkAction, string> = { activate: 'Activate', deactivate: 'Deactivate', delete: 'Delete' };

export default function SellerProductsPage() {
  const pageRef = useMountAnim();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const approved = user?.seller_profile?.application_status === 'approved';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [parentFilter, setParentFilter] = useState('');
  const [leafFilter, setLeafFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<SellerProduct | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [publishProblems, setPublishProblems] = useState<{ product: SellerProduct; problems: string[] } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: BulkAction }) | null>(null);

  const load = useCallback(() => {
    setError(null);
    return getSellerProductsApi()
      .then((rows) => {
        setProducts(rows);
        setSelected((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
      })
      .catch(() => setError('Your products could not be loaded. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // A message handed over by the product form ("Product published.").
  useEffect(() => {
    const flash = (location.state as { flash?: string } | null)?.flash;
    if (flash) {
      showToast(flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, showToast]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: products.length, live: 0, draft: 0, low_stock: 0, sold_out: 0, deactivated: 0, rejected: 0, pending_review: 0 };
    for (const p of products) {
      const v = viewOf(p);
      if (v === 'live') c.live++;
      if (v === 'draft') c.draft++;
      if (v === 'sold_out') c.sold_out++;
      if (v === 'deactivated' || v === 'removed') c.deactivated++;
      if (v === 'rejected') c.rejected++;
      if (v === 'pending_review') c.pending_review++;
      if (hasLowStock(p)) c.low_stock++;
    }
    return c;
  }, [products]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'live', label: 'Live' },
    { key: 'draft', label: 'Drafts' },
    { key: 'low_stock', label: 'Low stock' },
    { key: 'sold_out', label: 'Sold out' },
    { key: 'deactivated', label: 'Deactivated' },
    ...(counts.rejected ? [{ key: 'rejected' as Tab, label: 'Rejected' }] : []),
    ...(counts.pending_review ? [{ key: 'pending_review' as Tab, label: 'Pending review' }] : []),
  ];

  const filtered = useMemo(() => sortProducts(
    products.filter((p) => {
      const v = viewOf(p);
      if (tab === 'low_stock' && !hasLowStock(p)) return false;
      if (tab === 'deactivated' && v !== 'deactivated' && v !== 'removed') return false;
      if (!['all', 'low_stock', 'deactivated'].includes(tab) && v !== tab) return false;
      const q = search.trim().toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? '').toLowerCase().includes(q)
        && !p.variants.some((x) => x.sku?.toLowerCase().includes(q))) return false;
      if (leafFilter) return p.category_id === leafFilter;
      if (parentFilter) return LEAF_PARENT_MAP.get(p.category_id)?.id === parentFilter;
      return true;
    }),
    sort,
  ), [products, tab, search, leafFilter, parentFilter, sort]);

  const replace = (updated: SellerProduct) => setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  const actions: RowActions = {
    savePrice: async (p, v, value) => {
      try { replace(await setVariantPriceApi(p.id, Number(value), v?.id)); return undefined; }
      catch (e) { return apiErrorMessage(e, 'The price could not be saved.'); }
    },
    saveStock: async (p, v, value) => {
      try { replace(await setVariantStockApi(p.id, Number(value), v?.id)); return undefined; }
      catch (e) { return apiErrorMessage(e, 'The stock could not be saved.'); }
    },
    publish: async (p) => {
      setBusyId(p.id);
      try {
        const res = await setSellerProductStatusApi(p.id, 'active');
        replace(res.data);
        showToast(res.data.status === 'pending_review'
          ? `"${p.name}" is being checked. It goes live as soon as it passes.`
          : p.status === 'draft' ? `"${p.name}" is live.` : `"${p.name}" is active again.`);
      } catch (e) {
        const problem = apiProblem(e, 'The product could not be published.');
        const list = Object.values(problem.fields);
        if (list.length) setPublishProblems({ product: p, problems: list });
        else showToast(problem.message, 'error');
      } finally { setBusyId(null); }
    },
    deactivate: async (p) => {
      setBusyId(p.id);
      try {
        const res = await setSellerProductStatusApi(p.id, 'archived');
        replace(res.data);
        showToast(`"${p.name}" is hidden from buyers.`);
      } catch (e) { showToast(apiErrorMessage(e, 'The product could not be deactivated.'), 'error'); }
      finally { setBusyId(null); }
    },
    duplicate: async (p) => {
      setBusyId(p.id);
      try {
        const res = await duplicateSellerProductApi(p.id);
        setProducts((prev) => [res.data, ...prev]);
        showToast(res.message || `A draft copy of "${p.name}" was made.`);
      } catch (e) { showToast(apiErrorMessage(e, 'The product could not be duplicated.'), 'error'); }
      finally { setBusyId(null); }
    },
    remove: (p) => { setDeleteError(''); setConfirmDelete(p); },
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const p = confirmDelete;
    setBusyId(p.id);
    setDeleteError('');
    try {
      await deleteSellerProductApi(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
      setConfirmDelete(null);
      showToast(`"${p.name}" was deleted.`);
    } catch (e) {
      setDeleteError(apiErrorMessage(e, 'The product could not be deleted.'));
    } finally { setBusyId(null); }
  };

  const runBulk = async () => {
    if (!bulkConfirm) return;
    const action = bulkConfirm;
    setBulkBusy(true);
    try {
      const res = await bulkSellerProductsApi(action, [...selected]);
      setBulkConfirm(null);
      setSelected(new Set(res.skipped.map((s) => s.id)));
      await load();
      if (res.skipped.length) setBulkResult({ ...res, action });
      else showToast(res.message);
    } catch (e) {
      setBulkConfirm(null);
      showToast(apiErrorMessage(e, 'The bulk action could not be done.'), 'error');
    } finally { setBulkBusy(false); }
  };

  const visibleIds = filtered.map((p) => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAllVisible = (on: boolean) => setSelected((prev) => {
    const n = new Set(prev);
    visibleIds.forEach((id) => (on ? n.add(id) : n.delete(id)));
    return n;
  });

  const parentNode = CATEGORY_TREE.find((n) => n.id === parentFilter);
  const isFiltered = !!search.trim() || !!parentFilter || !!leafFilter || tab !== 'all';

  return (
    <div ref={pageRef} className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900">Products</h1>
            <span className="text-[13px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full tabular-nums">{counts.all}</span>
          </div>
          <p className="text-[12.5px] text-gray-500 mt-0.5">Click a price or stock number to change it. Prices here are regular prices; sales are set in Promotions.</p>
        </div>
        <Link to="/seller/products/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      {!approved && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-[13px] text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Your seller application is still being reviewed. You can prepare drafts now; publishing opens once Loved-IT approves your shop.</p>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => { setLoading(true); load(); }} className="font-bold underline">Try again</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-0.5 px-4 pt-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }} role="tablist">
          {tabs.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key} type="button" role="tab" aria-selected={active}
                onClick={() => setTab(key)}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[12.5px] font-semibold whitespace-nowrap transition-all border-b-2',
                  active ? 'text-brand-red border-brand-red bg-red-50/50' : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50',
                ].join(' ')}
              >
                {label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${active ? 'bg-brand-red text-white' : key === 'low_stock' && counts.low_stock ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-gray-100" />

        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search" placeholder="Search by name or SKU"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all bg-gray-50 focus:bg-white"
            />
          </div>
          <div className="w-48">
            <CustomSelect
              value={parentFilter}
              onChange={(v) => { setParentFilter(v); setLeafFilter(''); }}
              options={[{ value: '', label: 'All categories' }, ...CATEGORY_TREE.map((n) => ({ value: n.id, label: n.label }))]}
            />
          </div>
          {parentNode && (
            <div className="w-48">
              <CustomSelect
                value={leafFilter} onChange={setLeafFilter}
                options={[{ value: '', label: `All in ${parentNode.label}` }, ...parentNode.children.map((c) => ({ value: c.id, label: c.label }))]}
              />
            </div>
          )}
          <div className="w-48 ml-auto">
            <CustomSelect value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS} />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-900 text-white">
            <span className="text-[12.5px] font-semibold tabular-nums">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/20 mx-1" />
            <button type="button" disabled={!approved} title={approved ? undefined : 'Publishing opens once your shop is approved.'}
              onClick={() => setBulkConfirm('activate')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed">
              <Eye className="w-3.5 h-3.5" /> Activate
            </button>
            <button type="button" onClick={() => setBulkConfirm('deactivate')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-white/10">
              <EyeOff className="w-3.5 h-3.5" /> Deactivate
            </button>
            <button type="button" onClick={() => setBulkConfirm('delete')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-red-200 hover:bg-red-500/20">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button type="button" onClick={() => setSelected(new Set())}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[12px] text-white/70 hover:text-white">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-t border-b border-gray-100 bg-gray-50">
                <th className="pl-4 pr-1 py-3 w-8">
                  <input
                    type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleAllVisible(e.target.checked)}
                    disabled={visibleIds.length === 0} aria-label="Select all products shown"
                    className="w-4 h-4 rounded border-gray-300 accent-brand-red cursor-pointer"
                  />
                </th>
                <th className="px-2 py-3 w-12" />
                <th className="text-left px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Product</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Price</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Stock</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Sold</th>
                <th className="text-center px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? <tr><td colSpan={8}><EmptyState filtered={isFiltered} /></td></tr>
                  : filtered.map((p) => (
                    <ProductRow
                      key={p.id} product={p} actions={actions} approved={approved} busy={busyId === p.id}
                      selected={selected.has(p.id)}
                      onSelect={(on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(p.id); else n.delete(p.id); return n; })}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete one product */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this product?"
        footer={<>
          <button type="button" className={BUTTON.ghost} onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button type="button" className={BUTTON.danger} disabled={busyId === confirmDelete?.id} onClick={doDelete}>
            {busyId === confirmDelete?.id ? 'Deleting…' : 'Delete'}
          </button>
        </>}
      >
        <p className="text-[13.5px] text-stone-600">
          <span className="font-semibold text-stone-900">"{confirmDelete?.name}"</span> will be removed from your store and from buyers' carts and wishlists.
          A product that is still in an unfinished order cannot be deleted; deactivate it instead.
        </p>
        {deleteError && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{deleteError}</p>
        )}
      </Dialog>

      {/* Publish refused: say what to fix */}
      <Dialog
        open={!!publishProblems}
        onClose={() => setPublishProblems(null)}
        title="Finish this product before publishing"
        footer={<>
          <button type="button" className={BUTTON.ghost} onClick={() => setPublishProblems(null)}>Close</button>
          <Link to={`/seller/products/${publishProblems?.product.id}/edit`} className={`${BUTTON.primary} inline-flex items-center`}>Edit product</Link>
        </>}
      >
        <p className="text-[13.5px] text-stone-600">"{publishProblems?.product.name}" is missing:</p>
        <ul className="mt-2 space-y-1.5">
          {publishProblems?.problems.map((m) => (
            <li key={m} className="flex gap-2 text-[13px] text-stone-800"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-red shrink-0" />{m}</li>
          ))}
        </ul>
      </Dialog>

      {/* Bulk confirm */}
      <Dialog
        open={!!bulkConfirm}
        onClose={() => !bulkBusy && setBulkConfirm(null)}
        title={bulkConfirm ? `${BULK_VERB[bulkConfirm]} ${selected.size} product${selected.size === 1 ? '' : 's'}?` : ''}
        footer={<>
          <button type="button" className={BUTTON.ghost} disabled={bulkBusy} onClick={() => setBulkConfirm(null)}>Cancel</button>
          <button type="button" className={bulkConfirm === 'delete' ? BUTTON.danger : BUTTON.dark} disabled={bulkBusy} onClick={runBulk}>
            {bulkBusy ? 'Working…' : bulkConfirm ? BULK_VERB[bulkConfirm] : ''}
          </button>
        </>}
      >
        <p className="text-[13.5px] text-stone-600">
          {bulkConfirm === 'delete' && 'Each product is removed from your store. Products that are still in an unfinished order are skipped.'}
          {bulkConfirm === 'deactivate' && 'Buyers stop seeing these products. You can activate them again any time.'}
          {bulkConfirm === 'activate' && 'These products go live. Products that are missing required details are skipped and listed so you can fix them.'}
        </p>
      </Dialog>

      {/* Bulk result with skipped items */}
      <Dialog
        open={!!bulkResult}
        onClose={() => setBulkResult(null)}
        title={bulkResult?.message ?? ''}
        size="max-w-lg"
        footer={<button type="button" className={BUTTON.dark} onClick={() => setBulkResult(null)}>Done</button>}
      >
        {bulkResult && bulkResult.done.length > 0 && (
          <p className="text-[13px] text-stone-600 mb-3">{BULK_VERB[bulkResult.action]}d: {bulkResult.done.map((d) => d.name).join(', ')}</p>
        )}
        <p className="text-[12px] font-semibold uppercase tracking-wide text-stone-500 mb-2">Skipped</p>
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {bulkResult?.skipped.map((s) => (
            <li key={s.id} className="px-3 py-2">
              <p className="text-[13px] font-semibold text-stone-900">{s.name ?? `Product #${s.id}`}</p>
              <p className="text-[12px] text-stone-600">{s.reason}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-stone-500">Skipped products stay selected.</p>
      </Dialog>
    </div>
  );
}
