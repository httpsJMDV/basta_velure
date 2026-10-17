import { useState, useEffect } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, Star, ChevronDown, LayoutGrid, List, Package, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Store, SearchX,
} from 'lucide-react';
import { getProductsApi } from '../api/client';
import { CATEGORY_TREE, LEAF_MAP } from '../data/categories';
import ProductCard from '../components/ui/ProductCard';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import CategoryArt from '../components/storefront/CategoryArt';
import { useStorefrontCategories } from '../hooks/useStorefrontCategories';
import type { Product, ProductFilters, CatalogFacets, CatalogMeta, RelatedShop, StorefrontCategory } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

type SortValue = NonNullable<ProductFilters['sort']>;

/** The sort tabs; price toggles between low-to-high and high-to-low. */
const SORT_TABS: { value: SortValue; label: string }[] = [
  { value: 'best_match', label: 'Relevance' },
  { value: 'best_selling', label: 'Top sales' },
  { value: 'newest', label: 'Newest' },
  { value: 'highest_rated', label: 'Top rated' },
];

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under ₱500', max: 500 },
  { label: '₱500 – ₱2,000', min: 500, max: 2000 },
  { label: '₱2,000 – ₱10,000', min: 2000, max: 10000 },
  { label: 'Over ₱10,000', min: 10000 },
];

const RATING_OPTIONS = [4, 3, 2];
const PER_PAGE = 30;

const SHIPPED_FROM_OPTIONS = ['Metro Manila', 'North Luzon', 'South Luzon', 'Visayas', 'Mindanao'];

// ── Filter state derived from URL params ──────────────────────────────────────

function useFiltersFromUrl(parentIdFromRoute?: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const list = (key: string) => (searchParams.get(key) ? searchParams.get(key)!.split(',') : undefined);
  const shipped = list('shipped_from') ?? list('provinces');

  const filters: ProductFilters = {
    q:                  searchParams.get('q') ?? undefined,
    parent_category_id: parentIdFromRoute ?? searchParams.get('parent') ?? undefined,
    category_id:        searchParams.get('cat') ?? undefined,
    min_price:          searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined,
    max_price:          searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined,
    min_rating:         searchParams.get('rating') ? Number(searchParams.get('rating')) : undefined,
    on_sale:            ['1', 'true'].includes(searchParams.get('on_sale') ?? '') || undefined,
    new_arrivals:       ['1', 'true'].includes(searchParams.get('new_arrivals') ?? '') || undefined,
    seller_ids:         list('sellers')?.map(Number),
    shipped_from:       shipped,
    provinces:          shipped,
    sort:               (searchParams.get('sort') as SortValue) ?? 'best_match',
    page:               searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    per_page:           PER_PAGE,
  };

  function setFilter(updates: Partial<ProductFilters>) {
    const next = new URLSearchParams(searchParams);
    const set = (k: string, v: string | undefined) => (v ? next.set(k, v) : next.delete(k));
    if ('q' in updates) set('q', updates.q);
    if ('category_id' in updates) set('cat', updates.category_id);
    if ('min_price' in updates) set('min_price', updates.min_price != null ? String(updates.min_price) : undefined);
    if ('max_price' in updates) set('max_price', updates.max_price != null ? String(updates.max_price) : undefined);
    if ('min_rating' in updates) set('rating', updates.min_rating != null ? String(updates.min_rating) : undefined);
    if ('on_sale' in updates) set('on_sale', updates.on_sale ? '1' : undefined);
    if ('new_arrivals' in updates) set('new_arrivals', updates.new_arrivals ? '1' : undefined);
    if ('seller_ids' in updates) set('sellers', updates.seller_ids?.length ? updates.seller_ids.join(',') : undefined);
    if ('shipped_from' in updates) {
      set('shipped_from', updates.shipped_from?.length ? updates.shipped_from.join(',') : undefined);
      next.delete('provinces');
    }
    if ('sort' in updates) set('sort', updates.sort === 'best_match' ? undefined : updates.sort);
    if ('page' in updates) set('page', updates.page && updates.page > 1 ? String(updates.page) : undefined);
    else next.delete('page'); // any filter change goes back to page 1
    setSearchParams(next, { replace: true });
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (filters.q) next.set('q', filters.q);
    setSearchParams(next, { replace: true });
  }

  return { filters, setFilter, clearAll };
}

