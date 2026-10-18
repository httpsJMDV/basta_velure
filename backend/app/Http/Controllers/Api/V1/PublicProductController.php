<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\Review;
use App\Services\Pricing\PriceBook;
use App\Services\ProductSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PublicProductController extends Controller
{
    /** The prices of the products in this response (store sales and flash sales running now). */
    private ?PriceBook $book = null;

    private function book(Product $product): PriceBook
    {
        return $this->book ??= PriceBook::for([$product->id]);
    }

    /**
     * A buyer's name as shown on a public review (BUY-RATE-001): first letter, stars, last letter of the first name,
     * and the last name's initial ("J***n D."). One-letter names keep the letter.
     */
    public static function maskName(?string $first, ?string $last): string
    {
        $first = trim((string) $first);
        if ($first === '') {
            return 'Loved-IT buyer';
        }
        $chars = mb_str_split($first);
        $masked = count($chars) <= 2 ? $chars[0] . '*' : $chars[0] . str_repeat('*', min(4, count($chars) - 2)) . end($chars);
        $initial = trim((string) $last) !== '' ? ' ' . mb_strtoupper(mb_substr(trim((string) $last), 0, 1)) . '.' : '';

        return $masked . $initial;
    }
    /** GET /products */
    public function index(Request $request, ProductSearch $searcher): JsonResponse
    {
        // A price range is checked before it filters anything: no negatives, and the minimum cannot exceed the maximum.
        $request->validate([
            'min_price' => ['nullable', 'numeric', 'min:0'],
            'max_price' => ['nullable', 'numeric', 'min:0'],
        ], [
            'min_price.min'     => 'The minimum price cannot be negative.',
            'max_price.min'     => 'The maximum price cannot be negative.',
            'min_price.numeric' => 'Enter the minimum price as a number.',
            'max_price.numeric' => 'Enter the maximum price as a number.',
        ]);
        if ($request->filled('min_price') && $request->filled('max_price') && (float) $request->input('min_price') > (float) $request->input('max_price')) {
            throw \Illuminate\Validation\ValidationException::withMessages(['min_price' => 'The minimum price cannot be more than the maximum price.']);
        }

        $query = Product::with(['variants', 'images', 'seller.sellerProfile'])
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'));

        // Free-text search: word by word, forgiving typos, best match first (ProductSearch).
        $search = null;
        if ($request->filled('q')) {
            $search = $searcher->search((string) $request->input('q'));
            $query->whereIn('id', $search['ids'] ?: [0]);
        }

        // Category filters: a slug (what the web app sends) or an id; a parent category includes its subcategories.
        if ($categoryIds = $this->requestedCategoryIds($request)) {
            $query->whereIn('category_id', $categoryIds);
        }

        // Price range
        if ($request->filled('min_price')) $query->where('base_price', '>=', (float) $request->input('min_price'));
        if ($request->filled('max_price')) $query->where('base_price', '<=', (float) $request->input('max_price'));

        // Rating
        if ($request->filled('min_rating')) {
            $query->where('avg_rating', '>=', (float) $request->input('min_rating'));
        }

        // A store's own category (and its subcategories). A hidden or unknown category is "not found".
        if ($request->filled('store_category_id')) {
            $cat = \App\Models\StoreCategory::where('is_visible', true)->find((int) $request->input('store_category_id'));
            abort_if(! $cat || ($cat->parent_id && ! \App\Models\StoreCategory::where('id', $cat->parent_id)->where('is_visible', true)->exists()), 404, 'This store category was not found.');
            $ids = \App\Models\StoreCategory::where('parent_id', $cat->id)->where('is_visible', true)->pluck('id')->push($cat->id);
            $query->where('seller_id', $cat->seller_id)
                ->whereHas('storeCategories', fn ($q) => $q->whereIn('store_categories.id', $ids));
        }

        // Promotions: a store sale or a flash sale running now
        if ($request->boolean('on_sale')) {
            $query->where(fn ($q) => $q
                ->whereHas('storeSales', fn ($s) => $s->live())
                ->orWhereHas('flashSales', fn ($f) => $f->live()));
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
            // A seed keeps the shuffle stable across pages, so "View more" never repeats a product.
            'random'        => $request->filled('seed') ? $query->orderByRaw('RAND(?)', [(int) $request->input('seed')])->orderBy('id') : $query->inRandomOrder(),
            // Most sold, then most reviewed and best rated, then discounted, then newest.
            'trending'      => $query->orderByDesc('units_sold')->orderByDesc('review_count')->orderByDesc('avg_rating')
                ->orderByRaw('CASE WHEN original_price > base_price THEN 0 ELSE 1 END')->latest(),
            // Best match: a search keeps its relevance order; otherwise the best sellers come first.
            default         => $search && $search['ids']
                ? $query->orderByRaw('FIELD(id, ' . implode(',', array_map('intval', $search['ids'])) . ')')
                : $query->orderByDesc('units_sold')->orderByDesc('avg_rating'),
        };

        $perPage   = min((int) $request->input('per_page', 28), 100);
        $paginated = $query->paginate($perPage);
        $this->book = PriceBook::for(collect($paginated->items())->pluck('id'));

        // Facets — sellers and location macro-regions
        $facets = $this->buildFacets($request, $search ? ($search['ids'] ?: [0]) : null);

        // Related shops (when user searched a keyword)
        $relatedShops = [];
        if ($request->filled('q')) {
            $relatedShops = $this->buildRelatedShops((string) $request->input('q'));
        }

        return response()->json([
            'data'          => collect($paginated->items())->map(fn ($p) => $this->formatProduct($p)),
            'related_shops' => $relatedShops,
            // The query as the catalog spells it, when a typo was forgiven ("Showing results for ...").
            'search'        => $search ? ['corrected' => $search['corrected']] : null,
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
        $this->book = PriceBook::for($related->pluck('id'));

        return response()->json([
            'data' => $related->map(fn ($p) => $this->formatProduct($p)),
            'meta' => ['total' => $related->count()],
        ]);
    }

    /** GET /products/{product}/reviews */
    public function reviews(Product $product, Request $request): JsonResponse
    {
        $query = Review::with(['buyer', 'images'])
            ->where('product_id', $product->id)
            ->where('moderation_status', 'visible');

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
        $allApproved = Review::where('product_id', $product->id)->where('moderation_status', 'visible')->get();
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
                'variant_label'     => $r->variant_label,
                'images'            => $r->imageUrls(),
                'created_at'        => $r->created_at?->toIso8601String(),
                'buyer'             => [
                    'id'         => null,
                    'name'       => self::maskName($r->buyer?->first_name, $r->buyer?->last_name),
                    'avatar_url' => $r->buyer?->avatar_path ? asset('storage/' . $r->buyer->avatar_path) : null,
                ],
                'seller_reply'      => $r->seller_reply ? [
                    'body' => $r->seller_reply,
                    'replied_at' => $r->seller_replied_at?->toIso8601String(),
                    'edited_at' => $r->seller_reply_edited_at?->toIso8601String(),
                ] : null,
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

    /**
     * The category ids a request filters on: category_id (a slug or an id) or parent_category_id; a parent category
     * includes its subcategories. Null when the request has no category filter; [0] (matches nothing) when the
     * category does not exist.
     *
     * @return array<int, int>|null
     */
    private function requestedCategoryIds(Request $request): ?array
    {
        $value = $request->filled('category_id') ? $request->input('category_id') : $request->input('parent_category_id');
        if ($value === null || $value === '') {
            return null;
        }

        $category = Category::where(is_numeric($value) ? 'id' : 'slug', $value)->first(['id']);
        if (! $category) {
            return [0];
        }

        return Category::where('parent_id', $category->id)->pluck('id')->push($category->id)->all();
    }

    /** @param array<int, int>|null $productIds the search's matches, when there is a search */
    private function buildFacets(Request $request, ?array $productIds = null): array
    {
        $base = Product::with(['seller.sellerProfile'])
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'));

        if ($categoryIds = $this->requestedCategoryIds($request)) {
            $base->whereIn('category_id', $categoryIds);
        }
        if ($productIds !== null) {
            $base->whereIn('id', $productIds);
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
        $book = $this->book($product);
        $range = $book->range($product);
        $sale = $book->saleFor($product->id);
        $flash = $book->flashFor($product->id);
        $onSale = $range['min'] < $range['regular_min'] || $range['max'] < $range['regular_max'];

        return [
            'id'             => $product->id,
            'name'           => $product->name,
            'description'    => $product->description,
            'category_id'    => $product->category_id,
            'status'         => $product->status,
            'thumbnail_url'  => $primary ? asset('storage/' . $primary->path) : null,
            // The lowest price now (sale or flash price when one runs) and the regular price it replaces.
            'base_price'     => $range['min'],
            'original_price' => $onSale ? $range['regular_min'] : null,
            'price_range'    => $range,
            'discount_percent' => $sale && $sale->discount_type === 'percent' && $range['min'] < $range['regular_min'] ? $sale->discount_percent : null,
            'flash_sale'     => $flash ? [
                'id' => $flash->id, 'price' => (float) $flash->flash_price, 'remaining' => $flash->remaining(),
                'quantity' => $flash->quantity, 'ends_at' => $flash->slot_end->toIso8601String(), 'variant_id' => $flash->product_variant_id,
            ] : null,
            'units_sold'     => (int) $product->units_sold,
            'avg_rating'     => $product->avg_rating ? (float) $product->avg_rating : null,
            'review_count'   => (int) ($product->review_count ?? 0),
            'total_stock'    => (int) $product->variants->sum('stock_quantity'),
            'on_vacation'    => (bool) ($profile?->on_vacation),
            'purchase_limit' => $product->purchase_limit,
            'seller'         => [
                'id'        => $product->seller?->id,
                'shop_name' => $profile?->shop_name ?? ($product->seller?->first_name . ' ' . $product->seller?->last_name),
                'city'      => $profile?->address_city ?? null,
                'province'  => $profile?->address_province ?? null,
                'on_vacation' => (bool) ($profile?->on_vacation),
            ],
            'variants' => $product->variants->map(function ($v) use ($book) {
                $unit = $book->unit($v);

                return [
                    'id'             => $v->id,
                    'label'          => $v->label,
                    'price'          => $unit['price'],
                    'original_price' => $unit['price'] < $unit['regular'] ? $unit['regular'] : null,
                    'price_source'   => $unit['source'],
                    'stock_quantity' => (int) $v->stock_quantity,
                    'sku'            => $v->sku,
                ];
            })->values(),
        ];
    }

    /**
     * The variation selectors of the product page: one group per variation type (named as the seller named them, for
     * example Color and Size), and every combination with its own stock, so the page can disable an option whose
     * combination is sold out (Black + M) while the same option stays available with another (Natural + M).
     */
    private function buildVariantGroups(Product $product): array
    {
        $variants = $product->variants;
        if ($variants->isEmpty()) {
            return [];
        }
        if ($variants->count() === 1 && in_array(strtolower(trim($variants->first()->label ?? '')), ['', 'default', 'standard'], true)) {
            return [];
        }

        $book = $this->book($product);
        $names = array_values($product->variation_types ?? []);
        $split = $variants->map(fn ($v) => ['variant' => $v, 'parts' => array_map('trim', explode('/', $v->label ?? ''))]);
        $dimensions = (int) $split->max(fn ($s) => count($s['parts']));

        $groups = [];
        for ($i = 0; $i < $dimensions; $i++) {
            $options = [];
            foreach ($split as $s) {
                $label = $s['parts'][$i] ?? '';
                if ($label === '') {
                    continue;
                }
                $unit = $book->unit($s['variant']);
                if (! isset($options[$label])) {
                    $options[$label] = [
                        'id'             => (crc32("{$i}:{$label}") & 0x7fffffff) ?: ($i * 100 + count($options) + 1),
                        'label'          => $label,
                        'stock_quantity' => 0,
                        'price'          => $unit['price'],
                        'original_price' => $unit['price'] < $unit['regular'] ? $unit['regular'] : null,
                        'sku'            => $s['variant']->sku,
                    ];
                }
                $options[$label]['stock_quantity'] += (int) $s['variant']->stock_quantity;
            }
            if ($options) {
                $groups[] = ['name' => $names[$i] ?? ($dimensions === 1 ? 'Variation' : 'Variation ' . ($i + 1)), 'position' => $i, 'options' => array_values($options)];
            }
        }

        return $groups;
    }

    /** @return array<int, array<string, mixed>> every variant as its options, price and stock */
    private function combinations(Product $product): array
    {
        $book = $this->book($product);

        return $product->variants->map(function ($v) use ($book) {
            $unit = $book->unit($v);

            return [
                'variant_id'     => $v->id,
                'label'          => $v->label,
                'parts'          => array_map('trim', explode('/', $v->label ?? '')),
                'stock_quantity' => (int) $v->stock_quantity,
                'price'          => $unit['price'],
                'original_price' => $unit['price'] < $unit['regular'] ? $unit['regular'] : null,
                'price_source'   => $unit['source'],
            ];
        })->values()->all();
    }

    private function formatProductDetail(Product $product): array
    {
        $base    = $this->formatProduct($product);
        $profile = $product->seller?->sellerProfile;

        $category = $product->category()->with('parent:id,name,slug')->first(['id', 'name', 'slug', 'parent_id']);
        $shopProducts = Product::where('seller_id', $product->seller_id)->where('status', 'active');
        $shopRating = Review::whereIn('product_id', (clone $shopProducts)->select('id'))->avg('rating');

        $book = $this->book($product);
        $sale = $book->saleFor($product->id);
        $nextFlash = \App\Models\FlashSale::where('product_id', $product->id)->whereNull('ended_at')
            ->where('slot_start', '>', now())->orderBy('slot_start')->first();
        $viewer = auth('sanctum')->user();

        return array_merge($base, [
            'variation_types' => $product->variation_types ?? [],
            'combinations'    => $this->combinations($product),
            // The store sale running now, for its badge and end time.
            'store_sale'      => $sale ? [
                'id' => $sale->id, 'type' => $sale->discount_type, 'percent' => $sale->discount_percent,
                'sale_price' => $sale->sale_price !== null ? (float) $sale->sale_price : null, 'ends_at' => $sale->ends_at->toIso8601String(),
            ] : null,
            // A flash sale scheduled later, for the "upcoming flash sale" notice and the reminder button.
            'upcoming_flash_sale' => $nextFlash ? [
                'id' => $nextFlash->id, 'price' => (float) $nextFlash->flash_price, 'quantity' => $nextFlash->quantity,
                'starts_at' => $nextFlash->slot_start->toIso8601String(), 'ends_at' => $nextFlash->slot_end->toIso8601String(),
                'reminder_set' => $viewer ? \App\Models\FlashSaleReminder::where('flash_sale_id', $nextFlash->id)->where('user_id', $viewer->id)->exists() : false,
            ] : null,
            // Where it sits in the catalog (breadcrumb, specifications).
            'category' => $category ? [
                'slug'   => $category->slug,
                'name'   => $category->name,
                'parent' => $category->parent ? ['slug' => $category->parent->slug, 'name' => $category->parent->name] : null,
            ] : null,
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
                'shop_slug'       => Str::slug($profile?->shop_name ?? ('shop-' . $product->seller_id)),
                'product_count'   => (clone $shopProducts)->count(),
                'avg_rating'      => $shopRating !== null ? round((float) $shopRating, 1) : null,
                'joined_at'       => ($profile?->reviewed_at ?? $profile?->created_at)?->toIso8601String(),
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
