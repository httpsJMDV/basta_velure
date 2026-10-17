<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The admin Reviews page. Reviews are honest feedback from buyers, so the admin can read them and nothing else:
 * there is no approve, hide or delete. What the admin watches is each SHOP's reviews (a shop's reviews are the
 * reviews of its products), so the page lists shops first and opens one shop's reviews on request.
 * See docs/api/admin-orders-reviews.md.
 */
class AdminReviewController extends Controller
{
    private const SHOP_SORTS = ['reviews', 'rating', 'recent', 'name'];

    /**
     * GET /api/v1/admin/reviews/shops
     *
     * Every approved shop with its review figures, including shops with no reviews yet.
     * Filters (optional): search (shop name, owner name or email), sort (reviews, rating, recent, name),
     * direction (asc, desc), per_page (1 to 100, default 20).
     */
    public function shops(Request $request): JsonResponse
    {
        $request->validate([
            'search'    => ['nullable', 'string', 'max:100'],
            'sort'      => ['nullable', 'in:' . implode(',', self::SHOP_SORTS)],
            'direction' => ['nullable', 'in:asc,desc'],
            'per_page'  => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $like = $request->filled('search') ? '%' . addcslashes((string) $request->search, '\\%_') . '%' : null;
        $sort = $request->input('sort', 'reviews');
        $direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

        // One row per seller: how many reviews their products have, the average, and the latest.
        $stats = DB::table('reviews as r')
            ->join('products as p', 'p.id', '=', 'r.product_id')
            ->whereNull('r.deleted_at')
            ->groupBy('p.seller_id')
            ->selectRaw('p.seller_id, COUNT(*) as review_count, AVG(r.rating) as average_rating, MAX(r.created_at) as last_review_at');

        $shops = SellerProfile::query()
            ->where('seller_profiles.application_status', 'approved')
            ->join('users', 'users.id', '=', 'seller_profiles.user_id')
            ->leftJoinSub($stats, 's', 's.seller_id', '=', 'seller_profiles.user_id')
            ->when($like, fn ($q) => $q->where(function ($w) use ($like) {
                $w->where('seller_profiles.shop_name', 'like', $like)
                    ->orWhere('users.first_name', 'like', $like)
                    ->orWhere('users.last_name', 'like', $like)
                    ->orWhere('users.email', 'like', $like);
            }))
            ->select('seller_profiles.*', 'users.first_name', 'users.last_name', 'users.avatar_path as owner_avatar_path', 's.review_count', 's.average_rating', 's.last_review_at')
            ->when($sort === 'name', fn ($q) => $q->orderBy('seller_profiles.shop_name', $direction))
            ->when($sort === 'rating', fn ($q) => $q->orderByRaw("s.average_rating IS NULL")->orderBy('s.average_rating', $direction))
            ->when($sort === 'recent', fn ($q) => $q->orderByRaw("s.last_review_at IS NULL")->orderBy('s.last_review_at', $direction))
            ->when($sort === 'reviews', fn ($q) => $q->orderByRaw('COALESCE(s.review_count, 0) ' . $direction))
            ->orderBy('seller_profiles.shop_name')
            ->paginate((int) ($request->per_page ?? 20));

        return response()->json([
            'data' => $shops->map(fn ($p) => $this->formatShop($p, (int) ($p->review_count ?? 0), $p->average_rating, $p->last_review_at, $p->first_name, $p->last_name, $p->owner_avatar_path)),
            'meta' => $this->meta($shops),
        ]);
    }

    /**
     * GET /api/v1/admin/reviews/shops/{seller}: one shop's header, with its review figures and rating distribution.
     */
    public function shop(User $seller): JsonResponse
    {
        $profile = SellerProfile::where('user_id', $seller->id)->where('application_status', 'approved')->first();
        abort_unless($profile, 404, 'Shop not found.');

        $reviews = $this->shopReviews($seller->id);
        $figures = $this->figures($reviews);

        return response()->json([
            'data' => $this->formatShop($profile, $figures['total'], $figures['average_rating'], (clone $reviews)->max('reviews.created_at'), $seller->first_name, $seller->last_name, $seller->avatar_path)
                + ['rating_distribution' => $figures['rating_distribution']],
        ]);
    }

    /**
     * GET /api/v1/admin/reviews
     *
     * Filters (all optional): shop_id (the seller's user id), rating (1 to 5), search (buyer name or email, comment,
     * product name), per_page (1 to 100, default 20). Newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'shop_id'  => ['nullable', 'integer'],
            'rating'   => ['nullable', 'integer', 'between:1,5'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'search'   => ['nullable', 'string', 'max:100'],
        ]);

        $like = $request->filled('search') ? '%' . addcslashes((string) $request->search, '\\%_') . '%' : null;

        $reviews = Review::with(['buyer', 'order:id,order_number', 'product.seller.sellerProfile', 'product.images', 'images'])
            ->when($request->shop_id, fn ($q, $shopId) => $q->whereHas('product', fn ($p) => $p->where('seller_id', (int) $shopId)))
            ->when($request->rating, fn ($q) => $q->where('rating', (int) $request->rating))
            ->when($like, fn ($q) => $q->where(function ($w) use ($like) {
                $w->where('comment', 'like', $like)
                    ->orWhereHas('buyer', fn ($b) => $b
                        ->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like))
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $like));
            }))
            ->latest()
            ->latest('id')
            ->paginate((int) ($request->per_page ?? 20));

        return response()->json([
            'data' => $reviews->map(fn ($r) => $this->format($r)),
            'meta' => $this->meta($reviews),
        ]);
    }

    /**
     * GET /api/v1/admin/reviews/summary: the whole platform's review figures.
     *
     * `total` and the distribution cover every review that exists (soft-deleted ones excepted), so the distribution
     * adds up to `total`. `average_rating` is rounded to two places and is null, never 0, when there are no reviews.
     * `shops` is the number of approved shops and `shops_reviewed` how many of them have at least one review.
     */
    public function summary(): JsonResponse
    {
        $figures = $this->figures(Review::query());

        $reviewedShops = DB::table('reviews as r')
            ->join('products as p', 'p.id', '=', 'r.product_id')
            ->whereNull('r.deleted_at')
            ->distinct()
            ->count('p.seller_id');

        return response()->json([
            'data' => $figures + [
                'shops'          => SellerProfile::where('application_status', 'approved')->count(),
                'shops_reviewed' => $reviewedShops,
            ],
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** The reviews of every product a seller owns. */
    private function shopReviews(int $sellerId)
    {
        return Review::query()->whereHas('product', fn ($p) => $p->where('seller_id', $sellerId));
    }

    /**
     * @return array{total: int, average_rating: ?float, rating_distribution: array<string, int>}
     */
    private function figures($reviews): array
    {
        $byRating = (clone $reviews)->selectRaw('rating, COUNT(*) as total')->groupBy('rating')->pluck('total', 'rating');

        $distribution = [];
        foreach (range(1, 5) as $stars) {
            $distribution[(string) $stars] = (int) ($byRating[$stars] ?? 0);
        }
        $total = array_sum($distribution);

        return [
            'total'               => $total,
            'average_rating'      => $total > 0 ? round((float) (clone $reviews)->avg('rating'), 2) : null,
            'rating_distribution' => $distribution,
        ];
    }

    /** @return array<string, mixed> */
    private function formatShop(SellerProfile $p, int $reviewCount, mixed $average, mixed $lastAt, ?string $first, ?string $last, ?string $ownerAvatar = null): array
    {
        return [
            'id'             => $p->user_id,
            'shop_name'      => $p->shop_name,
            'shop_slug'      => Str::slug($p->shop_name ?? ''),
            'logo_url'       => $p->logo_url,
            'owner_name'     => trim(($first ?? '') . ' ' . ($last ?? '')),
            'owner_avatar_url' => $ownerAvatar ? asset('storage/' . $ownerAvatar) : null,
            'review_count'   => $reviewCount,
            'average_rating' => $reviewCount > 0 && $average !== null ? round((float) $average, 2) : null,
            'last_review_at' => $lastAt ? \Carbon\CarbonImmutable::parse($lastAt, 'UTC')->toIso8601String() : null,
        ];
    }

    /** @return array<string, mixed> */
    private function meta($paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page'    => $paginator->lastPage(),
            'total'        => $paginator->total(),
            'per_page'     => $paginator->perPage(),
            'from'         => $paginator->firstItem(),
            'to'           => $paginator->lastItem(),
        ];
    }

    /** @return array<string, mixed> */
    private function format(Review $r): array
    {
        $seller = $r->product?->seller;

        return [
            'id'                => $r->id,
            'product_id'        => $r->product_id,
            'rating'            => $r->rating,
            'comment'           => $r->comment,
            'verified_purchase' => $r->verified_purchase,
            'images'            => $r->imageUrls(),
            'created_at'        => $r->created_at,
            'buyer' => $r->buyer ? [
                'id'         => $r->buyer->id,
                'first_name' => $r->buyer->first_name,
                'last_name'  => $r->buyer->last_name,
                'email'      => $r->buyer->email,
                'avatar_url' => $r->buyer->avatar_url,
            ] : null,
            'product' => $r->product ? [
                'id'            => $r->product->id,
                'name'          => $r->product->name,
                'thumbnail_url' => ($img = $r->product->images->firstWhere('is_primary', true) ?? $r->product->images->first()) ? asset('storage/' . $img->path) : null,
            ] : null,
            'shop'    => $seller ? ['id' => $seller->id, 'name' => $seller->sellerProfile?->shop_name ?? trim($seller->first_name . ' ' . $seller->last_name)] : null,
            'order'   => $r->order ? ['id' => $r->order->id, 'order_number' => $r->order->order_number] : null,
        ];
    }
}
