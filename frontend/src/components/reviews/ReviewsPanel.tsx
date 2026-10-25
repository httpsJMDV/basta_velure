import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Star, X, ImagePlus, Package, PencilLine, Loader2, MessageSquareText, CheckCircle2 } from 'lucide-react';
import { getPendingReviewsApi, getMyReviewsApi, createReviewApi, updateReviewApi } from '../../api/client';
import type { PendingReview, BuyerReview } from '../../types';
import { useToast } from '../ui/Toast';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const WORDS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? 'fill-amber-400 text-amber-400' : 'fill-stone-200 text-stone-200'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

function Thumb({ src, className = 'w-16 h-16' }: { src: string | null | undefined; className?: string }) {
  return src
    ? <img src={src} alt="" loading="lazy" className={`${className} rounded-xl object-cover bg-stone-100 ring-1 ring-stone-200 shrink-0`} />
    : <span className={`${className} rounded-xl bg-stone-100 text-stone-300 flex items-center justify-center shrink-0`}><Package className="w-5 h-5" /></span>;
}

type Target =
  | { mode: 'new'; item: PendingReview }
  | { mode: 'edit'; review: BuyerReview };

/** The buyer's reviews: what they received and can still review, and what they already wrote. */
export default function ReviewsPanel() {
  const [searchParams] = useSearchParams();
  const focusOrder = Number(searchParams.get('order')) || null;
  const { showToast } = useToast();
  const [pending, setPending] = useState<PendingReview[] | null>(null);
  const [written, setWritten] = useState<BuyerReview[] | null>(null);
  const [tab, setTab] = useState<'pending' | 'written'>('pending');
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    let alive = true;
    getPendingReviewsApi().then((p) => { if (alive) setPending(p); }).catch(() => { if (alive) setPending([]); });
    getMyReviewsApi().then((w) => { if (alive) setWritten(w); }).catch(() => { if (alive) setWritten([]); });
    return () => { alive = false; };
  }, []);

  // Coming from an order ("Rate items"): that order's products first.
  const toReview = useMemo(() => {
    if (!pending || !focusOrder) return pending;
    return [...pending].sort((a, b) => Number(b.order_id === focusOrder) - Number(a.order_id === focusOrder));
  }, [pending, focusOrder]);

  const onSaved = (review: BuyerReview, wasNew: boolean) => {
    setTarget(null);
    if (wasNew) {
      setPending((p) => (p ?? []).filter((i) => !(i.order_id === review.order?.id && i.product.id === review.product?.id)));
      setWritten((w) => [review, ...(w ?? [])]);
      showToast('Thanks! Your review is on the product page now.');
    } else {
      setWritten((w) => (w ?? []).map((r) => (r.id === review.id ? review : r)));
      showToast('Your review was updated.');
    }
  };

  const tabs = [
    { key: 'pending' as const, label: 'To review', count: pending?.length },
    { key: 'written' as const, label: 'Written', count: written?.length },
  ];

  return (
    <section className="rounded-3xl bg-white/60 border border-stone-200 overflow-hidden">
      <header className="px-6 pt-6 bg-white border-b border-stone-200">
        <h2 className="text-xl font-serif font-bold tracking-tight text-[#1E1B18]">Reviews</h2>
        <p className="mt-1 text-[13px] text-stone-500">Rate what you received. Honest reviews help other buyers choose, and help shops improve.</p>
        <div role="tablist" aria-label="Reviews" className="flex gap-6 mt-4">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`relative pb-3 text-[14px] transition-colors ${tab === t.key ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
              {t.label}{t.count !== undefined && <span className="ml-1.5 text-stone-400 tabular-nums">{t.count}</span>}
              {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-red" />}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 sm:p-6">
        {tab === 'pending' ? (
          toReview === null ? <Spinner /> : toReview.length === 0 ? (
            <Empty
              icon={CheckCircle2}
              title="You are all caught up"
              hint="Products you receive show up here, ready to rate. You can review each product once per order."
              action={<Link to="/settings/orders" className="mt-4 h-9 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 flex items-center">Go to my orders</Link>}
            />
          ) : (
            <ul className="space-y-3">
              {toReview.map((item) => (
                <li key={`${item.order_id}-${item.product.id}`} className={`p-4 flex items-center gap-4 rounded-2xl bg-white border ${item.order_id === focusOrder ? 'border-brand-red/50 ring-1 ring-brand-red/25' : 'border-stone-200'}`}>
                  <Link to={`/products/${item.product.id}`}><Thumb src={item.product.image_url} /></Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/products/${item.product.id}`} className="block text-[14px] font-semibold text-stone-900 leading-snug line-clamp-2 hover:text-brand-red">{item.product.name}</Link>
                    <p className="mt-0.5 text-[12px] text-stone-500 truncate">{[item.variant_label, item.shop_name].filter(Boolean).join(' · ')}</p>
                    <p className="text-[12px] text-stone-400">Order <span className="font-mono">#{item.order_number}</span>{item.delivered_at ? ` · delivered ${day(item.delivered_at)}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => setTarget({ mode: 'new', item })}
                    className="shrink-0 h-9 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors">
                    <Star className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Write a review</span><span className="sm:hidden">Rate</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          written === null ? <Spinner /> : written.length === 0 ? (
            <Empty icon={MessageSquareText} title="No reviews yet" hint="Reviews you write appear here. You can edit one for 30 days after posting." />
          ) : (
            <ul className="space-y-3">
              {written.map((r) => {
                const edited = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 60_000;
                return (
                  <li key={r.id} className="p-4 flex gap-4 rounded-2xl bg-white border border-stone-200">
                    <Link to={r.product ? `/products/${r.product.id}` : '#'}><Thumb src={r.product?.image_url} className="w-14 h-14" /></Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={r.product ? `/products/${r.product.id}` : '#'} className="text-[14px] font-semibold text-stone-900 leading-snug line-clamp-1 hover:text-brand-red">{r.product?.name ?? 'Product'}</Link>
                        {r.can_edit && (
                          <button type="button" onClick={() => setTarget({ mode: 'edit', review: r })} className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-semibold text-stone-600 hover:text-brand-red">
                            <PencilLine className="w-3.5 h-3.5" /> Edit
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-stone-400">
                        <Stars value={r.rating} />
                        <span>{day(r.created_at)}{edited ? ' · edited' : ''}</span>
                        {r.order && <span>· order <span className="font-mono">#{r.order.order_number}</span></span>}
                      </div>
                      {r.comment && <p className="mt-2 text-[14px] leading-relaxed text-stone-700 whitespace-pre-line">{r.comment}</p>}
                      {r.images.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {r.images.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="w-16 h-16 rounded-lg object-cover ring-1 ring-stone-200" /></a>)}
                        </div>
                      )}
                      {!r.can_edit && <p className="mt-2 text-[11.5px] text-stone-400">Editing closed 30 days after posting.</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>

      <AnimatePresence>
        {target && <ReviewComposer key={target.mode === 'new' ? `n-${target.item.order_id}-${target.item.product.id}` : `e-${target.review.id}`} target={target} onClose={() => setTarget(null)} onSaved={onSaved} />}
      </AnimatePresence>
    </section>
  );
}

function Spinner() {
  return <div className="py-14 flex justify-center"><Loader2 className="w-6 h-6 text-brand-red animate-spin" /></div>;
}

function Empty({ icon: Icon, title, hint, action }: { icon: React.ElementType; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 flex flex-col items-center text-center">
      <span className="w-14 h-14 rounded-full bg-white border border-stone-200 text-stone-400 flex items-center justify-center"><Icon className="w-6 h-6" /></span>
      <p className="mt-3 font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-[13px] text-stone-500 max-w-sm">{hint}</p>
      {action}
    </div>
  );
}

// ─── Writing or editing a review ──────────────────────────────────────────────

function ReviewComposer({ target, onClose, onSaved }: { target: Target; onClose: () => void; onSaved: (r: BuyerReview, wasNew: boolean) => void }) {
  const isNew = target.mode === 'new';
  const product = isNew ? target.item.product : target.review.product;
  const [rating, setRating] = useState(isNew ? 0 : target.review.rating);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(isNew ? '' : target.review.comment ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, saving]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files);
    const tooBig = picked.find((f) => f.size > MAX_PHOTO_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_PHOTO_BYTES && /^image\/(jpeg|png)$/.test(f.type));
    setPhotos((cur) => [...cur, ...ok].slice(0, MAX_PHOTOS));
    setError(tooBig ? `${tooBig.name} is over 5 MB.` : ok.length < picked.length ? 'Only JPG or PNG photos.' : '');
  };

  const submit = async () => {
    if (!rating || saving) return;
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const form = new FormData();
        form.append('order_id', String(target.item.order_id));
        form.append('product_id', String(target.item.product.id));
        form.append('rating', String(rating));
        if (comment.trim()) form.append('comment', comment.trim());
        photos.forEach((f) => form.append('photos[]', f));
        onSaved(await createReviewApi(form), true);
      } else {
        onSaved(await updateReviewApi(target.review.id, { rating, comment: comment.trim() || null }), false);
      }
    } catch (err) {
      const res = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      setError(Object.values(res?.errors ?? {})[0]?.[0] ?? res?.message ?? 'Your review was not saved. Try again.');
      setSaving(false);
    }
  };

  const shown = hover || rating;

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={isNew ? 'Write a review' : 'Edit your review'}>
      <motion.div className="absolute inset-0 bg-stone-950/45" onClick={() => !saving && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white border-b border-stone-100">
          <Thumb src={product?.image_url} className="w-12 h-12" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{isNew ? 'Write a review' : 'Edit your review'}</p>
            <p className="text-[14px] font-semibold text-stone-900 truncate">{product?.name}</p>
            {isNew && target.item.variant_label && <p className="text-[12px] text-stone-500 truncate">{target.item.variant_label}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="w-9 h-9 rounded-full text-stone-500 hover:bg-stone-100 flex items-center justify-center disabled:opacity-40"><X className="w-4 h-4" /></button>
        </header>

        <div className="px-5 py-5 space-y-6">
          {/* Rating */}
          <div className="text-center">
            <p className="text-[13px] font-semibold text-stone-800">How would you rate it?</p>
            <div className="mt-3 flex justify-center gap-1.5" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}, ${WORDS[n]}`}
                  onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => setRating(n)}
                  className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red">
                  <Star className={`w-9 h-9 transition-colors ${n <= shown ? 'fill-amber-400 text-amber-400' : 'fill-stone-100 text-stone-300'}`} strokeWidth={1.4} />
                </button>
              ))}
            </div>
            <p className={`mt-1 h-5 text-[13px] font-semibold ${shown ? 'text-stone-800' : 'text-stone-400'}`}>{shown ? WORDS[shown] : 'Tap a star'}</p>
          </div>

          {/* Text */}
          <div>
            <label htmlFor="review-text" className="text-[13px] font-semibold text-stone-800">Tell other buyers about it <span className="font-normal text-stone-400">(optional)</span></label>
            <textarea
              id="review-text"
              rows={5}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How is the quality? Does it match the photos and description? How was the packaging?"
              className="mt-2 w-full px-3.5 py-3 text-[14px] leading-relaxed rounded-2xl border border-stone-300 outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none placeholder:text-stone-400"
            />
            <p className="mt-1 text-right text-[11px] text-stone-400 tabular-nums">{comment.length}/500</p>
          </div>

          {/* Photos */}
          {isNew ? (
            <div>
              <p className="text-[13px] font-semibold text-stone-800">Add photos <span className="font-normal text-stone-400">(up to {MAX_PHOTOS})</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <span key={src} className="relative">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover ring-1 ring-stone-200" />
                    <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove photo"
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center ring-2 ring-white"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 hover:border-brand-red hover:text-brand-red text-stone-400 flex flex-col items-center justify-center gap-1 transition-colors">
                    <ImagePlus className="w-5 h-5" /><span className="text-[11px] font-semibold">Add</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              <p className="mt-1.5 text-[11.5px] text-stone-400">Real photos of the item you got help the most. JPG, PNG or WEBP, 5 MB each.</p>
            </div>
          ) : target.review.images.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-stone-800">Your photos</p>
              <div className="mt-2 flex flex-wrap gap-2">{target.review.images.map((src) => <img key={src} src={src} alt="" className="w-16 h-16 rounded-lg object-cover ring-1 ring-stone-200" />)}</div>
              <p className="mt-1.5 text-[11.5px] text-stone-400">Photos stay as posted; you can change the rating and text.</p>
            </div>
          )}

          {error && <p role="alert" className="text-[13px] text-brand-red">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex items-center gap-3 px-5 py-4 bg-white border-t border-stone-100">
          <p className="flex-1 text-[11.5px] text-stone-400 leading-snug">Posted on the product page with your first name and last initial, marked as a verified purchase.</p>
          <button type="button" onClick={submit} disabled={!rating || saving}
            className="shrink-0 h-11 px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? 'Post review' : 'Save changes'}
          </button>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
