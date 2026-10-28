import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store, BadgeCheck, MapPin, Phone, Clock, RotateCcw, Truck, MessageCircle, UserPlus, UserCheck,
  Package, Copy, Check, ChevronRight, ChevronLeft, Flag, ShieldCheck, PenLine,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import VoucherTicket from '../components/vouchers/VoucherTicket';
import ProductCard from '../components/ui/ProductCard';
import CustomSelect from '../components/ui/CustomSelect';
import { useToast } from '../components/ui/Toast';
import { Stars, ShopReviewSummaryBlock, ShopReviewList, ShopReviewDialog, SeeAllShopReviews } from '../components/reviews/ShopReviewKit';
import { claimVoucherApi, getShopVouchersApi } from '../api/commerce';
import type { WalletVoucher } from '../api/commerce';
import { getMyShopReviewApi } from '../api/shopReviews';
import type { MyShopReview, ShopReviewSummary } from '../api/shopReviews';
import { apiErrorMessage } from '../utils/apiError';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { resolveShortLocation } from '../utils/psgc';
import { shopUrl, shopUrlLabel } from '../utils/shopLink';
import { getPublicShopProfileApi, getShopReviewsApi, getProductsApi, toggleStoreFollowApi } from '../api/client';
import type { PublicShopProfile, PublicShopReview, Product } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2) || 'SH').toUpperCase();
}

const joined = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '—');
const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

const RESPONSE_TIME_MAP: Record<string, string> = {
  within_1_hour: 'Within 1 hour',
  within_few_hours: 'Within a few hours',
  within_a_few_hours: 'Within a few hours',
  within_24_hours: 'Within 24 hours',
  within_1_day: 'Within 1 day',
  within_2_days: 'Within 2 days',
};
const responseTime = (val: string | null | undefined) =>
  !val ? null : RESPONSE_TIME_MAP[val] ?? val.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const EMPTY_SUMMARY: ShopReviewSummary = { count: 0, tag_counts: [], latest: [] };

type Tab = 'products' | 'reviews' | 'about';

// ─── Vouchers ─────────────────────────────────────────────────────────────────

