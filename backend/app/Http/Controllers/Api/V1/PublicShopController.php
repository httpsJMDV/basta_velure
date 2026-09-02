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
            ->with(['buyer', 'product.images']);

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
                'created_at'        => $r->created_at?->toIso8601String(),
                'buyer' => [
                    'id'         => $r->buyer?->id,
                    'name'       => $r->buyer ? trim($r->buyer->first_name . ' ' . $r->buyer->last_name) : 'Anonymous Buyer',
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

