import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, SlidersHorizontal, X, Star, MapPin, ChevronDown,
  ChevronUp, LayoutGrid, List, Package, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { getProductsApi } from '../api/client';
import { CATEGORY_TREE, LEAF_PARENT_MAP, LEAF_MAP } from '../data/categories';
import type { Product, ProductFilters, CatalogFacets, CatalogMeta } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'best_match',    label: 'Best Match' },
  { value: 'price_asc',     label: 'Price: Low to High' },
  { value: 'price_desc',    label: 'Price: High to Low' },
  { value: 'newest',        label: 'Newest' },
  { value: 'best_selling',  label: 'Best Selling' },
  { value: 'highest_rated', label: 'Highest Rated' },
] as const;

type SortValue = typeof SORT_OPTIONS[number]['value'];

const RATING_OPTIONS = [
  { value: 4, label: '4★ & up' },
  { value: 3, label: '3★ & up' },
];

const PER_PAGE = 28;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StarRow({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= Math.round(r) ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
      <span className="text-[11px] text-gray-400 ml-0.5">({count})</span>
    </div>
  );
}

// ── Filter state derived from URL params ──────────────────────────────────────

function useFiltersFromUrl(parentIdFromRoute?: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: ProductFilters = {
    q:                 searchParams.get('q')                 ?? undefined,
    parent_category_id: parentIdFromRoute ?? searchParams.get('parent') ?? undefined,
    category_id:       searchParams.get('cat')              ?? undefined,
    min_price:         searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined,
    max_price:         searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined,
    min_rating:        searchParams.get('rating')    ? Number(searchParams.get('rating'))    : undefined,
    free_shipping:     searchParams.get('free_shipping') === '1' || undefined,
    cod:               searchParams.get('cod')            === '1' || undefined,
    on_sale:           searchParams.get('on_sale')        === '1' || undefined,
    new_arrivals:      searchParams.get('new_arrivals')   === '1' || undefined,
    seller_ids:        searchParams.get('sellers') ? searchParams.get('sellers')!.split(',').map(Number) : undefined,
    provinces:         searchParams.get('provinces') ? searchParams.get('provinces')!.split(',') : undefined,
    sort:              (searchParams.get('sort') as SortValue) ?? 'best_match',
    page:              searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    per_page:          PER_PAGE,
  };

  function setFilter(updates: Partial<ProductFilters>) {
    const next = new URLSearchParams(searchParams);
    const set = (k: string, v: string | undefined) => v ? next.set(k, v) : next.delete(k);
    if ('q'                 in updates) set('q',             updates.q);
    if ('category_id'       in updates) set('cat',           updates.category_id);
    if ('min_price'         in updates) set('min_price',     updates.min_price != null ? String(updates.min_price) : undefined);
    if ('max_price'         in updates) set('max_price',     updates.max_price != null ? String(updates.max_price) : undefined);
    if ('min_rating'        in updates) set('rating',        updates.min_rating != null ? String(updates.min_rating) : undefined);
    if ('free_shipping'     in updates) set('free_shipping', updates.free_shipping ? '1' : undefined);
    if ('cod'               in updates) set('cod',           updates.cod ? '1' : undefined);
    if ('on_sale'           in updates) set('on_sale',       updates.on_sale ? '1' : undefined);
    if ('new_arrivals'      in updates) set('new_arrivals',  updates.new_arrivals ? '1' : undefined);
    if ('seller_ids'        in updates) set('sellers',       updates.seller_ids?.length ? updates.seller_ids.join(',') : undefined);
    if ('provinces'         in updates) set('provinces',     updates.provinces?.length ? updates.provinces.join(',') : undefined);
    if ('sort'              in updates) set('sort',          updates.sort);
    if ('page'              in updates) set('page',          updates.page && updates.page > 1 ? String(updates.page) : undefined);
    else next.delete('page'); // reset page on any filter change
    setSearchParams(next, { replace: true });
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (parentIdFromRoute) next.set('parent', parentIdFromRoute);
    setSearchParams(next, { replace: true });
  }

  return { filters, setFilter, clearAll };
}

// ── Active filter chips ───────────────────────────────────────────────────────

