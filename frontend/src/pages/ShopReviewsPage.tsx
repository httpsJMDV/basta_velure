import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, PenLine } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { ShopReviewDialog, ShopReviewList, ShopReviewSummaryBlock } from '../components/reviews/ShopReviewKit';
import { getMyShopReviewApi, getShopReviewListApi } from '../api/shopReviews';
import type { MyShopReview, ShopReviewPage } from '../api/shopReviews';
import { useAuth } from '../hooks/useAuth';

/** Every comment on one shop (the shop itself, not its products), newest first, filtered by quick tag. No stars. */
export default function ShopReviewsPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ShopReviewPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState<MyShopReview | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(() => {
    getShopReviewListApi(slug, { tag, page, per_page: 10 })
      .then((res) => { setData(res); setFailed(false); })
      .catch(() => setFailed(true));
  }, [slug, tag, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!user) { setMine(null); return; }
    getMyShopReviewApi(slug).then(setMine).catch(() => setMine(null));
  }, [slug, user]);

  const shopName = data?.shop?.name ?? 'Shop';
  const summary = data?.summary;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />
      <main className="flex-1 w-full max-w-[1100px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <Link to={`/shop/${slug}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-600 hover:text-brand-red">
          <ArrowLeft className="w-4 h-4" /> Back to {shopName}
        </Link>

        {failed ? (
          <div className="mt-10 text-center">
            <h1 className="font-serif text-2xl font-bold text-[#1E1B18]">This shop is not available</h1>
            <Link to="/search" className="mt-5 inline-flex h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold items-center">Keep shopping</Link>
          </div>
        ) : (
          <div className="mt-5 grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
            <aside className="lg:sticky lg:top-[126px] rounded-3xl bg-white border border-stone-200 p-6">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-red">Comments about the shop</p>
              <h1 className="mt-1.5 font-serif text-[26px] font-bold tracking-tight leading-tight text-[#1E1B18]">{shopName}</h1>
              <p className="mt-1 text-[12.5px] text-stone-500">What buyers say about the shop itself: shipping, packing and how the seller answers.</p>
              {summary && <div className="mt-6"><ShopReviewSummaryBlock summary={summary} activeTag={tag} onTag={(t) => { setTag(t); setPage(1); }} /></div>}
              <div className="mt-6">
                {!user ? (
                  <button type="button" onClick={() => navigate(`/login?next=${encodeURIComponent(`/shop/${slug}/reviews`)}`)}
                    className="w-full min-h-10 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-800 hover:border-stone-900">Sign in to comment</button>
                ) : mine?.review || mine?.can_review ? (
                  <button type="button" onClick={() => setWriting(true)}
                    className={`w-full min-h-10 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 ${mine.review ? 'border border-stone-300 bg-white text-stone-800 hover:border-stone-900' : 'bg-brand-red text-white hover:bg-brand-red-dark'}`}>
                    <PenLine className="w-4 h-4" /> {mine.review ? 'Edit your comment' : 'Comment on this shop'}
                  </button>
                ) : mine?.reason ? <p className="text-[12.5px] leading-snug text-stone-500">{mine.reason}</p> : null}
              </div>
            </aside>

            <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-7">
              <p className="text-[12px] text-stone-500">{tag ? <>Comments that mention <span className="font-semibold text-stone-800">{tag}</span>, newest first</> : 'Newest first'}</p>
              <div className="mt-4">
                {data === null
                  ? <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-stone-100 animate-pulse" />)}</div>
                  : <ShopReviewList reviews={data.data} shopName={shopName} emptyText={tag ? 'No comments mention this yet.' : 'No one has commented on this shop yet.'} />}
              </div>
              {data && data.meta.last_page > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page"
                    className="w-9 h-9 rounded-full border border-stone-300 bg-white flex items-center justify-center text-stone-600 hover:border-stone-900 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-[13px] text-stone-600 tabular-nums">Page {page} of {data.meta.last_page}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(data.meta.last_page, p + 1))} disabled={page === data.meta.last_page} aria-label="Next page"
                    className="w-9 h-9 rounded-full border border-stone-300 bg-white flex items-center justify-center text-stone-600 hover:border-stone-900 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {mine && (
        <ShopReviewDialog open={writing} onClose={() => setWriting(false)} shop={slug} shopName={shopName} mine={mine}
          onSaved={(review, editsLeft) => { setMine({ ...mine, review, edits_left_today: editsLeft }); load(); }} />
      )}
      <Footer />
    </div>
  );
}