/** Removable chips for every active filter (the search and category are shown in the title instead). */
function activeChips(filters: ProductFilters, sellers: CatalogFacets['sellers'], setFilter: (u: Partial<ProductFilters>) => void) {
  const chips: { label: string; onRemove: () => void }[] = [];
  if (filters.min_price != null || filters.max_price != null) {
    const label = filters.min_price != null && filters.max_price != null
      ? `₱${filters.min_price.toLocaleString()} – ₱${filters.max_price.toLocaleString()}`
      : filters.min_price != null ? `Over ₱${filters.min_price.toLocaleString()}` : `Under ₱${filters.max_price!.toLocaleString()}`;
    chips.push({ label, onRemove: () => setFilter({ min_price: undefined, max_price: undefined }) });
  }
  if (filters.min_rating) chips.push({ label: `${filters.min_rating}★ & up`, onRemove: () => setFilter({ min_rating: undefined }) });
  if (filters.on_sale) chips.push({ label: 'On sale', onRemove: () => setFilter({ on_sale: undefined }) });
  if (filters.new_arrivals) chips.push({ label: 'New arrivals', onRemove: () => setFilter({ new_arrivals: undefined }) });
  filters.seller_ids?.forEach((id) => chips.push({
    label: sellers.find((s) => s.id === id)?.shop_name ?? `Shop #${id}`,
    onRemove: () => setFilter({ seller_ids: filters.seller_ids!.filter((s) => s !== id) }),
  }));
  filters.shipped_from?.forEach((p) => chips.push({
    label: `From ${p}`,
    onRemove: () => setFilter({ shipped_from: filters.shipped_from!.filter((x) => x !== p) }),
  }));
  return chips;
}

// ── Filter rail ───────────────────────────────────────────────────────────────

function RailSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="py-4 border-t border-stone-200/80 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500 hover:text-stone-800 transition-colors"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function FilterRail({ filters, facets, categories, parent, onFilter }: {
  filters: ProductFilters;
  facets: CatalogFacets | null;
  categories: StorefrontCategory[] | null;
  parent: StorefrontCategory | null;
  onFilter: (updates: Partial<ProductFilters>) => void;
}) {
  const [minInput, setMinInput] = useState(filters.min_price != null ? String(filters.min_price) : '');
  const [maxInput, setMaxInput] = useState(filters.max_price != null ? String(filters.max_price) : '');
  const [allSellers, setAllSellers] = useState(false);

  const applyPrice = () => onFilter({
    min_price: minInput !== '' ? Number(minInput) : undefined,
    max_price: maxInput !== '' ? Number(maxInput) : undefined,
  });
  const pickPreset = (min?: number, max?: number) => {
    const same = filters.min_price === min && filters.max_price === max;
    setMinInput(same || min == null ? '' : String(min));
    setMaxInput(same || max == null ? '' : String(max));
    onFilter({ min_price: same ? undefined : min, max_price: same ? undefined : max });
  };
  const toggle = <T,>(current: T[] | undefined, value: T) => {
    const list = current ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    return next.length ? next : undefined;
  };

  const sellers = facets?.sellers ?? [];
  const visibleSellers = allSellers ? sellers : sellers.slice(0, 6);
  const locationCount = (name: string) => facets?.locations?.find((l) => l.name.toLowerCase() === name.toLowerCase())?.count ?? 0;

  return (
    <div className="text-sm">
      {/* Categories: the subcategories of the one being browsed, or every main category */}
      <RailSection title={parent ? parent.name : 'Categories'}>
        <ul className="space-y-0.5">
          {parent ? (
            <>
              <li>
                <button
                  type="button"
                  onClick={() => onFilter({ category_id: undefined })}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${!filters.category_id ? 'bg-white text-brand-red font-semibold shadow-[inset_2px_0_0_#B91C1C]' : 'text-stone-600 hover:text-stone-900'}`}
                >
                  <span>All</span>
                  <span className="text-[11px] text-stone-400 tabular-nums">{parent.product_count}</span>
                </button>
              </li>
              {(parent.children ?? []).map((leaf) => (
                <li key={leaf.id}>
                  <button
                    type="button"
                    onClick={() => onFilter({ category_id: leaf.slug })}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${filters.category_id === leaf.slug ? 'bg-white text-brand-red font-semibold shadow-[inset_2px_0_0_#B91C1C]' : leaf.product_count ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400'}`}
                  >
                    <span className="truncate">{leaf.name}</span>
                    <span className="text-[11px] text-stone-400 tabular-nums">{leaf.product_count}</span>
                  </button>
                </li>
              ))}
            </>
          ) : (
            (categories ?? []).map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors ${c.product_count ? 'text-stone-600 hover:text-brand-red' : 'text-stone-400 hover:text-stone-600'}`}>
                  <span className="truncate">{c.name}</span>
                  <span className="text-[11px] text-stone-400 tabular-nums">{c.product_count}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </RailSection>

      <RailSection title="Price">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRICE_PRESETS.map((p) => {
            const on = filters.min_price === p.min && filters.max_price === p.max;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => pickPreset(p.min, p.max)}
                className={`px-2.5 h-7 rounded-full border text-[12px] transition-colors ${on ? 'border-brand-red bg-brand-red text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); applyPrice(); }} className="flex items-center gap-1.5">
          <input type="number" min={0} inputMode="numeric" placeholder="₱ Min" value={minInput} onChange={(e) => setMinInput(e.target.value)}
            className="w-full min-w-0 h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] outline-none focus:border-brand-red" />
          <span className="text-stone-300">–</span>
          <input type="number" min={0} inputMode="numeric" placeholder="₱ Max" value={maxInput} onChange={(e) => setMaxInput(e.target.value)}
            className="w-full min-w-0 h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] outline-none focus:border-brand-red" />
          <button type="submit" className="shrink-0 h-9 px-3 rounded-lg bg-stone-900 hover:bg-black text-white text-[12px] font-semibold transition-colors">Go</button>
        </form>
      </RailSection>

      <RailSection title="Rating">
        <div className="flex flex-col gap-1">
          {RATING_OPTIONS.map((stars) => {
            const on = filters.min_rating === stars;
            return (
              <button
                key={stars}
                type="button"
                onClick={() => onFilter({ min_rating: on ? undefined : stars })}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${on ? 'bg-white shadow-[inset_2px_0_0_#B91C1C]' : 'hover:bg-white/70'}`}
              >
                <span className="flex">
                  {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-3.5 h-3.5 ${i <= stars ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200'}`} />)}
                </span>
                <span className={`text-[12px] ${on ? 'text-brand-red font-semibold' : 'text-stone-500'}`}>& up</span>
              </button>
            );
          })}
        </div>
      </RailSection>

      <RailSection title="Deals">
        <div className="flex flex-col gap-2">
          {([['on_sale', 'On sale'], ['new_arrivals', 'New arrivals (30 days)']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-stone-700">{label}</span>
              <input type="checkbox" className="peer sr-only" checked={!!filters[key]} onChange={(e) => onFilter({ [key]: e.target.checked || undefined })} />
              <span className="relative w-9 h-5 rounded-full bg-stone-300 transition-colors peer-checked:bg-brand-red after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-red/30" />
            </label>
          ))}
        </div>
      </RailSection>

      {sellers.length > 0 && (
        <RailSection title="Shops" defaultOpen={false}>
          <div className="flex flex-col gap-1.5">
            {visibleSellers.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={filters.seller_ids?.includes(s.id) ?? false} onChange={() => onFilter({ seller_ids: toggle(filters.seller_ids, s.id) })} className="accent-brand-red w-3.5 h-3.5" />
                <span className="flex-1 truncate text-stone-600 group-hover:text-stone-900">{s.shop_name}</span>
                <span className="text-[11px] text-stone-400 tabular-nums">{s.count}</span>
              </label>
            ))}
            {sellers.length > 6 && (
              <button type="button" onClick={() => setAllSellers(!allSellers)} className="text-left text-[12px] font-semibold text-brand-red hover:underline mt-1">
                {allSellers ? 'Show fewer' : `Show all ${sellers.length}`}
              </button>
            )}
          </div>
        </RailSection>
      )}

      <RailSection title="Ships from" defaultOpen={false}>
        <div className="flex flex-col gap-1.5">
          {SHIPPED_FROM_OPTIONS.map((name) => {
            const count = locationCount(name);
            return (
              <label key={name} className={`flex items-center gap-2.5 cursor-pointer group ${count === 0 && !filters.shipped_from?.includes(name) ? 'opacity-50' : ''}`}>
                <input type="checkbox" checked={filters.shipped_from?.includes(name) ?? false} onChange={() => onFilter({ shipped_from: toggle(filters.shipped_from, name) })} className="accent-brand-red w-3.5 h-3.5" />
                <span className="flex-1 text-stone-600 group-hover:text-stone-900">{name}</span>
                <span className="text-[11px] text-stone-400 tabular-nums">{count}</span>
              </label>
            );
          })}
        </div>
      </RailSection>
    </div>
  );
}

