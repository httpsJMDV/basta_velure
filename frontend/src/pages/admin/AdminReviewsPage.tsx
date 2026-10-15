import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminReviewsApi, getAdminReviewSummaryApi, moderateReviewApi } from '../../api/client';
import type { AdminReview, AdminReviewSummary, ModerationStatus } from '../../types';
import Button from '../../components/ui/Button';
import { PageHero, StatCard, StatCardSkeleton, ChartEmptyState } from '../../components/admin/dashboardKit';
import {
  Search, X, ChevronLeft, ChevronRight, Star, MessageSquare, Hourglass, Flag, CheckCircle2, EyeOff, AlertCircle,
  Store, Package, User as UserIcon, ShoppingBag,
} from 'lucide-react';
import { NA, whole } from '../../utils/adminReports';

const PER_PAGE = 20;

/** The four chips. "Flagged" is not a moderation status: it filters flagged reviews in any status. */
type Chip = '' | 'pending_review' | 'visible' | 'hidden' | 'flagged';

const STATUS_META: Record<ModerationStatus, { label: string; cls: string; icon: React.ElementType }> = {
  pending_review: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: Hourglass },
  visible:        { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: CheckCircle2 },
  hidden:         { label: 'Hidden', cls: 'bg-gray-100 text-gray-600 border border-gray-200', icon: EyeOff },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
      ))}
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

