import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Star, MessageSquareReply, Package, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useToast } from '../../components/ui/Toast';
import CustomSelect from '../../components/ui/CustomSelect';
import { getSellerProductsApi } from '../../api/client';
import { editSellerReviewReplyApi, getSellerReviewsApi, replySellerReviewApi } from '../../api/sellerCatalog';
import type { SellerReviewPage, SellerReviewRow } from '../../api/sellerCatalog';
import { apiErrorMessage } from '../../utils/apiError';
import { getSellerShopReviewsApi, replyShopReviewApi } from '../../api/shopReviews';
import type { ShopReviewPage, ShopReviewRow } from '../../api/shopReviews';
import { ShopReviewItem, ShopReviewSummaryBlock } from '../../components/reviews/ShopReviewKit';

const REPLY_MIN = 2;
const REPLY_MAX = 500;

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= value ? 'fill-amber-400 text-amber-400' : 'fill-gray-100 text-gray-200'}`} />
      ))}
    </span>
  );
}

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

/** Reviews of the seller's products, with one public reply per review that can be edited later. */
function ProductReviews() {
  const { showToast } = useToast();
  const [page, setPage] = useState<SellerReviewPage | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [replied, setReplied] = useState<'' | '0' | '1'>('');
  const [productId, setProductId] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [products, setProducts] = useState<{ value: string; label: string }[]>([]);

  const load = useCallback(() => {
    setError('');
    getSellerReviewsApi({
      rating: rating ?? undefined, replied: replied || undefined,
      product_id: productId ? Number(productId) : undefined, page: pageNo,
    })
      .then(setPage)
      .catch((e) => setError(apiErrorMessage(e, 'Reviews could not be loaded.')));
  }, [rating, replied, productId, pageNo]);

  useEffect(load, [load]);
  useEffect(() => {
    getSellerProductsApi().then((rows) => setProducts(rows.map((p) => ({ value: String(p.id), label: p.name })))).catch(() => undefined);
  }, []);

  const replace = (row: SellerReviewRow) => setPage((prev) => prev && { ...prev, data: prev.data.map((r) => (r.id === row.id ? row : r)) });

  const meta = page?.meta;
  const total = meta ? Object.values(meta.rating_counts).reduce((a, b) => a + b, 0) : 0;
  const filtered = rating !== null || replied !== '' || productId !== '';

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-gray-500">Buyers review a product after the order is completed. Your reply shows under the review on the product page.</p>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Average rating</p>
          <p className="mt-1 text-4xl font-black text-gray-900 tabular-nums">{meta?.average != null ? meta.average.toFixed(1) : '—'}</p>
          <div className="mt-1"><Stars value={Math.round(meta?.average ?? 0)} size="w-4 h-4" /></div>
          <p className="mt-2 text-[12px] text-gray-500 tabular-nums">{total.toLocaleString()} review{total === 1 ? '' : 's'}</p>
          {meta && meta.unreplied > 0 && (
            <button type="button" onClick={() => { setReplied('0'); setPageNo(1); }}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:underline">
              <MessageSquareReply className="w-3.5 h-3.5" /> {meta.unreplied} waiting for a reply
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">By stars · click to filter</p>
          <ul className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = meta?.rating_counts[String(s)] ?? 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              const active = rating === s;
              return (
                <li key={s}>
                  <button type="button" onClick={() => { setRating(active ? null : s); setPageNo(1); }} aria-pressed={active}
                    className={`w-full flex items-center gap-3 rounded-lg px-2 py-1 text-[12.5px] transition-colors ${active ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                    <span className="w-10 text-left font-semibold text-gray-700 tabular-nums">{s} ★</span>
                    <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${pct}%` }} /></span>
                    <span className="w-12 text-right text-gray-500 tabular-nums">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-gray-100">
          <div className="flex gap-1" role="group" aria-label="Reply status">
            {([['', 'All'], ['0', 'Needs reply'], ['1', 'Replied']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => { setReplied(v); setPageNo(1); }} aria-pressed={replied === v}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${replied === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="w-60 ml-auto">
            <CustomSelect value={productId} onChange={(v) => { setProductId(v); setPageNo(1); }}
              options={[{ value: '', label: 'All products' }, ...products]} />
          </div>
          {filtered && (
            <button type="button" onClick={() => { setRating(null); setReplied(''); setProductId(''); setPageNo(1); }}
              className="text-[12px] font-semibold text-gray-500 hover:text-gray-900">Clear filters</button>
          )}
        </div>

        {error ? (
          <div role="alert" className="flex items-center gap-3 px-5 py-6 text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button type="button" onClick={load} className="font-bold underline">Try again</button>
          </div>
        ) : !page ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : page.data.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-16 px-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center"><Star className="w-6 h-6 text-gray-300" /></div>
            <p className="text-[14px] font-bold text-gray-800">{filtered ? 'No reviews match these filters' : 'No reviews yet'}</p>
            <p className="text-[12.5px] text-gray-500 max-w-sm">{filtered ? 'Clear the filters to see every review.' : 'Reviews appear here once buyers rate their completed orders.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {page.data.map((r) => <ReviewItem key={r.id} review={r} onSaved={(row, m) => { replace(row); showToast(m); load(); }} />)}
          </ul>
        )}

        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-[12.5px] text-gray-600">
            <span className="tabular-nums">Page {meta.current_page} of {meta.last_page} · {meta.total} reviews</span>
            <div className="flex gap-1">
              <button type="button" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={pageNo >= meta.last_page} onClick={() => setPageNo((p) => p + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-30" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ review: r, onSaved }: { review: SellerReviewRow; onSaved: (row: SellerReviewRow, message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(r.seller_reply?.body ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = editing || !r.seller_reply;

  const submit = async () => {
    const text = body.trim();
    if (text.length < REPLY_MIN) { setError('Write your reply.'); return; }
    if (text.length > REPLY_MAX) { setError(`A reply can be at most ${REPLY_MAX} characters.`); return; }
    // The buyer and every shopper read it under the review: words, not "!!" or "123" (the server checks the same).
    if (!/\p{L}.*\p{L}/su.test(text)) { setError('Write your reply in words.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = r.seller_reply ? await editSellerReviewReplyApi(r.id, text) : await replySellerReviewApi(r.id, text);
      setEditing(false);
      onSaved(res.data, res.message);
    } catch (e) { setError(apiErrorMessage(e, 'The reply could not be saved.')); }
    finally { setBusy(false); }
  };

  return (
    <li className="px-5 py-4">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-lg bg-gray-100 overflow-hidden border border-gray-100 shrink-0">
          {r.product?.image_url
            ? <img src={r.product.image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {r.product
              ? <Link to={`/products/${r.product.id}`} className="text-[13px] font-semibold text-gray-900 hover:text-brand-red truncate max-w-[320px]">{r.product.name}</Link>
              : <span className="text-[13px] font-semibold text-gray-400">Deleted product</span>}
            {r.variant_label && r.variant_label !== 'Default' && <span className="text-[11.5px] text-gray-500">· {r.variant_label}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-gray-500">
            <Stars value={r.rating} />
            <span className="font-semibold text-gray-700">{r.buyer_name}</span>
            <span>{date(r.created_at)}</span>
            {r.order_number && <span className="font-mono">#{r.order_number}</span>}
          </div>
          {r.comment ? <p className="mt-2 text-[13.5px] text-gray-800 leading-relaxed whitespace-pre-line">{r.comment}</p>
            : <p className="mt-2 text-[12.5px] italic text-gray-400">No written review, stars only.</p>}
          {r.images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-gray-100">
                  <img src={src} alt="Review photo" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {r.seller_reply && !editing && (
            <div className="mt-3 rounded-xl border-l-2 border-brand-red bg-gray-50 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] font-bold text-gray-700">
                  Your reply <span className="font-normal text-gray-400">· {date(r.seller_reply.replied_at)}{r.seller_reply.edited_at ? ' · edited' : ''}</span>
                </p>
                <button type="button" onClick={() => { setBody(r.seller_reply?.body ?? ''); setEditing(true); }} className="text-[11.5px] font-semibold text-brand-red hover:underline">Edit</button>
              </div>
              <p className="mt-1 text-[13px] text-gray-700 whitespace-pre-line">{r.seller_reply.body}</p>
            </div>
          )}

          {open && (
            <div className="mt-3">
              <label htmlFor={`reply-${r.id}`} className="sr-only">Reply to this review</label>
              <textarea
                id={`reply-${r.id}`} rows={2} value={body} onChange={(e) => { setBody(e.target.value); setError(''); }}
                placeholder="Write a public reply. Thank the buyer or explain what you will do."
                aria-invalid={!!error}
                className={`w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none resize-y bg-white focus:ring-2 focus:ring-red-100 ${error ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'}`}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`text-[11px] tabular-nums ${error ? 'text-red-600 font-medium' : body.trim().length > REPLY_MAX ? 'text-red-600' : 'text-gray-400'}`}>
                  {error || `${body.trim().length}/${REPLY_MAX}`}
                </span>
                <div className="ml-auto flex gap-1.5">
                  {editing && <button type="button" onClick={() => { setEditing(false); setError(''); }} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>}
                  <button type="button" onClick={submit} disabled={busy}
                    className="px-3.5 py-1.5 rounded-lg bg-brand-red text-white text-[12px] font-bold hover:bg-brand-red-dark disabled:opacity-60">
                    {busy ? 'Saving…' : r.seller_reply ? 'Save reply' : 'Post reply'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Reviews & Ratings: product reviews (with stars) and comments about the shop itself (no stars), each with the seller's one public reply. */
export default function SellerReviewsPage() {
  const pageRef = useMountAnim();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'shop' ? 'shop' : 'products';

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Reviews &amp; Ratings</h1>
        <div className="mt-3 flex gap-1 border-b border-gray-200" role="tablist" aria-label="Review kinds">
          {([['products', 'Product reviews'], ['shop', 'Shop comments']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key}
              onClick={() => setParams(key === 'shop' ? { tab: 'shop' } : {}, { replace: true })}
              className={`px-4 py-2.5 -mb-px border-b-2 text-[13.5px] font-semibold transition-colors ${tab === key ? 'border-brand-red text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'shop' ? <ShopReviews /> : <ProductReviews />}
    </div>
  );
}

/** Comments about the shop itself (shipping, packing, replies), from buyers with a completed order. No stars. */
function ShopReviews() {
  const { showToast } = useToast();
  const [page, setPage] = useState<ShopReviewPage | null>(null);
  const [error, setError] = useState('');
  const [replied, setReplied] = useState<'' | '0' | '1'>('');
  const [pageNo, setPageNo] = useState(1);

  const load = useCallback(() => {
    setError('');
    getSellerShopReviewsApi({ replied: replied || undefined, page: pageNo })
      .then(setPage)
      .catch((e) => setError(apiErrorMessage(e, 'Shop comments could not be loaded.')));
  }, [replied, pageNo]);
  useEffect(load, [load]);

  const summary = page?.summary;
  const filtered = replied !== '';

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-gray-500">Buyers with a completed order can comment on your shop once and edit it later. Your reply shows under the comment on your shop page.</p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-start bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        {summary ? <ShopReviewSummaryBlock summary={summary} /> : <div className="h-28 rounded-xl bg-gray-50 animate-pulse" />}
        {page && (page.meta.unreplied ?? 0) > 0 && (
          <button type="button" onClick={() => { setReplied('0'); setPageNo(1); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:underline">
            <MessageSquareReply className="w-3.5 h-3.5" /> {page.meta.unreplied} waiting for a reply
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-gray-100">
          <div className="flex gap-1" role="group" aria-label="Reply status">
            {([['', 'All'], ['0', 'Needs reply'], ['1', 'Replied']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => { setReplied(v); setPageNo(1); }} aria-pressed={replied === v}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors ${replied === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-center gap-3 px-5 py-6 text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button type="button" onClick={load} className="font-bold underline">Try again</button>
          </div>
        ) : !page ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : page.data.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-16 px-6">
            <p className="text-[14px] font-bold text-gray-800">{filtered ? 'No comments match this filter' : 'No comments about your shop yet'}</p>
            <p className="text-[12.5px] text-gray-500 max-w-sm">{filtered ? 'Choose All to see every comment.' : 'Buyers can comment on your shop once one of their orders is completed.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {page.data.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <ShopReviewItem review={{ ...r, seller_reply: null }} />
                <ShopReplyEditor review={r} onSaved={(m) => { showToast(m); load(); }} />
              </li>
            ))}
          </ul>
        )}

        {page && page.meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-[12.5px] text-gray-600">
            <span className="tabular-nums">Page {page.meta.current_page} of {page.meta.last_page} · {page.meta.total} comments</span>
            <div className="flex gap-1">
              <button type="button" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-30" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" disabled={pageNo >= page.meta.last_page} onClick={() => setPageNo((p) => p + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-30" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The shop's one public reply to a comment: write it, or edit it later. */
function ShopReplyEditor({ review: r, onSaved }: { review: ShopReviewRow; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(r.seller_reply?.body ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = editing || !r.seller_reply;

  const submit = async () => {
    const text = body.trim();
    if (text.length < REPLY_MIN) { setError('Write your reply.'); return; }
    if (text.length > REPLY_MAX) { setError(`A reply can be at most ${REPLY_MAX} characters.`); return; }
    if (!/\p{L}.*\p{L}/su.test(text)) { setError('Write your reply in words.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await replyShopReviewApi(r.id, text, !!r.seller_reply);
      setEditing(false);
      onSaved(res.message);
    } catch (e) { setError(apiErrorMessage(e, 'The reply could not be saved.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 ml-12">
      {r.seller_reply && !editing && (
        <div className="rounded-xl border-l-2 border-brand-red bg-gray-50 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] font-bold text-gray-700">
              Your reply <span className="font-normal text-gray-400">· {date(r.seller_reply.replied_at)}{r.seller_reply.edited_at ? ' · edited' : ''}</span>
            </p>
            <button type="button" onClick={() => { setBody(r.seller_reply?.body ?? ''); setEditing(true); }} className="text-[11.5px] font-semibold text-brand-red hover:underline">Edit</button>
          </div>
          <p className="mt-1 text-[13px] text-gray-700 whitespace-pre-line">{r.seller_reply.body}</p>
        </div>
      )}
      {open && (
        <div>
          <label htmlFor={`shop-reply-${r.id}`} className="sr-only">Reply to this shop review</label>
          <textarea id={`shop-reply-${r.id}`} rows={2} value={body} onChange={(e) => { setBody(e.target.value); setError(''); }}
            placeholder="Write a public reply. Thank the buyer or explain what you will do."
            aria-invalid={!!error}
            className={`w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none resize-y bg-white focus:ring-2 focus:ring-red-100 ${error ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'}`} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`text-[11px] tabular-nums ${error ? 'text-red-600 font-medium' : body.trim().length > REPLY_MAX ? 'text-red-600' : 'text-gray-400'}`}>
              {error || `${body.trim().length}/${REPLY_MAX}`}
            </span>
            <div className="ml-auto flex gap-1.5">
              {editing && <button type="button" onClick={() => { setEditing(false); setError(''); }} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>}
              <button type="button" onClick={submit} disabled={busy} className="px-3.5 py-1.5 rounded-lg bg-brand-red text-white text-[12px] font-bold hover:bg-brand-red-dark disabled:opacity-60">
                {busy ? 'Saving…' : r.seller_reply ? 'Save reply' : 'Post reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
