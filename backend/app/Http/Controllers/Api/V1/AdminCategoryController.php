<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\AdminActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminCategoryController extends Controller
{
    /**
     * Get complete category tree with metric stats and product counts.
     */
    public function index(): JsonResponse
    {
        $parents = Category::whereNull('parent_id')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->with(['children' => function ($q) {
                $q->orderBy('sort_order')
                  ->orderBy('name')
                  ->withCount(['products' => function ($pq) {
                      $pq->whereNotIn('status', ['archived']);
                  }]);
            }])
            ->get();

        // Calculate summary metrics
        $totalParents = Category::whereNull('parent_id')->where('is_active', true)->count();
        $totalLeaves = Category::whereNotNull('parent_id')->where('is_active', true)->count();
        $totalProducts = Product::whereNotIn('status', ['archived'])->count();
        $fdaRegulatedLeaves = Category::whereNotNull('parent_id')
            ->where('requires_fda', true)
            ->count();

        return response()->json([
            'data' => $parents,
            'metrics' => [
                'total_parents'         => $totalParents,
                'total_leaves'          => $totalLeaves,
                'total_products'        => $totalProducts,
                'fda_regulated_leaves'  => $fdaRegulatedLeaves,
            ],
        ]);
    }

    /**
     * Create a parent category or a leaf sub-category.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'            => 'required|string|max:100',
            'slug'            => 'nullable|string|max:100|unique:categories,slug',
            'parent_id'       => 'nullable|exists:categories,id',
            'sort_order'      => 'nullable|integer|min:0',
            'is_active'       => 'nullable|boolean',
            'requires_fda'    => 'nullable|boolean',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
        ]);

        $slug = !empty($data['slug']) ? Str::slug($data['slug']) : Str::slug($data['name']);

        // Slugs must be unique
        if (Category::where('slug', $slug)->exists()) {
            return response()->json([
                'message' => "The category slug '{$slug}' is already in use. Please specify a unique slug.",
                'errors' => ['slug' => ["The slug '{$slug}' is already in use."]],
            ], 422);
        }

        $parentId = $data['parent_id'] ?? null;

        // If creating a leaf subcategory, verify parent is actually a root category
        if ($parentId) {
            $parentCat = Category::find($parentId);
            if ($parentCat && $parentCat->parent_id !== null) {
                return response()->json([
                    'message' => 'Loved-IT operates on a strict 2-level category hierarchy. Sub-categories cannot have nested children.',
                    'errors' => ['parent_id' => ['Target parent is already a subcategory.']],
                ], 422);
            }
        } else {
            // If creating a root parent, commission_rate and requires_fda must not be assigned
            if (!empty($data['commission_rate'])) {
                return response()->json([
                    'message' => 'Commission rate overrides can only be set on leaf sub-categories, not on parent categories.',
                    'errors' => ['commission_rate' => ['Commission overrides only apply to sub-categories.']],
                ], 422);
            }
            if (!empty($data['requires_fda'])) {
                return response()->json([
                    'message' => 'FDA Compliance requirement can only be set on leaf sub-categories, not on parent categories.',
                    'errors' => ['requires_fda' => ['FDA requirements only apply to sub-categories.']],
                ], 422);
            }
        }

        $category = Category::create([
            'name'            => trim($data['name']),
            'slug'            => $slug,
            'parent_id'       => $parentId,
            'sort_order'      => $data['sort_order'] ?? 0,
            'is_active'       => $data['is_active'] ?? true,
            'requires_fda'    => $parentId ? ($data['requires_fda'] ?? false) : false,
            'commission_rate' => $parentId ? ($data['commission_rate'] ?? null) : null,
        ]);

        $typeLabel = $parentId ? 'sub-category' : 'parent category';
        AdminActivityLog::log(
            $request->user()->id,
            'create_category',
            "Created {$typeLabel} '{$category->name}' (slug: {$category->slug})",
            'category',
            $category->id,
            ['category' => $category->toArray()]
        );

        return response()->json([
            'message' => "Category '{$category->name}' created successfully.",
            'data'    => $category,
        ], 201);
    }

    /**
     * Update an existing category or leaf.
     */
    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name'            => 'sometimes|required|string|max:100',
            'slug'            => "sometimes|nullable|string|max:100|unique:categories,slug,{$category->id}",
            'parent_id'       => 'nullable|exists:categories,id',
            'sort_order'      => 'nullable|integer|min:0',
            'is_active'       => 'nullable|boolean',
            'requires_fda'    => 'nullable|boolean',
            'commission_rate' => 'nullable|numeric|min:0|max:100',
        ]);

        if (isset($data['slug'])) {
            $slug = !empty($data['slug']) ? Str::slug($data['slug']) : Str::slug($data['name'] ?? $category->name);
            if (Category::where('slug', $slug)->where('id', '!=', $category->id)->exists()) {
                return response()->json([
                    'message' => "The category slug '{$slug}' is already taken.",
                    'errors' => ['slug' => ["The slug '{$slug}' is already in use."]],
                ], 422);
            }
            $category->slug = $slug;
        }

        if (isset($data['name'])) {
            $category->name = trim($data['name']);
        }

        if (isset($data['sort_order'])) {
            $category->sort_order = (int) $data['sort_order'];
        }

        if (isset($data['is_active'])) {
            $category->is_active = (bool) $data['is_active'];
        }

        // Parent validation
        if ($category->parent_id === null) {
            // Cannot assign commission rate or FDA flag on parent
            $category->commission_rate = null;
            $category->requires_fda = false;
        } else {
            if (array_key_exists('requires_fda', $data)) {
                $category->requires_fda = (bool) $data['requires_fda'];
            }
            if (array_key_exists('commission_rate', $data)) {
                $category->commission_rate = $data['commission_rate'] !== null && $data['commission_rate'] !== ''
                    ? (float) $data['commission_rate']
                    : null;
            }
        }

        $category->save();

        AdminActivityLog::log(
            $request->user()->id,
            'update_category',
            "Updated category '{$category->name}' (ID: {$category->id})",
            'category',
            $category->id,
            ['updated_fields' => $data]
        );

        return response()->json([
            'message' => "Category '{$category->name}' updated successfully.",
            'data'    => $category,
        ]);
    }

    /**
     * Safely delete category with guardrails against orphans and orphaned products.
     */
    public function destroy(Request $request, Category $category): JsonResponse
    {
        // Guard 1: Parent category with children
        if ($category->parent_id === null) {
            $childCount = $category->children()->count();
            if ($childCount > 0) {
                return response()->json([
                    'message' => "Cannot delete parent category '{$category->name}' because it contains {$childCount} sub-category children. Please delete or reassign its sub-categories first.",
                    'error_code' => 'CATEGORY_HAS_CHILDREN',
                    'child_count' => $childCount,
                ], 422);
            }
        }

        // Guard 2: Leaf category with products
        $productCount = $category->products()->count();
        if ($productCount > 0) {
            return response()->json([
                'message' => "Cannot delete sub-category '{$category->name}' because {$productCount} product listings are currently assigned to it. Please reassign or archive these products first.",
                'error_code' => 'CATEGORY_HAS_PRODUCTS',
                'product_count' => $productCount,
            ], 422);
        }

        $catName = $category->name;
        $catId = $category->id;
        $category->delete();

        AdminActivityLog::log(
            $request->user()->id,
            'delete_category',
            "Deleted category '{$catName}' (ID: {$catId})",
            'category',
            $catId,
            []
        );

        return response()->json([
            'message' => "Category '{$catName}' was safely deleted.",
        ]);
    }
}
