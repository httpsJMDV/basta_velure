<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Models\ReviewHelpfulVote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Helpful" on a product review (docs/api/product-reviews.md). Any signed-in account may mark another buyer's visible
 * review, once. PUT and DELETE are idempotent, so a double tap or a retry on a bad connection lands in the same state;
 * both answer with the review's count after the change.
 */
class ReviewHelpfulController extends Controller
{
    /** PUT /reviews/{review}/helpful */
    public function store(Request $request, Review $review): JsonResponse
    {
        $this->ensureVisible($review);
        $user = $request->user();
        abort_if((int) $review->buyer_id === (int) $user->id, 422, 'You cannot mark your own review as helpful.');

        // The unique (review_id, user_id) index turns a second vote into a no-op instead of a duplicate.
        ReviewHelpfulVote::insertOrIgnore([
            'review_id'  => $review->id,
            'user_id'    => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $this->state($review, true);
    }

    /** DELETE /reviews/{review}/helpful */
    public function destroy(Request $request, Review $review): JsonResponse
    {
        $this->ensureVisible($review);
        ReviewHelpfulVote::where('review_id', $review->id)->where('user_id', $request->user()->id)->delete();

        return $this->state($review, false);
    }

    /** A review that is not shown publicly is answered as missing, like the list that leaves it out. */
    private function ensureVisible(Review $review): void
    {
        abort_unless($review->moderation_status === 'visible', 404, 'Review not found.');
    }

    private function state(Review $review, bool $helped): JsonResponse
    {
        return response()->json(['data' => [
            'review_id'     => $review->id,
            'helpful_count' => ReviewHelpfulVote::where('review_id', $review->id)->count(),
            'helped'        => $helped,
        ]]);
    }
}
