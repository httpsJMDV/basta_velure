<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\StoreCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The seller's store categories (Seller workbook S3, A7, A19, A25): a two-level menu on the store page, separate from
 * the platform categories. Names are 1 to 50 characters and unique within the store (ignoring case and surrounding
 * spaces). Deleting a category moves its products to Uncategorized (they are never hidden or deleted); deleting a
 * parent deletes its subcategories too.
 */
class SellerStoreCategoryController extends Controller
{
    /** GET /seller/store-categories: the tree, in order, with product counts. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => self::tree($request->user()->id, onlyVisible: false)]);
    }

    /** POST /seller/store-categories {name, parent_id?} */
    public function store(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $data = $this->validated($request, $sellerId);

        $category = StoreCategory::create([
            'seller_id'  => $sellerId,
            'parent_id'  => $data['parent_id'] ?? null,
            'name'       => $data['name'],
            'sort_order' => (int) StoreCategory::where('seller_id', $sellerId)->where('parent_id', $data['parent_id'] ?? null)->max('sort_order') + 1,
            'is_visible' => true,
        ]);

        return response()->json(['message' => "Category \"{$category->name}\" added.", 'data' => self::tree($sellerId, false)], 201);
    }

    /** PATCH /seller/store-categories/{category} {name?, is_visible?} */
    public function update(Request $request, int $category): JsonResponse
    {
        $sellerId = $request->user()->id;
        $cat = StoreCategory::where('seller_id', $sellerId)->findOrFail($category);

        $changes = [];
        if ($request->has('name')) {
            $changes['name'] = $this->validated($request, $sellerId, $cat)['name'];
        }
        if ($request->has('is_visible')) {
            $changes['is_visible'] = $request->validate(['is_visible' => ['required', 'boolean']])['is_visible'];
        }
        $cat->update($changes);

        return response()->json(['message' => 'Category saved.', 'data' => self::tree($sellerId, false)]);
    }

    /** POST /seller/store-categories/reorder {parent_id?, ids[]}: the new order of one level. */
    public function reorder(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $data = $request->validate([
            'parent_id' => ['nullable', 'integer'],
            'ids'       => ['required', 'array', 'min:1'],
            'ids.*'     => ['integer', 'distinct'],
        ]);
        $siblings = StoreCategory::where('seller_id', $sellerId)->where('parent_id', $data['parent_id'] ?? null)->pluck('id')->all();
        if (array_diff($data['ids'], $siblings) || count($data['ids']) !== count($siblings)) {
            throw ValidationException::withMessages(['ids' => 'Send every category of this level once, in the new order.']);
        }

        DB::transaction(function () use ($data) {
            foreach ($data['ids'] as $i => $id) {
                StoreCategory::whereKey($id)->update(['sort_order' => $i]);
            }
        });

        return response()->json(['message' => 'Order saved.', 'data' => self::tree($sellerId, false)]);
    }

    /** GET /seller/store-categories/{category}/delete-preview: what a delete would change, for the warning. */
    public function deletePreview(Request $request, int $category): JsonResponse
    {
        $cat = StoreCategory::with('children')->where('seller_id', $request->user()->id)->findOrFail($category);
        $ids = $cat->children->pluck('id')->push($cat->id);
        $products = DB::table('product_store_category')->whereIn('store_category_id', $ids)->distinct()->count('product_id');

        return response()->json(['data' => [
            'name'          => $cat->name,
            'subcategories' => $cat->children->pluck('name')->values(),
            'products'      => $products,
            'message'       => $products > 0
                ? "{$products} product(s) will move to Uncategorized. They stay active and buyable."
                : 'No products are in this category.',
        ]]);
    }

