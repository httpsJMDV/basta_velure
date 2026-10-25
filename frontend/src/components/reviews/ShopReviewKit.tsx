// Shop reviews on the storefront, the seller centre and the admin pages: the stars, the summary with its bars, one
// review with the shop's reply, and the dialog a buyer writes or edits their review in.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Store } from 'lucide-react';
import { Dialog } from '../ui/Overlay';
import { createShopReviewApi, updateShopReviewApi } from '../../api/shopReviews';
import type { MyShopReview, ShopReviewRow, ShopReviewSummary } from '../../api/shopReviews';
import { apiErrorMessage } from '../../utils/apiError';

export function Stars({ value, size = 'sm' }: { value: number; size?: 'xs' | 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-5 h-5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** The average as a big number, the stars, the count, and a bar per star level. */
export function ShopReviewSummaryBlock({ summary, compact = false }: { summary: ShopReviewSummary; compact?: boolean }) {
  const max = Math.max(1, ...Object.values(summary.rating_counts));
  return (
    <div className={`grid ${compact ? 'gap-4' : 'sm:grid-cols-[auto_minmax(0,1fr)] gap-5 sm:gap-8'} items-center`}>
      <div>
        <p className="font-serif text-[44px] font-bold leading-none tracking-tight text-[#1E1B18] tabular-nums">
          {summary.average !== null ? summary.average.toFixed(1) : '–'}
        </p>
        <div className="mt-2"><Stars value={summary.average ?? 0} size="sm" /></div>
        <p className="mt-1 text-[12.5px] text-stone-500">{summary.count === 0 ? 'No shop reviews yet' : `${summary.count} shop review${summary.count === 1 ? '' : 's'}`}</p>
      </div>
      <ul className="space-y-1.5" aria-label="Reviews per star rating">
        {[5, 4, 3, 2, 1].map((s) => {
          const n = summary.rating_counts[s] ?? 0;
          return (
            <li key={s} className="flex items-center gap-2.5 text-[12px]">
              <span className="w-3 text-right text-stone-600 tabular-nums">{s}</span>
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right text-stone-400 tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One shop review: who, when, the stars and tags, the comment and the shop's reply. */
export function ShopReviewItem({ review, shopName, footer }: { review: ShopReviewRow; shopName?: string; footer?: React.ReactNode }) {
  const initials = review.buyer.name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || 'B';
  return (
    <article className="py-5 first:pt-0 last:pb-0">
      <header className="flex items-start gap-3">
        {review.buyer.avatar_url
          ? <img src={review.buyer.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover bg-stone-100 shrink-0" />
          : <span className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 text-[13px] font-semibold flex items-center justify-center shrink-0">{initials}</span>}
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
            <span className="font-semibold text-stone-900">{review.buyer_full_name || review.buyer.name}</span>
            {review.buyer_email && <span className="text-[12px] text-stone-400">{review.buyer_email}</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[12px] text-stone-500">
            <Stars value={review.rating} size="xs" />
            <span>{shortDate(review.created_at)}{review.edited ? ' · edited' : ''}</span>
          </p>
        </div>
      </header>
      {review.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {review.tags.map((t) => <li key={t} className="px-2 py-0.5 rounded-md bg-stone-100 text-[11.5px] font-medium text-stone-700">{t}</li>)}
        </ul>
      )}
      {review.comment && <p className="mt-2.5 text-[13.5px] leading-relaxed text-stone-700 whitespace-pre-line break-words">{review.comment}</p>}
      {review.seller_reply && (
        <div className="mt-3 ml-1 pl-3.5 border-l-2 border-stone-200">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-800"><Store className="w-3.5 h-3.5 text-stone-400" /> {shopName ? `${shopName} replied` : 'The shop replied'}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-600 whitespace-pre-line break-words">{review.seller_reply.body}</p>
        </div>
      )}
      {footer}
    </article>
  );
}

/** The latest reviews with a link to all of them; empty states say what to expect. */
export function ShopReviewList({ reviews, shopName, emptyText = 'No shop reviews yet.' }: { reviews: ShopReviewRow[]; shopName?: string; emptyText?: string }) {
  if (reviews.length === 0) return <p className="py-6 text-[13px] text-stone-500">{emptyText}</p>;
  return <div className="divide-y divide-stone-100">{reviews.map((r) => <ShopReviewItem key={r.id} review={r} shopName={shopName} />)}</div>;
}

/** The buyer's own review of the shop: a new one, or an edit of theirs (two edits a day). */
export function ShopReviewDialog({ open, onClose, shop, shopName, mine, onSaved }: {
  open: boolean;
  onClose: () => void;
  shop: string | number;
  shopName: string;
  mine: MyShopReview;
  onSaved: (review: ShopReviewRow, editsLeft: number) => void;
}) {
  const existing = mine.review;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setTags(existing?.tags ?? []);
    setComment(existing?.comment ?? '');
    setError(null);
  }, [open, existing]);

  const outOfEdits = !!existing && mine.edits_left_today === 0;
  const tooLong = comment.length > 500;

  const save = async () => {
    if (rating < 1) { setError('Choose from 1 to 5 stars.'); return; }
    if (tooLong || outOfEdits) return;
    setBusy(true);
    setError(null);
    try {
      const body = { rating, tags, comment: comment.trim() || undefined };
      if (existing) {
        const res = await updateShopReviewApi(shop, body);
        onSaved(res.data, res.edits_left_today);
      } else {
        const res = await createShopReviewApi(shop, body);
        onSaved(res.data, mine.edits_left_today);
      }
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'Your review could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || rating;
  const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

  return (
    <Dialog open={open} onClose={onClose} size="max-w-lg" title={existing ? 'Edit your shop review' : `Review ${shopName}`}
      footer={<>
        <button type="button" onClick={onClose} className="min-h-10 px-4 rounded-full text-[13px] font-semibold text-stone-600 hover:text-stone-900">Cancel</button>
        <button type="button" onClick={save} disabled={busy || outOfEdits || tooLong}
          className="min-h-10 px-5 rounded-full bg-brand-red text-white text-[13px] font-semibold hover:bg-brand-red-dark disabled:opacity-50">
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Post review'}
        </button>
      </>}>
      <p className="text-[13px] text-stone-500">About the shop itself: shipping, packing and how the seller answers you. Products have their own reviews.</p>

      <div className="mt-5">
        <p className="text-[12.5px] font-semibold text-stone-800">Your rating <span className="text-brand-red">*</span></p>
        <div className="mt-2 flex items-center gap-3" onMouseLeave={() => setHover(0)}>
          <span className="flex gap-1" role="radiogroup" aria-label="Stars">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i === 1 ? '' : 's'}`}
                onMouseEnter={() => setHover(i)} onClick={() => { setRating(i); setError(null); }} className="p-0.5">
                <Star className={`w-8 h-8 transition-colors ${i <= shown ? 'fill-amber-400 text-amber-400' : 'fill-stone-100 text-stone-300'}`} />
              </button>
            ))}
          </span>
          <span className="text-[13px] font-medium text-stone-600">{words[shown]}</span>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[12.5px] font-semibold text-stone-800">What stood out? <span className="font-normal text-stone-400">(optional)</span></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {mine.tags.map((t) => {
            const on = tags.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                className={`px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-colors ${on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}`}>
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="shop-review-comment" className="text-[12.5px] font-semibold text-stone-800">Comment <span className="font-normal text-stone-400">(optional)</span></label>
        <textarea id="shop-review-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was buying from this shop?"
          className={`mt-2 w-full rounded-xl border px-3.5 py-2.5 text-[13.5px] resize-none outline-none focus:ring-2 focus:ring-brand-red/10 ${tooLong ? 'border-brand-red' : 'border-stone-300 focus:border-brand-red'}`} />
        <p className={`mt-1 text-right text-[11.5px] tabular-nums ${tooLong ? 'text-brand-red font-medium' : 'text-stone-400'}`}>{comment.length}/500</p>
      </div>

      {existing && (
        <p className={`mt-1 text-[12px] ${outOfEdits ? 'text-amber-800' : 'text-stone-500'}`}>
          {outOfEdits ? 'You edited this review twice today. You can edit it again tomorrow.' : `You can edit it ${mine.edits_left_today === 1 ? 'once more' : 'twice'} today.`}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] font-medium text-brand-red">{error}</p>}
    </Dialog>
  );
}

/** The link under the latest reviews. */
export function SeeAllShopReviews({ slug, count }: { slug: string; count: number }) {
  if (count === 0) return null;
  return (
    <Link to={`/shop/${slug}/reviews`} className="inline-flex items-center justify-center min-h-10 px-4 rounded-full border border-stone-300 bg-white text-[13px] font-semibold text-stone-800 hover:border-stone-900">
      See all {count} review{count === 1 ? '' : 's'}
    </Link>
  );
}
