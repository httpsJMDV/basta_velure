<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\ProductImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SellerProductController extends Controller
{
    /** GET /seller/products — list the authenticated seller's products */
    public function index(Request $request): JsonResponse
    {
        $products = Product::with(['variants', 'images', 'category'])
            ->where('seller_id', $request->user()->id)
            ->latest()
            ->get()
            ->map(fn ($p) => $this->formatProduct($p));

        return response()->json(['data' => $products]);
    }

    /** GET /seller/products/{product} — fetch single product for edit form */
    public function show(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);
        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'category']))]);
    }

    /** PUT /seller/products/{product} — update an existing product */
    public function update(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);

        $data = $request->validate([
            'name'                => 'required|string|max:255',
            'description'         => 'nullable|string|max:1500',
            'category_slug'       => 'nullable|string|max:100',
            'base_price'          => 'nullable|numeric|min:0',
            'weight_kg'           => 'nullable|numeric|min:0',
            'dimension_l_cm'      => 'nullable|numeric|min:0',
            'dimension_w_cm'      => 'nullable|numeric|min:0',
            'dimension_h_cm'      => 'nullable|numeric|min:0',
            'sku'                 => 'nullable|string|max:100',
            'status'              => 'nullable|in:draft,pending_review,active,archived',
            'variants'            => 'nullable|array|min:1',
            'variants.*.label'    => 'required_with:variants|string|max:255',
            'variants.*.price'    => 'required_with:variants|numeric|min:0',
            'variants.*.stock'    => 'required_with:variants|integer|min:0',
            'variants.*.sku'      => 'nullable|string|max:100',
            'images'              => 'nullable|array',
            'images.*'            => 'image|max:5120',
            'delete_image_ids'    => 'nullable|array',
            'delete_image_ids.*'  => 'integer',
            'fda_lto'             => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
            'fda_cpr'             => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
            'net_weight_volume'   => 'nullable|string|max:10',
            'expiry_best_before'  => 'nullable|string|max:50',
            'ingredients'         => 'nullable|string|max:500',
            'storage_instructions'=> 'nullable|string|max:500',
            'allergen_info'       => 'nullable|string|max:500',
        ]);

        $product = DB::transaction(function () use ($request, $data, $product) {
            $categoryId = $product->category_id;
            if (!empty($data['category_slug'])) {
                $resolved = Category::where('slug', $data['category_slug'])->value('id');
                if ($resolved) $categoryId = $resolved;
            }

            $product->update([
                'category_id'          => $categoryId,
                'name'                 => $data['name'],
                'description'          => $data['description'] ?? null,
                'base_price'           => $data['base_price'] ?? 0,
                'status'               => $data['status'] ?? $product->status,
                'weight_kg'            => $data['weight_kg'] ?? null,
                'dimension_l_cm'       => $data['dimension_l_cm'] ?? null,
                'dimension_w_cm'       => $data['dimension_w_cm'] ?? null,
                'dimension_h_cm'       => $data['dimension_h_cm'] ?? null,
                'sku'                  => $data['sku'] ?? null,
                'net_weight_volume'    => $data['net_weight_volume'] ?? null,
                'expiry_best_before'   => $data['expiry_best_before'] ?? null,
                'ingredients'          => $data['ingredients'] ?? null,
                'storage_instructions' => $data['storage_instructions'] ?? null,
                'allergen_info'        => $data['allergen_info'] ?? null,
                'fda_lto_path'         => $request->hasFile('fda_lto')
                    ? $request->file('fda_lto')->store('products/fda', 'local')
                    : $product->fda_lto_path,
                'fda_cpr_path'         => $request->hasFile('fda_cpr')
                    ? $request->file('fda_cpr')->store('products/fda', 'local')
                    : $product->fda_cpr_path,
            ]);

            // Delete removed images
            if (!empty($data['delete_image_ids'])) {
                $toDelete = $product->images()->whereIn('id', $data['delete_image_ids'])->get();
                foreach ($toDelete as $img) {
                    Storage::disk('public')->delete($img->path);
                    $img->delete();
                }
            }

            // Replace variants
            if (!empty($data['variants'])) {
                $product->variants()->delete();
                foreach ($data['variants'] as $v) {
                    $product->variants()->create([
                        'label'          => $v['label'],
                        'price'          => $v['price'],
                        'stock_quantity' => $v['stock'],
                        'sku'            => $v['sku'] ?? null,
                    ]);
                }
            }

            // Append new images
            if ($request->hasFile('images')) {
                $offset = $product->images()->count();
                foreach ($request->file('images') as $i => $file) {
                    $path = $file->store('products/images', 'public');
                    $product->images()->create([
                        'path'       => $path,
                        'is_primary' => $offset === 0 && $i === 0,
                        'sort_order' => $offset + $i,
                    ]);
                }
            }

            // Re-assign primary if needed
            $product->load('images');
            if ($product->images->isNotEmpty() && !$product->images->contains('is_primary', true)) {
                $product->images()->oldest('sort_order')->first()?->update(['is_primary' => true]);
            }

            return $product->fresh(['variants', 'images', 'category']);
        });

        return response()->json(['data' => $this->formatProduct($product)]);
    }

    /** POST /seller/products — create a new product (draft or submit for review) */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                => 'required|string|max:255',
            'description'         => 'nullable|string|max:1500',
            'category_slug'       => 'nullable|string|max:100',
            'base_price'          => 'nullable|numeric|min:0',
            'weight_kg'           => 'nullable|numeric|min:0',
            'dimension_l_cm'      => 'nullable|numeric|min:0',
            'dimension_w_cm'      => 'nullable|numeric|min:0',
            'dimension_h_cm'      => 'nullable|numeric|min:0',
            'sku'                 => 'nullable|string|max:100',
            'status'              => 'in:draft,pending_review',
            'variants'            => 'nullable|array|min:1',
            'variants.*.label'    => 'required_with:variants|string|max:255',
            'variants.*.price'    => 'required_with:variants|numeric|min:0',
            'variants.*.stock'    => 'required_with:variants|integer|min:0',
            'variants.*.sku'      => 'nullable|string|max:100',
            'images'              => 'nullable|array',
            'images.*'            => 'image|max:5120',
            'fda_lto'             => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
            'fda_cpr'             => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240',
            'net_weight_volume'   => 'nullable|string|max:10',
            'expiry_best_before'  => 'nullable|string|max:50',
            'ingredients'         => 'nullable|string|max:500',
            'storage_instructions'=> 'nullable|string|max:500',
            'allergen_info'       => 'nullable|string|max:500',
        ]);

        $product = DB::transaction(function () use ($request, $data) {
            $categoryId = !empty($data['category_slug'])
                ? Category::where('slug', $data['category_slug'])->value('id')
                : null;

            $product = Product::create([
                'seller_id'            => $request->user()->id,
                'category_id'          => $categoryId,
                'name'                 => $data['name'],
                'description'          => $data['description'] ?? null,
                'base_price'           => $data['base_price'] ?? 0,
                'status'               => $data['status'] ?? 'draft',
                'weight_kg'            => $data['weight_kg'] ?? null,
                'dimension_l_cm'       => $data['dimension_l_cm'] ?? null,
                'dimension_w_cm'       => $data['dimension_w_cm'] ?? null,
                'dimension_h_cm'       => $data['dimension_h_cm'] ?? null,
                'sku'                  => $data['sku'] ?? null,
                'net_weight_volume'    => $data['net_weight_volume'] ?? null,
                'expiry_best_before'   => $data['expiry_best_before'] ?? null,
                'ingredients'          => $data['ingredients'] ?? null,
                'storage_instructions' => $data['storage_instructions'] ?? null,
                'allergen_info'        => $data['allergen_info'] ?? null,
                'fda_lto_path'         => $request->hasFile('fda_lto')
                    ? $request->file('fda_lto')->store('products/fda', 'local')
                    : null,
                'fda_cpr_path'         => $request->hasFile('fda_cpr')
                    ? $request->file('fda_cpr')->store('products/fda', 'local')
                    : null,
            ]);

            foreach ($data['variants'] as $v) {
                $product->variants()->create([
                    'label'          => $v['label'],
                    'price'          => $v['price'],
                    'stock_quantity' => $v['stock'],
                    'sku'            => $v['sku'] ?? null,
                ]);
            }

            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $i => $file) {
                    $path = $file->store('products/images', 'public');
                    $product->images()->create([
                        'path'       => $path,
                        'is_primary' => $i === 0,
                        'sort_order' => $i,
                    ]);
                }
            }

            return $product->load(['variants', 'images']);
        });

        return response()->json(['data' => $this->formatProduct($product)], 201);
    }

    /** PATCH /seller/products/{product}/stock — quick stock update */
    public function updateStock(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);

        $data = $request->validate(['stock' => 'required|integer|min:0']);

        DB::transaction(function () use ($product, $data) {
            if ($product->variants->count() === 1) {
                $product->variants->first()->update(['stock_quantity' => $data['stock']]);
            } else {
                $each = (int) floor($data['stock'] / max(1, $product->variants->count()));
                $product->variants()->update(['stock_quantity' => $each]);
            }
        });

        return response()->json(['data' => $this->formatProduct($product->fresh(['variants', 'images']))]);
    }

    /** PATCH /seller/products/{product}/price — quick price update (single-variant only) */
    public function updatePrice(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);

        $data = $request->validate(['price' => 'required|numeric|min:0.01']);

        DB::transaction(function () use ($product, $data) {
            $product->update(['base_price' => $data['price']]);
            if ($product->variants->count() === 1) {
                $product->variants->first()->update(['price' => $data['price']]);
            }
        });

        return response()->json(['data' => $this->formatProduct($product->fresh(['variants', 'images']))]);
    }

    /** PATCH /seller/products/{product}/status — submit for review / archive / unarchive */
    public function updateStatus(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);

        $data = $request->validate(['status' => 'required|in:pending_review,active,archived']);

        // Guard: can only submit draft, rejected, or admin-archived (after edit) for review
        if ($data['status'] === 'pending_review') {
            if (!in_array($product->status, ['draft', 'rejected']) &&
                !($product->status === 'archived' && $product->archived_by === 'admin')) {
                return response()->json(['message' => 'Only draft, rejected, or admin-archived products can be submitted for review.'], 422);
            }
        }

        // Guard: cannot archive a product that is pending review
        if ($data['status'] === 'archived' && $product->status === 'pending_review') {
            return response()->json(['message' => 'Cannot archive a product that is pending review.'], 422);
        }

        // Guard: seller cannot unarchive an admin-archived product
        if ($data['status'] === 'active' && $product->status === 'archived' && $product->archived_by === 'admin') {
            return response()->json(['message' => 'This product was archived by admin. Edit and resubmit for review to restore it.'], 422);
        }

        $updates = ['status' => $data['status']];
        // When seller archives their own product, track it
        if ($data['status'] === 'archived') {
            $updates['archived_by'] = 'seller';
            $updates['archive_reason'] = null;
        }
        // When seller unarchives their own product
        if ($data['status'] === 'active' && $product->archived_by === 'seller') {
            $updates['archived_by'] = null;
        }

        $product->update($updates);

        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images']))]);
    }

    /** DELETE /seller/products/{product} */
    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->authorizeProduct($product, $request);

        if (!in_array($product->status, ['draft', 'rejected'])) {
            return response()->json(['message' => 'Only draft or rejected products can be deleted.'], 422);
        }

        $product->delete();

        return response()->json(null, 204);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function authorizeProduct(Product $product, Request $request): void
    {
        abort_if($product->seller_id !== $request->user()->id, 403);
    }

    private function formatProduct(Product $product): array
    {
        $primaryImage = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

        return [
            'id'                   => $product->id,
            'name'                 => $product->name,
            'description'          => $product->description,
            'category_id'          => $product->category?->slug ?? '',
            'thumbnail_url'        => $primaryImage ? asset('storage/' . $primaryImage->path) : null,
            'base_price'           => (float) $product->base_price,
            'status'               => $product->status,
            'units_sold'           => $product->units_sold,
            'rejection_reason'     => $product->rejection_reason,
            'archive_reason'       => $product->archive_reason,
            'archived_by'          => $product->archived_by,
            'created_at'           => $product->created_at,
            'total_stock'          => $product->variants->sum('stock_quantity'),
            'weight_kg'            => $product->weight_kg,
            'dimension_l_cm'       => $product->dimension_l_cm,
            'dimension_w_cm'       => $product->dimension_w_cm,
            'dimension_h_cm'       => $product->dimension_h_cm,
            'sku'                  => $product->sku,
            'net_weight_volume'    => $product->net_weight_volume,
            'expiry_best_before'   => $product->expiry_best_before,
            'ingredients'          => $product->ingredients,
            'storage_instructions' => $product->storage_instructions,
            'allergen_info'        => $product->allergen_info,
            'fda_lto_on_file'      => !empty($product->fda_lto_path),
            'fda_cpr_on_file'      => !empty($product->fda_cpr_path),
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
            ])->values(),
        ];
    }

    /** POST /seller/products/description-image */
    public function uploadDescriptionImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|image|max:5120',
        ]);

        $path = $request->file('image')->store('products/descriptions', 'public');
        $url  = asset('storage/' . $path);

        return response()->json(['url' => $url]);
    }
}
