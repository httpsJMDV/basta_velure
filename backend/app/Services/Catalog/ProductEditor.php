<?php

namespace App\Services\Catalog;

use App\Models\Category;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\StoreCategory;
use App\Support\Validation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Creating and editing a seller's products (Seller workbook S4, S5, A7, A16, A17, A19, A25).
 *
 * A draft needs only a name; publishing checks everything: name 5 to 120 characters, description 20 to 3,000
 * (visible text), a platform category, 1 to 9 JPG/PNG images up to 5 MB, a weight above 0, and for every variant a
 * price from ₱1.00 to ₱1,000,000.00 (2 decimals) and whole-number stock from 0 to 99,999. Variants are kept by id, so
 * a variant with unfinished orders cannot be removed and orders keep pointing at the right one.
 */
class ProductEditor
{
    public const MAX_IMAGES = 9;
    public const MAX_TYPES = 2;
    public const MAX_OPTIONS = 20;
    /** The longest option name ("Midnight Blue", "XL"), as Shopee and Lazada allow. */
    public const OPTION_MAX = 20;

    /** Field rules for the request; $publish turns on the publish requirements. */
    public function rules(bool $publish, ?Product $existing = null): array
    {
        $required = $publish ? 'required' : 'nullable';

        return [
            'name'                 => Validation::displayName(5, 120),
            'description'          => [$required, 'string', 'max:20000', function ($attr, $value, $fail) use ($publish) {
                $length = mb_strlen(self::visibleText($value));
                if ($publish && $length < 20) {
                    $fail('The description must be at least 20 characters.');
                } elseif ($length > 3000) {
                    $fail('The description must be 3,000 characters or fewer.');
                }
            }],
            'category_slug'        => [$required, 'string', 'max:100', 'exists:categories,slug', function ($attr, $value, $fail) use ($existing) {
                // An inactive category, or a parent that has sub-categories, cannot take new listings. A product
                // already filed there may keep it while it is edited.
                $category = Category::withCount('children')->where('slug', $value)->first();
                if (! $category || $category->id === $existing?->category_id) {
                    return;
                }
                if (! $category->is_active) {
                    $fail('This category is no longer open for new listings. Choose another.');
                } elseif ($category->children_count > 0) {
                    $fail('Choose one of the sub-categories of ' . $category->name . '.');
                }
            }],
            'store_category_ids'   => ['nullable', 'array', 'max:' . StoreCategory::MAX_PER_PRODUCT],
            'store_category_ids.*' => ['integer', 'distinct'],
            'variation_types'      => ['nullable', 'array', 'max:' . self::MAX_TYPES],
            'variation_types.*'    => ['string', 'min:1', 'max:20'],
            'variants'             => [$required, 'array', 'min:1', 'max:400'],
            'variants.*.id'        => ['nullable', 'integer'],
            'variants.*.label'     => ['nullable', 'string', 'max:255'],
            'variants.*.price'     => $publish ? Validation::price() : ['nullable', 'numeric', 'decimal:0,2', 'min:1', 'max:1000000'],
            'variants.*.stock'     => $publish ? Validation::stock() : Validation::stock(required: false),
            'variants.*.sku'       => ['nullable', 'string', 'max:100', 'regex:' . Validation::SKU_REGEX],
            'weight_kg'            => [$required, 'numeric', 'gt:0', 'max:1000'],
            'dimension_l_cm'       => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'dimension_w_cm'       => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'dimension_h_cm'       => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'purchase_limit'       => ['nullable', 'integer', 'min:1', 'max:99999'],
            // A29: follow the shop's low-stock level, use this product's own (0: only when it sells out), or no alert.
            'low_stock_alert'      => ['nullable', 'in:shop,custom,off'],
            'low_stock_threshold'  => ['nullable', 'required_if:low_stock_alert,custom', 'integer', 'min:0', 'max:999'],
            'sku'                  => ['nullable', 'string', 'max:100', 'regex:' . Validation::SKU_REGEX],
            'images'               => ['nullable', 'array', 'max:' . self::MAX_IMAGES],
            'images.*'             => Validation::image(),
            'delete_image_ids'     => ['nullable', 'array'],
            'delete_image_ids.*'   => ['integer'],
            'fda_lto'              => Validation::document(required: false),
            'fda_cpr'              => Validation::document(required: false),
            'net_weight_volume'    => ['nullable', 'string', 'max:10'],
            'expiry_best_before'   => ['nullable', 'string', 'max:50'],
            'ingredients'          => ['nullable', 'string', 'max:500'],
            'storage_instructions' => ['nullable', 'string', 'max:500'],
            'allergen_info'        => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            ...Validation::displayNameMessages('name', 'Product name', 5, 120),
            'sku.regex'              => 'An SKU may use letters, numbers, dots, dashes and underscores only.',
            'weight_kg.max'          => 'The weight must be 1,000 kg or less.',
            'dimension_l_cm.max'     => 'Each dimension must be 1,000 cm or less.',
            'dimension_w_cm.max'     => 'Each dimension must be 1,000 cm or less.',
            'dimension_h_cm.max'     => 'Each dimension must be 1,000 cm or less.',
            'description.required'   => 'A description of at least 20 characters is required to publish.',
            'category_slug.required' => 'Choose a platform category.',
            'category_slug.exists'   => 'Choose a platform category from the list.',
            'store_category_ids.max' => 'A product can be in at most 3 store categories.',
            'variation_types.max'    => 'A product can have at most 2 variation types.',
            'variants.required'      => 'Add a price and stock to publish.',
            'variants.*.price.required' => 'Enter a price.',
            'variants.*.price.numeric'  => 'The price must be a number.',
            'variants.*.price.decimal'  => 'The price can have at most 2 decimal places.',
            'variants.*.price.min'      => 'The price must be at least ₱1.00.',
            'variants.*.price.max'      => 'The price must be ₱1,000,000.00 or less.',
            'variants.*.stock.required' => 'Enter the stock.',
            'variants.*.stock.integer'  => 'Stock must be a whole number from 0 to 99,999.',
            'variants.*.stock.min'      => 'Stock must be a whole number from 0 to 99,999.',
            'variants.*.stock.max'      => 'Stock must be a whole number from 0 to 99,999.',
            'variants.*.sku.regex'      => 'An SKU may use letters, numbers, dots, dashes and underscores only.',
            'weight_kg.required'     => 'Enter the weight to publish.',
            'weight_kg.gt'           => 'The weight must be more than 0 kg.',
            'weight_kg.numeric'      => 'The weight must be a number.',
            'dimension_l_cm.gt'      => 'Dimensions must be more than 0 cm.',
            'dimension_w_cm.gt'      => 'Dimensions must be more than 0 cm.',
            'dimension_h_cm.gt'      => 'Dimensions must be more than 0 cm.',
            'dimension_l_cm.numeric' => 'Dimensions must be numbers.',
            'dimension_w_cm.numeric' => 'Dimensions must be numbers.',
            'dimension_h_cm.numeric' => 'Dimensions must be numbers.',
            'purchase_limit.min'     => 'The purchase limit must be at least 1.',
            'low_stock_threshold.required_if' => 'Enter the stock level for this product\'s alert (0 alerts only when it sells out).',
            'low_stock_threshold.integer'     => 'The alert level must be a whole number from 0 to 999.',
            'low_stock_threshold.min'         => 'The alert level must be a whole number from 0 to 999.',
            'low_stock_threshold.max'         => 'The alert level must be a whole number from 0 to 999.',
            'images.max'             => 'A product can have at most 9 images.',
            'images.*.mimes'         => 'Product images must be JPG or PNG files.',
            'images.*.max'           => 'Each product image must be 5 MB or smaller.',
            'images.*.uploaded'      => 'An image could not be uploaded. Use JPG or PNG files up to 5 MB.',
        ];
    }

