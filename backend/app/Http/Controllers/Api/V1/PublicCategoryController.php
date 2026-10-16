<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * GET /categories: the active category tree for the storefront (the landing page and the header's Categories menu).
 * Each category carries how many products buyers can see in it and a cover photo: the primary photo of its
 * best-selling visible product (for a parent, across its subcategories). A category nobody sells in yet has no
 * cover. Cached for five minutes.
 */
class PublicCategoryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Cache::remember('storefront.categories', 300, fn () => $this->tree())]);
    }

    /** @return array<int, array<string, mixed>> */
    private function tree(): array
    {
        $categories = Category::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'parent_id', 'name', 'slug']);

        // Visible products, best sellers first, each with its primary photo.
        $products = Product::query()
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active'))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved'))
            ->with(['images' => fn ($q) => $q->orderByDesc('is_primary')->orderBy('sort_order')])
            ->orderByDesc('units_sold')->orderByDesc('review_count')->orderBy('id')
            ->get(['id', 'category_id', 'units_sold', 'review_count'])
            ->groupBy('category_id');

        $node = function (Category $category, Collection $leafIds) use ($products): array {
            $mine = $leafIds->flatMap(fn ($id) => $products->get($id, collect()));
            $cover = $mine->sortByDesc('units_sold')->first(fn ($p) => $p->images->isNotEmpty());

            return [
                'id'            => $category->id,
                'slug'          => $category->slug,
                'name'          => $category->name,
                'product_count' => $mine->count(),
                'image_url'     => $cover ? asset('storage/' . $cover->images->first()->path) : null,
            ];
        };

        $children = $categories->whereNotNull('parent_id')->groupBy('parent_id');

        return $categories->whereNull('parent_id')->map(function (Category $parent) use ($children, $node) {
            $kids = $children->get($parent->id, collect());

            return $node($parent, $kids->pluck('id')->push($parent->id)) + [
                'children' => $kids->map(fn (Category $c) => $node($c, collect([$c->id])))->values()->all(),
            ];
        })->values()->all();
    }
}
