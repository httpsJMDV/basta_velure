<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\PayoutRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SellerEarningsController extends Controller
{
    /**
     * GET /api/v1/seller/earnings
     */
    public function summary(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        // Total earnings from all delivered items
        $grossAvailable = (float) OrderItem::where('seller_id', $sellerId)
            ->where('payout_status', 'available')
            ->sum('seller_earnings');

        // Total already requested in pending or processing payouts
        $requestedPayouts = (float) PayoutRequest::where('seller_id', $sellerId)
            ->whereIn('status', ['pending', 'processing', 'completed'])
            ->sum('amount');

        // Real available balance for withdrawal
        $availableBalance = max(0, round($grossAvailable - $requestedPayouts, 2));

        // Pending balance: orders confirmed or in transit (not yet delivered)
        $pendingBalance = (float) OrderItem::where('seller_id', $sellerId)
            ->where('payout_status', 'pending_release')
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'returned']))
            ->sum('seller_earnings');

        // Total paid out completed
        $totalPaidOut = (float) PayoutRequest::where('seller_id', $sellerId)
            ->where('status', 'completed')
            ->sum('amount');

        // Lifetime total net earnings
        $lifetimeEarnings = (float) OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'returned']))
            ->sum('seller_earnings');

        $totalCommissionPaid = (float) OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'returned']))
            ->sum('commission_amount');

        return response()->json([
            'data' => [
                'available_balance'     => $availableBalance,
                'pending_balance'       => round($pendingBalance, 2),
                'total_paid_out'        => round($totalPaidOut, 2),
                'lifetime_earnings'     => round($lifetimeEarnings, 2),
                'total_commission_paid' => round($totalCommissionPaid, 2),
            ],
        ]);
    }

    /**
     * GET /api/v1/seller/earnings/orders
     */
    public function orderBreakdown(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        $items = OrderItem::with(['order.buyer'])
            ->where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'returned']))
            ->latest()
            ->paginate(15);

        return response()->json([
            'data' => $items->map(function (OrderItem $item) {
                return [
                    'id'                => $item->id,
                    'order_id'          => $item->order_id,
                    'order_number'      => $item->order?->order_number,
                    'order_status'      => $item->order?->status,
                    'payment_status'    => $item->order?->payment_status,
                    'product_name'      => $item->product_name,
                    'variant_label'     => $item->variant_label,
                    'quantity'          => $item->quantity,
                    'item_subtotal'     => (float) $item->subtotal,
                    'commission_rate'   => (float) $item->commission_rate,
                    'commission_pct'    => round(((float) $item->commission_rate) * 100, 1),
                    'commission_amount' => (float) $item->commission_amount,
                    'seller_earnings'   => (float) $item->seller_earnings,
                    'payout_status'     => $item->payout_status,
                    'order_date'        => $item->created_at?->toIso8601String(),
                    'delivered_date'    => $item->delivered_at?->toIso8601String(),
                ];
            }),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
            ],
        ]);
    }

    /**
     * GET /api/v1/seller/payouts
     */
    public function payouts(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        $payouts = PayoutRequest::where('seller_id', $sellerId)
            ->latest()
            ->paginate(15);

        return response()->json([
            'data' => $payouts->map(fn (PayoutRequest $p) => [
                'id'               => $p->id,
                'reference_code'   => $p->reference_code,
                'amount'           => (float) $p->amount,
                'gcash_number'     => $p->gcash_number,
                'gcash_name'       => $p->gcash_name,
                'status'           => $p->status,
                'rejection_reason' => $p->rejection_reason,
                'processed_at'     => $p->processed_at?->toIso8601String(),
                'created_at'       => $p->created_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $payouts->currentPage(),
                'last_page'    => $payouts->lastPage(),
                'total'        => $payouts->total(),
            ],
        ]);
    }

    /**
     * POST /api/v1/seller/payouts/request
     */
    public function requestPayout(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        $data = $request->validate([
            'amount'       => ['required', 'numeric', 'min:100'],
            'gcash_number' => ['required', 'string', 'regex:/^(09|\+639)\d{9}$/'],
            'gcash_name'   => ['required', 'string', 'max:150'],
        ], [
            'amount.min'          => 'Minimum payout request amount is ₱100.00.',
            'gcash_number.regex'  => 'Please enter a valid Philippine GCash mobile number (e.g. 09171234567).',
        ]);

        return DB::transaction(function () use ($sellerId, $data) {
            // Check available balance
            $grossAvailable = (float) OrderItem::where('seller_id', $sellerId)
                ->where('payout_status', 'available')
                ->sum('seller_earnings');

            $requestedPayouts = (float) PayoutRequest::where('seller_id', $sellerId)
                ->whereIn('status', ['pending', 'processing', 'completed'])
                ->sum('amount');

            $availableBalance = max(0, round($grossAvailable - $requestedPayouts, 2));

            $requestedAmount = (float) $data['amount'];
            if ($requestedAmount > $availableBalance) {
                abort(422, "Requested amount (₱" . number_format($requestedAmount, 2) . ") exceeds your available balance of ₱" . number_format($availableBalance, 2) . ".");
            }

            $referenceCode = 'PO-' . date('Ymd') . '-' . strtoupper(Str::random(6));

            $payout = PayoutRequest::create([
                'seller_id'      => $sellerId,
                'reference_code' => $referenceCode,
                'amount'         => $requestedAmount,
                'gcash_number'   => $data['gcash_number'],
                'gcash_name'     => $data['gcash_name'],
                'status'         => 'pending',
            ]);

            return response()->json([
                'message' => 'Payout request submitted successfully! It is now pending admin processing.',
                'data'    => [
                    'id'             => $payout->id,
                    'reference_code' => $payout->reference_code,
                    'amount'         => (float) $payout->amount,
                    'gcash_number'   => $payout->gcash_number,
                    'gcash_name'     => $payout->gcash_name,
                    'status'         => $payout->status,
                    'created_at'     => $payout->created_at?->toIso8601String(),
                ],
            ], 201);
        });
    }
}

