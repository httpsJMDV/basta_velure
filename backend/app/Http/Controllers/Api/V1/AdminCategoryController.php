<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Category;
use App\Models\PlatformSetting;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The platform's category tree: parent categories and their sub-categories (two levels). A commission rate set here is
 * the same override Platform Settings shows: a parent's rate covers its sub-categories that have none of their own.
 * Every change clears the storefront's cached category menu and is written to the admin activity log.
 */
class AdminCategoryController extends Controller
{
    private const RULES = [
        'name'            => 'string|min:2|max:100',
        'slug'            => 'nullable|string|max:100',
        'parent_id'       => 'nullable|integer|exists:categories,id',
        'sort_order'      => 'nullable|integer|min:0|max:9999',
        'is_active'       => 'nullable|boolean',
        'requires_fda'    => 'nullable|boolean',
        'commission_rate' => 'nullable|numeric|decimal:0,2|min:0|max:100',
    ];

    private const MESSAGES = [
        'name.required'          => 'Enter the category name.',
        'name.min'               => 'The category name needs at least 2 characters.',
        'commission_rate.decimal' => 'The commission rate can have at most 2 decimal places.',
        'commission_rate.max'    => 'The commission rate cannot be above 100%.',
        'commission_rate.min'    => 'The commission rate cannot be below 0%.',
    ];

    /** GET /admin/categories: the tree with product counts (archived products count, since they still use the category). */
    public function index(): JsonResponse
    {
        $parents = Category::whereNull('parent_id')
            ->orderBy('sort_order')->orderBy('name')
            ->withCount('products')
            ->with(['children' => fn ($q) => $q->orderBy('sort_order')->orderBy('name')
                ->withCount(['products', 'products as active_products_count' => fn ($pq) => $pq->where('status', 'active')])])
            ->get();

        return response()->json([
            'data' => $parents,
            'metrics' => [
                'total_parents'        => Category::whereNull('parent_id')->where('is_active', true)->count(),
                'total_leaves'         => Category::whereNotNull('parent_id')->where('is_active', true)->count(),
                'total_products'       => Product::whereNotIn('status', ['archived'])->count(),
                'fda_regulated_leaves' => Category::whereNotNull('parent_id')->where('requires_fda', true)->count(),
                'base_commission_rate' => round(PlatformSetting::baseCommissionRate() * 100, 2),
            ],
        ]);
    }

    /** POST /admin/categories: a parent category or a sub-category. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => 'required|' . self::RULES['name']] + self::RULES, self::MESSAGES);
        $parentId = $data['parent_id'] ?? null;
        $this->assertParent($parentId, null);
        $this->assertUniqueName($data['name'], $parentId, null);
        $slug = $this->slug($data['slug'] ?? null, $data['name'], null);
        if (! $parentId && ! empty($data['requires_fda'])) {
            throw ValidationException::withMessages(['requires_fda' => 'The FDA requirement applies to sub-categories only.']);
        }

        $category = Category::create([
            'name'            => trim($data['name']),
            'slug'            => $slug,
            'parent_id'       => $parentId,
            'sort_order'      => $data['sort_order'] ?? 0,
            'is_active'       => $data['is_active'] ?? true,
            'requires_fda'    => $parentId ? (bool) ($data['requires_fda'] ?? false) : false,
            'commission_rate' => $this->rate($data),
        ]);
        $this->changed($request, 'create_category', 'Created ' . ($parentId ? 'sub-category' : 'parent category') . " '{$category->name}' (slug: {$category->slug})", $category, ['category' => $category->toArray()]);

        return response()->json(['message' => "Category '{$category->name}' created.", 'data' => $category], 201);
    }

    /** PUT /admin/categories/{category}: edit, or move a sub-category under another parent. */
    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate(['name' => 'sometimes|required|' . self::RULES['name']] + self::RULES, self::MESSAGES);
        $before = $category->only(['name', 'slug', 'parent_id', 'sort_order', 'is_active', 'requires_fda', 'commission_rate']);

