import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, CheckCircle2, ShieldCheck, Shield, MapPin, Phone, Clock,
  RotateCcw, Truck, MessageCircle, UserPlus, UserCheck,
  Star, Package, Users, Copy, Check, X,
  ChevronRight, Flag, ChevronLeft,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import ProductCard from '../components/ui/ProductCard';
import CustomSelect from '../components/ui/CustomSelect';
import Button from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { resolveShortLocation } from '../utils/psgc';
import {
  getPublicShopProfileApi,
  getShopReviewsApi,
  getProductsApi,
  toggleStoreFollowApi,
} from '../api/client';
import type {
  PublicShopProfile,
  PublicShopReview,
  Product,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || 'SH').toUpperCase();
}

function formatJoinDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

function formatReviewDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

const RESPONSE_TIME_MAP: Record<string, string> = {
  within_1_hour: 'Within 1 hour',
  within_few_hours: 'Within a few hours',
  within_a_few_hours: 'Within a few hours',
  within_24_hours: 'Within 24 hours',
  within_1_day: 'Within 1 day',
  within_2_days: 'Within 2 days',
};

function formatResponseTime(val: string | null | undefined): string {
  if (!val) return 'Within a few hours';
  if (RESPONSE_TIME_MAP[val]) return RESPONSE_TIME_MAP[val];
  return val
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${cls} ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
        />
      ))}
    </div>
  );
}

// ─── Report Shop Modal ────────────────────────────────────────────────────────