// ── Related shops (on a search) ───────────────────────────────────────────────

function RelatedShops({ shops }: { shops: RelatedShop[] }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500">Shops</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {shops.map((shop) => (
          <Link
            key={shop.id}
            to={`/shop/${shop.shop_slug}`}
            className="group shrink-0 w-[300px] flex items-center gap-3 p-3 rounded-2xl bg-white border border-stone-200 hover:border-stone-400 transition-colors"
          >
            <span className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 flex items-center justify-center text-stone-500 font-bold shrink-0">
              {shop.logo_url ? <img src={shop.logo_url} alt="" className="w-full h-full object-cover" /> : (shop.shop_name[0]?.toUpperCase() ?? <Store className="w-5 h-5" />)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-900 truncate group-hover:text-brand-red">{shop.shop_name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-stone-500 mt-0.5">
                {shop.avg_rating > 0 && (<><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{shop.avg_rating.toFixed(1)}<span className="text-stone-300">·</span></>)}
                {shop.total_products} products
              </span>
            </span>
            <span className="text-[12px] font-semibold text-brand-red shrink-0">Visit</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ meta, onPage }: { meta: CatalogMeta; onPage: (p: number) => void }) {
  const { current_page, last_page } = meta;
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
  const step = 'w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors';

  return (
    <nav className="flex items-center justify-center gap-1 pt-10" aria-label="Pages">
      <button type="button" onClick={() => onPage(current_page - 1)} disabled={current_page <= 1} className={`${step} text-stone-500 hover:bg-white disabled:opacity-30`} aria-label="Previous page">
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map((p, i) => p === '…'
        ? <span key={`e${i}`} className={`${step} text-stone-400`}>…</span>
        : (
          <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === current_page ? 'page' : undefined}
            className={`${step} ${p === current_page ? 'bg-stone-900 text-white font-semibold' : 'text-stone-600 hover:bg-white'}`}>
            {p}
          </button>
        ))}
      <button type="button" onClick={() => onPage(current_page + 1)} disabled={current_page >= last_page} className={`${step} text-stone-500 hover:bg-white disabled:opacity-30`} aria-label="Next page">
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}

// ── Mobile filter drawer ──────────────────────────────────────────────────────