        if (array_key_exists('parent_id', $data)) {
            $parentId = $data['parent_id'] ? (int) $data['parent_id'] : null;
            if ($category->parent_id === null && $parentId !== null) {
                throw ValidationException::withMessages(['parent_id' => 'A parent category cannot be moved under another category.']);
            }
            if ($category->parent_id !== null && $parentId === null) {
                throw ValidationException::withMessages(['parent_id' => 'Choose the parent category for this sub-category.']);
            }
            if ($parentId !== null && $parentId !== $category->parent_id) {
                $this->assertParent($parentId, $category->id);
                $category->parent_id = $parentId;
            }
        }
        if (isset($data['name'])) {
            $this->assertUniqueName($data['name'], $category->parent_id, $category->id);
            $category->name = trim($data['name']);
        } elseif ($category->isDirty('parent_id')) {
            $this->assertUniqueName($category->name, $category->parent_id, $category->id);
        }
        if (array_key_exists('slug', $data) || isset($data['name'])) {
            $wanted = $data['slug'] ?? $category->slug;
            $category->slug = $this->slug($wanted, $category->name, $category->id);
        }
        if (isset($data['sort_order'])) {
            $category->sort_order = (int) $data['sort_order'];
        }
        if (isset($data['is_active'])) {
            $category->is_active = (bool) $data['is_active'];
        }
        if ($category->parent_id === null) {
            $category->requires_fda = false;
        } elseif (array_key_exists('requires_fda', $data)) {
            $category->requires_fda = (bool) $data['requires_fda'];
        }
        if (array_key_exists('commission_rate', $data)) {
            $category->commission_rate = $this->rate($data);
        }
        $category->save();

        $this->changed($request, 'update_category', "Updated category '{$category->name}' (ID: {$category->id})", $category,
            ['before' => $before, 'after' => $category->only(array_keys($before))]);

        return response()->json(['message' => "Category '{$category->name}' saved.", 'data' => $category->fresh()]);
    }

    /** DELETE /admin/categories/{category}: only an empty one (no sub-categories, no products, archived included). */
    public function destroy(Request $request, Category $category): JsonResponse
    {
        $children = $category->children()->count();
        if ($children > 0) {
            return response()->json([
                'message' => "Cannot delete '{$category->name}': it has {$children} sub-categories. Delete or move them first.",
                'error_code' => 'CATEGORY_HAS_CHILDREN', 'child_count' => $children,
            ], 422);
        }
        $products = $category->products()->count();
        if ($products > 0) {
            return response()->json([
                'message' => "Cannot delete '{$category->name}': {$products} products (archived ones included) are in it. Move them to another category first.",
                'error_code' => 'CATEGORY_HAS_PRODUCTS', 'product_count' => $products,
            ], 422);
        }

        $name = $category->name;
        $id = $category->id;
        $category->delete();
        $this->changed($request, 'delete_category', "Deleted category '{$name}' (ID: {$id})", null, ['id' => $id, 'name' => $name]);

        return response()->json(['message' => "Category '{$name}' deleted."]);
    }

    /** The parent must be a parent category (two levels only), and not the category itself. */
    private function assertParent(?int $parentId, ?int $selfId): void
    {
        if ($parentId === null) {
            return;
        }
        $parent = Category::find($parentId);
        if (! $parent || $parent->parent_id !== null || $parentId === $selfId) {
            throw ValidationException::withMessages(['parent_id' => 'Choose a parent category: categories go only two levels deep.']);
        }
    }

    private function assertUniqueName(string $name, ?int $parentId, ?int $ignoreId): void
    {
        $taken = Category::whereRaw('LOWER(name) = ?', [mb_strtolower(trim($name))])
            ->when($parentId, fn ($q) => $q->where('parent_id', $parentId), fn ($q) => $q->whereNull('parent_id'))
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['name' => $parentId ? 'This parent already has a sub-category with this name.' : 'A parent category with this name already exists.']);
        }
    }

    private function slug(?string $wanted, string $name, ?int $ignoreId): string
    {
        $slug = Str::slug(trim((string) $wanted) !== '' ? $wanted : $name);
        if ($slug === '') {
            throw ValidationException::withMessages(['slug' => 'Use letters or numbers in the name or slug.']);
        }
        if (Category::where('slug', $slug)->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists()) {
            throw ValidationException::withMessages(['slug' => "The slug '{$slug}' is already used by another category."]);
        }

        return $slug;
    }

    private function rate(array $data): ?float
    {
        $rate = $data['commission_rate'] ?? null;

        return $rate === null || $rate === '' ? null : round((float) $rate, 2);
    }

    /** Clears the storefront's cached category menu and writes the activity log. */
    private function changed(Request $request, string $action, string $description, ?Category $category, array $meta): void
    {
        Cache::forget('storefront.categories');
        AdminActivityLog::log($request->user()->id, $action, $description, 'category', $category?->id ?? ($meta['id'] ?? null), $meta);
    }
}
