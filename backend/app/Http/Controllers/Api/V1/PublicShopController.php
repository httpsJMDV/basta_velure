<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Review;
use App\Models\SellerProfile;
use App\Models\StoreFollow;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PublicShopController extends Controller
{
    /**
     * GET /shops/{slugOrId} or GET /stores/{slugOrId}
     */
    public function show(string $slugOrId, Request $request): JsonResponse
    {
        $profile = $this->resolveProfile($slugOrId);
        abort_if(!$profile, 404, 'Shop not found');

        $seller = $profile->user;
        abort_if(!$seller || $seller->status === 'suspended', 404, 'Shop is currently unavailable');

        $user = auth('sanctum')->user();
        $isFollowing = $user ? StoreFollow::where('user_id', $user->id)->where('seller_id', $seller->id)->exists() : false;

        $activeProductsQuery = Product::where('seller_id', $seller->id)->where('status', 'active');
        $productCount = (clone $activeProductsQuery)->count();

        $reviewsQuery = Review::whereHas('product', fn ($q) => $q->where('seller_id', $seller->id));
        $avgRating    = (clone $reviewsQuery)->avg('rating');
        $totalReviews = (clone $reviewsQuery)->count();

        // Rating breakdown (1 to 5 stars)
        $ratingBreakdown = [
            5 => (clone $reviewsQuery)->where('rating', 5)->count(),
            4 => (clone $reviewsQuery)->where('rating', 4)->count(),
            3 => (clone $reviewsQuery)->where('rating', 3)->count(),
            2 => (clone $reviewsQuery)->where('rating', 2)->count(),
            1 => (clone $reviewsQuery)->where('rating', 1)->count(),
        ];

        $followerCount = StoreFollow::where('seller_id', $seller->id)->count();

        // Category breakdown of seller's active products
        $categoryBreakdown = Product::where('seller_id', $seller->id)
            ->where('status', 'active')
            ->leftJoin('categories', 'products.category_id', '=', 'categories.id')
            ->select('products.category_id', 'categories.name as category_name')
            ->selectRaw('count(*) as count')
            ->groupBy('products.category_id', 'categories.name')
            ->get()
            ->map(fn ($row) => [
                'category_id'   => (string) $row->category_id,
                'category_name' => $row->category_name ?? ('Category ' . $row->category_id),
                'count'         => (int) $row->count,
            ]);

        $slug = Str::slug($profile->shop_name ?? ('shop-' . $seller->id));

        return response()->json([
            'data' => [
                'id'                  => $profile->id,
                'seller_id'           => $seller->id,
                'seller_name'         => trim($seller->first_name . ' ' . $seller->last_name),
                'shop_name'           => $profile->shop_name ?? ($seller->first_name . "'s Shop"),
                'shop_slug'           => $slug,
                'shop_category'       => $profile->shop_category,
                'shop_description'    => $profile->shop_description,
                'shop_bio'            => $profile->shop_bio,
                'address_province'    => $profile->address_province,
                'address_city'        => $profile->address_city,
                'address_barangay'    => $profile->address_barangay,
                'shop_contact_number' => $profile->shop_contact_number,
                'return_policy'       => $profile->return_policy,
                'shipping_policy'     => $profile->shipping_policy,
                'business_hours'      => $profile->business_hours,
                'response_time'       => $profile->response_time,
                'logo_url'            => $profile->logo_path ? asset('storage/' . $profile->logo_path) : ($seller->avatar_path ? asset('storage/' . $seller->avatar_path) : null),
                'banner_url'          => $profile->banner_path ? asset('storage/' . $profile->banner_path) : null,
                'application_status'  => $profile->application_status,
                'joined_date'         => $profile->created_at?->toIso8601String() ?? $seller->created_at?->toIso8601String(),
                'avg_rating'          => $avgRating ? round($avgRating, 1) : null,
                'total_reviews'       => $totalReviews,
                'total_products'      => $productCount,
                'follower_count'      => $followerCount,
                'is_following'        => $isFollowing,
                'rating_breakdown'    => $ratingBreakdown,
                'categories'          => $categoryBreakdown,
                // The store's own menu: visible store categories in the seller's order (A7)
                'store_categories'    => SellerStoreCategoryController::tree($seller->id, onlyVisible: true),
                'on_vacation'         => (bool) $profile->on_vacation,
            ],
        ]);
    }

    /**
     * GET /shops/{slugOrId}/reviews or GET /stores/{slugOrId}/reviews
     */
    public function reviews(string $slugOrId, Request $request): JsonResponse
    {
        $profile = $this->resolveProfile($slugOrId);
        abort_if(!$profile, 404, 'Shop not found');

        $seller = $profile->user;
        abort_if(!$seller, 404);

        $query = Review::whereHas('product', fn ($q) => $q->where('seller_id', $seller->id))
            ->where('moderation_status', 'visible')
            ->with(['buyer', 'product.images', 'images']);

        if ($request->filled('rating') && in_array((int) $request->rating, [1, 2, 3, 4, 5], true)) {
            $query->where('rating', (int) $request->rating);
        }

        $paginated = $query->latest()->paginate(10);

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($r) => [
                'id'                => $r->id,
                'rating'            => $r->rating,
                'comment'           => $r->comment,
                'verified_purchase' => (bool) $r->verified_purchase,
                'images'            => $r->imageUrls(),
                'created_at'        => $r->created_at?->toIso8601String(),
                'variant_label'     => $r->variant_label,
                'seller_reply'      => $r->seller_reply ? ['body' => $r->seller_reply, 'replied_at' => $r->seller_replied_at?->toIso8601String()] : null,
                'buyer' => [
                    'id'         => null,
                    'name'       => PublicProductController::maskName($r->buyer?->first_name, $r->buyer?->last_name),
                    'avatar_url' => $r->buyer?->avatar_path ? asset('storage/' . $r->buyer->avatar_path) : null,
                ],
                'product' => [
                    'id'            => $r->product?->id,
                    'name'          => $r->product?->name,
                    'thumbnail_url' => $r->product?->images?->first()?->path
                        ? asset('storage/' . $r->product->images->first()->path)
                        : null,
                ],
            ]),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * GET /shops: the most-ordered shops (approved, not suspended, at least three live products), each with its
     * rating and three best sellers, for the storefront's "Shops to know" band. Cached for five minutes.
     */
    public function featured(Request $request): JsonResponse
    {
        $limit = max(1, min(12, (int) $request->query('limit', 4)));

        // Ties (shops with equal sales) rotate once a day, and the band prefers shops of different kinds.
        $seed = (int) now()->format('Ymd');
        $data = \Illuminate\Support\Facades\Cache::remember("storefront.shops.{$limit}.{$seed}", 300, function () use ($limit, $seed) {
            $candidates = Product::query()
                ->where('products.status', 'active')
                ->join('seller_profiles', 'seller_profiles.user_id', '=', 'products.seller_id')
                ->join('users', 'users.id', '=', 'products.seller_id')
                ->where('seller_profiles.application_status', 'approved')
                ->where('users.status', '!=', 'suspended')
                ->groupBy('products.seller_id')
                ->havingRaw('count(*) >= 3')
                ->selectRaw('products.seller_id, max(seller_profiles.shop_category) as shop_category, count(*) as product_count, coalesce(sum(products.units_sold), 0) as units_sold')
                ->orderByDesc('units_sold')
                ->orderByRaw('RAND(?)', [$seed])
                ->limit($limit * 5)
                ->get();

            // One shop per kind first, in sales order; then the rest.
            $picked = collect();
            $kinds = [];
            foreach ($candidates as $row) {
                $kind = strtolower(trim((string) $row->shop_category));
                if ($picked->count() < $limit && ! isset($kinds[$kind])) {
                    $picked->push($row);
                    $kinds[$kind] = true;
                }
            }
            foreach ($candidates as $row) {
                if ($picked->count() >= $limit) {
                    break;
                }
                if (! $picked->contains('seller_id', $row->seller_id)) {
                    $picked->push($row);
                }
            }
            $rows = $picked->sortByDesc('units_sold')->values();

            $ids = $rows->pluck('seller_id')->all();
            if ($ids === []) {
                return [];
            }

            $profiles = SellerProfile::with('user')->whereIn('user_id', $ids)->get()->keyBy('user_id');
            $ratings = Review::join('products', 'products.id', '=', 'reviews.product_id')
                ->whereIn('products.seller_id', $ids)
                ->groupBy('products.seller_id')
                ->selectRaw('products.seller_id, avg(reviews.rating) as avg_rating, count(*) as review_count')
                ->get()->keyBy('seller_id');
            $previews = Product::with('images')
                ->whereIn('seller_id', $ids)->where('status', 'active')
                ->orderByDesc('units_sold')->orderByDesc('id')
                ->get()->groupBy('seller_id');

            return $rows->map(function ($row) use ($profiles, $ratings, $previews) {
                $profile = $profiles[$row->seller_id] ?? null;
                $rating = $ratings[$row->seller_id] ?? null;

                return [
                    'seller_id'     => (int) $row->seller_id,
                    'shop_name'     => $profile?->shop_name ?? 'Shop',
                    'shop_slug'     => Str::slug($profile?->shop_name ?? ('shop-' . $row->seller_id)),
                    'logo_url'      => $profile?->logo_url,
                    'city'          => $profile?->address_city,
                    'province'      => $profile?->address_province,
                    'product_count' => (int) $row->product_count,
                    'units_sold'    => (int) $row->units_sold,
                    'avg_rating'    => $rating ? round((float) $rating->avg_rating, 1) : null,
                    'review_count'  => $rating ? (int) $rating->review_count : 0,
                    'products'      => ($previews[$row->seller_id] ?? collect())->take(3)->map(fn (Product $p) => [
                        'id'        => $p->id,
                        'name'      => $p->name,
                        'price'     => (float) $p->base_price,
                        'image_url' => $p->primaryImageUrl(),
                    ])->values()->all(),
                ];
            })->values()->all();
        });

        return response()->json(['data' => $data]);
    }

    private function resolveProfile(string $slugOrId): ?SellerProfile
    {
        if (is_numeric($slugOrId)) {
            $id = (int) $slugOrId;
            $profile = SellerProfile::where('user_id', $id)
                ->orWhere('id', $id)
                ->first();
            if ($profile) return $profile;
        }

        // Try exact match on shop_name or slug conversion
        $profiles = SellerProfile::all();
        foreach ($profiles as $p) {
            if ($p->shop_name && Str::slug($p->shop_name) === Str::slug($slugOrId)) {
                return $p;
            }
        }

        return null;
    }
}