    /** The visible text of a rich-text description. */
    public static function visibleText(mixed $html): string
    {
        return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags((string) $html), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    /**
     * Checks the variants beyond per-field rules: at most 2 variation types with 1 to 20 options each, no empty or
     * duplicate option (ignoring case), SKUs unique in the product and in the seller's other products, and no removal
     * of a variant that still has unfinished orders.
     *
     * @param  array<int, array<string, mixed>>  $variants
     */
    public function checkVariants(array $variants, ?Product $existing, int $sellerId): void
    {
        $errors = [];
        $positions = [];
        $labels = [];
        $skus = [];

        foreach ($variants as $i => $v) {
            $label = trim((string) ($v['label'] ?? ''));
            $parts = $label === '' ? [] : array_map('trim', explode('/', $label));
            if (count($parts) > self::MAX_TYPES) {
                $errors["variants.{$i}.label"] = 'A product can have at most 2 variation types.';
            }
            foreach ($parts as $p => $part) {
                if ($part === '') {
                    $errors["variants.{$i}.label"] = 'Option names cannot be empty.';
                } elseif (mb_strlen($part) > self::OPTION_MAX || ! preg_match('/[\p{L}\p{N}]/u', $part)) {
                    $errors["variants.{$i}.label"] = 'Each option name is 1 to ' . self::OPTION_MAX . ' characters with a letter or number, like "Red" or "XL".';
                }
                $positions[$p][mb_strtolower($part)] = true;
            }
            $key = mb_strtolower(preg_replace('/\s*\/\s*/', ' / ', $label));
            if (isset($labels[$key])) {
                $errors["variants.{$i}.label"] = "\"{$label}\" is listed twice. Option names must be unique (ignoring upper and lower case).";
            }
            $labels[$key] = true;

            $sku = trim((string) ($v['sku'] ?? ''));
            if ($sku !== '') {
                $skuKey = mb_strtolower($sku);
                if (isset($skus[$skuKey])) {
                    $errors["variants.{$i}.sku"] = "SKU {$sku} is used by two variants. Each variant needs its own SKU.";
                }
                $skus[$skuKey] = $i;
            }
        }
        foreach ($positions as $p => $options) {
            if (count($options) > self::MAX_OPTIONS) {
                $errors['variation_types'] = 'Each variation type can have at most 20 options.';
            }
        }

        if ($skus) {
            $taken = ProductVariant::query()
                ->whereHas('product', fn ($q) => $q->where('seller_id', $sellerId)->when($existing, fn ($w) => $w->where('id', '!=', $existing->id)))
                ->whereIn(DB::raw('LOWER(sku)'), array_keys($skus))
                ->pluck('sku');
            foreach ($taken as $sku) {
                $i = $skus[mb_strtolower($sku)];
                $errors["variants.{$i}.sku"] = "SKU {$sku} is already used by another of your products.";
            }
        }

        if ($existing) {
            $keep = collect($variants)->pluck('id')->filter()->map(fn ($id) => (int) $id)->all();
            foreach ($existing->variants as $variant) {
                if (! in_array($variant->id, $keep, true) && $existing->hasUnfinishedOrders($variant->id)) {
                    $errors['variants'] = "\"{$variant->label}\" has unfinished orders and cannot be removed. Set its stock to 0 instead.";
                }
            }
            foreach ($keep as $id) {
                if (! $existing->variants->contains('id', $id)) {
                    $errors['variants'] = 'A variant does not belong to this product.';
                }
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    /** @param array<int, int> $ids */
    public function checkStoreCategories(array $ids, int $sellerId): void
    {
        if ($ids && StoreCategory::where('seller_id', $sellerId)->whereIn('id', $ids)->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['store_category_ids' => 'Choose store categories from your own store.']);
        }
    }

    /**
     * Saves the product (new when $product is null) with its variants, images and store categories.
     *
     * @param  array<string, mixed>  $data  validated input
     */
    public function save(?Product $product, array $data, Request $request, int $sellerId, string $status): Product
    {
        $stored = [];
        try {
            return DB::transaction(function () use ($product, $data, $request, $sellerId, $status, &$stored) {
                $categoryId = ! empty($data['category_slug']) ? Category::where('slug', $data['category_slug'])->value('id') : $product?->category_id;
                $store = function (string $key, string $dir, string $disk) use ($request, &$stored) {
                    if (! $request->hasFile($key)) {
                        return null;
                    }
                    $path = $request->file($key)->store($dir, $disk);
                    $stored[] = [$disk, $path];

                    return $path;
                };

                $fields = [
                    'category_id'          => $categoryId,
                    'name'                 => trim($data['name']),
                    'description'          => $data['description'] ?? $product?->description,
                    'status'               => $status,
                    'weight_kg'            => $data['weight_kg'] ?? null,
                    'dimension_l_cm'       => $data['dimension_l_cm'] ?? null,
                    'dimension_w_cm'       => $data['dimension_w_cm'] ?? null,
                    'dimension_h_cm'       => $data['dimension_h_cm'] ?? null,
                    'sku'                  => $data['sku'] ?? null,
                    'variation_types'      => array_values(array_filter(array_map('trim', $data['variation_types'] ?? []))) ?: null,
                    'purchase_limit'       => $data['purchase_limit'] ?? null,
                    'net_weight_volume'    => $data['net_weight_volume'] ?? null,
                    'expiry_best_before'   => $data['expiry_best_before'] ?? null,
                    'ingredients'          => $data['ingredients'] ?? null,
                    'storage_instructions' => $data['storage_instructions'] ?? null,
                    'allergen_info'        => $data['allergen_info'] ?? null,
                ];
                // An older form that sends no alert setting keeps the product's current one.
                $alert = $data['low_stock_alert'] ?? $product?->low_stock_alert ?? 'shop';
                $fields['low_stock_alert'] = $alert;
                $fields['low_stock_threshold'] = $alert === 'custom'
                    ? (int) (array_key_exists('low_stock_threshold', $data) ? $data['low_stock_threshold'] : $product?->low_stock_threshold)
                    : null;
                if ($status === 'active') {
                    $fields['published_at'] = $product?->published_at ?? now();
                    $fields['archived_by'] = null;
                    $fields['archive_reason'] = null;
                }
                if ($path = $store('fda_lto', 'products/fda', 'local')) {
                    $fields['fda_lto_path'] = $path;
                }
                if ($path = $store('fda_cpr', 'products/fda', 'local')) {
                    $fields['fda_cpr_path'] = $path;
                }

                if ($product) {
                    $product->update($fields);
                } else {
                    $product = Product::create($fields + [
                        'seller_id'   => $sellerId,
                        'base_price'  => 0,
                        'publish_key' => $data['publish_key'] ?? null,
                    ]);
                }

                $this->saveVariants($product, $data['variants'] ?? null);
                $this->saveImages($product, $request, $data['delete_image_ids'] ?? [], $stored);

                if (array_key_exists('store_category_ids', $data)) {
                    $product->storeCategories()->sync(array_map('intval', $data['store_category_ids'] ?? []));
                }

                return $product->fresh(['variants', 'images', 'category', 'storeCategories']);
            });
        } catch (\Throwable $e) {
            foreach ($stored as [$disk, $path]) {
                Storage::disk($disk)->delete($path);
            }
            throw $e;
        }
    }

    /** @param array<int, array<string, mixed>>|null $variants */
    private function saveVariants(Product $product, ?array $variants): void
    {
        if ($variants === null) {
            if ($product->variants()->doesntExist()) {
                $product->variants()->create(['label' => 'Standard', 'price' => 0, 'stock_quantity' => 0]);
            }
        } else {
            $keep = [];
            foreach ($variants as $v) {
                $values = [
                    'label'          => trim((string) ($v['label'] ?? '')) ?: 'Standard',
                    'price'          => $v['price'] ?? 0,
                    'stock_quantity' => (int) ($v['stock'] ?? 0),
                    'sku'            => isset($v['sku']) && trim((string) $v['sku']) !== '' ? trim((string) $v['sku']) : null,
                    'original_price' => null,
                ];
                $variant = ! empty($v['id']) ? $product->variants()->whereKey((int) $v['id'])->first() : null;
                if ($variant) {
                    $variant->update($values);
                } else {
                    $variant = $product->variants()->create($values);
                }
                $keep[] = $variant->id;
            }
            // Removed variants are soft deleted: carts and orders that point at them still know what they were.
            $product->variants()->whereNotIn('id', $keep)->get()->each->delete();
        }

        $cheapest = $product->variants()->min('price');
        $product->forceFill(['base_price' => $cheapest ?? 0, 'original_price' => null, 'discount_percent' => null])->save();
    }

    /** @param array<int, int> $deleteIds */
    private function saveImages(Product $product, Request $request, array $deleteIds, array &$stored): void
    {
        if ($deleteIds) {
            foreach ($product->images()->whereIn('id', $deleteIds)->get() as $img) {
                Storage::disk('public')->delete($img->path);
                $img->delete();
            }
        }

        $files = array_values($request->file('images', []));
        if (($product->images()->count() + count($files)) > self::MAX_IMAGES) {
            throw ValidationException::withMessages(['images' => 'A product can have at most 9 images.']);
        }
        $offset = (int) $product->images()->max('sort_order') + ($product->images()->exists() ? 1 : 0);
        foreach ($files as $i => $file) {
            $path = $file->store('products/images', 'public');
            $stored[] = ['public', $path];
            $product->images()->create(['path' => $path, 'is_primary' => false, 'sort_order' => $offset + $i]);
        }

        $images = $product->images()->get();
        if ($images->isNotEmpty() && ! $images->contains('is_primary', true)) {
            $images->sortBy('sort_order')->first()->update(['is_primary' => true]);
        }
    }

    /**
     * What stops a saved product from being published, field by field (SEL-PROD-010): nothing when it is complete.
     *
     * @return array<string, string>
     */
    public function publishProblems(Product $product): array
    {
        $product->loadMissing(['variants', 'images']);
        $problems = [];
        $nameLength = mb_strlen(trim((string) $product->name));
        if ($nameLength < 5 || $nameLength > 120) {
            $problems['name'] = 'Product name must be 5 to 120 characters.';
        }
        $descLength = mb_strlen(self::visibleText($product->description));
        if ($descLength < 20) {
            $problems['description'] = 'A description of at least 20 characters is required to publish.';
        } elseif ($descLength > 3000) {
            $problems['description'] = 'The description must be 3,000 characters or fewer.';
        }
        if (! $product->category_id) {
            $problems['category_slug'] = 'Choose a platform category.';
        }
        $images = $product->images->count();
        if ($images < 1) {
            $problems['images'] = 'Add at least one product image to publish.';
        } elseif ($images > self::MAX_IMAGES) {
            $problems['images'] = 'A product can have at most 9 images.';
        }
        if (! $product->weight_kg || (float) $product->weight_kg <= 0) {
            $problems['weight_kg'] = 'Enter a weight above 0 kg to publish.';
        }
        if ($product->variants->isEmpty()) {
            $problems['variants'] = 'Add a price and stock to publish.';
        }
        foreach ($product->variants->values() as $i => $v) {
            if ((float) $v->price < 1 || (float) $v->price > 1000000) {
                $problems["variants.{$i}.price"] = 'The price must be from ₱1.00 to ₱1,000,000.00.';
            }
            if ($v->stock_quantity < 0 || $v->stock_quantity > 99999) {
                $problems["variants.{$i}.stock"] = 'Stock must be a whole number from 0 to 99,999.';
            }
        }
        $product->loadMissing('category');

        return $problems + $this->fdaProblems($product->category, $product, (int) $product->seller_id);
    }

    /**
     * A category marked "requires FDA" (food, supplements) publishes only with an FDA License to Operate (the shop's:
     * on this product, on another of its products, or from the seller application) and this product's own CPR/CPN.
     * $ltoUpload / $cprUpload count a file sent with the same request.
     *
     * @return array<string, string>
     */
    public function fdaProblems(?Category $category, ?Product $product, int $sellerId, bool $ltoUpload = false, bool $cprUpload = false): array
    {
        if (! $category?->requires_fda) {
            return [];
        }
        $problems = [];
        if (! $ltoUpload && ! $this->shopHasLto($sellerId, $product)) {
            $problems['fda_lto'] = 'Upload your FDA License to Operate (LTO). ' . $category->name . ' products need it to be published.';
        }
        if (! $cprUpload && ! $product?->fda_cpr_path) {
            $problems['fda_cpr'] = 'Upload the CPR or CPN of this product. ' . $category->name . ' products need it to be published.';
        }

        return $problems;
    }

    /** Whether the shop already has an FDA LTO on file: this product's, another product's, or the application's. */
    public function shopHasLto(int $sellerId, ?Product $product = null): bool
    {
        return (bool) $product?->fda_lto_path
            || \App\Models\SellerProfile::where('user_id', $sellerId)->whereNotNull('fda_lto_path')->exists()
            || Product::where('seller_id', $sellerId)->whereNotNull('fda_lto_path')->exists();
    }

    /** A draft copy of a product: same details, variants and images (the files are copied), store categories kept. */
    public function duplicate(Product $source): Product
    {
        $source->loadMissing(['variants', 'images', 'storeCategories']);
        $copied = [];

        try {
            return DB::transaction(function () use ($source, &$copied) {
                $copy = $source->replicate(['units_sold', 'avg_rating', 'review_count', 'publish_key', 'published_at', 'rejection_reason', 'archive_reason', 'archived_by']);
                $copy->status = 'draft';
                $copy->units_sold = 0;
                $copy->save();

                foreach ($source->variants as $v) {
                    $copy->variants()->create([
                        'label' => $v->label, 'price' => $v->price, 'stock_quantity' => $v->stock_quantity,
                        // SKUs are unique per store, so the copy starts without them.
                        'sku' => null,
                    ]);
                }
                foreach ($source->images as $img) {
                    $ext = pathinfo($img->path, PATHINFO_EXTENSION);
                    $path = 'products/images/' . \Illuminate\Support\Str::uuid() . ($ext ? ".{$ext}" : '');
                    if (Storage::disk('public')->exists($img->path)) {
                        Storage::disk('public')->copy($img->path, $path);
                        $copied[] = $path;
                    } else {
                        $path = $img->path;
                    }
                    ProductImage::create(['product_id' => $copy->id, 'path' => $path, 'is_primary' => $img->is_primary, 'sort_order' => $img->sort_order]);
                }
                $copy->storeCategories()->sync($source->storeCategories->pluck('id'));

                return $copy->fresh(['variants', 'images', 'category', 'storeCategories']);
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($copied);
            throw $e;
        }
    }
}