function ReportShopModal({
  shopName,
  isOpen,
  onClose,
}: {
  shopName: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('Inappropriate or misleading content');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reasons = [
    'Inappropriate or misleading content',
    'Counterfeit or illegal items',
    'Suspicious or fraudulent seller activity',
    'Non-responsive or abusive behavior',
    'Other policy violation',
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2000);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative z-10 w-full max-w-md p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl"
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-brand-red">
                <Flag className="w-5 h-5" />
                <h3 className="text-base font-bold text-gray-900">Report {shopName}</h3>
              </div>
              <button onClick={onClose} className="p-1 text-gray-400 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <p className="text-base font-bold text-gray-900">Report Submitted</p>
                <p className="text-xs text-gray-500">Thank you. Our moderation team will investigate this shop.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Reason for Report
                  </label>
                  <div className="flex flex-col gap-2">
                    {reasons.map((r) => (
                      <label
                        key={r}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          reason === r
                            ? 'border-brand-red bg-red-50/50 font-semibold text-gray-900'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="reportReason"
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          className="w-4 h-4 accent-brand-red"
                        />
                        <span>{r}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                    Additional Details (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Provide any additional context or proof..."
                    className="w-full p-3 text-xs border border-gray-200 outline-none rounded-xl focus:border-brand-red focus:ring-1 focus:ring-brand-red"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <Button type="submit" className="flex-1 py-2.5 text-xs font-semibold">
                    Submit Report
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Shop Profile Page ───────────────────────────────────────────────────

export default function ShopProfilePage() {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const shopIdentifier = slug || id || '';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openChatWithSeller } = useChat();

  // Shop state
  const [profile, setProfile] = useState<PublicShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Address resolution
  const [resolvedLocation, setResolvedLocation] = useState<string>('');

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // Copy URL state
  const [copied, setCopied] = useState(false);

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('newest');
  const [productPage, setProductPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [lastProductPage, setLastProductPage] = useState(1);

  // Reviews state
  const [reviews, setReviews] = useState<PublicShopReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewRatingFilter, setReviewRatingFilter] = useState<number | undefined>(undefined);
  const [reviewPage, setReviewPage] = useState(1);
  const [, setTotalReviews] = useState(0);
  const [lastReviewPage, setLastReviewPage] = useState(1);

  // Load shop profile
  const loadProfile = useCallback(async () => {
    if (!shopIdentifier) return;
    setLoading(true);
    setError(false);
    try {
      const data = await getPublicShopProfileApi(shopIdentifier);
      setProfile(data);
      setIsFollowing(data.is_following);
      setFollowerCount(data.follower_count);

      // Resolve address to City, Province words
      if (data.address_province || data.address_city) {
        resolveShortLocation(data.address_province, data.address_city)
          .then((loc) => setResolvedLocation(loc || 'Philippines'));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [shopIdentifier]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load products for this seller
  const loadProducts = useCallback(async () => {
    if (!profile) return;
    setProductsLoading(true);
    try {
      const res = await getProductsApi({
        seller_ids: [profile.seller_id],
        category_id: selectedCategory === 'all' ? undefined : String(selectedCategory),
        sort: sortOption as any,
        page: productPage,
        per_page: 12,
      });
      setProducts(res.data);
      setTotalProducts(res.meta.total);
      setLastProductPage(res.meta.last_page);
    } catch {
      // ignore
    } finally {
      setProductsLoading(false);
    }
  }, [profile, selectedCategory, sortOption, productPage]);

  useEffect(() => {
    if (profile) {
      loadProducts();
    }
  }, [profile, loadProducts]);

  // Load reviews for this seller
  const loadReviews = useCallback(async () => {
    if (!profile) return;
    setReviewsLoading(true);
    try {
      const res = await getShopReviewsApi(profile.seller_id, {
        rating: reviewRatingFilter,
        page: reviewPage,
      });
      setReviews(res.data);
      setTotalReviews(res.meta.total);
      setLastReviewPage(res.meta.last_page);
    } catch {
      // ignore
    } finally {
      setReviewsLoading(false);
    }
  }, [profile, reviewRatingFilter, reviewPage]);

  useEffect(() => {
    if (profile) {
      loadReviews();
    }
  }, [profile, loadReviews]);

  // Follow toggle handler
  async function handleToggleFollow() {
    if (!profile) return;
    if (!user) {
      navigate('/login');
      return;
    }
    setFollowLoading(true);
    try {
      const res = await toggleStoreFollowApi(profile.seller_id);
      setIsFollowing(res.following);
      setFollowerCount((c) => (res.following ? c + 1 : Math.max(0, c - 1)));
    } catch {
      // optimistic fallback
    } finally {
      setFollowLoading(false);
    }
  }

  // Copy slug URL handler
  function handleCopyUrl() {
    if (!profile) return;
    const url = `${window.location.origin}/shop/${profile.shop_slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-gray-soft">
        <SiteHeader />
        <div className="flex flex-col gap-6 px-4 py-8 mx-auto max-w-7xl">
          <div className="h-64 bg-gray-200 rounded-3xl animate-pulse" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="bg-gray-200 h-96 rounded-2xl animate-pulse" />
            <div className="bg-gray-200 lg:col-span-2 h-96 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-brand-gray-soft">
        <SiteHeader />
        <div className="px-4 py-32 mx-auto text-center max-w-7xl">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 text-brand-red">
            <Store className="w-8 h-8" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Shop Not Found</h2>
          <p className="max-w-sm mx-auto mb-6 text-sm text-gray-500">
            The shop you are looking for does not exist or is currently unavailable.
          </p>
          <Link to="/">
            <Button>Return to Home</Button>
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const sortOptions = [
    { value: 'newest', label: 'Latest' },
    { value: 'best_selling', label: 'Best Selling' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-brand-gray-soft">
      <SiteHeader />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="flex items-center h-12 gap-2 px-4 mx-auto text-sm max-w-7xl">
          <Link to="/" className="text-gray-500 transition-colors hover:text-brand-red">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          <span className="text-gray-500">Shops</span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          <span className="font-semibold text-gray-800 truncate">{profile.shop_name}</span>
        </div>
      </div>

      <main className="flex flex-col flex-1 w-full gap-6 px-4 py-6 mx-auto max-w-7xl">

        {/* ── 1. Header Card (Banner + Pinned Overlapping Avatar + Unobstructed Identity Block) ── */}
        <div className="overflow-hidden bg-white border border-gray-100 shadow-sm rounded-3xl">
          {/* Banner Container with Pinned Avatar */}
          <div className="relative w-full h-48 sm:h-64 bg-gradient-to-r from-gray-800 via-gray-900 to-black">
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt={profile.shop_name}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-gradient-to-r from-rose-950 via-zinc-900 to-neutral-900">
                <Store className="w-20 h-20 text-white/10" />
              </div>
            )}

            {/* Pinned Avatar (half overlapping banner bottom, z-index 10) */}
            <div className="absolute z-10 flex items-center justify-center overflow-hidden bg-white border-4 border-white rounded-full shadow-xl -bottom-12 left-6 sm:left-8 w-28 h-28 sm:w-32 sm:h-32">
              {profile.logo_url ? (
                <img
                  src={profile.logo_url}
                  alt={profile.shop_name}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-2xl font-black text-white bg-gradient-to-br from-brand-red to-brand-red-dark sm:text-3xl">
                  {initials(profile.shop_name)}
                </div>
              )}
            </div>
          </div>

          {/* Identity block (pt-16 ensures name/details are never covered) */}
          <div className="px-6 pt-16 pb-6 sm:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              {/* Shop Title & Badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl font-black leading-tight text-gray-900 sm:text-3xl">
                    {profile.shop_name}
                  </h1>
                  {profile.application_status === 'approved' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Verified Seller
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active Now
                  </span>
                </div>
                {profile.shop_category && (
                  <p className="mt-1 text-xs font-bold tracking-wide text-gray-400 uppercase">
                    {profile.shop_category}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                <button
                  onClick={handleToggleFollow}
                  disabled={followLoading}
                  className={`min-h-[42px] px-5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-xs ${
                    isFollowing
                      ? 'bg-gray-100 hover:bg-red-50 hover:text-brand-red hover:border-brand-red border border-gray-200 text-gray-700'
                      : 'bg-brand-red hover:bg-brand-red-dark text-white shadow-brand-red/20'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4 text-brand-red" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Follow</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      navigate('/login');
                      return;
                    }
                    openChatWithSeller(profile.seller_id);
                  }}
                  className="min-h-[42px] px-4 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm flex items-center gap-2 hover:border-brand-red hover:text-brand-red transition-colors bg-white shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Chat</span>
                </button>

                <button
                  onClick={() => setReportOpen(true)}
                  className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                  title="Report this shop"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Shop Bio */}
            {profile.shop_bio && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                {profile.shop_bio}
              </p>
            )}

            {/* Store Link with Copy Button */}
            <div className="mt-4 pt-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">Store link:</span>
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 font-mono font-medium transition-colors"
                >
                  <span>loved-it.com/shop/{profile.shop_slug}</span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Stats Row (Neutral Gray Icons, Amber Star) ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {/* Rating */}
          <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Rating</p>
              <p className="text-base font-black text-gray-900">
                {profile.avg_rating != null ? profile.avg_rating.toFixed(1) : 'New'}
                <span className="ml-1 text-xs font-normal text-gray-400">({profile.total_reviews})</span>
              </p>
            </div>
          </div>

          {/* Followers */}
          <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center justify-center w-10 h-10 text-gray-500 bg-gray-100 rounded-xl shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Followers</p>
              <p className="text-base font-black text-gray-900">{followerCount.toLocaleString()}</p>
            </div>
          </div>

          {/* Products */}
          <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center justify-center w-10 h-10 text-gray-500 bg-gray-100 rounded-xl shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Products</p>
              <p className="text-base font-black text-gray-900">{profile.total_products}</p>
            </div>
          </div>

          {/* Response Time */}
          <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
            <div className="flex items-center justify-center w-10 h-10 text-gray-500 bg-gray-100 rounded-xl shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Response</p>
              <p className="text-sm font-black text-gray-900 truncate">
                {formatResponseTime(profile.response_time)}
              </p>
            </div>
          </div>

          {/* Member Since */}
          <div className="flex items-center col-span-2 gap-3 p-4 bg-white border border-gray-100 shadow-sm rounded-2xl sm:col-span-1">
            <div className="flex items-center justify-center w-10 h-10 text-gray-500 bg-gray-100 rounded-xl shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Member Since</p>
              <p className="text-sm font-black text-gray-900">{formatJoinDate(profile.joined_date)}</p>
            </div>
          </div>
        </div>

        {/* ── Main Two-Column Balanced Content (35% Left / 65% Right) ── */}
        <div className="grid items-start grid-cols-1 gap-6 lg:grid-cols-12">

          {/* ── Left Column: Shop Info, Policies, Contact ── */}
          <div className="flex flex-col gap-5 lg:col-span-4">

            {/* 3. About Section */}
            <div className="flex flex-col gap-3 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
                <Store className="w-4 h-4 text-brand-red" /> About the Shop
              </h2>
              <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-line">
                {profile.shop_description || 'No detailed description provided by this seller yet.'}
              </p>
            </div>

            {/* 4. Shop Policies (Hybrid Model) */}
            <div className="flex flex-col gap-3.5 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
                <ShieldCheck className="w-4 h-4 text-brand-red" /> Policies &amp; Guarantees
              </h2>

              {/* Platform Guaranteed Policy Badge */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-rose-50/60 border border-brand-red/20">
                <Shield className="w-4 h-4 text-brand-red mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-900">Loved-IT 7-Day Guaranteed Return</p>
                    <span className="text-[9px] font-bold bg-brand-red text-white px-2 py-0.5 rounded-full">Platform Policy</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                    Standard 7-day return window upon delivery for eligible items in original condition. Protected by Loved-IT Dispute Mediation. (Perishable foods &amp; custom items excluded).
                  </p>
                </div>
              </div>

              {/* Seller Additional Return Terms */}
              {profile.return_policy && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                  <RotateCcw className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800">Additional Store Return Terms</p>
                    <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                      {profile.return_policy}
                    </p>
                  </div>
                </div>
              )}

              {/* Shipping Policy */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <Truck className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800">Shipping Details</p>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                    {profile.shipping_policy || 'Orders are processed within 24–48 business hours with verified courier partners.'}
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Business Hours & Response Time (Formatted without underscores) */}
            <div className="flex flex-col gap-3 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
                <Clock className="w-4 h-4 text-brand-red" /> Business Hours
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">Operating Hours:</span>
                  <span className="font-semibold text-gray-800">{profile.business_hours || 'Mon – Sat: 9:00 AM – 6:00 PM'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Average Response:</span>
                  <span className="font-semibold text-gray-800">{formatResponseTime(profile.response_time)}</span>
                </div>
              </div>
            </div>

            {/* 6. Contact & Location (City/Province words only for privacy) */}
            <div className="flex flex-col gap-3 p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
                <MapPin className="w-4 h-4 text-brand-red" /> Contact &amp; Location
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2.5 text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{resolvedLocation || 'Philippines'}</span>
                </div>
                {profile.shop_contact_number && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{profile.shop_contact_number}</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Right Column: Shop Products & Shop Reviews ── */}
          <div className="flex flex-col gap-6 lg:col-span-8">

            {/* ── 7. Shop Products Section ── */}
            <div className="flex flex-col gap-5 p-6 bg-white border border-gray-100 shadow-sm rounded-3xl">
              {/* Section Header */}
              <div className="flex flex-col justify-between gap-4 pb-4 border-b border-gray-100 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Shop Products</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{totalProducts} active items in store</p>
                </div>

                {/* Sort Dropdown */}
                <div className="w-48 shrink-0">
                  <CustomSelect
                    value={sortOption}
                    onChange={(v) => { setSortOption(v); setProductPage(1); }}
                    options={sortOptions}
                  />
                </div>
              </div>

              {/* Category Filter Tabs */}
              {profile.categories && profile.categories.length > 0 && (
                <div className="flex items-center gap-2 pb-1 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => { setSelectedCategory('all'); setProductPage(1); }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                      selectedCategory === 'all'
                        ? 'bg-brand-red text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All Products ({profile.total_products})
                  </button>
                  {profile.categories.map((cat) => {
                    const active = selectedCategory === cat.category_id;
                    return (
                      <button
                        key={cat.category_id}
                        onClick={() => { setSelectedCategory(cat.category_id); setProductPage(1); }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                          active
                            ? 'bg-brand-red text-white shadow-xs'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {cat.category_name} ({cat.count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Products Grid */}
              {productsLoading ? (
                <div className="grid grid-cols-2 gap-4 py-8 sm:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-gray-100 aspect-square rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Package className="w-12 h-12 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No active products found in this category</p>
                  <p className="text-xs text-gray-400">Select "All Products" to browse all available items.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}

              {/* Product Pagination */}
              {lastProductPage > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                    disabled={productPage === 1}
                    className="p-2 text-gray-500 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 text-xs font-semibold text-gray-600">
                    Page {productPage} of {lastProductPage}
                  </span>
                  <button
                    onClick={() => setProductPage((p) => Math.min(lastProductPage, p + 1))}
                    disabled={productPage === lastProductPage}
                    className="p-2 text-gray-500 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* ── 8. Shop Reviews Section ── */}
            <div className="flex flex-col gap-5 p-6 bg-white border border-gray-100 shadow-sm rounded-3xl">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Shop Reviews</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Feedback from verified buyers</p>
                </div>
                <div className="flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-black text-amber-800">
                    {profile.avg_rating != null ? profile.avg_rating.toFixed(1) : 'New'}
                  </span>
                  <span className="text-xs font-medium text-amber-600">/ 5.0</span>
                </div>
              </div>

              {/* Rating Breakdown Bar Chart */}
              {profile.rating_breakdown && (
                <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = profile.rating_breakdown?.[stars] ?? 0;
                    const pct = profile.total_reviews > 0 ? (count / profile.total_reviews) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-3 text-xs">
                        <div className="flex items-center w-12 gap-1 font-semibold text-gray-600 shrink-0">
                          <span>{stars}</span>
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        </div>
                        <div className="flex-1 h-2 overflow-hidden bg-gray-200 rounded-full">
                          <div
                            className="h-full transition-all duration-300 rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-gray-400 font-medium text-[11px] shrink-0">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Star Rating Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { setReviewRatingFilter(undefined); setReviewPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    reviewRatingFilter === undefined
                      ? 'bg-brand-red text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({profile.total_reviews})
                </button>
                {[5, 4, 3, 2, 1].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setReviewRatingFilter(s); setReviewPage(1); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                      reviewRatingFilter === s
                        ? 'bg-brand-red text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{s}</span>
                    <Star className="w-3 h-3 fill-current" />
                  </button>
                ))}
              </div>

              {/* Reviews List */}
              {reviewsLoading ? (
                <div className="flex flex-col gap-4 py-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-10 text-xs text-center text-gray-400">
                  No reviews found for this filter.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="p-4 rounded-2xl border border-gray-100 bg-white flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center w-8 h-8 overflow-hidden text-xs font-bold text-gray-700 bg-gray-100 rounded-full shrink-0">
                            {r.buyer.avatar_url ? (
                              <img src={r.buyer.avatar_url} alt={r.buyer.name} className="object-cover w-full h-full" />
                            ) : (
                              initials(r.buyer.name)
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-gray-900">{r.buyer.name}</span>
                              {r.verified_purchase && (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-semibold border border-emerald-100">
                                  Verified Purchase
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-400">{formatReviewDate(r.created_at)}</span>
                          </div>
                        </div>
                        <StarRow rating={r.rating} />
                      </div>

                      {/* Comment */}
                      {r.comment && (
                        <p className="text-xs leading-relaxed text-gray-700">{r.comment}</p>
                      )}

                      {/* Purchased product thumbnail link */}
                      {r.product && (
                        <Link
                          to={`/products/${r.product.id}`}
                          className="self-start flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-100 mt-1"
                        >
                          {r.product.thumbnail_url && (
                            <img
                              src={r.product.thumbnail_url}
                              alt={r.product.name}
                              className="object-cover w-5 h-5 rounded"
                            />
                          )}
                          <span className="text-[11px] text-gray-500 font-medium truncate max-w-[200px]">
                            {r.product.name}
                          </span>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Reviews Pagination */}
              {lastReviewPage > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setReviewPage((p) => Math.max(1, p - 1))}
                    disabled={reviewPage === 1}
                    className="p-2 text-gray-500 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 text-xs font-semibold text-gray-600">
                    Page {reviewPage} of {lastReviewPage}
                  </span>
                  <button
                    onClick={() => setReviewPage((p) => Math.min(lastReviewPage, p + 1))}
                    disabled={reviewPage === lastReviewPage}
                    className="p-2 text-gray-500 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

          </div>

        </div>

      </main>

      {/* Report Modal */}
      <ReportShopModal
        shopName={profile.shop_name}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {/* ── 9. Global Site Footer ── */}
      <SiteFooter />
    </div>
  );
}

// ─── Site Footer Component ───────────────────────────────────────────────────

function SiteFooter() {
  return <Footer />;
}