/** The shop's claimable vouchers (B7). Code-only vouchers are never listed. */
function ShopVoucherStrip({ sellerId }: { sellerId: number }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<WalletVoucher[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    getShopVouchersApi(sellerId).then(setRows).catch(() => setRows([]));
  }, [sellerId, user?.id]);

  if (rows.length === 0) return null;

  const claim = async (v: WalletVoucher) => {
    if (!user) { navigate('/login'); return; }
    setBusy(v.id);
    try {
      const res = await claimVoucherApi({ voucher_id: v.id });
      setRows((prev) => prev.map((r) => (r.id === v.id ? { ...r, claimed: true } : r)));
      showToast(res.message, 'success');
    } catch (e) {
      showToast(apiErrorMessage(e, 'The voucher could not be claimed.'), 'error');
    } finally { setBusy(null); }
  };

  return (
    <section aria-label="Shop vouchers" className="mb-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-stone-500">Shop vouchers</h2>
      <div className="mt-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((v) => (
          <VoucherTicket key={v.id} voucher={v} busy={busy === v.id}
            action={v.used_up_by_you ? 'used' : v.claimed ? 'claimed' : 'claim'} onAction={() => claim(v)} />
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * A shop's storefront: the header (banner, logo, name, how it is rated), then Products, Reviews and About. Shop
 * reviews (about the shop itself) sit beside the product reviews; a buyer with a completed order can write one.
 */
export default function ShopProfilePage() {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const shopIdentifier = slug || id || '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openChatWithSeller, openChatWithSupport } = useChat();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (['products', 'reviews', 'about'] as const).find((t) => t === params.get('tab')) ?? 'products';
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'products') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });

  const [profile, setProfile] = useState<PublicShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [location, setLocation] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [storeCat, setStoreCat] = useState<number | null>(null);
  const [storeSub, setStoreSub] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<string>('newest');
  const [productPage, setProductPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [lastProductPage, setLastProductPage] = useState(1);

  // Product reviews
  const [reviews, setReviews] = useState<PublicShopReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewRatingFilter, setReviewRatingFilter] = useState<number | undefined>(undefined);
  const [reviewPage, setReviewPage] = useState(1);
  const [lastReviewPage, setLastReviewPage] = useState(1);

  // Shop reviews
  const [shopSummary, setShopSummary] = useState<ShopReviewSummary>(EMPTY_SUMMARY);
  const [mine, setMine] = useState<MyShopReview | null>(null);
  const [writing, setWriting] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!shopIdentifier) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getPublicShopProfileApi(shopIdentifier);
      setProfile(data);
      setIsFollowing(data.is_following);
      setFollowerCount(data.follower_count);
      setShopSummary(data.shop_reviews ?? EMPTY_SUMMARY);
      if (data.address_province || data.address_city) {
        resolveShortLocation(data.address_province, data.address_city).then((loc) => setLocation(loc || 'Philippines'));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [shopIdentifier]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  useEffect(() => {
    if (!profile || !user) { setMine(null); return; }
    getMyShopReviewApi(profile.shop_slug).then(setMine).catch(() => setMine(null));
  }, [profile, user]);

  const loadProducts = useCallback(async () => {
    if (!profile) return;
    setProductsLoading(true);
    try {
      const res = await getProductsApi({
        seller_ids: [profile.seller_id],
        category_id: selectedCategory === 'all' ? undefined : String(selectedCategory),
        store_category_id: storeSub ?? storeCat ?? undefined,
        sort: sortOption as 'newest',
        page: productPage,
        per_page: 12,
      });
      setProducts(res.data);
      setTotalProducts(res.meta.total);
      setLastProductPage(res.meta.last_page);
    } catch {
      // keep what is shown
    } finally {
      setProductsLoading(false);
    }
  }, [profile, selectedCategory, storeCat, storeSub, sortOption, productPage]);

  useEffect(() => { if (profile) void loadProducts(); }, [profile, loadProducts]);

  const loadReviews = useCallback(async () => {
    if (!profile) return;
    setReviewsLoading(true);
    try {
      const res = await getShopReviewsApi(profile.seller_id, { rating: reviewRatingFilter, page: reviewPage });
      setReviews(res.data);
      setLastReviewPage(res.meta.last_page);
    } catch {
      // keep what is shown
    } finally {
      setReviewsLoading(false);
    }
  }, [profile, reviewRatingFilter, reviewPage]);

  useEffect(() => { if (profile && tab === 'reviews') void loadReviews(); }, [profile, tab, loadReviews]);

  async function toggleFollow() {
    if (!profile) return;
    if (!user) { navigate('/login'); return; }
    setFollowLoading(true);
    try {
      const res = await toggleStoreFollowApi(profile.seller_id);
      setIsFollowing(res.following);
      setFollowerCount((c) => (res.following ? c + 1 : Math.max(0, c - 1)));
    } catch {
      // the button stays as it was
    } finally {
      setFollowLoading(false);
    }
  }

  function copyLink() {
    if (!profile) return;
    void navigator.clipboard?.writeText(shopUrl(profile.shop_slug)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // A report goes to Loved-IT Support in chat, where a person reads it.
  function report() {
    if (!profile) return;
    if (!user) { navigate('/login'); return; }
    void openChatWithSupport(undefined, `I want to report the shop "${profile.shop_name}" (${shopUrl(profile.shop_slug)}). Reason: `);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5]">
        <SiteHeader />
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 space-y-5">
          <div className="h-56 rounded-3xl bg-stone-200/60 animate-pulse" />
          <div className="h-10 w-1/2 rounded-xl bg-stone-200/60 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="aspect-square rounded-2xl bg-stone-200/60 animate-pulse" />)}</div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24">
          <Store className="w-10 h-10 text-stone-300" />
          <h1 className="mt-4 font-serif text-2xl font-bold text-[#1E1B18]">This shop is not available</h1>
          <p className="mt-2 max-w-sm text-sm text-stone-500">It may have changed its name, or it is closed for now.</p>
          <Link to="/search" className="mt-6 h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold flex items-center">Keep shopping</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const reply = responseTime(profile.response_time);
  const reviewCount = shopSummary.count + profile.total_reviews;
  const storeCats = profile.store_categories ?? [];
  const sortOptions = [
    { value: 'newest', label: 'Latest' },
    { value: 'best_selling', label: 'Best selling' },
    { value: 'price_asc', label: 'Price: low to high' },
    { value: 'price_desc', label: 'Price: high to low' },
  ];
  const activeCatName = storeCat !== null
    ? (storeCats.find((c) => c.id === storeCat)?.children?.find((c) => c.id === storeSub)?.name ?? storeCats.find((c) => c.id === storeCat)?.name)
    : selectedCategory !== 'all' ? profile.categories?.find((c) => c.category_id === selectedCategory)?.category_name : null;

  const stats: { label: string; value: React.ReactNode; onClick?: () => void }[] = [
    // Comments about the shop have no stars; the product reviews keep theirs.
    { label: 'Shop comments', value: shopSummary.count > 0 ? shopSummary.count.toLocaleString() : 'None yet', onClick: () => setTab('reviews') },
    { label: 'Product rating', value: profile.avg_rating != null ? `${profile.avg_rating.toFixed(1)} (${profile.total_reviews})` : 'No reviews yet', onClick: () => setTab('reviews') },
    { label: 'Followers', value: followerCount.toLocaleString() },
    { label: 'Products', value: profile.total_products.toLocaleString() },
    { label: 'Usually replies', value: reply ?? '—' },
    { label: 'On Loved-IT since', value: joined(profile.joined_date) },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF8F5]">
      <SiteHeader />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-8 pb-16">
        <nav className="flex items-center gap-1.5 py-4 text-[12px] text-stone-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-brand-red">Home</Link>
          <ChevronRight className="w-3 h-3 text-stone-300" />
          <span>Shops</span>
          <ChevronRight className="w-3 h-3 text-stone-300" />
          <span className="text-stone-800 truncate">{profile.shop_name}</span>
        </nav>

        {profile.on_vacation && (
          <p role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span><span className="font-semibold">{profile.shop_name} is on vacation.</span> You can browse and save items; ordering opens again when the shop is back.</span>
          </p>
        )}

        {/* Header: banner, then the shop's identity beside its actions, then how it is rated */}
        <section className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
          {/* A thin brand-red strip when the shop has no banner, so the page does not open on an empty block */}
          <div className={profile.banner_url ? 'h-32 sm:h-48 bg-[#EDE6DC]' : 'h-3 bg-brand-red'}>
            {profile.banner_url && <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0 flex-1">
              {profile.logo_url
                ? <img src={profile.logo_url} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-stone-200 bg-white shrink-0" />
                : <span className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#1E1B18] text-[#FAF8F5] font-serif text-2xl font-bold flex items-center justify-center shrink-0">{initials(profile.shop_name)}</span>}
              <div className="min-w-0">
                <h1 className="font-serif text-[26px] sm:text-[34px] font-bold tracking-tight leading-[1.1] text-[#1E1B18] break-words">{profile.shop_name}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-stone-500">
                  {profile.application_status === 'approved' && (
                    <span className="inline-flex items-center gap-1 font-semibold text-stone-800"><BadgeCheck className="w-4 h-4 text-brand-red" /> Verified shop</span>
                  )}
                  {profile.shop_category && <span>{profile.shop_category}</span>}
                  {location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{location}</span>}
                </p>
                {profile.shop_bio && <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-stone-600">{profile.shop_bio}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button type="button" onClick={toggleFollow} disabled={followLoading}
                className={`min-h-[42px] px-5 rounded-full text-[13.5px] font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60 ${isFollowing ? 'border border-stone-300 bg-white text-stone-800 hover:border-stone-900' : 'bg-brand-red text-white hover:bg-brand-red-dark'}`}>
                {isFollowing ? <><UserCheck className="w-4 h-4" /> Following</> : <><UserPlus className="w-4 h-4" /> Follow</>}
              </button>
              <button type="button" onClick={() => { if (!user) { navigate('/login'); return; } void openChatWithSeller(profile.seller_id); }}
                className="min-h-[42px] px-4 rounded-full border border-stone-300 bg-white text-[13.5px] font-semibold text-stone-800 hover:border-stone-900 inline-flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Chat
              </button>
              <button type="button" onClick={copyLink} title={copied ? 'Link copied' : 'Copy shop link'} aria-label="Copy shop link"
                className="w-[42px] h-[42px] rounded-full border border-stone-300 bg-white text-stone-600 hover:border-stone-900 hover:text-stone-900 flex items-center justify-center">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-t border-stone-100 [&>div]:border-stone-100 [&>div]:border-b lg:[&>div]:border-b-0 [&>div:not(:first-child)]:lg:border-l">
            {stats.map((s) => {
              const body = (
                <>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{s.label}</dt>
                  <dd className="mt-1 text-[14px] font-semibold text-stone-900 tabular-nums">{s.value}</dd>
                </>
              );
              return (
                <div key={s.label} className="min-w-0">
                  {s.onClick
                    ? <button type="button" onClick={s.onClick} className="w-full text-left px-5 py-4 hover:bg-stone-50 transition-colors">{body}</button>
                    : <div className="px-5 py-4">{body}</div>}
                </div>
              );
            })}
          </dl>
        </section>

        {/* Tabs */}
        <div className="mt-6 flex items-center gap-1 border-b border-stone-200" role="tablist" aria-label="Shop sections">
          {([['products', `Products (${profile.total_products})`], ['reviews', `Reviews (${reviewCount})`], ['about', 'About']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 py-3 -mb-px border-b-2 text-[14px] font-semibold transition-colors ${tab === key ? 'border-brand-red text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-900'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'products' && (
          <div className="mt-6 grid lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            {/* Categories: a list on a wide screen, chips on a phone */}
            <aside className="lg:sticky lg:top-[126px]">
              <p className="hidden lg:block text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400 mb-2">Categories</p>
              <ul className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
                <CatItem label="All products" count={profile.total_products} active={storeCat === null && selectedCategory === 'all'}
                  onClick={() => { setStoreCat(null); setStoreSub(null); setSelectedCategory('all'); setProductPage(1); }} />
                {storeCats.length > 0
                  ? storeCats.map((c) => (
                    <li key={c.id} className="shrink-0 lg:shrink">
                      <CatButton label={c.name} count={c.product_count} active={storeCat === c.id && storeSub === null}
                        onClick={() => { setStoreCat(c.id); setStoreSub(null); setSelectedCategory('all'); setProductPage(1); }} />
                      {storeCat === c.id && (c.children?.length ?? 0) > 0 && (
                        <ul className="hidden lg:block ml-3 pl-2 border-l border-stone-200 my-1">
                          {c.children!.map((sub) => (
                            <li key={sub.id}><CatButton small label={sub.name} count={sub.product_count} active={storeSub === sub.id} onClick={() => { setStoreSub(sub.id); setProductPage(1); }} /></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))
                  : (profile.categories ?? []).map((c) => (
                    <CatItem key={c.category_id} label={c.category_name} count={c.count} active={selectedCategory === c.category_id}
                      onClick={() => { setSelectedCategory(c.category_id); setStoreCat(null); setStoreSub(null); setProductPage(1); }} />
                  ))}
              </ul>
            </aside>

            <div className="min-w-0">
              <ShopVoucherStrip sellerId={profile.seller_id} />
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-serif text-[22px] font-bold tracking-tight text-[#1E1B18]">{activeCatName ?? 'All products'}</h2>
                  <p className="text-[12.5px] text-stone-500 tabular-nums">{totalProducts.toLocaleString()} item{totalProducts === 1 ? '' : 's'}</p>
                </div>
                <div className="w-48"><CustomSelect value={sortOption} onChange={(v) => { setSortOption(v); setProductPage(1); }} options={sortOptions} /></div>
              </div>

              {productsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-stone-200/60 animate-pulse" />)}</div>
              ) : products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
                  <Package className="w-8 h-8 mx-auto text-stone-300" />
                  <p className="mt-3 text-[14px] font-semibold text-stone-700">Nothing here yet</p>
                  <p className="mt-1 text-[12.5px] text-stone-500">Try another category or All products.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
                  {products.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              )}

              <Pager page={productPage} last={lastProductPage} onPage={setProductPage} />
            </div>
          </div>
        )}

        {tab === 'reviews' && (
          <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
            {/* Comments about the shop itself (no stars) */}
            <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-[22px] font-bold tracking-tight text-[#1E1B18]">Comments about the shop</h2>
                  <p className="text-[12.5px] text-stone-500">Shipping, packing and how the seller answers, from buyers with a completed order.</p>
                </div>
                <ReviewAction mine={mine} signedIn={!!user} onWrite={() => setWriting(true)} onSignIn={() => navigate(`/login?next=${encodeURIComponent(`/shop/${profile.shop_slug}?tab=reviews`)}`)} />
              </div>
              <div className="mt-6"><ShopReviewSummaryBlock summary={shopSummary} /></div>
              <div className="mt-6 pt-5 border-t border-stone-100">
                <ShopReviewList reviews={shopSummary.latest} shopName={profile.shop_name} emptyText="No one has commented on the shop yet. Buyers can comment once an order from it is completed." />
              </div>
              {shopSummary.count > shopSummary.latest.length && <div className="mt-5"><SeeAllShopReviews slug={profile.shop_slug} count={shopSummary.count} /></div>}
            </section>

            {/* Reviews of its products */}
            <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-[22px] font-bold tracking-tight text-[#1E1B18]">Product reviews</h2>
                <p className="inline-flex items-center gap-1.5 text-[13px] text-stone-600">
                  <Stars value={profile.avg_rating ?? 0} size="xs" />
                  <span className="font-semibold text-stone-900 tabular-nums">{profile.avg_rating != null ? profile.avg_rating.toFixed(1) : '–'}</span>
                  <span className="text-stone-400">({profile.total_reviews})</span>
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {[undefined, 5, 4, 3, 2, 1].map((s) => {
                  const on = reviewRatingFilter === s;
                  const n = s === undefined ? profile.total_reviews : profile.rating_breakdown?.[s] ?? 0;
                  return (
                    <button key={s ?? 'all'} type="button" aria-pressed={on} onClick={() => { setReviewRatingFilter(s); setReviewPage(1); }}
                      className={`px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition-colors ${on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}`}>
                      {s === undefined ? 'All' : `${s} star${s === 1 ? '' : 's'}`} <span className={on ? 'text-white/70' : 'text-stone-400'}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5">
                {reviewsLoading ? (
                  <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-stone-100 animate-pulse" />)}</div>
                ) : reviews.length === 0 ? (
                  <p className="py-6 text-[13px] text-stone-500">No product reviews {reviewRatingFilter ? 'with this rating' : 'yet'}.</p>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {reviews.map((r) => (
                      <article key={r.id} className="py-5 first:pt-0">
                        <div className="flex items-start gap-3">
                          {r.buyer.avatar_url
                            ? <img src={r.buyer.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                            : <span className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 text-[13px] font-semibold flex items-center justify-center shrink-0">{initials(r.buyer.name).slice(0, 1)}</span>}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold text-stone-900">{r.buyer.name}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-stone-500"><Stars value={r.rating} size="xs" />{shortDate(r.created_at)}</p>
                          </div>
                        </div>
                        {r.comment && <p className="mt-2.5 text-[13.5px] leading-relaxed text-stone-700">{r.comment}</p>}
                        {r.product && (
                          <Link to={`/products/${r.product.id}`} className="mt-2.5 inline-flex items-center gap-2 max-w-full px-2 py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-[12px] text-stone-600">
                            {r.product.thumbnail_url && <img src={r.product.thumbnail_url} alt="" className="w-6 h-6 rounded object-cover" />}
                            <span className="truncate">{r.product.name}</span>
                          </Link>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <Pager page={reviewPage} last={lastReviewPage} onPage={setReviewPage} />
            </section>
          </div>
        )}

        {tab === 'about' && (
          <div className="mt-6 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-start">
            <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-7">
              <h2 className="font-serif text-[22px] font-bold tracking-tight text-[#1E1B18]">About {profile.shop_name}</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-stone-700 whitespace-pre-line">{profile.shop_description || 'The shop has not written about itself yet.'}</p>

              <h3 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.1em] text-stone-500">Returns and shipping</h3>
              <ul className="mt-3 divide-y divide-stone-100">
                <AboutRow icon={ShieldCheck} title="7-day returns on Loved-IT"
                  text="Return an eligible item within 7 days of delivery if it is damaged or not as described. Loved-IT steps in if you and the shop cannot agree. Perishable food and made-to-order items are excluded." />
                {profile.return_policy && <AboutRow icon={RotateCcw} title="The shop's return terms" text={profile.return_policy} />}
                <AboutRow icon={Truck} title="Shipping" text={profile.shipping_policy || 'The shop has not added shipping notes. The delivery fee and courier are shown at checkout.'} />
              </ul>
            </section>

            <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-7">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-stone-500">Hours and contact</h3>
              <dl className="mt-3 space-y-3 text-[13.5px]">
                <InfoRow icon={Clock} label="Hours" value={profile.business_hours || 'Not listed'} />
                <InfoRow icon={MessageCircle} label="Usually replies" value={reply ?? 'Not listed'} />
                <InfoRow icon={MapPin} label="Ships from" value={location || 'Philippines'} />
                {profile.shop_contact_number && <InfoRow icon={Phone} label="Phone" value={profile.shop_contact_number} />}
              </dl>

              <h3 className="mt-7 text-[13px] font-semibold uppercase tracking-[0.1em] text-stone-500">Shop link</h3>
              <div className="mt-2.5 flex items-center rounded-xl border border-stone-200 bg-stone-50 text-[12.5px] font-mono">
                <a href={shopUrl(profile.shop_slug)} className="flex-1 min-w-0 px-3 py-2 truncate text-stone-700 hover:text-brand-red">{shopUrlLabel(profile.shop_slug)}</a>
                <button type="button" onClick={copyLink} aria-label="Copy shop link" className="px-3 self-stretch border-l border-stone-200 hover:bg-stone-100">
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-400" />}
                </button>
              </div>

              <button type="button" onClick={report} className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-stone-500 hover:text-brand-red">
                <Flag className="w-3.5 h-3.5" /> Report this shop to Loved-IT
              </button>
            </section>
          </div>
        )}
      </main>

      {mine && (
        <ShopReviewDialog open={writing} onClose={() => setWriting(false)} shop={profile.shop_slug} shopName={profile.shop_name} mine={mine}
          onSaved={(review, editsLeft) => {
            setMine({ ...mine, review, edits_left_today: editsLeft });
            void loadProfile();
          }} />
      )}

      <Footer />
    </div>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function CatButton({ label, count, active, onClick, small = false }: { label: string; count: number; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`w-full flex items-center justify-between gap-3 whitespace-nowrap lg:whitespace-normal text-left rounded-full lg:rounded-lg border lg:border-0 px-3.5 lg:px-3 ${small ? 'py-1.5 text-[12.5px]' : 'py-1.5 lg:py-2 text-[13px]'} transition-colors ${active ? 'border-stone-900 bg-stone-900 text-white lg:bg-white lg:text-stone-900 lg:font-semibold lg:shadow-[inset_2px_0_0_#B91C1C]' : 'border-stone-300 bg-white lg:bg-transparent text-stone-600 hover:text-stone-900 lg:hover:bg-white'}`}>
      <span className="min-w-0 lg:truncate">{label}</span>
      <span className={`text-[11.5px] tabular-nums ${active ? 'text-white/70 lg:text-stone-400' : 'text-stone-400'}`}>{count}</span>
    </button>
  );
}

function CatItem(props: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <li className="shrink-0 lg:shrink"><CatButton {...props} /></li>;
}

function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null;
  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Previous page"
        className="w-9 h-9 rounded-full border border-stone-300 bg-white flex items-center justify-center text-stone-600 hover:border-stone-900 disabled:opacity-40">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-[13px] text-stone-600 tabular-nums">Page {page} of {last}</span>
      <button type="button" onClick={() => onPage(Math.min(last, page + 1))} disabled={page === last} aria-label="Next page"
        className="w-9 h-9 rounded-full border border-stone-300 bg-white flex items-center justify-center text-stone-600 hover:border-stone-900 disabled:opacity-40">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Write, edit, sign in, or why the buyer cannot comment yet. */
function ReviewAction({ mine, signedIn, onWrite, onSignIn }: { mine: MyShopReview | null; signedIn: boolean; onWrite: () => void; onSignIn: () => void }) {
  const btn = 'min-h-10 px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors';
  if (!signedIn) return <button type="button" onClick={onSignIn} className={`${btn} border border-stone-300 bg-white text-stone-800 hover:border-stone-900`}>Sign in to comment</button>;
  if (!mine) return null;
  if (mine.review) return <button type="button" onClick={onWrite} className={`${btn} border border-stone-300 bg-white text-stone-800 hover:border-stone-900`}><PenLine className="w-4 h-4" /> Edit your comment</button>;
  if (mine.can_review) return <button type="button" onClick={onWrite} className={`${btn} bg-brand-red text-white hover:bg-brand-red-dark`}><PenLine className="w-4 h-4" /> Comment on this shop</button>;
  return <p className="max-w-[220px] text-[12px] leading-snug text-stone-500 sm:text-right">{mine.reason}</p>;
}

function AboutRow({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-stone-400" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-stone-900">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600 whitespace-pre-line">{text}</p>
      </div>
    </li>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" strokeWidth={1.75} />
      <dt className="w-28 shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 text-stone-900 break-words">{value}</dd>
    </div>
  );
}