function ActiveChips({
  filters, onRemove,
}: {
  filters: ProductFilters;
  onRemove: (key: keyof ProductFilters, value?: string | number) => void;
}) {
  const chips: { label: string; onRemove: () => void }[] = [];

  if (filters.category_id) {
    const leaf = LEAF_MAP.get(filters.category_id);
    if (leaf) chips.push({ label: leaf.label, onRemove: () => onRemove('category_id') });
  }
  if (filters.min_price != null || filters.max_price != null) {
    const label = [
      filters.min_price != null ? `₱${filters.min_price}` : '',
      filters.max_price != null ? `₱${filters.max_price}` : '',
    ].filter(Boolean).join(' – ');
    chips.push({ label: `Price: ${label}`, onRemove: () => { onRemove('min_price'); onRemove('max_price'); } });
  }
  if (filters.min_rating) chips.push({ label: `${filters.min_rating}★ & up`, onRemove: () => onRemove('min_rating') });
  if (filters.free_shipping) chips.push({ label: 'Free Shipping', onRemove: () => onRemove('free_shipping') });
  if (filters.cod)           chips.push({ label: 'Cash on Delivery', onRemove: () => onRemove('cod') });
  if (filters.on_sale)       chips.push({ label: 'On Sale', onRemove: () => onRemove('on_sale') });
  if (filters.new_arrivals)  chips.push({ label: 'New Arrivals', onRemove: () => onRemove('new_arrivals') });
  filters.seller_ids?.forEach((id) => chips.push({ label: `Seller #${id}`, onRemove: () => onRemove('seller_ids', id) }));
  filters.provinces?.forEach((p) => chips.push({ label: p, onRemove: () => onRemove('provinces', p) }));

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 bg-red-50 border border-brand-red/20 text-brand-red text-xs font-semibold px-3 py-1.5 rounded-full">
          {c.label}
          <button onClick={c.onRemove} className="hover:text-red-800 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ── Collapsible filter section ────────────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 pb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-sm font-bold text-gray-800 hover:text-brand-red transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Filter Sidebar ────────────────────────────────────────────────────────────

function FilterSidebar({
  filters,
  facets,
  parentId,
  onFilter,
  onClearAll,
}: {
  filters: ProductFilters;
  facets: CatalogFacets | null;
  parentId: string | undefined;
  onFilter: (updates: Partial<ProductFilters>) => void;
  onClearAll: () => void;
}) {
  const [minInput, setMinInput] = useState(filters.min_price != null ? String(filters.min_price) : '');
  const [maxInput, setMaxInput] = useState(filters.max_price != null ? String(filters.max_price) : '');
  const [showMoreSellers, setShowMoreSellers] = useState(false);
  const [showMoreProvinces, setShowMoreProvinces] = useState(false);

  const parentNode = parentId ? CATEGORY_TREE.find((p) => p.id === parentId) : null;

  const hasActiveFilters = !!(
    filters.category_id || filters.min_price != null || filters.max_price != null ||
    filters.min_rating || filters.free_shipping || filters.cod || filters.on_sale ||
    filters.new_arrivals || filters.seller_ids?.length || filters.provinces?.length
  );

  function applyPrice() {
    const min = minInput !== '' ? Number(minInput) : undefined;
    const max = maxInput !== '' ? Number(maxInput) : undefined;
    onFilter({ min_price: min, max_price: max });
  }

  function toggleSeller(id: number) {
    const current = filters.seller_ids ?? [];
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    onFilter({ seller_ids: next.length ? next : undefined });
  }

  function toggleProvince(name: string) {
    const current = filters.provinces ?? [];
    const next = current.includes(name) ? current.filter((p) => p !== name) : [...current, name];
    onFilter({ provinces: next.length ? next : undefined });
  }

  const sellers = facets?.sellers ?? [];
  const provinces = facets?.provinces ?? [];
  const visibleSellers = showMoreSellers ? sellers : sellers.slice(0, 5);
  const visibleProvinces = showMoreProvinces ? provinces : provinces.slice(0, 5);

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-brand-red" /> Filters
        </span>
        {hasActiveFilters && (
          <button onClick={onClearAll} className="text-xs text-brand-red font-semibold hover:underline">
            Clear All
          </button>
        )}
      </div>

      {/* Subcategory filter — only when browsing a parent */}
      {parentNode && (
        <FilterSection title="Category">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onFilter({ category_id: undefined })}
              className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${
                !filters.category_id ? 'text-brand-red font-semibold bg-red-50' : 'text-gray-600 hover:text-brand-red hover:bg-gray-50'
              }`}
            >
              All in {parentNode.label}
            </button>
            {parentNode.children.map((leaf) => (
              <button
                key={leaf.id}
                onClick={() => onFilter({ category_id: leaf.id })}
                className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${
                  filters.category_id === leaf.id
                    ? 'text-brand-red font-semibold bg-red-50'
                    : 'text-gray-600 hover:text-brand-red hover:bg-gray-50'
                }`}
              >
                {leaf.label}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {/* Price range */}
      <FilterSection title="Price Range">
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number" min={0} placeholder="Min"
            value={minInput}
            onChange={(e) => setMinInput(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
          />
          <span className="text-gray-400 text-sm shrink-0">–</span>
          <input
            type="number" min={0} placeholder="Max"
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            onBlur={applyPrice}
            onKeyDown={(e) => e.key === 'Enter' && applyPrice()}
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
          />
        </div>
      </FilterSection>

      {/* Rating */}
      <FilterSection title="Rating">
        <div className="flex flex-col gap-1 mt-1">
          {RATING_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio" name="rating"
                checked={filters.min_rating === opt.value}
                onChange={() => onFilter({ min_rating: filters.min_rating === opt.value ? undefined : opt.value })}
                className="accent-brand-red w-4 h-4"
              />
              <span className="flex items-center gap-1 text-sm text-gray-600 group-hover:text-brand-red transition-colors">
                {[1,2,3,4,5].map((i) => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i <= opt.value ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-200'}`} />
                ))}
                <span className="ml-0.5">&amp; up</span>
              </span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Services */}
      <FilterSection title="Service / Promotion">
        <div className="flex flex-col gap-2 mt-1">
          {([
            { key: 'free_shipping', label: 'Free Shipping' },
            { key: 'cod',           label: 'Cash on Delivery' },
            { key: 'on_sale',       label: 'On Sale' },
            { key: 'new_arrivals',  label: 'New Arrivals' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={!!filters[key]}
                onChange={(e) => onFilter({ [key]: e.target.checked || undefined })}
                className="accent-brand-red w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-600 group-hover:text-brand-red transition-colors">{label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Sellers */}
      {sellers.length > 0 && (
        <FilterSection title="Brand / Seller" defaultOpen={false}>
          <div className="flex flex-col gap-2 mt-1">
            {visibleSellers.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.seller_ids?.includes(s.id) ?? false}
                  onChange={() => toggleSeller(s.id)}
                  className="accent-brand-red w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-600 group-hover:text-brand-red transition-colors flex-1 truncate">
                  {s.shop_name}
                </span>
                <span className="text-xs text-gray-400">({s.count})</span>
              </label>
            ))}
            {sellers.length > 5 && (
              <button
                onClick={() => setShowMoreSellers(!showMoreSellers)}
                className="text-xs text-brand-red font-semibold hover:underline text-left mt-1"
              >
                {showMoreSellers ? 'View Less' : `View ${sellers.length - 5} More`}
              </button>
            )}
          </div>
        </FilterSection>
      )}

      {/* Location */}
      {provinces.length > 0 && (
        <FilterSection title="Ships From" defaultOpen={false}>
          <div className="flex flex-col gap-2 mt-1">
            {visibleProvinces.map((p) => (
              <label key={p.name} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={filters.provinces?.includes(p.name) ?? false}
                  onChange={() => toggleProvince(p.name)}
                  className="accent-brand-red w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-600 group-hover:text-brand-red transition-colors flex-1 truncate">
                  {p.name}
                </span>
                <span className="text-xs text-gray-400">({p.count})</span>
              </label>
            ))}
            {provinces.length > 5 && (
              <button
                onClick={() => setShowMoreProvinces(!showMoreProvinces)}
                className="text-xs text-brand-red font-semibold hover:underline text-left mt-1"
              >
                {showMoreProvinces ? 'View Less' : `View ${provinces.length - 5} More`}
              </button>
            )}
          </div>
        </FilterSection>
      )}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, list }: { product: Product; list: boolean }) {
  const isOnSale = product.original_price != null && product.original_price > product.base_price;
  const discount = isOnSale
    ? Math.round((1 - product.base_price / product.original_price!) * 100)
    : 0;

  if (list) {
    return (
      <Link
        to={`/products/${product.id}`}
        className="flex gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-3"
      >
        <div className="w-28 h-28 shrink-0 rounded-xl bg-gray-100 overflow-hidden">
          {product.thumbnail_url
            ? <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
          }
        </div>
        <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
          <div>
            <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
            <StarRow rating={product.avg_rating} count={product.review_count} />
          </div>
          <div className="flex items-end justify-between gap-2 flex-wrap">
            <div>
              <span className="text-base font-black text-brand-red">{formatPrice(product.base_price)}</span>
              {isOnSale && (
                <span className="ml-2 text-xs text-gray-400 line-through">{formatPrice(product.original_price!)}</span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              {product.seller.city ?? product.seller.province ?? '—'}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {product.thumbnail_url
          ? <img
              src={product.thumbnail_url}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          : <div className="w-full h-full flex items-center justify-center">
              <Package className="w-10 h-10 text-gray-300" />
            </div>
        }
        {isOnSale && (
          <span className="absolute top-2 left-2 bg-brand-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            -{discount}%
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
        <div className="mt-auto flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base font-black text-brand-red">{formatPrice(product.base_price)}</span>
            {isOnSale && (
              <span className="text-xs text-gray-400 line-through">{formatPrice(product.original_price!)}</span>
            )}
          </div>
          <StarRow rating={product.avg_rating} count={product.review_count} />
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-0.5">
            <span>{product.units_sold > 0 ? `${product.units_sold.toLocaleString()} sold` : 'New'}</span>
            <span className="flex items-center gap-0.5 truncate max-w-[50%]">
              <MapPin className="w-3 h-3 shrink-0" />
              {product.seller.city ?? product.seller.province ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Package className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-base font-bold text-gray-700">No products found</p>
      <p className="text-sm text-gray-400 mt-1 max-w-xs">
        Try adjusting your filters or search terms to find what you're looking for.
      </p>
      <button
        onClick={onClear}
        className="mt-5 px-5 py-2.5 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red-dark transition-colors"
      >
        Clear Filters
      </button>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function PaginationBar({ meta, onPage }: { meta: CatalogMeta; onPage: (p: number) => void }) {
  const { current_page, last_page, total, from, to } = meta;
  if (last_page <= 1) return null;

  const pages: (number | '…')[] = [];
  if (last_page <= 7) {
    for (let i = 1; i <= last_page; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current_page > 3) pages.push('…');
    for (let i = Math.max(2, current_page - 1); i <= Math.min(last_page - 1, current_page + 1); i++) pages.push(i);
    if (current_page < last_page - 2) pages.push('…');
    pages.push(last_page);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
      <p className="text-sm text-gray-500">
        Showing <span className="font-semibold text-gray-800">{from ?? 0}–{to ?? 0}</span> of{' '}
        <span className="font-semibold text-gray-800">{total.toLocaleString()}</span> products
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(current_page - 1)} disabled={current_page <= 1}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="w-9 h-9 flex items-center justify-center text-gray-400 text-sm">…</span>
            : <button
                key={p}
                onClick={() => onPage(p as number)}
                className={[
                  'w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  p === current_page
                    ? 'bg-brand-red text-white'
                    : 'border border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red',
                ].join(' ')}
              >{p}</button>
        )}
        <button
          onClick={() => onPage(current_page + 1)} disabled={current_page >= last_page}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Mobile filter drawer ──────────────────────────────────────────────────────

function MobileFilterDrawer({
  open, onClose, children,
}: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 left-0 z-50 w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-gray-900">Filters</span>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-brand-red text-white font-semibold text-sm hover:bg-brand-red-dark transition-colors"
              >
                Show Results
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const { parentId } = useParams<{ parentId?: string }>();
  const { filters, setFilter, clearAll } = useFiltersFromUrl(parentId);

  const [products,    setProducts]    = useState<Product[]>([]);
  const [meta,        setMeta]        = useState<CatalogMeta | null>(null);
  const [facets,      setFacets]      = useState<CatalogFacets | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [listView,    setListView]    = useState(false);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [sortOpen,    setSortOpen]    = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Derive page title
  const parentNode = parentId ? CATEGORY_TREE.find((p) => p.id === parentId) : null;
  const leafNode   = filters.category_id ? LEAF_MAP.get(filters.category_id) : null;
  const pageTitle  = leafNode?.label ?? parentNode?.label ?? (filters.q ? `Results for "${filters.q}"` : 'All Products');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProductsApi(filters);
      setProducts(res.data);
      setMeta(res.meta);
      setFacets(res.facets);
    } catch {
      setProducts([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Close sort dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleRemoveChip(key: keyof ProductFilters, value?: string | number) {
    if (key === 'seller_ids' && value != null) {
      setFilter({ seller_ids: filters.seller_ids?.filter((id) => id !== value) });
    } else if (key === 'provinces' && value != null) {
      setFilter({ provinces: filters.provinces?.filter((p) => p !== value) });
    } else {
      setFilter({ [key]: undefined });
    }
  }

  const currentSort = SORT_OPTIONS.find((o) => o.value === filters.sort) ?? SORT_OPTIONS[0];

  const sidebarContent = (
    <FilterSidebar
      filters={filters}
      facets={facets}
      parentId={parentId}
      onFilter={(u) => setFilter(u)}
      onClearAll={clearAll}
    />
  );

  return (
    <div className="min-h-screen bg-brand-gray-soft">

      {/* ── Page header bar ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="text-brand-red font-bold text-lg tracking-tight shrink-0">Velure</Link>
          <span className="text-gray-300">/</span>
          {parentNode && (
            <>
              <Link to={`/category/${parentNode.id}`} className="text-sm text-gray-500 hover:text-brand-red transition-colors truncate">
                {parentNode.label}
              </Link>
              {leafNode && <><span className="text-gray-300">/</span><span className="text-sm text-gray-700 font-medium truncate">{leafNode.label}</span></>}
            </>
          )}
          {!parentNode && filters.q && (
            <span className="text-sm text-gray-700 font-medium truncate">Search: {filters.q}</span>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ── Title + result count ── */}
        <div className="mb-5">
          <h1 className="text-xl font-black text-gray-900">{pageTitle}</h1>
          {meta && (
            <p className="text-sm text-gray-400 mt-0.5">
              {meta.total.toLocaleString()} {meta.total === 1 ? 'item' : 'items'} found
            </p>
          )}
        </div>

        {/* ── Active chips ── */}
        <ActiveChips filters={filters} onRemove={handleRemoveChip} />

        <div className="flex gap-6 mt-5">

          {/* ── Desktop sidebar ── */}
          <aside className="hidden lg:block w-56 xl:w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sticky top-20">
              {sidebarContent}
            </div>
          </aside>

          {/* ── Results column ── */}
          <div className="flex-1 min-w-0">

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {/* Mobile filter button */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-brand-red hover:text-brand-red transition-colors min-h-[44px]"
              >
                <SlidersHorizontal className="w-4 h-4" /> Filters
              </button>

              <div className="flex items-center gap-2 ml-auto">
                {/* Sort dropdown */}
                <div ref={sortRef} className="relative">
                  <button
                    onClick={() => setSortOpen(!sortOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-brand-red hover:text-brand-red transition-colors min-h-[44px]"
                  >
                    {currentSort.label}
                    <ChevronDown className={`w-4 h-4 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {sortOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-xl z-20 overflow-hidden"
                      >
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => { setFilter({ sort: opt.value }); setSortOpen(false); }}
                            className={[
                              'w-full text-left px-4 py-2.5 text-sm transition-colors',
                              filters.sort === opt.value
                                ? 'bg-red-50 text-brand-red font-semibold'
                                : 'text-gray-700 hover:bg-gray-50',
                            ].join(' ')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* View toggle */}
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                  <button
                    onClick={() => setListView(false)}
                    className={`w-10 h-10 flex items-center justify-center transition-colors ${!listView ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-gray-700'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setListView(true)}
                    className={`w-10 h-10 flex items-center justify-center transition-colors ${listView ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-gray-700'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grid / List */}
            {loading ? (
              <div className={listView
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              }>
                {Array.from({ length: PER_PAGE }).map((_, i) => (
                  <div key={i} className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${listView ? 'flex gap-4 p-3' : ''}`}>
                    {listView
                      ? <><div className="w-28 h-28 rounded-xl bg-gray-100 animate-pulse shrink-0" /><div className="flex-1 flex flex-col gap-2 py-1"><div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" /><div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" /></div></>
                      : <><div className="aspect-square bg-gray-100 animate-pulse" /><div className="p-3 flex flex-col gap-2"><div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" /><div className="h-4 bg-gray-100 rounded animate-pulse w-1/3" /></div></>
                    }
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyState onClear={clearAll} />
            ) : (
              <div className={listView
                ? 'flex flex-col gap-3'
                : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              }>
                {products.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <ProductCard product={p} list={listView} />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {meta && !loading && (
              <PaginationBar meta={meta} onPage={(p) => setFilter({ page: p })} />
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <MobileFilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebarContent}
      </MobileFilterDrawer>
    </div>
  );
}
