<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PayoutRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPayoutController extends Controller
{
    /**
     * GET /api/v1/admin/payouts
     */
    public function index(Request $request): JsonResponse
    {
        $payouts = PayoutRequest::with(['seller.sellerProfile', 'processedBy'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, function ($q, $search) {
                $q->where(function ($sub) use ($search) {
                    $sub->where('reference_code', 'like', "%{$search}%")
                        ->orWhere('gcash_number', 'like', "%{$search}%")
                        ->orWhere('gcash_name', 'like', "%{$search}%")
                        ->orWhereHas('seller', fn ($sq) => $sq->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"));
                });
            })
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $payouts->map(fn (PayoutRequest $p) => [
                'id'               => $p->id,
                'reference_code'   => $p->reference_code,
                'amount'           => (float) $p->amount,
                'gcash_number'     => $p->gcash_number,
                'gcash_name'       => $p->gcash_name,
                'status'           => $p->status,
                'rejection_reason' => $p->rejection_reason,
                'admin_notes'      => $p->admin_notes,
                'processed_at'     => $p->processed_at?->toIso8601String(),
                'created_at'       => $p->created_at?->toIso8601String(),
                'seller' => [
                    'id'        => $p->seller?->id,
                    'name'      => trim($p->seller?->first_name . ' ' . $p->seller?->last_name),
                    'shop_name' => $p->seller?->sellerProfile?->shop_name ?? ($p->seller?->first_name . "'s Shop"),
                    'email'     => $p->seller?->email,
                ],
                'processed_by' => $p->processedBy ? [
                    'id'   => $p->processedBy->id,
                    'name' => trim($p->processedBy->first_name . ' ' . $p->processedBy->last_name),
                ] : null,
            ]),
            'meta' => [
                'current_page' => $payouts->currentPage(),
                'last_page'    => $payouts->lastPage(),
                'total'        => $payouts->total(),
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/mark-sent
     */
    public function markSent(Request $request, PayoutRequest $payout): JsonResponse
    {
        $payout->update([
            'status'       => 'processing',
            'processed_by' => $request->user()->id,
            'admin_notes'  => $request->admin_notes ?? 'GCash transfer initiated / sent',
        ]);

        return response()->json(['message' => 'Payout marked as Sent (Processing).']);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/complete
     */
    public function complete(Request $request, PayoutRequest $payout): JsonResponse
    {
        $payout->update([
            'status'       => 'completed',
            'processed_by' => $request->user()->id,
            'processed_at' => now(),
            'admin_notes'  => $request->admin_notes ?? 'Sent via GCash',
        ]);

        return response()->json(['message' => 'Payout marked as completed.']);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/reject
     */
    public function reject(Request $request, PayoutRequest $payout): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $payout->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['reason'],
            'processed_by'     => $request->user()->id,
            'processed_at'     => now(),
        ]);

        return response()->json(['message' => 'Payout rejected. Balance has been restored.']);
    }
}

