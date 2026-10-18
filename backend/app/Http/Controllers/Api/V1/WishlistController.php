<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StoreFollow;
use App\Models\Wishlist;
use App\Models\WishlistItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class WishlistController extends Controller
{
    private ?\App\Services\Pricing\PriceBook $book = null;

    /** GET /wishlist — paginated wishlist items */
    public function index(Request $request): JsonResponse
    {
        $user     = $request->user();
        $wishlist = Wishlist::firstOrCreate(['user_id' => $user->id]);

        $sort  = $request->input('sort', 'recent');
        $query = $wishlist->items()->with(['product.variants', 'product.images', 'product.seller.sellerProfile']);

        match ($sort) {
            'price_asc'  => $query->join('products', 'wishlist_items.product_id', '=', 'products.id')
                                  ->orderBy('products.base_price')->select('wishlist_items.*'),
            'price_desc' => $query->join('products', 'wishlist_items.product_id', '=', 'products.id')
                                  ->orderByDesc('products.base_price')->select('wishlist_items.*'),
            default      => $query->latest('wishlist_items.created_at'),
        };

        $paginated = $query->paginate(20);
        $this->book = \App\Services\Pricing\PriceBook::for(collect($paginated->items())->pluck('product_id'));

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($item) => $this->formatWishlistItem($item))->filter()->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /** POST /wishlist/toggle */
    public function toggle(Request $request): JsonResponse
    {
        $request->validate(['product_id' => 'required|integer|exists:products,id']);

        $user     = $request->user();
        $wishlist = Wishlist::firstOrCreate(['user_id' => $user->id]);
        $existing = WishlistItem::where('wishlist_id', $wishlist->id)
                                ->where('product_id', $request->product_id)
                                ->first();

        if ($existing) {
            $existing->delete();
            return response()->json(['wishlisted' => false]);
        }

        WishlistItem::create(['wishlist_id' => $wishlist->id, 'product_id' => $request->product_id]);
        return response()->json(['wishlisted' => true]);
    }

    /** GET /store-follows — paginated followed stores */
    public function followedStores(Request $request): JsonResponse
    {
        $user  = $request->user();
        $sort  = $request->input('sort', 'recent');
        $query = StoreFollow::where('user_id', $user->id)
                            ->with(['seller.sellerProfile']);

        if ($sort === 'highest_rated') {
            $query->join('seller_profiles', 'store_follows.seller_id', '=', 'seller_profiles.user_id')
                  ->orderByDesc('seller_profiles.avg_rating')
                  ->select('store_follows.*');
        } else {
            $query->latest('store_follows.created_at');
        }

        $paginated = $query->paginate(20);

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($f) => $this->formatFollowedStore($f)),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /** POST /store-follows/toggle */
    public function toggleFollow(Request $request): JsonResponse
    {
        $request->validate(['seller_id' => 'required|integer|exists:users,id']);

        $user     = $request->user();
        $existing = StoreFollow::where('user_id', $user->id)
                               ->where('seller_id', $request->seller_id)
                               ->first();

        if ($existing) {
            $existing->delete();
            return response()->json(['following' => false]);
        }

        StoreFollow::create(['user_id' => $user->id, 'seller_id' => $request->seller_id]);
        return response()->json(['following' => true]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function formatWishlistItem(WishlistItem $item): array
    {
        $product = $item->product;
        if (! $product) return [];

        $primary = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
        $profile = $product->seller?->sellerProfile;
        $totalStock = $product->variants->sum('stock_quantity');
        $book = $this->book ??= \App\Services\Pricing\PriceBook::for([$product->id]);
        $range = $book->range($product);
        // Unavailable: deleted, not active, or the store is gone; Sold out: no stock; On vacation: the store is away.
        $availability = match (true) {
            $product->trashed() || $product->status !== 'active' || $profile?->application_status !== 'approved' || $product->seller?->status !== 'active' => 'unavailable',
            (bool) $profile?->on_vacation => 'on_vacation',
            $totalStock <= 0 => 'sold_out',
            default => 'available',
        };

        return [
            'wishlist_item_id' => $item->id,
            'added_at'         => $item->created_at?->toISOString(),
            'product'          => [
                'id'             => $product->id,
                'name'           => $product->name,
                'thumbnail_url'  => $primary ? asset('storage/' . $primary->path) : null,
                'base_price'     => $range['min'],
                'original_price' => $range['min'] < $range['regular_min'] ? $range['regular_min'] : null,
                'status'         => $product->trashed() ? 'deleted' : $product->status,
                'availability'   => $availability,
                'total_stock'    => $availability === 'unavailable' ? 0 : $totalStock,
                // So "Add to cart" can add the right variant (a product with options opens its page instead).
                'variants'       => $availability === 'unavailable' ? [] : $product->variants->map(fn ($v) => [
                    'id' => $v->id, 'label' => $v->label, 'price' => $book->unit($v)['price'], 'stock_quantity' => (int) $v->stock_quantity,
                ])->values(),
                'seller'         => [
                    'id'        => $product->seller?->id,
                    'shop_name' => $profile?->shop_name ?? ($product->seller?->first_name . ' ' . $product->seller?->last_name),
                    'shop_slug' => \Illuminate\Support\Str::slug($profile?->shop_name ?? ('shop-' . $product->seller?->id)),
                ],
            ],
        ];
    }

    private function formatFollowedStore(StoreFollow $follow): array
    {
        $seller  = $follow->seller;
        $profile = $seller?->sellerProfile;

        $productCount = $profile
            ? Product::where('seller_id', $seller->id)->where('status', 'active')->count()
            : 0;

        return [
            'follow_id'     => $follow->id,
            'followed_at'   => $follow->created_at?->toISOString(),
            'seller'        => [
                'id'            => $seller?->id,
                'shop_name'     => $profile?->shop_name ?? ($seller?->first_name . ' ' . $seller?->last_name),
                'shop_slug'     => \Illuminate\Support\Str::slug($profile?->shop_name ?? ('shop-' . $seller?->id)),
                'logo_url'      => $profile?->logo_path ? asset('storage/' . $profile->logo_path) : null,
                'avg_rating'    => $profile?->avg_rating ? (float) $profile->avg_rating : null,
                'product_count' => $productCount,
                'has_sale'      => Product::where('seller_id', $seller?->id)
                                          ->where('status', 'active')
                                          ->where(fn ($q) => $q->whereHas('storeSales', fn ($s) => $s->live())->orWhereHas('flashSales', fn ($f) => $f->live()))
                                          ->exists(),
            ],
        ];
    }
}
