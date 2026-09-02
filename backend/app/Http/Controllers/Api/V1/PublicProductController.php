<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicProductController extends Controller
{
    /** GET /products */
    public function index(Request $request): JsonResponse
    {
        $query = Product::with(['variants', 'images', 'seller.sellerProfile'])
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'));

        // Free-text search
        if ($request->filled('q')) {
            $s = (string) $request->input('q');
            $like = "%{$s}%";
            $query->where(function ($q) use ($like) {
                $q->where('name', 'like', $like)
                  ->orWhere('description', 'like', $like)
                  ->orWhereHas('seller.sellerProfile', function ($sq) use ($like) {
                      $sq->where('shop_name', 'like', $like);
                  });
            });
        }

        // Category filters
        if ($request->filled('category_id')) {
            $query->where('category_id', $request->input('category_id'));
        } elseif ($request->filled('parent_category_id')) {
            // parent_category_id is a string slug — match against category_id prefix
            $query->where('category_id', 'like', $request->input('parent_category_id') . '%');
        }

        // Price range
        if ($request->filled('min_price')) $query->where('base_price', '>=', (float) $request->input('min_price'));
        if ($request->filled('max_price')) $query->where('base_price', '<=', (float) $request->input('max_price'));

        // Rating
        if ($request->filled('min_rating')) {
            $query->where('avg_rating', '>=', (float) $request->input('min_rating'));
        }

        // Promotions
        if ($request->boolean('on_sale')) {
            $query->whereNotNull('original_price')->whereColumn('base_price', '<', 'original_price');
        }
        if ($request->boolean('new_arrivals')) {
            $query->where('created_at', '>=', now()->subDays(30));
        }

        // Seller filter
        if ($request->filled('seller_ids')) {
            $ids = array_map('intval', explode(',', (string) $request->input('seller_ids')));
            $query->whereIn('seller_id', $ids);
        }

        // Shipped From / Location filter (macro-regions & provinces)
        $locationParam = $request->shipped_from ?? $request->provinces;
        if ($locationParam) {
            $locations = array_filter(array_map('trim', explode(',', $locationParam)));
            $query->whereHas('seller.sellerProfile', function ($q) use ($locations) {
                $q->where(function ($inner) use ($locations) {
                    foreach ($locations as $loc) {
                        $locLower = strtolower(str_replace([' ', '-'], '_', $loc));
                        if ($locLower === 'domestic') {
                            $inner->orWhereNotNull('address_province');
                        } elseif (in_array($locLower, ['metro_manila', 'ncr', '13', '130000000'])) {
                            $inner->orWhere('address_province', 'like', '13%')
                                  ->orWhere('address_province', 'like', '%Manila%')
                                  ->orWhere('address_province', 'like', '%NCR%');
                        } elseif (in_array($locLower, ['north_luzon', 'luzon_north'])) {
                            $inner->orWhere('address_province', 'like', '01%')
                                  ->orWhere('address_province', 'like', '02%')
                                  ->orWhere('address_province', 'like', '03%')
                                  ->orWhere('address_province', 'like', '14%');
                        } elseif (in_array($locLower, ['south_luzon', 'luzon_south'])) {
                            $inner->orWhere('address_province', 'like', '04%')
                                  ->orWhere('address_province', 'like', '17%')
                                  ->orWhere('address_province', 'like', '05%');
                        } elseif ($locLower === 'visayas') {
                            $inner->orWhere('address_province', 'like', '06%')
                                  ->orWhere('address_province', 'like', '07%')
                                  ->orWhere('address_province', 'like', '08%')
                                  ->orWhere('address_province', 'like', '18%');
                        } elseif ($locLower === 'mindanao') {
                            $inner->orWhere('address_province', 'like', '09%')
                                  ->orWhere('address_province', 'like', '10%')
                                  ->orWhere('address_province', 'like', '11%')
                                  ->orWhere('address_province', 'like', '12%')
                                  ->orWhere('address_province', 'like', '16%')
                                  ->orWhere('address_province', 'like', '19%');
                        } else {
                            $inner->orWhere('address_province', $loc);
                        }
                    }
                });
            });
        }

        // Sorting
        match ($request->input('sort', 'best_match')) {
            'price_asc'     => $query->orderBy('base_price'),
            'price_desc'    => $query->orderByDesc('base_price'),
            'newest'        => $query->latest(),
            'best_selling'  => $query->orderByDesc('units_sold')->orderBy('id'),
            'highest_rated' => $query->orderByDesc('avg_rating'),
            'random'        => $query->inRandomOrder(),
            default         => $query->orderByDesc('units_sold')->orderByDesc('avg_rating'),
        };

        $perPage   = min((int) $request->input('per_page', 28), 100);
        $paginated = $query->paginate($perPage);

        // Facets — sellers and location macro-regions
        $facets = $this->buildFacets($request);

        // Related shops (when user searched a keyword)
        $relatedShops = [];
        if ($request->filled('q')) {
            $relatedShops = $this->buildRelatedShops((string) $request->input('q'));
        }

        return response()->json([
            'data'          => collect($paginated->items())->map(fn ($p) => $this->formatProduct($p)),
            'related_shops' => $relatedShops,
            'meta'          => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
            ],
            'facets' => $facets,
        ]);
    }

    /** GET /products/{product} */
    public function show(Product $product): JsonResponse
    {
        abort_if($product->status !== 'active', 404);

        $product->load(['variants', 'images', 'seller.sellerProfile']);

        return response()->json(['data' => $this->formatProductDetail($product)]);
    }

    /** GET /products/{product}/related */
    public function related(Product $product): JsonResponse
    {
        $related = Product::with(['variants', 'images', 'seller.sellerProfile'])
            ->where('status', 'active')
            ->where('category_id', $product->category_id)
            ->where('id', '!=', $product->id)
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'))
            ->orderByDesc('units_sold')
            ->limit(12)
            ->get();

        return response()->json([
            'data' => $related->map(fn ($p) => $this->formatProduct($p)),
            'meta' => ['total' => $related->count()],
        ]);
    }

    /** GET /products/{product}/reviews */
    public function reviews(Product $product, Request $request): JsonResponse
    {
        $query = Review::with(['buyer'])
            ->where('product_id', $product->id)
            ->where('moderation_status', 'approved');

        if ($request->filled('rating')) {
            $query->where('rating', (int) $request->input('rating'));
        }

        if ($request->input('sort') === 'recent') {
            $query->latest();
        } else {
            $query->orderByDesc('rating')->latest();
        }

        $paginated = $query->paginate(10);

        // Rating distribution counts
        $allApproved = Review::where('product_id', $product->id)->where('moderation_status', 'approved')->get();
        $ratingCounts = [
            '1' => $allApproved->where('rating', 1)->count(),
            '2' => $allApproved->where('rating', 2)->count(),
            '3' => $allApproved->where('rating', 3)->count(),
            '4' => $allApproved->where('rating', 4)->count(),
            '5' => $allApproved->where('rating', 5)->count(),
        ];
        $avgRating = $allApproved->avg('rating');

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($r) => [
                'id'                => $r->id,
                'rating'            => (int) $r->rating,
                'comment'           => $r->comment,
                'verified_purchase' => (bool) $r->verified_purchase,
                'created_at'        => $r->created_at?->toIso8601String(),
                'buyer'             => [
                    'id'         => $r->buyer?->id,
                    'name'       => $r->buyer ? trim($r->buyer->first_name . ' ' . $r->buyer->last_name) : 'Anonymous Buyer',
                    'avatar_url' => $r->buyer?->avatar_path ? asset('storage/' . $r->buyer->avatar_path) : null,
                ],
            ]),
            'meta' => [
                'current_page'  => $paginated->currentPage(),
                'last_page'     => $paginated->lastPage(),
                'total'         => $paginated->total(),
                'avg_rating'    => $avgRating ? round((float) $avgRating, 1) : null,
                'rating_counts' => $ratingCounts,
            ],
        ]);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function buildRelatedShops(string $q): array
    {
        $like = "%{$q}%";

        // Find approved sellers whose shop name, bio, description, category or active product names match $q
        $profiles = \App\Models\SellerProfile::with(['user'])
            ->where('application_status', 'approved')
            ->whereHas('user', fn ($uq) => $uq->where('status', 'active'))
            ->where(function ($sub) use ($like) {
                $sub->where('shop_name', 'like', $like)
                    ->orWhere('shop_bio', 'like', $like)
                    ->orWhere('shop_description', 'like', $like)
                    ->orWhere('shop_category', 'like', $like)
                    ->orWhereHas('user.products', fn ($pq) => $pq->where('status', 'active')->where('name', 'like', $like));
            })
            ->limit(3)
            ->get();

        return $profiles->map(function ($profile) {
            $seller = $profile->user;
            $activeProducts = Product::with(['images'])
                ->where('seller_id', $seller->id)
                ->where('status', 'active')
                ->latest()
                ->limit(4)
                ->get();

            $avgRating = \App\Models\Review::whereHas('product', fn ($rq) => $rq->where('seller_id', $seller->id))->avg('rating');
            $followerCount = \App\Models\StoreFollow::where('seller_id', $seller->id)->count();
            $slug = \Illuminate\Support\Str::slug($profile->shop_name ?? ('shop-' . $seller->id));

            return [
                'id'               => $profile->id,
                'seller_id'        => $seller->id,
                'shop_name'        => $profile->shop_name ?? ($seller->first_name . "'s Shop"),
                'shop_slug'        => $slug,
                'shop_category'    => $profile->shop_category ?? 'General Marketplace',
                'shop_bio'         => $profile->shop_bio,
                'logo_url'         => $profile->logo_path ? asset('storage/' . $profile->logo_path) : ($seller->avatar_path ? asset('storage/' . $seller->avatar_path) : null),
                'avg_rating'       => $avgRating ? round((float) $avgRating, 1) : 5.0,
                'total_products'   => Product::where('seller_id', $seller->id)->where('status', 'active')->count(),
                'follower_count'   => $followerCount,
                'rating_pct'       => $avgRating ? round(((float) $avgRating / 5) * 100) : 98,
                'response_rate'    => $profile->response_time ?? 'Within 1 hour',
                'preview_products' => $activeProducts->map(fn ($p) => [
                    'id'            => $p->id,
                    'name'          => $p->name,
                    'base_price'    => (float) $p->base_price,
                    'thumbnail_url' => ($p->images->firstWhere('is_primary', true) ?? $p->images->first()) ? asset('storage/' . ($p->images->firstWhere('is_primary', true) ?? $p->images->first())->path) : null,
                ]),
            ];
        })->toArray();
    }

    private function buildFacets(Request $request): array
    {
        $base = Product::with(['seller.sellerProfile'])
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'));

        if ($request->category_id) {
            $base->where('category_id', $request->category_id);
        } elseif ($request->parent_category_id) {
            $base->where('category_id', 'like', $request->parent_category_id . '%');
        }

        $products = $base->get();

        // Sellers facet
        $sellers = $products->groupBy('seller_id')->map(function ($group) {
            $seller  = $group->first()->seller;
            $profile = $seller?->sellerProfile;
            return [
                'id'        => $seller?->id,
                'shop_name' => $profile?->shop_name ?? $seller?->first_name,
                'count'     => $group->count(),
            ];
        })->values()->filter(fn ($s) => $s['id'])->sortByDesc('count')->values();

        // Macro-regions counts
        $cDomestic    = 0;
        $cMetroManila = 0;
        $cNorthLuzon  = 0;
        $cSouthLuzon  = 0;
        $cVisayas     = 0;
        $cMindanao    = 0;

        foreach ($products as $p) {
            $prov = $p->seller?->sellerProfile?->address_province;
            if (!$prov) continue;
            $cDomestic++;

            $prefix2 = substr($prov, 0, 2);
            if ($prefix2 === '13' || stripos($prov, 'manila') !== false || stripos($prov, 'ncr') !== false) {
                $cMetroManila++;
            } elseif (in_array($prefix2, ['01', '02', '03', '14'])) {
                $cNorthLuzon++;
            } elseif (in_array($prefix2, ['04', '17', '05'])) {
                $cSouthLuzon++;
            } elseif (in_array($prefix2, ['06', '07', '08', '18'])) {
                $cVisayas++;
            } elseif (in_array($prefix2, ['09', '10', '11', '12', '16', '19'])) {
                $cMindanao++;
            }
        }

        $locations = [
            ['key' => 'Domestic',     'name' => 'Domestic',     'count' => $cDomestic],
            ['key' => 'Metro Manila', 'name' => 'Metro Manila', 'count' => $cMetroManila],
            ['key' => 'North Luzon',  'name' => 'North Luzon',  'count' => $cNorthLuzon],
            ['key' => 'South Luzon',  'name' => 'South Luzon',  'count' => $cSouthLuzon],
            ['key' => 'Visayas',      'name' => 'Visayas',      'count' => $cVisayas],
            ['key' => 'Mindanao',     'name' => 'Mindanao',     'count' => $cMindanao],
        ];

        return [
            'sellers'   => $sellers->toArray(),
            'locations' => $locations,
            'provinces' => $locations, // alias for backwards compatibility
        ];
    }

    private function formatProduct(Product $product): array
    {
        $primary = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
        $profile = $product->seller?->sellerProfile;

        return [
            'id'             => $product->id,
            'name'           => $product->name,
            'description'    => $product->description,
            'category_id'    => $product->category_id,
            'status'         => $product->status,
            'thumbnail_url'  => $primary ? asset('storage/' . $primary->path) : null,
            'base_price'     => (float) $product->base_price,
            'original_price' => $product->original_price ? (float) $product->original_price : null,
            'units_sold'     => (int) $product->units_sold,
            'avg_rating'     => $product->avg_rating ? (float) $product->avg_rating : null,
            'review_count'   => (int) ($product->review_count ?? 0),
            'seller'         => [
                'id'        => $product->seller?->id,
                'shop_name' => $profile?->shop_name ?? ($product->seller?->first_name . ' ' . $product->seller?->last_name),
                'city'      => $profile?->address_city ?? null,
                'province'  => $profile?->address_province ?? null,
            ],
            'variants' => $product->variants->map(fn ($v) => [
                'id'             => $v->id,
                'label'          => $v->label,
                'price'          => (float) $v->price,
                'original_price' => $v->original_price ? (float) $v->original_price : null,
                'stock_quantity' => (int) $v->stock_quantity,
                'sku'            => $v->sku,
            ]),
        ];
    }

    private function buildVariantGroups(Product $product): array
    {
        $variants = $product->variants;
        if ($variants->isEmpty()) {
            return [];
        }

        // If only 1 variant and it is 'Default' or empty, no selection group needed
        if ($variants->count() === 1 && in_array(strtolower(trim($variants->first()->label ?? '')), ['', 'default'])) {
            return [];
        }

        // Check if any variant label contains multi-dimension delimiter ' / '
        $hasMultiDimension = $variants->contains(fn ($v) => str_contains($v->label ?? '', ' / '));

        if (!$hasMultiDimension) {
            // Single dimension variation group (e.g., Flavor, Color, Size)
            return [
                [
                    'name'    => 'Variation',
                    'options' => $variants->map(fn ($v) => [
                        'id'             => $v->id,
                        'label'          => $v->label ?: 'Default',
                        'stock_quantity' => (int) $v->stock_quantity,
                        'price'          => (float) $v->price,
                        'original_price' => $v->original_price ? (float) $v->original_price : null,
                        'sku'            => $v->sku,
                    ])->values()->all(),
                ],
            ];
        }

        // Multi-dimension variant combinations (e.g., "Red / M", "Blue / L")
        $dimensionCount = 0;
        $splitVariants = [];
        foreach ($variants as $v) {
            $parts = array_map('trim', explode('/', $v->label ?? ''));
            $dimensionCount = max($dimensionCount, count($parts));
            $splitVariants[] = ['variant' => $v, 'parts' => $parts];
        }

        $groups = [];
        for ($i = 0; $i < $dimensionCount; $i++) {
            $groupName = match ($i) {
                0 => 'Variation 1',
                1 => 'Variation 2',
                default => 'Variation ' . ($i + 1),
            };

            $uniqueOptions = [];
            foreach ($splitVariants as $sv) {
                $optLabel = $sv['parts'][$i] ?? '';
                if ($optLabel === '') continue;

                if (!isset($uniqueOptions[$optLabel])) {
                    $uniqueOptions[$optLabel] = [
                        'id'             => (crc32($groupName . ':' . $optLabel) & 0x7fffffff) ?: ($i * 100 + count($uniqueOptions) + 1),
                        'label'          => $optLabel,
                        'stock_quantity' => (int) $sv['variant']->stock_quantity,
                        'price'          => (float) $sv['variant']->price,
                        'original_price' => $sv['variant']->original_price ? (float) $sv['variant']->original_price : null,
                        'sku'            => $sv['variant']->sku,
                    ];
                } else {
                    $uniqueOptions[$optLabel]['stock_quantity'] += (int) $sv['variant']->stock_quantity;
                }
            }

            if (!empty($uniqueOptions)) {
                $groups[] = [
                    'name'    => $groupName,
                    'options' => array_values($uniqueOptions),
                ];
            }
        }

        return $groups;
    }

    private function formatProductDetail(Product $product): array
    {
        $base    = $this->formatProduct($product);
        $profile = $product->seller?->sellerProfile;

        return array_merge($base, [
            'images' => $product->images->map(fn ($img) => [
                'id'         => $img->id,
                'url'        => asset('storage/' . $img->path),
                'is_primary' => (bool) $img->is_primary,
                'sort_order' => $img->sort_order,
            ]),
            'variant_groups' => $this->buildVariantGroups($product),
            'specs' => [
                'description'            => $product->description ?? '',
                'whats_in_box'           => null,
                'weight_grams'           => $product->weight_kg ? (int) ($product->weight_kg * 1000) : null,
                'dimensions_cm'          => $product->dimension_l_cm
                    ? "{$product->dimension_l_cm} × {$product->dimension_w_cm} × {$product->dimension_h_cm}"
                    : null,
                'sku'                    => $product->sku,
                'ingredients'            => $product->ingredients,
                'net_weight_volume'      => $product->net_weight_volume,
                'storage_instructions'   => $product->storage_instructions,
                'expiry_best_before'     => $product->expiry_best_before,
                'allergen_info'          => $product->allergen_info,
                'fda_registration_number'=> null,
                'key_ingredients'        => null,
                'skin_type_suitability'  => null,
                'battery_info'           => null,
                'ports_connectivity'     => null,
                'compatibility'          => null,
                'material'               => null,
                'care_instructions'      => null,
                'size_chart_url'         => null,
            ],
            'seller' => [
                'id'              => $product->seller?->id,
                'shop_name'       => $profile?->shop_name ?? '',
                'avatar_url'      => $profile?->logo_path ? asset('storage/' . $profile->logo_path) : null,
                'city'            => $profile?->address_city ?? null,
                'province'        => $profile?->address_province ?? null,
                'rating_pct'      => null,
                'units_sold'      => (int) Product::where('seller_id', $product->seller_id)->sum('units_sold'),
                'repurchase_rate' => null,
                'response_rate'   => null,
                'return_policy'   => $profile?->return_policy ?? null,
                'shipping_policy' => $profile?->shipping_policy ?? null,
            ],
            'shipping_fee'                  => null,
            'estimated_delivery_days_min'   => 3,
            'estimated_delivery_days_max'   => 7,
            'return_policy'                 => $profile?->return_policy ?? null,
            'shipping_policy'               => $profile?->shipping_policy ?? null,
            'warranty'                      => null,
            'is_wishlisted'                 => false,
        ]);
    }
}
