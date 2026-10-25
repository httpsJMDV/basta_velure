import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getAdminReviewsApi, getAdminReviewSummaryApi, getAdminReviewShopsApi, getAdminReviewShopApi, getAdminFeedbackApi, updateAdminFeedbackApi,
} from '../../api/client';
import type { AdminReview, AdminReviewShop, AdminReviewShopSort, AdminReviewSummary, AdminFeedback } from '../../types';
import CustomSelect from '../../components/ui/CustomSelect';
import { PageHero, StatCard, StatCardSkeleton, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { getAdminShopReviewsApi } from '../../api/shopReviews';
import type { ShopReviewPage } from '../../api/shopReviews';
import { ShopReviewItem, ShopReviewSummaryBlock } from '../../components/reviews/ShopReviewKit';
import {
  type ListMeta, FilterPanel, SearchField, StatusTabs, ListCard, ListPager, ListEmpty, ListError, Pill, Avatar, RowAction,
  CardGrid, TileShell, SkeletonTiles, SkeletonCards, RailCard, useViewMode, ViewToggle, TH, TD, ROW, rowKeys, relativeTime,
} from '../../components/admin/listKit';
import {
  ChevronRight, Star, MessageSquare, Store, ArrowLeft, ExternalLink, Package, ShoppingBag, MessageSquareText, Inbox, CheckCheck,
  Link2, Undo2,
} from 'lucide-react';
import { NA, whole } from '../../utils/adminReports';

const PER_PAGE_OPTIONS = [12, 24, 48];

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

function formatDate(iso: string | null | undefined) {
  if (!iso) return NA;
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
            <Star className="absolute inset-0 w-full h-full text-gray-200 fill-gray-200" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${size} text-amber-400 fill-amber-400 max-w-none`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function RatingLine({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return <span className="text-[12px] text-gray-400">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars rating={rating} />
      <span className="text-[13px] font-bold text-gray-900">{rating.toFixed(2)}</span>
      <span className="text-[12px] text-gray-400">({whole(count)})</span>
    </span>
  );
}

/** A long text that shows a few lines and expands on request. */
function Expandable({ text, empty = 'No comment' }: { text: string | null; empty?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-[13px] italic text-gray-400">{empty}</p>;
  const long = text.length > 160;
  return (
    <div>
      <p className={`text-[13px] leading-relaxed text-gray-700 whitespace-pre-line ${!open && long ? 'line-clamp-3' : ''}`}>{text}</p>
      {long && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open} className="mt-1 text-[12px] font-bold text-brand-red hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/** Shop logo with the owner's photo pinned to its corner. */
function ShopIdentity({ shop, size = 'lg' }: { shop: Pick<AdminReviewShop, 'shop_name' | 'logo_url' | 'owner_name' | 'owner_avatar_url'>; size?: 'md' | 'lg' | 'xl' }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={shop.shop_name} src={shop.logo_url} icon={shop.logo_url ? undefined : Store} size={size} />
      <span className="absolute -bottom-1 -right-1 rounded-lg ring-2 ring-white overflow-hidden" title={shop.owner_name}>
        <Avatar name={shop.owner_name || shop.shop_name} src={shop.owner_avatar_url} size="sm" />
      </span>
    </span>
  );
}

function Distribution({ distribution, total, rating, onPick }: {
  distribution: Record<'1' | '2' | '3' | '4' | '5', number> | undefined;
  total: number;
  rating?: number | null;
  onPick?: (stars: number) => void;
}) {
  return (
    <RailCard title="Rating distribution">
      {!distribution ? (
        <div className="space-y-2 animate-pulse">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-3 bg-gray-100 rounded" />)}</div>
      ) : total === 0 ? (
        <p className="py-3 text-xs text-center text-gray-400">No reviews yet</p>
      ) : (
        <ul className="space-y-1">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = distribution[String(stars) as '1' | '2' | '3' | '4' | '5'];
            const pct = Math.round((count / total) * 100);
            const row = (
              <>
                <span className="flex items-center w-7 gap-0.5 font-bold text-gray-700">{stars}<Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" /></span>
                <span className="flex-1 h-1.5 overflow-hidden bg-gray-100 rounded-full"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></span>
                <span className="w-12 font-medium text-right text-gray-500 tabular-nums">{pct}%</span>
              </>
            );
            return (
              <li key={stars}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(stars)} aria-pressed={rating === stars}
                    className={`flex items-center w-full gap-2 px-1.5 py-1 text-[11px] rounded-lg transition-colors hover:bg-gray-50 ${rating === stars ? 'bg-rose-50 ring-1 ring-brand-red/20' : ''}`}>
                    {row}
                  </button>
                ) : <div className="flex items-center w-full gap-2 px-1.5 py-1 text-[11px]">{row}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}

type Meta = ListMeta;
const EMPTY_META: Meta = { current_page: 1, last_page: 1, per_page: 12, total: 0, from: null, to: null };
const toMeta = (m: unknown): Meta => {
  const x = m as Partial<Meta>;
  return { current_page: x.current_page ?? 1, last_page: x.last_page ?? 1, per_page: x.per_page ?? 12, total: x.total ?? 0, from: x.from ?? null, to: x.to ?? null };
};

type Tab = 'reviews' | 'feedback';

/** The two halves of the page, under the hero. */
function PageTabs({ tab, onTab, newFeedback }: { tab: Tab; onTab: (t: Tab) => void; newFeedback: number | null }) {
  return (
    <FilterPanel>
      <StatusTabs<Tab>
        label="Reviews or feedback"
        value={tab}
        onChange={onTab}
        options={[
          { value: 'reviews', label: 'Shop reviews' },
          { value: 'feedback', label: 'Site feedback', count: newFeedback ?? undefined },
        ]}
      />
    </FilterPanel>
  );
}

// ─── All shops ────────────────────────────────────────────────────────────────

function ShopsView({ onOpen, tabs }: { onOpen: (id: number) => void; tabs: React.ReactNode }) {
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
  const [perPage, setPerPage] = useState(12);
  const [view, setView] = useViewMode('reviews_shops');

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadSummary = useCallback(() => {
    setSummaryFailed(false);
    getAdminReviewSummaryApi().then(setSummary).catch(() => setSummaryFailed(true));
  }, []);

  const loadShops = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getAdminReviewShopsApi({ search: search || undefined, sort, direction: sort === 'name' ? 'asc' : 'desc', page, per_page: perPage })
      .then((res) => { setShops(res.data); setMeta(toMeta(res.meta)); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [search, sort, page, perPage]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadShops(); }, [loadShops]);

  const empty = <ListEmpty icon={Store} title={search ? 'No shop matches that search' : 'No shops yet'} hint={search ? "Check the spelling, or search by the owner's name." : 'Shops appear here once a seller application is approved.'} filtered={Boolean(search)} onClear={() => setSearchInput('')} />;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Star} eyebrow="Trust & Safety" title="Reviews & Feedback"
        subtitle="What buyers say about each shop, and what users say about Loved-IT. Reviews are honest feedback: read them, never edit or hide them." />
      {tabs}

      <div className="grid items-start gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4">
          {summaryFailed ? (
            <ListError message="The review totals could not be loaded." onRetry={loadSummary} />
          ) : (
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              {!summary ? [1, 2, 3].map((i) => <StatCardSkeleton key={i} />) : (
                <>
                  <StatCard compact icon={Star} label="Average rating" value={summary.average_rating === null ? null : `${summary.average_rating.toFixed(2)} / 5`}
                    subtext={summary.average_rating === null ? 'No reviews yet' : 'Across every shop'} iconBg="bg-amber-50" iconColor="text-amber-500" />
                  <StatCard compact icon={MessageSquare} label="Total reviews" value={summary.total} subtext="From buyers" iconBg="bg-violet-50" iconColor="text-violet-600" />
                  <StatCard compact icon={Store} label="Shops reviewed" value={`${whole(summary.shops_reviewed)} of ${whole(summary.shops)}`} subtext="With at least one review" iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                </>
              )}
            </div>
          )}
          <Distribution distribution={summary?.rating_distribution} total={summary?.total ?? 0} />
        </aside>

        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search shops" placeholder="Search a shop, its owner or email…" />
              <div className="flex items-center gap-2">
                <CustomSelect className="flex-1 sm:w-48" value={sort} onChange={(v) => { setSort(v as AdminReviewShopSort); setPage(1); }} options={SORT_OPTIONS} />
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>
          </FilterPanel>

          {failed ? <ListError message="The shops could not be loaded." onRetry={loadShops} /> : (
            <ListCard title="Shops" count={meta.total} busy={loading}>
              {view === 'grid' ? (
                shops.length === 0 && !loading ? empty : (
                  <CardGrid>
                    {loading && shops.length === 0 && <SkeletonTiles />}
                    {shops.map((s) => (
                      <TileShell key={s.id} onOpen={() => onOpen(s.id)} dimmed={loading}>
                        <div className="flex items-start gap-3 p-4">
                          <ShopIdentity shop={s} size="xl" />
                          <div className="flex-1 min-w-0 pl-1">
                            <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{s.shop_name}</p>
                            <p className="text-[12px] text-gray-500 truncate mt-0.5">{s.owner_name}</p>
                            <div className="mt-2"><RatingLine rating={s.average_rating} count={s.review_count} /></div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                          <span className="text-[11px] text-gray-500">{s.last_review_at ? `Latest ${relativeTime(s.last_review_at)}` : 'No reviews yet'}</span>
                          <RowAction onClick={() => onOpen(s.id)} label={`Open reviews of ${s.shop_name}`}>Reviews <ChevronRight className="w-3 h-3" aria-hidden="true" /></RowAction>
                        </div>
                      </TileShell>
                    ))}
                  </CardGrid>
                )
              ) : (
                <>
                  <div className="hidden md:block max-h-[68vh] overflow-auto">
                    <table className="w-full text-[13px]">
                      <thead><tr>
                        <th scope="col" className={TH}>Shop and owner</th>
                        <th scope="col" className={TH}>Rating</th>
                        <th scope="col" className={TH}>Reviews</th>
                        <th scope="col" className={TH}>Latest review</th>
                        <th scope="col" className={`${TH} text-right`}><span className="sr-only">Open</span></th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {!loading && shops.length === 0 && <tr><td colSpan={5}>{empty}</td></tr>}
                        {shops.map((s) => (
                          <tr key={s.id} {...rowKeys(() => onOpen(s.id))} className={`${ROW} ${loading ? 'opacity-60' : ''}`}>
                            <td className={TD}>
                              <div className="flex items-center gap-3 min-w-0">
                                <ShopIdentity shop={s} size="md" />
                                <div className="min-w-0 pl-1">
                                  <p className="font-semibold truncate text-brand-black">{s.shop_name}</p>
                                  <p className="text-[11px] text-gray-400 truncate">{s.owner_name}</p>
                                </div>
                              </div>
                            </td>
                            <td className={TD}><RatingLine rating={s.average_rating} count={s.review_count} /></td>
                            <td className={`${TD} font-semibold text-gray-800`}>{whole(s.review_count)}</td>
                            <td className={`${TD} text-gray-500 whitespace-nowrap`}>{formatDate(s.last_review_at)}</td>
                            <td className={`${TD} text-right`}><RowAction onClick={() => onOpen(s.id)} label={`Open reviews of ${s.shop_name}`}>Open</RowAction></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-gray-100 md:hidden">
                    {loading && shops.length === 0 && <SkeletonCards />}
                    {!loading && shops.length === 0 && empty}
                    {shops.map((s) => (
                      <div key={s.id} {...rowKeys(() => onOpen(s.id))} className={`flex items-center gap-3 p-3 ${ROW}`}>
                        <ShopIdentity shop={s} size="md" />
                        <div className="flex-1 min-w-0 pl-1">
                          <p className="text-[13px] font-semibold truncate text-brand-black">{s.shop_name}</p>
                          <RatingLine rating={s.average_rating} count={s.review_count} />
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    ))}
                  </div>
                </>
              )}
              <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} noun={['shop', 'shops']} />
            </ListCard>
          )}
        </section>
      </div>
    </div>
  );
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
  const [perPage, setPerPage] = useState(12);
  // Product reviews of the shop, or reviews of the shop itself (read-only either way).
  const [kind, setKind] = useState<'products' | 'shop'>('products');

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadShop = useCallback(() => {
    setShopFailed(false);
    getAdminReviewShopApi(shopId).then(setShop).catch(() => setShopFailed(true));
  }, [shopId]);

  const loadReviews = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getAdminReviewsApi({ shop_id: shopId, rating: rating ?? undefined, search: search || undefined, page, per_page: perPage })
      .then((res) => { setReviews(res.data); setMeta(toMeta(res.meta)); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [shopId, rating, search, page, perPage]);

  useEffect(() => { loadShop(); }, [loadShop]);
  useEffect(() => { loadReviews(); }, [loadReviews]);

  const filtersActive = Boolean(rating || search);
  const clearFilters = () => { setRating(null); setSearchInput(''); setSearch(''); setPage(1); };
  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> All shops
    </button>
  );

  if (shopFailed) {
    return <div className="pb-8 space-y-3">{back}<ListError message="This shop could not be found." onRetry={loadShop} /></div>;
  }

  return (
    <div className="pb-8 space-y-3">
      {back}
      <PageHero icon={Store} eyebrow="Shop reviews" title={shop?.shop_name ?? 'Loading shop…'} subtitle={shop ? <>Owned by {shop.owner_name}</> : undefined}>
        {shop && (
          <Link to={`/shop/${shop.shop_slug}`} target="_blank" rel="noopener noreferrer" className={HERO_BUTTON}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Go to shop profile
          </Link>
        )}
      </PageHero>

      <div className="grid items-start gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
            {!shop ? <div className="h-16 bg-gray-100 rounded-xl animate-pulse" /> : (
              <div className="flex items-center gap-3">
                <ShopIdentity shop={shop} size="xl" />
                <div className="min-w-0 pl-1">
                  <p className="font-bold text-gray-900 truncate">{shop.shop_name}</p>
                  <p className="text-[12px] text-gray-500 truncate">{shop.owner_name}</p>
                  <div className="mt-1"><RatingLine rating={shop.average_rating} count={shop.review_count} /></div>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!shop ? [1, 2].map((i) => <StatCardSkeleton key={i} />) : (
              <>
                <StatCard compact icon={Star} label="Average" value={shop.average_rating === null ? null : `${shop.average_rating.toFixed(2)}`} subtext="Out of 5" iconBg="bg-amber-50" iconColor="text-amber-500" />
                <StatCard compact icon={MessageSquare} label="Reviews" value={shop.review_count} subtext={shop.last_review_at ? `Latest ${relativeTime(shop.last_review_at)}` : 'None yet'} iconBg="bg-violet-50" iconColor="text-violet-600" />
              </>
            )}
          </div>
          <Distribution distribution={shop?.rating_distribution} total={shop?.review_count ?? 0} rating={rating} onPick={(s) => { setRating((c) => (c === s ? null : s)); setPage(1); }} />
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="inline-flex p-1 rounded-xl bg-white border border-gray-200/80 shadow-xs" role="tablist" aria-label="Review kinds">
            {([['products', 'Product reviews'], ['shop', 'Shop reviews']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                className={`px-3.5 h-9 rounded-lg text-[12.5px] font-bold transition-colors ${kind === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>

          {kind === 'shop' ? <AdminOwnShopReviews shopId={shopId} /> : (<>
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search this shop's reviews" placeholder="Search comments, products or buyers…" />
              <CustomSelect className="sm:w-44" value={rating === null ? '' : String(rating)} onChange={(v) => { setRating(v ? Number(v) : null); setPage(1); }} options={RATING_OPTIONS} />
            </div>
          </FilterPanel>

          {failed ? <ListError message="The reviews could not be loaded." onRetry={loadReviews} /> : (
            <ListCard title="Reviews" count={meta.total} busy={loading}>
              {loading && reviews.length === 0 ? <SkeletonCards /> : reviews.length === 0 ? (
                <ListEmpty icon={MessageSquare} title={filtersActive ? 'No reviews match these filters' : 'No reviews for this shop yet'}
                  hint={filtersActive ? 'Try another rating or clear the filters.' : 'Reviews appear after buyers rate their completed orders.'} filtered={filtersActive} onClear={clearFilters} />
              ) : (
                <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
                  {reviews.map((r) => {
                    const buyer = r.buyer ? `${r.buyer.first_name} ${r.buyer.last_name}` : 'Deleted account';
                    return (
                      <li key={r.id} className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <Avatar name={buyer} src={r.buyer?.avatar_url} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[13px] font-semibold text-gray-900">{buyer}</span>
                              {r.verified_purchase && <Pill tone="emerald">Verified purchase</Pill>}
                              <span className="ml-auto text-[11px] text-gray-400" title={formatDate(r.created_at)}>{relativeTime(r.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Stars rating={r.rating} />
                              <span className="text-[12px] font-bold text-gray-800">{r.rating}.0</span>
                              <span className="sr-only">out of 5 stars</span>
                            </div>
                            <div className="mt-2"><Expandable text={r.comment} /></div>
                            {(r.images?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {r.images!.map((src) => (
                                  <a key={src} href={src} target="_blank" rel="noreferrer" aria-label="Open the review photo">
                                    <img src={src} alt="" loading="lazy" className="object-cover w-14 h-14 border border-gray-200 rounded-lg" />
                                  </a>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {r.product && (
                                <Link to={`/products/${r.product.id}`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 py-1 pl-1 pr-2.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] text-gray-700 hover:border-brand-red/40 max-w-full">
                                  {r.product.thumbnail_url ? <img src={r.product.thumbnail_url} alt="" className="w-7 h-7 rounded-md object-cover" /> : <Package className="w-4 h-4 text-gray-400 m-1.5" />}
                                  <span className="truncate">{r.product.name}</span>
                                </Link>
                              )}
                              {r.order && (
                                <Link to={`/admin/orders?search=${encodeURIComponent(r.order.order_number)}`}
                                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 font-mono text-[12px] font-semibold text-brand-red hover:border-brand-red/40">
                                  <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" /> {r.order.order_number}
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} noun={['review', 'reviews']} />
            </ListCard>
          )}
          </>)}
        </section>
      </div>
    </div>
  );
}

/** Reviews of the shop itself (not its products): read-only, with who wrote each one. */
function AdminOwnShopReviews({ shopId }: { shopId: number }) {
  const [data, setData] = useState<ShopReviewPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setFailed(false);
    getAdminShopReviewsApi(shopId, { rating: rating ?? undefined, page })
      .then(setData)
      .catch(() => setFailed(true));
  }, [shopId, rating, page]);
  useEffect(() => { load(); }, [load]);

  if (failed) return <ListError message="The shop reviews could not be loaded." onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="p-5 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        {data ? <ShopReviewSummaryBlock summary={data.summary} /> : <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />}
      </div>
      <FilterPanel>
        <CustomSelect className="sm:w-44" value={rating === null ? '' : String(rating)} onChange={(v) => { setRating(v ? Number(v) : null); setPage(1); }} options={RATING_OPTIONS} />
      </FilterPanel>
      <ListCard title="Shop reviews" count={data?.meta.total ?? 0} busy={!data}>
        {!data ? <SkeletonCards /> : data.data.length === 0 ? (
          <ListEmpty icon={MessageSquare} title={rating ? 'No shop reviews with this rating' : 'No shop reviews yet'}
            hint={rating ? 'Try another rating.' : 'Buyers can review a shop once one of their orders from it is completed.'} filtered={!!rating} onClear={() => { setRating(null); setPage(1); }} />
        ) : (
          <div className="px-4 sm:px-5 py-4 divide-y divide-gray-100">
            {data.data.map((r) => <ShopReviewItem key={r.id} review={r} />)}
          </div>
        )}
        {data && data.meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-[12.5px] text-gray-600">
            <span className="tabular-nums">Page {data.meta.current_page} of {data.meta.last_page}</span>
            <div className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 h-8 rounded-lg hover:bg-gray-100 disabled:opacity-30">Previous</button>
              <button type="button" disabled={page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)} className="px-3 h-8 rounded-lg hover:bg-gray-100 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </ListCard>
    </div>
  );
}

// ─── Site feedback ────────────────────────────────────────────────────────────

type FeedbackStatus = 'new' | 'read' | 'all';

function FeedbackView({ tabs, onCounts }: { tabs: React.ReactNode; onCounts: (n: number) => void }) {
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [counts, setCounts] = useState<{ new: number; read: number; all: number } | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getAdminFeedbackApi({ status, search: search || undefined, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(toMeta(res.meta)); setCounts(res.meta.counts); onCounts(res.meta.counts.new); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [status, search, page, perPage, onCounts]);

  useEffect(() => { load(); }, [load]);

  async function mark(item: AdminFeedback, next: 'new' | 'read') {
    setBusyId(item.id);
    try {
      await updateAdminFeedbackApi(item.id, next);
      load();
    } finally {
      setBusyId(null);
    }
  }

  const pick = (s: FeedbackStatus) => { setStatus(s); setPage(1); };
  const pathOf = (url: string | null) => {
    if (!url) return null;
    try { return new URL(url).pathname + new URL(url).search; } catch { return url; }
  };

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={MessageSquareText} eyebrow="Trust & Safety" title="Reviews & Feedback"
        subtitle="Notes users send from the Feedback button on the storefront: bugs, ideas and complaints about Loved-IT itself." />
      {tabs}

      <div className="grid items-start gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {!counts ? [1, 2, 3].map((i) => <StatCardSkeleton key={i} />) : (
              <>
                <StatCard compact icon={Inbox} label="New" value={counts.new} subtext="Waiting to be read" iconBg="bg-rose-50" iconColor="text-brand-red" onClick={() => pick('new')} active={status === 'new'} />
                <StatCard compact icon={CheckCheck} label="Read" value={counts.read} subtext="Handled" iconBg="bg-emerald-50" iconColor="text-emerald-600" onClick={() => pick('read')} active={status === 'read'} />
                <StatCard compact icon={MessageSquareText} label="All feedback" value={counts.all} subtext="Since launch" iconBg="bg-violet-50" iconColor="text-violet-600" onClick={() => pick('all')} active={status === 'all'} />
              </>
            )}
          </div>
          <RailCard title="Working through feedback">
            <ul className="space-y-1.5 text-[12px] text-gray-600 leading-snug">
              <li>Open the page it was sent from to see what the user saw.</li>
              <li>Mark it read once it is handled or passed to the team.</li>
              <li>Need to reply? Message the user from Messages &amp; Inquiries.</li>
            </ul>
          </RailCard>
        </aside>

        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <StatusTabs<FeedbackStatus>
                label="Feedback status"
                value={status}
                onChange={pick}
                options={[
                  { value: 'new', label: 'New', count: counts ? counts.new : null },
                  { value: 'read', label: 'Read', count: counts ? counts.read : null },
                  { value: 'all', label: 'All', count: counts ? counts.all : null },
                ]}
              />
              <div className="sm:w-72"><SearchField value={searchInput} onChange={setSearchInput} label="Search feedback" placeholder="Search words, names or emails…" /></div>
            </div>
          </FilterPanel>

          {failed ? <ListError message="The feedback could not be loaded." onRetry={load} /> : (
            <ListCard title={status === 'new' ? 'New feedback' : status === 'read' ? 'Read feedback' : 'All feedback'} count={meta.total} busy={loading}>
              {loading && items.length === 0 ? <SkeletonCards /> : items.length === 0 ? (
                <ListEmpty icon={Inbox} title={search ? 'No feedback matches that search' : status === 'new' ? 'You are all caught up' : 'No feedback yet'}
                  hint={search ? 'Try another word.' : status === 'new' ? 'New notes from users will show up here.' : 'Users send feedback from the storefront toolbar.'}
                  filtered={Boolean(search)} onClear={() => setSearchInput('')} />
              ) : (
                <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
                  {items.map((f) => {
                    const name = f.user?.name || 'Deleted account';
                    const path = pathOf(f.page_url);
                    return (
                      <li key={f.id} className={`p-4 sm:p-5 ${f.status === 'new' ? 'bg-rose-50/30' : ''}`}>
                        <div className="flex items-start gap-3">
                          <Avatar name={name} src={f.user?.avatar_url} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[13px] font-semibold text-gray-900">{name}</span>
                              {f.user?.email && <span className="text-[12px] text-gray-400 truncate">{f.user.email}</span>}
                              <span className="ml-auto text-[11px] text-gray-400" title={formatDate(f.created_at)}>{relativeTime(f.created_at)}</span>
                            </div>
                            <div className="mt-2"><Expandable text={f.message} empty="(empty)" /></div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Pill tone={f.status === 'new' ? 'red' : 'gray'}>{f.status === 'new' ? 'New' : 'Read'}</Pill>
                                {path && (
                                  <a href={f.page_url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-brand-red truncate max-w-[22rem]" title={f.page_url!}>
                                    <Link2 className="w-3.5 h-3.5 shrink-0" />{path}
                                  </a>
                                )}
                              </div>
                              {f.status === 'new'
                                ? <RowAction tone="success" loading={busyId === f.id} onClick={() => mark(f, 'read')} label="Mark as read"><CheckCheck className="w-3.5 h-3.5" /> Mark read</RowAction>
                                : <RowAction loading={busyId === f.id} onClick={() => mark(f, 'new')} label="Mark as new"><Undo2 className="w-3.5 h-3.5" /> Mark new</RowAction>}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} noun={['note', 'notes']} />
            </ListCard>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** Shop reviews (all shops, then ?shop=<id> for one) and site feedback (?tab=feedback). */
export default function AdminReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [newFeedback, setNewFeedback] = useState<number | null>(null);
  const tab: Tab = searchParams.get('tab') === 'feedback' ? 'feedback' : 'reviews';
  const shopParam = Number(searchParams.get('shop'));
  const shopId = Number.isInteger(shopParam) && shopParam > 0 ? shopParam : null;

  // The New count on the Feedback tab, also when the reviews half is open.
  useEffect(() => {
    let alive = true;
    getAdminFeedbackApi({ status: 'new', per_page: 1 }).then((r) => { if (alive) setNewFeedback(r.meta.counts.new); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const setTab = (t: Tab) => setSearchParams(t === 'feedback' ? { tab: 'feedback' } : {});
  const tabs = <PageTabs tab={tab} onTab={setTab} newFeedback={newFeedback} />;

  if (tab === 'feedback') return <FeedbackView tabs={tabs} onCounts={setNewFeedback} />;
  if (shopId !== null) return <ShopReviewsView key={shopId} shopId={shopId} onBack={() => setSearchParams({})} />;
  return <ShopsView tabs={tabs} onOpen={(id) => setSearchParams({ shop: String(id) })} />;
}
