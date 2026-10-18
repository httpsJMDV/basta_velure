<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Catalog\ProductEditor;
use App\Services\Pricing\PriceBook;
use App\Support\Validation;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The seller's products (Seller workbook S4 to S6). A seller whose store is not approved yet can save drafts; only an
 * approved store publishes (A18). Publishing makes the product Active at once; a double-clicked Publish creates one
 * product (A37). A product or variant with unfinished orders cannot be deleted; other deletes are soft (A19).
 */
class SellerProductController extends Controller
{
    public function __construct(private readonly ProductEditor $editor) {}

    /** GET /seller/products */
    public function index(Request $request): JsonResponse
    {
        $products = Product::with(['variants', 'images', 'category', 'storeCategories'])
            ->where('seller_id', $request->user()->id)
            ->latest()
            ->get();
        $book = PriceBook::for($products->pluck('id'));

        return response()->json(['data' => $products->map(fn ($p) => $this->formatProduct($p, $book))]);
    }

    /** GET /seller/products/{product} */
    public function show(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $product->load(['variants', 'images', 'category', 'storeCategories']);

        return response()->json(['data' => $this->formatProduct($product, PriceBook::for([$product->id]))]);
    }

    /** POST /seller/products: a draft (status draft) or a published product (status active). */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $publish = $this->wantsPublish($request);
        $this->guardPublish($request, $publish);

        $key = trim((string) ($request->header('Idempotency-Key') ?? $request->input('publish_key', '')));
        if ($key !== '' && ($existing = Product::where('seller_id', $user->id)->where('publish_key', $key)->first())) {
            return $this->repeat($existing);
        }

        $data = $request->validate($this->editor->rules($publish), $this->editor->messages());
        $this->editor->checkVariants($data['variants'] ?? [], null, $user->id);
        $this->editor->checkStoreCategories($data['store_category_ids'] ?? [], $user->id);
        if ($publish && count($request->file('images', [])) < 1) {
            throw ValidationException::withMessages(['images' => 'Add at least one product image to publish.']);
        }
        $data['publish_key'] = $key !== '' ? $key : null;

        try {
            $product = $this->editor->save(null, $data, $request, $user->id, $publish ? 'active' : 'draft');
        } catch (QueryException $e) {
            // Two identical submits at the same moment: the unique publish key lets only one in.
            if ($key !== '' && ($existing = Product::where('seller_id', $user->id)->where('publish_key', $key)->first())) {
                return $this->repeat($existing);
            }
            throw $e;
        }

