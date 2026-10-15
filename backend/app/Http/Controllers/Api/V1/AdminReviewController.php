<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminReviewController extends Controller
{
    /**
     * GET /api/v1/admin/reviews
     *
     * Filters (all optional): moderation_status (visible, hidden, pending_review), flagged=true, rating (1 to 5),
     * search (buyer name or email, comment, product name, shop name), per_page (1 to 100, default 20).
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'moderation_status' => ['nullable', 'in:visible,hidden,pending_review'],
            'rating'            => ['nullable', 'integer', 'between:1,5'],
            'per_page'          => ['nullable', 'integer', 'min:1', 'max:100'],
            'search'            => ['nullable', 'string', 'max:100'],
        ]);

        $like = $request->filled('search') ? '%' . addcslashes((string) $request->search, '\\%_') . '%' : null;

        $reviews = Review::with(['buyer', 'order:id,order_number', 'product.seller.sellerProfile'])
            ->when($request->moderation_status, fn ($q) => $q->where('moderation_status', $request->moderation_status))
            ->when($request->flagged === 'true', fn ($q) => $q->where('flagged', true))
            ->when($request->rating, fn ($q) => $q->where('rating', (int) $request->rating))
            ->when($like, fn ($q) => $q->where(function ($w) use ($like) {
                $w->where('comment', 'like', $like)
                    ->orWhereHas('buyer', fn ($b) => $b
                        ->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like))
                    ->orWhereHas('product', fn ($p) => $p
                        ->where('name', 'like', $like)
                        ->orWhereHas('seller.sellerProfile', fn ($sp) => $sp->where('shop_name', 'like', $like)));
            }))
            ->latest()
            ->latest('id')
            ->paginate((int) ($request->per_page ?? 20));

        return response()->json([
            'data' => $reviews->map(fn ($r) => $this->format($r)),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page'    => $reviews->lastPage(),
                'total'        => $reviews->total(),
                'per_page'     => $reviews->perPage(),
                'from'         => $reviews->firstItem(),
                'to'           => $reviews->lastItem(),
            ],
        ]);
    }

    public function moderate(Request $request, Review $review): JsonResponse
    {
        $request->validate([
            'moderation_status' => ['required', 'in:visible,hidden,pending_review'],
        ]);

        $review->update(['moderation_status' => $request->moderation_status]);

        AdminActivityLog::create([
            'admin_id'    => $request->user()->id,
            'action'      => 'moderate_review',
            'target_type' => 'review',
            'target_id'   => $review->id,
            'description' => "Review #{$review->id} set to {$request->moderation_status}.",
            'meta'        => ['product_id' => $review->product_id],
        ]);

        return response()->json(['data' => $this->format($review->fresh(['buyer', 'order:id,order_number', 'product.seller.sellerProfile']))]);
    }

    public function stats(): JsonResponse
    {
        $flagged        = Review::where('flagged', true)->where('moderation_status', 'pending_review')->count();
        $pendingReview  = Review::where('moderation_status', 'pending_review')->count();
        $hidden         = Review::where('moderation_status', 'hidden')->count();

        return response()->json([
            'data' => [
                'flagged_pending' => $flagged,
                'pending_review'  => $pendingReview,
                'hidden'          => $hidden,
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/reviews/summary: the cards, chip counts and rating distribution of the Reviews page.
     *
     * Every figure covers all reviews that exist (soft-deleted ones excepted), whatever their moderation status, so
     * the distribution adds up to `total` and `by_status` adds up to `total` too. `flagged` counts flagged reviews in
     * any status (a review can be flagged and pending, or flagged and already hidden). `average_rating` is null,
     * never 0, when there are no reviews.
     */
    public function summary(): JsonResponse
    {
        $byStatus = Review::selectRaw('moderation_status, COUNT(*) as total')->groupBy('moderation_status')->pluck('total', 'moderation_status');
        $byRating = Review::selectRaw('rating, COUNT(*) as total')->groupBy('rating')->pluck('total', 'rating');

        $distribution = [];
        foreach (range(1, 5) as $stars) {
            $distribution[(string) $stars] = (int) ($byRating[$stars] ?? 0);
        }
        $total = array_sum($distribution);
        $average = $total > 0 ? round((float) Review::avg('rating'), 2) : null;

        return response()->json([
            'data' => [
                'total'               => $total,
                'average_rating'      => $average,
                'rating_distribution' => $distribution,
                'by_status'           => [
                    'pending_review' => (int) ($byStatus['pending_review'] ?? 0),
                    'visible'        => (int) ($byStatus['visible'] ?? 0),
                    'hidden'         => (int) ($byStatus['hidden'] ?? 0),
                ],
                'flagged'             => Review::where('flagged', true)->count(),
            ],
        ]);
    }

    private function format(Review $r): array
    {
        $seller = $r->product?->seller;

        return [
            'id'                => $r->id,
            'product_id'        => $r->product_id,
            'rating'            => $r->rating,
            'comment'           => $r->comment,
            'verified_purchase' => $r->verified_purchase,
            'flagged'           => $r->flagged,
            'flag_reason'       => $r->flag_reason,
            'moderation_status' => $r->moderation_status,
            'created_at'        => $r->created_at,
            'buyer' => $r->buyer ? [
                'id'         => $r->buyer->id,
                'first_name' => $r->buyer->first_name,
                'last_name'  => $r->buyer->last_name,
                'email'      => $r->buyer->email,
            ] : null,
            // Added for the redesigned page: what was reviewed, whose shop sold it, and the order it came from.
            'product' => $r->product ? ['id' => $r->product->id, 'name' => $r->product->name] : null,
            'shop'    => $seller ? ['id' => $seller->id, 'name' => $seller->sellerProfile?->shop_name ?? trim($seller->first_name . ' ' . $seller->last_name)] : null,
            'order'   => $r->order ? ['id' => $r->order->id, 'order_number' => $r->order->order_number] : null,
        ];
    }
}
