<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The seller's reviews (Seller workbook S13, A12): every review of the store's products with stars, text, photos,
 * variant and date, filtered by rating or product. The seller can post one reply per review and edit it; a buyer's
 * review cannot be deleted or hidden.
 */
class SellerReviewController extends Controller
{
    /** GET /seller/reviews?rating=&product_id=&replied=0|1&page= */
    public function index(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $base = Review::whereHas('product', fn ($q) => $q->withTrashed()->where('seller_id', $sellerId))->where('moderation_status', 'visible');

        $page = (clone $base)->with(['buyer:id,first_name,last_name,avatar_path', 'product' => fn ($q) => $q->withTrashed()->with('images'), 'images', 'order:id,order_number'])
            ->when($request->filled('rating'), fn ($q) => $q->where('rating', (int) $request->input('rating')))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', (int) $request->input('product_id')))
            ->when($request->input('replied') === '0', fn ($q) => $q->whereNull('seller_reply'))
            ->when($request->input('replied') === '1', fn ($q) => $q->whereNotNull('seller_reply'))
            ->latest()
            ->paginate(min(50, max(5, (int) $request->query('per_page', 20))));

        $counts = (clone $base)->select('rating', DB::raw('count(*) as n'))->groupBy('rating')->pluck('n', 'rating');

        return response()->json([
            'data' => $page->getCollection()->map(fn (Review $r) => $this->row($r))->all(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'rating_counts' => collect([5, 4, 3, 2, 1])->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)]),
                'average' => ($t = (clone $base)->count()) > 0 ? round((float) (clone $base)->avg('rating'), 1) : null,
                'unreplied' => (clone $base)->whereNull('seller_reply')->count(),
            ],
        ]);
    }

    /** POST /seller/reviews/{review}/reply {body}: the store's one reply to a review. */
    public function reply(Request $request, int $review): JsonResponse
    {
        $r = $this->ownReview($request, $review);
        abort_if($r->seller_reply !== null, 409, 'You already replied to this review. Edit your reply instead.');
        $body = $this->body($request);
        $r->forceFill(['seller_reply' => $body, 'seller_replied_at' => now()])->save();

        return response()->json(['message' => 'Reply posted. Buyers see it under the review.', 'data' => $this->row($r->fresh(['buyer', 'product.images', 'images', 'order']))], 201);
    }

    /** PATCH /seller/reviews/{review}/reply {body}: replaces the reply. */
    public function updateReply(Request $request, int $review): JsonResponse
    {
        $r = $this->ownReview($request, $review);
        abort_if($r->seller_reply === null, 404, 'There is no reply to edit yet.');
        $r->forceFill(['seller_reply' => $this->body($request), 'seller_reply_edited_at' => now()])->save();

        return response()->json(['message' => 'Reply updated.', 'data' => $this->row($r->fresh(['buyer', 'product.images', 'images', 'order']))]);
    }

    private function body(Request $request): string
    {
        $request->merge(['body' => is_string($request->input('body')) ? trim(strip_tags($request->input('body'))) : $request->input('body')]);

        return $request->validate(['body' => ['required', 'string', 'min:2', 'max:500']], [
            'body.required' => 'Write your reply.',
            'body.max'      => 'A reply can be at most 500 characters.',
        ])['body'];
    }

    private function ownReview(Request $request, int $id): Review
    {
        return Review::whereHas('product', fn ($q) => $q->withTrashed()->where('seller_id', $request->user()->id))->findOrFail($id);
    }

    private function row(Review $r): array
    {
        return [
            'id'            => $r->id,
            'rating'        => (int) $r->rating,
            'comment'       => $r->comment,
            'images'        => $r->imageUrls(),
            'variant_label' => $r->variant_label,
            'created_at'    => $r->created_at?->toIso8601String(),
            'buyer_name'    => PublicProductController::maskName($r->buyer?->first_name, $r->buyer?->last_name),
            'order_number'  => $r->order?->order_number,
            'product'       => $r->product ? ['id' => $r->product->id, 'name' => $r->product->name, 'image_url' => $r->product->primaryImageUrl()] : null,
            'seller_reply'  => $r->seller_reply ? [
                'body' => $r->seller_reply,
                'replied_at' => $r->seller_replied_at?->toIso8601String(),
                'edited_at' => $r->seller_reply_edited_at?->toIso8601String(),
            ] : null,
        ];
    }
}
