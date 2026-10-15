import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getAdminReviewsApi, getAdminReviewSummaryApi, getAdminReviewShopsApi, getAdminReviewShopApi,
} from '../../api/client';
import type { AdminReview, AdminReviewShop, AdminReviewShopSort, AdminReviewSummary } from '../../types';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import { PageHero, StatCard, StatCardSkeleton, ChartEmptyState, HERO_BUTTON } from '../../components/admin/dashboardKit';
import {
  Search, X, ChevronLeft, ChevronRight, Star, MessageSquare, Store, AlertCircle, ArrowLeft, ExternalLink,
  Package, User as UserIcon, ShoppingBag,
} from 'lucide-react';
import { NA, whole } from '../../utils/adminReports';

const PER_PAGE = 20;

const SORT_OPTIONS: { value: AdminReviewShopSort; label: string }[] = [
  { value: 'reviews', label: 'Most reviews' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'recent', label: 'Latest review' },
  { value: 'name', label: 'Shop name (A to Z)' },
];

const RATING_OPTIONS = [
  { value: '', label: 'All ratings' },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })),
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

function Stars({ rating, size = 'w-3.5 h-3.5' }: { rating: number; size?: string }) {
  // A fractional rating fills the last star by the part of it.
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 w-full h-full text-gray-200 fill-gray-200`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${size} text-amber-400 fill-amber-400 max-w-none`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ShopLogo({ shop, size = 'w-10 h-10' }: { shop: Pick<AdminReviewShop, 'shop_name' | 'logo_url'>; size?: string }) {
  const [broken, setBroken] = useState(false);
  if (shop.logo_url && !broken) {
    return <img src={shop.logo_url} alt="" onError={() => setBroken(true)} className={`${size} rounded-xl object-cover border border-gray-200 bg-gray-50 shrink-0`} />;
  }
  return (
    <span className={`${size} rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-700 text-white flex items-center justify-center font-bold text-sm shrink-0`} aria-hidden="true">
      {shop.shop_name?.[0]?.toUpperCase() ?? 'S'}
    </span>
  );
}

function RatingBadge({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return <span className="text-xs text-gray-400">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars rating={rating} />
      <span className="text-sm font-black text-gray-900">{rating.toFixed(2)}</span>
    </span>
  );
}

/** A comment that shows a few lines and expands on request. */
function Comment({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-sm italic text-gray-400">No comment</p>;
  const long = text.length > 140;
  return (
    <div>
      <p className={`text-sm leading-relaxed text-gray-700 whitespace-pre-line ${!open && long ? 'line-clamp-2' : ''}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 text-xs font-bold text-brand-red hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function Pagination({ meta, loading, onPage, noun }: {
  meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null };
  loading: boolean;
  onPage: (page: number) => void;
  noun: string;
}) {
  if (meta.total === 0) return null;
  return (
    <div className="flex flex-col items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 sm:flex-row">
      <p className="text-[12px] text-gray-500">
        Showing <span className="font-semibold text-gray-800">{meta.from ?? 0}–{meta.to ?? 0}</span> of <span className="font-semibold text-gray-800">{whole(meta.total)}</span> {noun}{meta.total === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-2">
        <button disabled={meta.current_page <= 1 || loading} onClick={() => onPage(meta.current_page - 1)} aria-label="Previous page"
          className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <span className="text-[12px] text-gray-600">Page {meta.current_page} of {meta.last_page}</span>
        <button disabled={meta.current_page >= meta.last_page || loading} onClick={() => onPage(meta.current_page + 1)} aria-label="Next page"
          className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>
    </div>
  );
}

function Distribution({ distribution, total, rating, onPick, title }: {
  distribution: Record<'1' | '2' | '3' | '4' | '5', number> | undefined;
  total: number;
  rating?: number | null;
  onPick?: (stars: number) => void;
  title: string;
}) {
  const max = distribution ? Math.max(...Object.values(distribution), 1) : 1;
  return (
    <div className="p-3.5 bg-white border shadow-xs border-gray-200/80 rounded-xl">
      <h2 className="mb-2 text-xs font-bold tracking-wider text-gray-900 uppercase">{title}</h2>
      {!distribution ? (
        <div className="space-y-2 animate-pulse">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-3 bg-gray-100 rounded" />)}</div>
      ) : total === 0 ? (
        <p className="py-3 text-xs text-center text-gray-400">{NA}</p>
      ) : (
        <ul className="space-y-1">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = distribution[String(stars) as '1' | '2' | '3' | '4' | '5'];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const row = (
              <>
                <span className="flex items-center w-7 gap-0.5 font-bold text-gray-700">{stars}<Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" /></span>
                <span className="flex-1 h-1.5 overflow-hidden bg-gray-100 rounded-full">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="w-14 font-medium text-right text-gray-500">{count} · {pct}%</span>
              </>
            );
            return (
              <li key={stars}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(stars)} aria-pressed={rating === stars} aria-label={`${stars} star reviews: ${count}`}
                    className={`flex items-center w-full gap-2 px-1 py-0.5 text-[11px] rounded transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${rating === stars ? 'bg-rose-50' : ''}`}>
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center w-full gap-2 px-1 py-0.5 text-[11px]">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Meta = { current_page: number; last_page: number; total: number; from: number | null; to: number | null };
const EMPTY_META: Meta = { current_page: 1, last_page: 1, total: 0, from: null, to: null };
const toMeta = (m: unknown): Meta => {
  const x = m as Partial<Meta>;
  return { current_page: x.current_page ?? 1, last_page: x.last_page ?? 1, total: x.total ?? 0, from: x.from ?? null, to: x.to ?? null };
};

// ─── All shops ────────────────────────────────────────────────────────────────

function ShopsView({ onOpen }: { onOpen: (id: number) => void }) {
  const [summary, setSummary] = useState<AdminReviewSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [shops, setShops] = useState<AdminReviewShop[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AdminReviewShopSort>('reviews');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadSummary = useCallback(async () => {
    setSummaryFailed(false);
    try { setSummary(await getAdminReviewSummaryApi()); } catch { setSummaryFailed(true); }
  }, []);

  const loadShops = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getAdminReviewShopsApi({ search: search || undefined, sort, direction: sort === 'name' ? 'asc' : 'desc', page, per_page: PER_PAGE });
      setShops(res.data);
      setMeta(toMeta(res.meta));
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [search, sort, page]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadShops(); }, [loadShops]);

  return (
    <div className="pb-8 space-y-3">
      <PageHero
        icon={Star}
        eyebrow="Trust & Safety"
        title="Shop Reviews"
        subtitle="What buyers say about each shop. Reviews are honest feedback: the admin can read them, never edit or hide them."
      />

      {summaryFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span>The review totals could not be loaded.</span>
          <button onClick={loadSummary} className="px-3 py-1 text-xs font-bold text-white bg-brand-red rounded-lg hover:bg-[#8e2424]">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-4">
          <div className="grid grid-cols-3 gap-2.5 lg:col-span-3">
            {!summary ? [1, 2, 3].map((i) => <StatCardSkeleton key={i} />) : (
              <>
                <StatCard compact icon={Star} label="Average rating" value={summary.average_rating === null ? null : `${summary.average_rating.toFixed(2)} / 5`}
                  subtext={summary.average_rating === null ? 'No reviews yet' : 'Across every shop'} iconBg="bg-amber-50" iconColor="text-amber-500" />
                <StatCard compact icon={MessageSquare} label="Total reviews" value={summary.total} subtext="From buyers" iconBg="bg-violet-50" iconColor="text-violet-600" />
                <StatCard compact icon={Store} label="Shops reviewed" value={`${whole(summary.shops_reviewed)} of ${whole(summary.shops)}`} subtext="Shops with at least one review" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              </>
            )}
          </div>
          <Distribution title="Rating distribution" distribution={summary?.rating_distribution} total={summary?.total ?? 0} />
        </div>
      )}

      <div className="flex flex-col gap-2 p-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search shops"
            placeholder="Search a shop or its owner"
            className="w-full min-h-[44px] pl-10 pr-9 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <CustomSelect className="lg:w-60" value={sort} onChange={(v) => { setSort(v as AdminReviewShopSort); setPage(1); }} options={SORT_OPTIONS} />
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center bg-white border border-red-200 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-gray-700">The shops could not be loaded.</p>
          <Button variant="primary" onClick={loadShops}>Retry</Button>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={loading}>
          {/* Table from md up */}
          <div className="hidden md:block max-h-[64vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left">
                  {['Shop', 'Rating', 'Reviews', 'Latest review'].map((h) => (
                    <th key={h} scope="col" className="sticky top-0 z-10 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">{h}</th>
                  ))}
                  <th scope="col" className="sticky top-0 z-10 w-10 bg-gray-50 border-b border-gray-100"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && shops.length === 0 && [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="animate-pulse">{[0, 1, 2, 3, 4].map((c) => <td key={c} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded w-3/4" /></td>)}</tr>
                ))}
                {!loading && shops.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12"><ShopsEmpty searching={Boolean(search)} /></td></tr>
                )}
                {shops.map((s) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    onClick={() => onOpen(s.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s.id); } }}
                    className={`cursor-pointer transition-colors hover:bg-red-50/40 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red ${loading ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ShopLogo shop={s} />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{s.shop_name}</p>
                          <p className="text-xs text-gray-500 truncate">{s.owner_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RatingBadge rating={s.average_rating} count={s.review_count} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{whole(s.review_count)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{s.last_review_at ? formatDate(s.last_review_at) : NA}</td>
                    <td className="px-3 py-3 text-gray-300"><ChevronRight className="w-4 h-4" aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below md */}
          <div className="md:hidden divide-y divide-gray-100">
            {loading && shops.length === 0 && [0, 1, 2].map((i) => <div key={i} className="p-4 space-y-2 animate-pulse"><div className="h-3 bg-gray-100 rounded w-1/2" /><div className="h-3 bg-gray-100 rounded w-3/4" /></div>)}
            {!loading && shops.length === 0 && <div className="px-4 py-10"><ShopsEmpty searching={Boolean(search)} /></div>}
            {shops.map((s) => (
              <button key={s.id} type="button" onClick={() => onOpen(s.id)} className={`flex items-center w-full gap-3 p-4 text-left hover:bg-red-50/40 focus:outline-none focus-visible:bg-red-50/60 ${loading ? 'opacity-60' : ''}`}>
                <ShopLogo shop={s} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-gray-900 truncate">{s.shop_name}</span>
                  <span className="block mt-0.5"><RatingBadge rating={s.average_rating} count={s.review_count} /></span>
                  <span className="block text-xs text-gray-500">{whole(s.review_count)} review{s.review_count === 1 ? '' : 's'}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>

          <Pagination meta={meta} loading={loading} onPage={setPage} noun="shop" />
        </div>
      )}
    </div>
  );
}

function ShopsEmpty({ searching }: { searching: boolean }) {
  return searching
    ? <ChartEmptyState message="No shop matches that search" hint="Check the spelling, or search by the owner's name." />
    : <ChartEmptyState message="No shops yet" hint="Shops appear here once a seller application is approved." />;
}

// ─── One shop's reviews ───────────────────────────────────────────────────────

function ShopReviewsView({ shopId, onBack }: { shopId: number; onBack: () => void }) {
  const [shop, setShop] = useState<AdminReviewShop | null>(null);
  const [shopFailed, setShopFailed] = useState(false);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadShop = useCallback(async () => {
    setShopFailed(false);
    try { setShop(await getAdminReviewShopApi(shopId)); } catch { setShopFailed(true); }
  }, [shopId]);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getAdminReviewsApi({ shop_id: shopId, rating: rating ?? undefined, search: search || undefined, page, per_page: PER_PAGE });
      setReviews(res.data);
      setMeta(toMeta(res.meta));
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [shopId, rating, search, page]);

  useEffect(() => { loadShop(); }, [loadShop]);
  useEffect(() => { loadReviews(); }, [loadReviews]);

  const filtersActive = Boolean(rating || search);
  const clearFilters = () => { setRating(null); setSearchInput(''); setSearch(''); setPage(1); };

  if (shopFailed) {
    return (
      <div className="pb-8 space-y-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline"><ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> All shops</button>
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center bg-white border border-red-200 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-gray-700">This shop could not be found.</p>
          <Button variant="primary" onClick={loadShop}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 space-y-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> All shops
      </button>

      <PageHero
        icon={Store}
        eyebrow="Shop reviews"
        title={shop?.shop_name ?? 'Loading shop…'}
        subtitle={shop ? <>Owned by {shop.owner_name}</> : undefined}
      >
        {shop && (
          <Link to={`/shop/${shop.shop_slug}`} target="_blank" rel="noopener noreferrer" className={HERO_BUTTON}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Go to shop profile
          </Link>
        )}
      </PageHero>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-4">
        <div className="grid grid-cols-2 gap-2.5 lg:col-span-3">
          {!shop ? [1, 2].map((i) => <StatCardSkeleton key={i} />) : (
            <>
              <div className="flex items-center gap-3 p-3 bg-white border shadow-xs border-gray-200/80 rounded-xl">
                <ShopLogo shop={shop} size="w-14 h-14" />
                <div className="min-w-0">
                  <p className="font-black text-gray-900 truncate">{shop.shop_name}</p>
                  <p className="text-xs text-gray-500 truncate">{shop.owner_name}</p>
                  <div className="mt-1"><RatingBadge rating={shop.average_rating} count={shop.review_count} /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard compact icon={Star} label="Average rating" value={shop.average_rating === null ? null : `${shop.average_rating.toFixed(2)} / 5`} subtext="This shop" iconBg="bg-amber-50" iconColor="text-amber-500" />
                <StatCard compact icon={MessageSquare} label="Reviews" value={shop.review_count} subtext={shop.last_review_at ? `Latest ${formatDate(shop.last_review_at)}` : 'None yet'} iconBg="bg-violet-50" iconColor="text-violet-600" />
              </div>
            </>
          )}
        </div>
        <Distribution title="Rating distribution" distribution={shop?.rating_distribution} total={shop?.review_count ?? 0} rating={rating} onPick={(s) => { setRating((c) => (c === s ? null : s)); setPage(1); }} />
      </div>

      <div className="flex flex-col gap-2 p-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search this shop's reviews"
            placeholder="Search comments, products or buyers"
            className="w-full min-h-[44px] pl-10 pr-9 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <CustomSelect className="lg:w-48" value={rating === null ? '' : String(rating)} onChange={(v) => { setRating(v ? Number(v) : null); setPage(1); }} options={RATING_OPTIONS} />
        {filtersActive && <button type="button" onClick={clearFilters} className="self-start px-2 text-xs font-bold text-brand-red hover:underline lg:self-auto">Clear filters</button>}
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center bg-white border border-red-200 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-gray-700">The reviews could not be loaded.</p>
          <Button variant="primary" onClick={loadReviews}>Retry</Button>
        </div>
      ) : (
        <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={loading}>
          {loading && reviews.length === 0 ? (
            <div className="divide-y divide-gray-100">
              {[0, 1, 2].map((i) => <div key={i} className="p-4 space-y-2 animate-pulse"><div className="h-3 bg-gray-100 rounded w-1/4" /><div className="h-3 bg-gray-100 rounded w-3/4" /></div>)}
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-12">
              {filtersActive ? (
                <>
                  <ChartEmptyState message="No reviews match these filters" hint="Try another rating or clear the filters." />
                  <button type="button" onClick={clearFilters} className="text-xs font-bold text-brand-red hover:underline">Clear filters</button>
                </>
              ) : (
                <ChartEmptyState message="No reviews for this shop yet" hint="Reviews appear here after buyers rate their completed orders." />
              )}
            </div>
          ) : (
            <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
              {reviews.map((r) => {
                const buyer = r.buyer ? `${r.buyer.first_name} ${r.buyer.last_name}` : NA;
                return (
                  <li key={r.id} className="p-4 sm:p-5 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Stars rating={r.rating} />
                        <span className="text-sm font-black text-gray-900">{r.rating}.0</span>
                        <span className="sr-only">out of 5 stars</span>
                      </span>
                      {r.verified_purchase && <span className="text-[11px] font-semibold text-emerald-700">Verified purchase</span>}
                      <span className="ml-auto text-xs text-gray-400">{formatDate(r.created_at)}</span>
                    </div>
                    <Comment text={r.comment} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" aria-hidden="true" /> {r.product?.name ?? NA}</span>
                      <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3" aria-hidden="true" /> {buyer}</span>
                      {r.order ? (
                        <Link to={`/admin/orders?search=${encodeURIComponent(r.order.order_number)}`} className="inline-flex items-center gap-1 font-mono font-semibold text-brand-red hover:underline">
                          <ShoppingBag className="w-3 h-3" aria-hidden="true" /> {r.order.order_number}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1"><ShoppingBag className="w-3 h-3" aria-hidden="true" /> {NA}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination meta={meta} loading={loading} onPage={setPage} noun="review" />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** All shops first; /admin/reviews?shop=<id> opens one shop's reviews. */
export default function AdminReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const shopParam = Number(searchParams.get('shop'));
  const shopId = Number.isInteger(shopParam) && shopParam > 0 ? shopParam : null;

  if (shopId !== null) {
    return <ShopReviewsView key={shopId} shopId={shopId} onBack={() => setSearchParams({})} />;
  }
  return <ShopsView onOpen={(id) => setSearchParams({ shop: String(id) })} />;
}