function RatingDistribution({ summary, rating, onPick }: { summary: AdminReviewSummary | null; rating: number | null; onPick: (stars: number) => void }) {
  const max = summary ? Math.max(...Object.values(summary.rating_distribution), 1) : 1;
  return (
    <div className="p-4 bg-white border shadow-xs border-gray-200/80 rounded-xl">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-bold tracking-wider text-gray-900 uppercase">Rating distribution</h2>
        <span className="text-[10px] text-gray-400">All reviews</span>
      </div>
      {!summary ? (
        <div className="space-y-2 animate-pulse">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-3 bg-gray-100 rounded" />)}</div>
      ) : summary.total === 0 ? (
        <p className="py-4 text-xs text-center text-gray-400">{NA}</p>
      ) : (
        <ul className="space-y-1.5">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = summary.rating_distribution[String(stars) as '1' | '2' | '3' | '4' | '5'];
            const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
            return (
              <li key={stars}>
                <button
                  type="button"
                  onClick={() => onPick(stars)}
                  aria-pressed={rating === stars}
                  aria-label={`${stars} star reviews: ${count}`}
                  className={`flex items-center w-full gap-2 px-1 py-0.5 text-[11px] rounded transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${rating === stars ? 'bg-rose-50' : ''}`}
                >
                  <span className="flex items-center w-7 gap-0.5 font-bold text-gray-700">{stars}<Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" /></span>
                  <span className="flex-1 h-1.5 overflow-hidden bg-gray-100 rounded-full">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <span className="w-14 font-medium text-right text-gray-500">{count} · {pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [meta, setMeta]       = useState({ current_page: 1, last_page: 1, total: 0, from: null as number | null, to: null as number | null });
  const [summary, setSummary] = useState<AdminReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]   = useState(false);
  const [summaryFailed, setSummaryFailed] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]   = useState('');
  const [chip, setChip]       = useState<Chip>('');
  const [rating, setRating]   = useState<number | null>(null);
  const [page, setPage]       = useState(1);
  const [actioning, setActioning] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getAdminReviewsApi({
        moderation_status: chip && chip !== 'flagged' ? chip : undefined,
        flagged: chip === 'flagged' ? true : undefined,
        rating: rating ?? undefined,
        search: search || undefined,
        page,
        per_page: PER_PAGE,
      });
      setReviews(res.data);
      setMeta({ current_page: res.meta.current_page, last_page: res.meta.last_page, total: res.meta.total, from: (res.meta as { from?: number | null }).from ?? null, to: (res.meta as { to?: number | null }).to ?? null });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [chip, rating, search, page]);

  const loadSummary = useCallback(async () => {
    setSummaryFailed(false);
    try {
      setSummary(await getAdminReviewSummaryApi());
    } catch {
      setSummaryFailed(true);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  function chooseChip(next: Chip) {
    setChip((current) => (current === next ? '' : next));
    setPage(1);
  }

  function chooseRating(stars: number) {
    setRating((current) => (current === stars ? null : stars));
    setPage(1);
  }

  async function handleModerate(id: number, status: ModerationStatus) {
    setActioning(id);
    setActionError('');
    try {
      await moderateReviewApi(id, status);
      // The review may now belong to a different chip, and the counts moved: reload both.
      await Promise.all([loadList(), loadSummary()]);
    } catch {
      setActionError('The review could not be updated. Please try again.');
    } finally {
      setActioning(null);
    }
  }

  const filtersActive = Boolean(chip || rating || search);
  function clearFilters() {
    setChip('');
    setRating(null);
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  const chips: { key: Chip; label: string; count: number | undefined }[] = [
    { key: '',               label: 'All',      count: summary?.total },
    { key: 'pending_review', label: 'Pending',  count: summary?.by_status.pending_review },
    { key: 'visible',        label: 'Approved', count: summary?.by_status.visible },
    { key: 'hidden',         label: 'Hidden',   count: summary?.by_status.hidden },
    { key: 'flagged',        label: 'Flagged',  count: summary?.flagged },
  ];

  return (
    <div className="pb-8 space-y-4">
      <PageHero
        icon={Star}
        eyebrow="Trust & Safety"
        title="Reviews & Ratings"
        subtitle="What buyers say about the products they received, and the moderation queue"
      />

      {/* ── Summary cards and distribution ── */}
      {summaryFailed ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
          <span>The review totals could not be loaded.</span>
          <button onClick={loadSummary} className="px-3 py-1 text-xs font-bold text-white bg-brand-red rounded-lg hover:bg-[#8e2424]">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            {!summary ? (
              [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard icon={Star} label="Average rating" value={summary.average_rating === null ? null : `${summary.average_rating.toFixed(2)} / 5`}
                  subtext={summary.average_rating === null ? 'No reviews yet' : 'Across all reviews'} iconBg="bg-amber-50" iconColor="text-amber-500" />
                <StatCard icon={MessageSquare} label="Total reviews" value={summary.total} subtext="Every moderation status" iconBg="bg-violet-50" iconColor="text-violet-600"
                  onClick={() => chooseChip('')} active={chip === ''} actionLabel="Show all" />
                <StatCard icon={Hourglass} label="Pending moderation" value={summary.by_status.pending_review} subtext="Waiting for an admin" iconBg="bg-amber-50" iconColor="text-amber-600"
                  onClick={() => chooseChip('pending_review')} active={chip === 'pending_review'} actionLabel="Review queue" />
                <StatCard icon={Flag} label="Flagged" value={summary.flagged} subtext="Reported, in any status" iconBg="bg-red-50" iconColor="text-red-600"
                  onClick={() => chooseChip('flagged')} active={chip === 'flagged'} actionLabel="Show flagged" />
              </>
            )}
          </div>
          <RatingDistribution summary={summary} rating={rating} onPick={chooseRating} />
        </div>
      )}

      {/* ── Chips and search ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by moderation status">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => chooseChip(c.key)}
              aria-pressed={chip === c.key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                chip === c.key ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {c.label}
              <span className={`px-1.5 rounded-full text-[10px] ${chip === c.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{c.count === undefined ? NA : whole(c.count)}</span>
            </button>
          ))}
          {rating !== null && (
            <button type="button" onClick={() => setRating(null)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              {rating} star <X className="w-3 h-3" aria-label="Clear the star filter" />
            </button>
          )}
        </div>

        <div className="relative lg:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search reviews"
            placeholder="Comment, product, shop or buyer"
            className="w-full pl-8 pr-8 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="px-4 py-2.5 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">{actionError}</p>
      )}

      {/* ── List ── */}
      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center bg-white border border-red-200 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm text-gray-700">The reviews could not be loaded.</p>
          <Button variant="primary" onClick={loadList}>Retry</Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden" aria-busy={loading}>
          {loading && reviews.length === 0 ? (
            <div className="divide-y divide-gray-100">
              {[0, 1, 2].map((i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse"><div className="h-3 bg-gray-100 rounded w-1/4" /><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-12">
              {filtersActive ? (
                <>
                  <ChartEmptyState message="No reviews match these filters" hint="Try another status or clear the filters." />
                  <button type="button" onClick={clearFilters} className="text-xs font-bold text-brand-red hover:underline">Clear filters</button>
                </>
              ) : (
                <ChartEmptyState message="No reviews yet" hint="Reviews appear here after buyers rate their completed orders." />
              )}
            </div>
          ) : (
            <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
              {reviews.map((r) => {
                const status = STATUS_META[r.moderation_status];
                const StatusIcon = status.icon;
                const buyer = r.buyer ? `${r.buyer.first_name} ${r.buyer.last_name}` : NA;
                return (
                  <li key={r.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Stars rating={r.rating} />
                            <span className="text-sm font-black text-gray-900">{r.rating}.0</span>
                            <span className="sr-only">out of 5 stars</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.cls}`}>
                            <StatusIcon className="w-3 h-3" aria-hidden="true" /> {status.label}
                          </span>
                          {r.flagged && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              <Flag className="w-3 h-3" aria-hidden="true" /> Flagged
                            </span>
                          )}
                          {r.verified_purchase && <span className="text-[11px] font-semibold text-emerald-700">Verified purchase</span>}
                        </div>

                        <Comment text={r.comment} />
                        {r.flagged && r.flag_reason && (
                          <p className="px-2.5 py-1.5 text-xs text-red-800 border border-red-100 rounded-lg bg-red-50/60">Flag reason: {r.flag_reason}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" aria-hidden="true" /> {r.product?.name ?? NA}</span>
                          <span className="inline-flex items-center gap-1"><Store className="w-3 h-3" aria-hidden="true" /> {r.shop?.name ?? NA}</span>
                          <span className="inline-flex items-center gap-1"><UserIcon className="w-3 h-3" aria-hidden="true" /> {buyer}</span>
                          {r.order ? (
                            <Link to={`/admin/orders?search=${encodeURIComponent(r.order.order_number)}`} className="inline-flex items-center gap-1 font-mono font-semibold text-brand-red hover:underline">
                              <ShoppingBag className="w-3 h-3" aria-hidden="true" /> {r.order.order_number}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1"><ShoppingBag className="w-3 h-3" aria-hidden="true" /> {NA}</span>
                          )}
                          <span>{formatDate(r.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {r.moderation_status !== 'visible' && (
                          <Button variant="secondary" loading={actioning === r.id} onClick={() => handleModerate(r.id, 'visible')} className="!min-h-[36px] !px-3 text-xs">
                            Approve
                          </Button>
                        )}
                        {r.moderation_status !== 'hidden' && (
                          <Button variant="danger" loading={actioning === r.id} onClick={() => handleModerate(r.id, 'hidden')} className="!min-h-[36px] !px-3 text-xs">
                            Hide
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {meta.total > 0 && (
            <div className="flex flex-col items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 sm:flex-row">
              <p className="text-[12px] text-gray-500">
                Showing <span className="font-semibold text-gray-800">{meta.from ?? 0}–{meta.to ?? 0}</span> of <span className="font-semibold text-gray-800">{whole(meta.total)}</span> {meta.total === 1 ? 'review' : 'reviews'}
              </p>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <span className="text-[12px] text-gray-600">Page {meta.current_page} of {meta.last_page}</span>
                <button disabled={page >= meta.last_page || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page"
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
