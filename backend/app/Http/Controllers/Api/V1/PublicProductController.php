<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
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
        if ($s = $request->q) {
            $like = "%{$s}%";
            $query->where(fn ($q) => $q
                ->where('name', 'like', $like)
                ->orWhere('description', 'like', $like)
                ->orWhereHas('seller.sellerProfile', fn ($sq) => $sq->where('shop_name', 'like', $like))
            );
        }

        // Category filters
        if ($request->category_id) {
            $query->where('category_id', $request->category_id);
        } elseif ($request->parent_category_id) {
            // parent_category_id is a string slug — match against category_id prefix
            $query->where('category_id', 'like', $request->parent_category_id . '%');
        }

        // Price range
        if ($request->filled('min_price')) $query->where('base_price', '>=', (float) $request->min_price);
        if ($request->filled('max_price')) $query->where('base_price', '<=', (float) $request->max_price);

        // Rating
        if ($request->filled('min_rating')) {
            $query->where('avg_rating', '>=', (float) $request->min_rating);
        }

        // Promotions
        if ($request->boolean('on_sale')) {
            $query->whereNotNull('original_price')->whereColumn('base_price', '<', 'original_price');
        }
        if ($request->boolean('new_arrivals')) {
            $query->where('created_at', '>=', now()->subDays(30));
        }
        if ($request->boolean('has_voucher')) {
            $query->whereHas('vouchers', fn ($q) => $q->where('is_active', true)->where('expires_at', '>', now()));
        }

        // Seller filter
        if ($request->seller_ids) {
            $ids = array_map('intval', explode(',', $request->seller_ids));
            $query->whereIn('seller_id', $ids);
        }

        // Province filter (via seller profile)
        if ($request->provinces) {
            $provinces = explode(',', $request->provinces);
            $query->whereHas('seller.sellerProfile', fn ($q) => $q->whereIn('address_province', $provinces));
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

        // Facets — sellers and provinces from the unfiltered active set
        $facets = $this->buildFacets($request);

        return response()->json([
            'data'   => collect($paginated->items())->map(fn ($p) => $this->formatProduct($p)),
            'meta'   => [
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

    // ─── Private helpers ──────────────────────────────────────────────────────

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

        // Provinces facet
        $provinces = $products->groupBy(fn ($p) => $p->seller?->sellerProfile?->address_province)
            ->filter(fn ($g, $k) => $k !== null)
            ->map(fn ($g, $k) => ['name' => $k, 'count' => $g->count()])
            ->sortByDesc('count')
            ->values();

        return [
            'sellers'   => $sellers->toArray(),
            'provinces' => $provinces->toArray(),
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
            'thumbnail_url'  => $primary ? url(Storage::url($primary->path)) : null,
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
                'url'        => url(Storage::url($img->path)),
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
                'avatar_url'      => $profile?->logo_path ? url(Storage::url($profile->logo_path)) : null,
                'city'            => $profile?->address_city ?? null,
                'province'        => $profile?->address_province ?? null,
                'rating_pct'      => null,
                'units_sold'      => (int) Product::where('seller_id', $product->seller_id)->sum('units_sold'),
                'repurchase_rate' => null,
                'response_rate'   => null,
            ],
            'shipping_fee'                  => null,
            'estimated_delivery_days_min'   => 3,
            'estimated_delivery_days_max'   => 7,
            'return_policy'                 => $profile?->return_policy ?? null,
            'warranty'                      => null,
            'is_wishlisted'                 => false,
        ]);
    }
}
