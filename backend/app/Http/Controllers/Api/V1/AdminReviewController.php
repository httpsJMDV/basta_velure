<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminReviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $reviews = Review::with(['buyer'])
            ->when($request->moderation_status, fn ($q) => $q->where('moderation_status', $request->moderation_status))
            ->when($request->flagged === 'true', fn ($q) => $q->where('flagged', true))
            ->when($request->search, fn ($q) => $q->whereHas('buyer', fn ($q2) =>
                $q2->where('first_name', 'like', "%{$request->search}%")
                   ->orWhere('last_name',  'like', "%{$request->search}%")
                   ->orWhere('email',      'like', "%{$request->search}%")
            ))
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $reviews->map(fn ($r) => $this->format($r)),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page'    => $reviews->lastPage(),
                'total'        => $reviews->total(),
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

        return response()->json(['data' => $this->format($review->fresh('buyer'))]);
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

    private function format(Review $r): array
    {
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
        ];
    }
}