    /** DELETE /seller/store-categories/{category}: products move to Uncategorized; subcategories go with a parent. */
    public function destroy(Request $request, int $category): JsonResponse
    {
        $sellerId = $request->user()->id;
        $cat = StoreCategory::with('children')->where('seller_id', $sellerId)->findOrFail($category);
        $moved = DB::transaction(function () use ($cat) {
            $ids = $cat->children->pluck('id')->push($cat->id);
            $moved = DB::table('product_store_category')->whereIn('store_category_id', $ids)->distinct()->count('product_id');
            DB::table('product_store_category')->whereIn('store_category_id', $ids)->delete();
            StoreCategory::whereIn('id', $cat->children->pluck('id'))->delete();
            $cat->delete();

            return $moved;
        });

        return response()->json([
            'message' => "Category deleted. {$moved} product(s) are now Uncategorized.",
            'data'    => self::tree($sellerId, false),
        ]);
    }

    /** @return array{name: string, parent_id: ?int} */
    private function validated(Request $request, int $sellerId, ?StoreCategory $editing = null): array
    {
        $name = is_string($request->input('name')) ? preg_replace('/\s+/u', ' ', trim($request->input('name'))) : $request->input('name');
        $request->merge(['name' => $name]);

        $data = $request->validate([
            // Buyers read it on the shop page: words like "New Arrivals", not "!!" or "123".
            'name'      => ['required', 'string', 'min:2', 'max:50', 'regex:' . \App\Support\Validation::LABEL_REGEX, 'regex:' . \App\Support\Validation::TWO_LETTERS_REGEX],
            'parent_id' => ['nullable', 'integer'],
        ], [
            'name.required' => 'Enter a category name.',
            'name.min'      => 'A category name must be 2 to 50 characters.',
            'name.max'      => 'A category name can be at most 50 characters.',
            'name.regex'    => "A category name needs at least two letters and may use letters, numbers, spaces and . , ' & ( ) / # - only.",
        ]);

        $exists = StoreCategory::where('seller_id', $sellerId)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($data['name'])])
            ->when($editing, fn ($q) => $q->where('id', '!=', $editing->id))
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages(['name' => "A category named \"{$data['name']}\" already exists in your store."]);
        }

        if (! $editing && ! empty($data['parent_id'])) {
            $parent = StoreCategory::where('seller_id', $sellerId)->find($data['parent_id']);
            if (! $parent) {
                throw ValidationException::withMessages(['parent_id' => 'Choose a parent category from your store.']);
            }
            if ($parent->parent_id !== null) {
                throw ValidationException::withMessages(['parent_id' => 'Store categories have 2 levels at most: a subcategory cannot have its own subcategories.']);
            }
        }

        return ['name' => $data['name'], 'parent_id' => $editing ? $editing->parent_id : ($data['parent_id'] ?? null)];
    }

    /**
     * The store's categories in order, with how many active products each holds (a parent counts its subcategories'
     * products once).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function tree(int $sellerId, bool $onlyVisible = true): array
    {
        $all = StoreCategory::where('seller_id', $sellerId)
            ->when($onlyVisible, fn ($q) => $q->where('is_visible', true))
            ->orderBy('sort_order')->orderBy('id')->get();
        $counts = DB::table('product_store_category')
            ->join('products', 'products.id', '=', 'product_store_category.product_id')
            ->whereIn('store_category_id', $all->pluck('id'))
            ->whereNull('products.deleted_at')
            ->when($onlyVisible, fn ($q) => $q->where('products.status', 'active'))
            ->select('store_category_id', DB::raw('count(*) as n'))
            ->groupBy('store_category_id')
            ->pluck('n', 'store_category_id');

        $row = fn (StoreCategory $c) => [
            'id' => $c->id, 'name' => $c->name, 'parent_id' => $c->parent_id, 'is_visible' => $c->is_visible,
            'sort_order' => $c->sort_order, 'product_count' => (int) ($counts[$c->id] ?? 0),
        ];

        return $all->whereNull('parent_id')->values()->map(function (StoreCategory $parent) use ($all, $row) {
            $children = $all->where('parent_id', $parent->id)->values()->map($row)->all();

            return $row($parent) + ['children' => $children];
        })->all();
    }
}