function MobileFilterDrawer({ open, onClose, total, children }: { open: boolean; onClose: () => void; total: number | null; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-y-0 left-0 z-50 w-80 max-w-[88vw] bg-[#FAF8F5] shadow-2xl flex flex-col"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'tween', duration: 0.24 }}
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-stone-200">
              <span className="font-semibold text-stone-900">Filters</span>
              <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-200/60" aria-label="Close filters">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            <div className="px-5 py-4 border-t border-stone-200">
              <button type="button" onClick={onClose} className="w-full h-11 rounded-full bg-brand-red text-white font-semibold text-sm hover:bg-brand-red-dark transition-colors">
                Show {total != null ? total.toLocaleString() : ''} results
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
  const categories = useStorefrontCategories();

  // The last response, tagged with the filters it answers; it is "loading" while the filters have moved on.
  const filtersKey = JSON.stringify(filters);
  const [result, setResult] = useState<{
    key: string; products: Product[]; relatedShops: RelatedShop[]; meta: CatalogMeta | null; facets: CatalogFacets | null; corrected: string | null;
  } | null>(null);
  const [listView, setListView] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Names: the live category tree when it has loaded, the built-in one meanwhile.
  const parent = parentId ? categories?.find((c) => c.slug === parentId) ?? null : null;
  const parentLabel = parent?.name ?? (parentId ? CATEGORY_TREE.find((p) => p.id === parentId)?.label : undefined);
  const leaf = filters.category_id ? parent?.children?.find((c) => c.slug === filters.category_id) : undefined;
  const leafLabel = leaf?.name ?? (filters.category_id ? LEAF_MAP.get(filters.category_id)?.label : undefined);
  const title = filters.q ? `“${filters.q}”` : leafLabel ?? parentLabel ?? 'All products';

  useEffect(() => {
    let alive = true;
    getProductsApi(JSON.parse(filtersKey) as ProductFilters)
      .then((res) => {
        if (alive) setResult({ key: filtersKey, products: res.data, relatedShops: res.related_shops ?? [], meta: res.meta, facets: res.facets, corrected: res.search?.corrected ?? null });
      })
      .catch(() => {
        if (alive) setResult({ key: filtersKey, products: [], relatedShops: [], meta: null, facets: null, corrected: null });
      });
    return () => { alive = false; };
  }, [filtersKey]);

  const loading = result?.key !== filtersKey;
  const products = result?.products ?? [];
  const relatedShops = result?.relatedShops ?? [];
  const meta = result?.meta ?? null;
  const facets = result?.facets ?? null;
  const corrected = result?.corrected ?? null;

  const chips = activeChips(filters, facets?.sellers ?? [], setFilter);
  const sort = filters.sort ?? 'best_match';
  const priceSort = sort === 'price_asc' || sort === 'price_desc';
  const goToPage = (p: number) => { setFilter({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const rail = <FilterRail key={`${filters.min_price}-${filters.max_price}`} filters={filters} facets={facets} categories={categories} parent={parent} onFilter={setFilter} />;
  const gridClass = listView ? 'flex flex-col gap-3' : 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-7';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />

      {/* ── Title band ── */}
      <div className="bg-white border-b border-stone-200/70">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 pt-5 pb-5">
          <nav className="flex items-center gap-1.5 text-[12px] text-stone-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-brand-red">Home</Link>
            <ChevronRight className="w-3 h-3 text-stone-300" />
            {parentLabel ? (
              <>
                <Link to={`/category/${parentId}`} className={leafLabel ? 'hover:text-brand-red' : 'text-stone-900 font-medium'}>{parentLabel}</Link>
                {leafLabel && (<><ChevronRight className="w-3 h-3 text-stone-300" /><span className="text-stone-900 font-medium">{leafLabel}</span></>)}
              </>
            ) : (
              <span className="text-stone-900 font-medium">{filters.q ? 'Search' : 'All products'}</span>
            )}
          </nav>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <h1 className="text-[26px] sm:text-[30px] leading-tight font-serif font-bold tracking-tight text-[#1E1B18]">
              {filters.q && <span className="text-stone-400 font-sans font-medium text-[15px] sm:text-[17px] align-middle mr-2">Results for</span>}
              {title}
            </h1>
            {meta && <p className="text-[13px] text-stone-500 tabular-nums pb-1">{meta.total.toLocaleString()} {meta.total === 1 ? 'product' : 'products'}</p>}
          </div>
          {filters.q && corrected && (
            <p className="mt-1.5 text-[13px] text-stone-600">
              Showing results for <Link to={`/search?q=${encodeURIComponent(corrected)}`} className="font-semibold text-brand-red hover:underline">{corrected}</Link>
            </p>
          )}

          {/* Subcategory chips (or every main category) */}
          {(() => {
            const chipsRow = parent ? parent.children ?? [] : !filters.q ? categories ?? [] : [];
            if (chipsRow.length === 0) return null;
            return (
              <div className="mt-4 -mx-1 px-1 flex gap-2 overflow-x-auto no-scrollbar">
                {parent && (
                  <button type="button" onClick={() => setFilter({ category_id: undefined })}
                    className={`shrink-0 h-10 px-4 rounded-full border text-[13px] transition-colors ${!filters.category_id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-400'}`}>
                    All
                  </button>
                )}
                {chipsRow.map((c) => {
                  const on = parent ? filters.category_id === c.slug : false;
                  const inner = (
                    <>
                      <span className="w-7 h-7 rounded-full overflow-hidden bg-stone-50 shrink-0"><CategoryArt category={c} variant="circle" /></span>
                      <span className="whitespace-nowrap">{c.name}</span>
                    </>
                  );
                  const cls = `shrink-0 h-10 pl-1.5 pr-4 rounded-full border flex items-center gap-2 text-[13px] transition-colors ${on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-700 hover:border-stone-400'}`;
                  return parent
                    ? <button key={c.id} type="button" onClick={() => setFilter({ category_id: c.slug })} className={cls}>{inner}</button>
                    : <Link key={c.id} to={`/category/${c.slug}`} className={cls}>{inner}</Link>;
                })}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="max-w-[1536px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 flex-1 flex gap-8">
        {/* ── Filter rail ── */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-[126px] max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar pb-6">{rail}</div>
        </aside>

        {/* ── Results ── */}
        <div className="flex-1 min-w-0">
          {filters.q && relatedShops.length > 0 && <RelatedShops shops={relatedShops} />}

          {/* Sort tabs + view toggle */}
          <div className="flex items-center gap-2 border-b border-stone-200 mb-4">
            <button type="button" onClick={() => setDrawerOpen(true)}
              className="lg:hidden flex items-center gap-1.5 h-9 px-3 mb-2 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-700">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters{chips.length > 0 && <span className="ml-0.5 w-5 h-5 rounded-full bg-brand-red text-white text-[10px] flex items-center justify-center">{chips.length}</span>}
            </button>
            <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {SORT_TABS.map((t) => {
                const on = sort === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => setFilter({ sort: t.value })}
                    className={`relative shrink-0 px-3 h-11 text-[13px] transition-colors ${on ? 'text-stone-900 font-semibold' : 'text-stone-500 hover:text-stone-800'}`}>
                    {t.label}
                    {on && <motion.span layoutId="sort-underline" className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand-red rounded-full" />}
                  </button>
                );
              })}
              <button type="button" onClick={() => setFilter({ sort: sort === 'price_asc' ? 'price_desc' : 'price_asc' })}
                className={`relative shrink-0 flex items-center gap-1 px-3 h-11 text-[13px] transition-colors ${priceSort ? 'text-stone-900 font-semibold' : 'text-stone-500 hover:text-stone-800'}`}
                title={sort === 'price_asc' ? 'Price: low to high' : sort === 'price_desc' ? 'Price: high to low' : 'Sort by price'}>
                Price
                {sort === 'price_asc' ? <ArrowUp className="w-3.5 h-3.5" /> : sort === 'price_desc' ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
                {priceSort && <motion.span layoutId="sort-underline" className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand-red rounded-full" />}
              </button>
            </div>
            <div className="hidden sm:flex items-center gap-0.5 mb-2 p-0.5 rounded-full bg-stone-200/60">
              {([false, true] as const).map((asList) => (
                <button key={String(asList)} type="button" onClick={() => setListView(asList)} aria-label={asList ? 'List view' : 'Grid view'}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${listView === asList ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                  {asList ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 h-7 pl-3 pr-1.5 rounded-full bg-white border border-stone-200 text-[12px] text-stone-700">
                  {c.label}
                  <button type="button" onClick={c.onRemove} className="w-5 h-5 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={`Remove ${c.label}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-brand-red hover:underline ml-1">Clear all</button>
            </div>
          )}

          {loading ? (
            <div className={gridClass}>
              {Array.from({ length: 10 }).map((_, i) => listView
                ? <div key={i} className="h-36 rounded-2xl bg-white border border-stone-100 animate-pulse" />
                : (
                  <div key={i} className="space-y-2">
                    <div className="aspect-square rounded-xl bg-stone-200/50 animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-stone-200/50 animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-stone-200/50 animate-pulse" />
                  </div>
                ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center text-center py-20">
              <span className="w-14 h-14 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400">
                {filters.q ? <SearchX className="w-6 h-6" /> : <Package className="w-6 h-6" />}
              </span>
              <p className="mt-4 text-base font-semibold text-stone-900">
                {filters.q ? `Nothing matches “${filters.q}”` : 'No products here yet'}
              </p>
              <p className="mt-1 text-sm text-stone-500 max-w-sm">
                {chips.length > 0 ? 'Try removing a filter or two.' : filters.q ? 'Check the spelling or try a more general word, like “phone” or “snacks”.' : 'New products show up here as soon as shops list them.'}
              </p>
              <div className="mt-5 flex gap-2">
                {chips.length > 0 && <button type="button" onClick={clearAll} className="h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-black">Clear filters</button>}
                <Link to="/search" className="h-10 px-5 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-700 hover:border-stone-500 flex items-center">Browse everything</Link>
              </div>
            </div>
          ) : (
            <div className={gridClass}>
              {products.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.2) }}>
                  <ProductCard product={p} list={listView} />
                </motion.div>
              ))}
            </div>
          )}

          {meta && !loading && (
            <>
              <Pagination meta={meta} onPage={goToPage} />
              {meta.total > 0 && (
                <p className="mt-3 text-center text-[12px] text-stone-400 tabular-nums">
                  {meta.from?.toLocaleString()}–{meta.to?.toLocaleString()} of {meta.total.toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <MobileFilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} total={meta?.total ?? null}>
        {rail}
      </MobileFilterDrawer>

      <Footer />
    </div>
  );
}