        return response()->json([
            'message' => $publish ? 'Product published. Buyers can find it now.' : 'Draft saved.',
            'data'    => $this->formatProduct($product, PriceBook::for([$product->id])),
        ], 201);
    }

    /** POST /seller/products/{product}: save changes; status active publishes, status draft keeps it a draft. */
    public function update(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $product->load(['variants', 'images']);
        $publish = $this->wantsPublish($request, $product);
        $this->guardPublish($request, $publish);

        $data = $request->validate($this->editor->rules($publish, $product), $this->editor->messages());
        $this->editor->checkVariants($data['variants'] ?? $product->variants->map(fn ($v) => ['id' => $v->id, 'label' => $v->label, 'sku' => $v->sku])->all(), $product, $request->user()->id);
        $this->editor->checkStoreCategories($data['store_category_ids'] ?? [], $request->user()->id);

        if ($publish) {
            $remaining = $product->images->count() - count(array_intersect($product->images->pluck('id')->all(), array_map('intval', $data['delete_image_ids'] ?? [])));
            if ($remaining + count($request->file('images', [])) < 1) {
                throw ValidationException::withMessages(['images' => 'Add at least one product image to publish.']);
            }
        }

        $status = match (true) {
            $publish                               => 'active',
            $request->input('status') === 'draft'  => 'draft',
            $request->input('status') === 'archived' => 'archived',
            default                                => $product->status,
        };
        $product = $this->editor->save($product, $data, $request, $request->user()->id, $status);

        return response()->json([
            'message' => 'Product saved.',
            'data'    => $this->formatProduct($product, PriceBook::for([$product->id])),
        ]);
    }

    /** POST /seller/products/{product}/duplicate: a draft copy with a new id. */
    public function duplicate(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $copy = $this->editor->duplicate($product);

        return response()->json([
            'message' => 'Copy saved as a draft. Check it and publish when ready.',
            'data'    => $this->formatProduct($copy, PriceBook::for([$copy->id])),
        ], 201);
    }

    /** PATCH /seller/products/{product}/stock {stock, variant_id?}: whole numbers from 0 to 99,999 (A17). */
    public function updateStock(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $data = $request->validate([
            'stock'      => Validation::stock(),
            'variant_id' => ['nullable', 'integer'],
        ], [
            'stock.required' => 'Enter the stock.',
            'stock.integer'  => 'Stock must be a whole number from 0 to 99,999.',
            'stock.min'      => 'Stock must be a whole number from 0 to 99,999.',
            'stock.max'      => 'Stock must be a whole number from 0 to 99,999.',
        ]);

        $variants = $product->variants;
        $target = ! empty($data['variant_id']) ? $variants->firstWhere('id', (int) $data['variant_id']) : ($variants->count() === 1 ? $variants->first() : null);
        if (! $target) {
            throw ValidationException::withMessages(['variant_id' => 'Choose which variant to restock.']);
        }
        $target->update(['stock_quantity' => (int) $data['stock']]);

        return response()->json(['data' => $this->formatProduct($product->fresh(['variants', 'images', 'category', 'storeCategories']), PriceBook::for([$product->id]))]);
    }

    /** PATCH /seller/products/{product}/price {price, variant_id?} */
    public function updatePrice(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $data = $request->validate([
            'price'      => Validation::price(),
            'variant_id' => ['nullable', 'integer'],
        ], [
            'price.decimal' => 'The price can have at most 2 decimal places.',
            'price.min'     => 'The price must be at least ₱1.00.',
            'price.max'     => 'The price must be ₱1,000,000.00 or less.',
        ]);

        $variants = $product->variants;
        $target = ! empty($data['variant_id']) ? $variants->firstWhere('id', (int) $data['variant_id']) : ($variants->count() === 1 ? $variants->first() : null);
        if (! $target) {
            throw ValidationException::withMessages(['variant_id' => 'Choose which variant to reprice.']);
        }
        DB::transaction(function () use ($product, $target, $data) {
            $target->update(['price' => $data['price'], 'original_price' => null]);
            $product->forceFill(['base_price' => $product->variants()->min('price')])->save();
        });

        return response()->json(['data' => $this->formatProduct($product->fresh(['variants', 'images', 'category', 'storeCategories']), PriceBook::for([$product->id]))]);
    }

    /** PATCH /seller/products/{product}/status {status: active|archived}: publish or reactivate, or deactivate. */
    public function updateStatus(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        $data = $request->validate(['status' => 'required|in:pending_review,active,archived']);
        $target = $data['status'] === 'pending_review' ? 'active' : $data['status'];

        if ($target === 'active') {
            $this->guardPublish($request, true);
            if ($product->status === 'archived' && $product->archived_by === 'admin') {
                return response()->json(['message' => 'This product was archived by Loved-IT. Edit it to fix the issue, then publish it again.'], 422);
            }
            if ($problems = $this->editor->publishProblems($product)) {
                throw ValidationException::withMessages($problems);
            }
            $product->update(['status' => 'active', 'archived_by' => null, 'archive_reason' => null, 'published_at' => $product->published_at ?? now()]);
        } else {
            $product->update(['status' => 'archived', 'archived_by' => 'seller', 'archive_reason' => null]);
        }

        return response()->json([
            'message' => $target === 'active' ? 'Product is live.' : 'Product deactivated. Buyers no longer see it.',
            'data'    => $this->formatProduct($product->fresh(['variants', 'images', 'category', 'storeCategories']), PriceBook::for([$product->id])),
        ]);
    }

    /** DELETE /seller/products/{product}: refused while the product is in an unfinished order (A19). */
    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        if ($product->hasUnfinishedOrders()) {
            return response()->json(['message' => 'This product has unfinished orders and cannot be deleted yet. Deactivate it instead.'], 422);
        }
        $product->delete();

        return response()->json(null, 204);
    }

    /**
     * POST /seller/products/bulk {action: deactivate|activate|delete, ids[]}: every product the seller owns is tried; the
     * response says which were done and which were skipped, with the reason.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => 'required|in:deactivate,activate,delete',
            'ids'    => 'required|array|min:1|max:200',
            'ids.*'  => 'integer',
        ]);
        if ($data['action'] === 'activate') {
            $this->guardPublish($request, true);
        }

        $done = [];
        $skipped = [];
        $products = Product::with(['variants', 'images'])->where('seller_id', $request->user()->id)->whereIn('id', $data['ids'])->get();
        foreach ($products as $product) {
            $reason = match ($data['action']) {
                'delete'   => $product->hasUnfinishedOrders() ? 'It has unfinished orders.' : null,
                'activate' => ($p = $this->editor->publishProblems($product)) ? reset($p) : ($product->archived_by === 'admin' ? 'It was archived by Loved-IT.' : null),
                default    => null,
            };
            if ($reason) {
                $skipped[] = ['id' => $product->id, 'name' => $product->name, 'reason' => $reason];
                continue;
            }
            match ($data['action']) {
                'delete'     => $product->delete(),
                'activate'   => $product->update(['status' => 'active', 'archived_by' => null, 'published_at' => $product->published_at ?? now()]),
                'deactivate' => $product->update(['status' => 'archived', 'archived_by' => 'seller']),
            };
            $done[] = ['id' => $product->id, 'name' => $product->name];
        }
        foreach (array_diff($data['ids'], $products->pluck('id')->all()) as $missing) {
            $skipped[] = ['id' => (int) $missing, 'name' => null, 'reason' => 'Not found in your store.'];
        }

        $verb = ['delete' => 'deleted', 'activate' => 'activated', 'deactivate' => 'deactivated'][$data['action']];

        return response()->json([
            'message' => count($done) . " product(s) {$verb}" . ($skipped ? ', ' . count($skipped) . ' skipped.' : '.'),
            'done'    => $done,
            'skipped' => $skipped,
        ]);
    }

    /** POST /seller/products/description-image */
    public function uploadDescriptionImage(Request $request): JsonResponse
    {
        $request->validate(['image' => Validation::image()], Validation::uploadMessages('image', 'the image'));
        $path = $request->file('image')->store('products/descriptions', 'public');

        return response()->json(['url' => asset('storage/' . $path)]);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function wantsPublish(Request $request, ?Product $product = null): bool
    {
        $status = $request->input('status');
        if ($status === null) {
            return $product?->status === 'active';
        }

        return in_array($status, ['active', 'pending_review', 'publish'], true);
    }

    /** Only an approved store publishes (A18). */
    private function guardPublish(Request $request, bool $publish): void
    {
        if ($publish && $request->user()->sellerProfile?->application_status !== 'approved') {
            abort(403, 'Your store must be approved before you can publish products. You can save drafts in the meantime.');
        }
    }

    private function repeat(Product $product): JsonResponse
    {
        $product->load(['variants', 'images', 'category', 'storeCategories']);

        return response()->json([
            'message'  => 'This product was already saved.',
            'repeated' => true,
            'data'     => $this->formatProduct($product, PriceBook::for([$product->id])),
        ]);
    }

    private function authorizeProduct(Product $product, Request $request): void
    {
        abort_if($product->seller_id !== $request->user()->id, 403);
    }

    private function formatProduct(Product $product, PriceBook $book): array
    {
        $primaryImage = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
        $range = $book->range($product);
        $sale = $book->saleFor($product->id);

        return [
            'id'                   => $product->id,
            'name'                 => $product->name,
            'description'          => $product->description,
            'category_id'          => $product->category?->slug ?? '',
            'thumbnail_url'        => $primaryImage ? asset('storage/' . $primaryImage->path) : null,
            'base_price'           => (float) $product->base_price,
            'original_price'       => $range['min'] < $range['regular_min'] ? $range['regular_min'] : null,
            'price_range'          => $range,
            'discount_percent'     => $sale?->discount_type === 'percent' ? $sale->discount_percent : null,
            'status'               => $product->status,
            'units_sold'           => $product->units_sold,
            'rejection_reason'     => $product->rejection_reason,
            'archive_reason'       => $product->archive_reason,
            'archived_by'          => $product->archived_by,
            'created_at'           => $product->created_at,
            'published_at'         => $product->published_at?->toIso8601String(),
            'total_stock'          => $product->variants->sum('stock_quantity'),
            'weight_kg'            => $product->weight_kg,
            'dimension_l_cm'       => $product->dimension_l_cm,
            'dimension_w_cm'       => $product->dimension_w_cm,
            'dimension_h_cm'       => $product->dimension_h_cm,
            'sku'                  => $product->sku,
            'variation_types'      => $product->variation_types ?? [],
            'purchase_limit'       => $product->purchase_limit,
            'store_category_ids'   => $product->relationLoaded('storeCategories') ? $product->storeCategories->pluck('id')->values() : [],
            'net_weight_volume'    => $product->net_weight_volume,
            'expiry_best_before'   => $product->expiry_best_before,
            'ingredients'          => $product->ingredients,
            'storage_instructions' => $product->storage_instructions,
            'allergen_info'        => $product->allergen_info,
            'fda_lto_on_file'      => ! empty($product->fda_lto_path),
            'fda_cpr_on_file'      => ! empty($product->fda_cpr_path),
            'images'               => $product->images->sortBy('sort_order')->map(fn ($img) => [
                'id'         => $img->id,
                'url'        => asset('storage/' . $img->path),
                'is_primary' => (bool) $img->is_primary,
                'sort_order' => $img->sort_order,
            ])->values(),
            'variants'             => $product->variants->map(fn ($v) => [
                'id'             => $v->id,
                'label'          => $v->label,
                'sku'            => $v->sku,
                'stock_quantity' => $v->stock_quantity,
                'price'          => (float) $v->price,
                'regular_price'  => (float) $v->price,
                'current_price'  => $book->unit($v)['price'],
                'low_stock'      => $v->stock_quantity <= \App\Models\ProductVariant::LOW_STOCK_THRESHOLD,
            ])->values(),
        ];
    }
}
