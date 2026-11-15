<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\Payments\GcashReview;
use App\Services\Payments\PlatformGcash;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformGcashController extends Controller
{
    public function resubmit(Request $request, Order $order, GcashReview $review): JsonResponse
    {
        abort_unless((int) $order->buyer_id === (int) $request->user()->id, 404);
        $v = $request->validate(['reference' => ['required', 'regex:/^\d{13}$/'],
            'receipt' => ['required', 'file', 'mimes:jpg,jpeg,png', 'max:5120']]);
        $path = null;
        try {
            \Illuminate\Support\Facades\DB::transaction(function () use ($request, $order, $review, $v, &$path) {
                $orders = $review->orders($order, true);
                abort_if($orders->isEmpty(), 409, 'This payment changed. Refresh before uploading.');
                abort_unless($orders->every(fn ($o) => in_array($o->payment_status, ['pending', 'pending_verification', 'verification_failed'], true)), 409, 'Received payments cannot be replaced.');
                abort_if(\Illuminate\Support\Facades\DB::table('platform_gcash_references')->where('direction', 'incoming')->where('reference', $v['reference'])->exists(), 422, 'This transfer is already verified. Contact Loved-IT for reconciliation.');
                $path = $request->file('receipt')->store('orders/payment-proofs', 'ids');
                foreach ($orders as $o) {
                    $o->update(['payment_reference' => $v['reference'], 'payment_proof_path' => $path,
                        'payment_status' => 'pending_verification', 'verification_rejection_reason' => null]);
                    $o->payment?->update(['reference_number' => $v['reference'], 'status' => 'pending']);
                }
            });
        } catch (\Throwable $e) {
            if ($path) \Illuminate\Support\Facades\Storage::disk('ids')->delete($path);
            throw $e;
        }
        return response()->json(['message' => 'Receipt updated for the whole transaction. Do not pay again while it is being reviewed.']);
    }

    public function confirm(Request $request, Order $order, GcashReview $review): JsonResponse
    {
        $v = $request->validate(['received_amount' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'reference' => ['required', 'string', 'regex:/^\d{13}$/'], 'received_in_gcash' => ['required', 'accepted']]);
        $review->confirm($order, $request->user(), $v['reference'], $v['received_amount']);
        return response()->json(['message' => 'Loved-IT receipt recorded. Active orders can now be accepted by their shops; closed orders stay closed and require a refund.', 'data' => $review->present($order->fresh())]);
    }

    public function reject(Request $request, Order $order, GcashReview $review): JsonResponse
    {
        $v = $request->validate(['reference' => ['required', 'string', 'regex:/^\d{13}$/'], 'reason' => Validation::sentence(true, 10, 500)]);
        $review->reject($order, $request->user(), $v['reference'], $v['reason']);
        return response()->json(['message' => 'Payment was not verified. The review reason is recorded.']);
    }

    public function settings(): JsonResponse
    {
        return response()->json(['data' => ['mode' => PlatformGcash::enabled() ? 'platform' : 'direct',
            'configured' => PlatformGcash::account() !== null, 'account' => PlatformGcash::account(),
            'manual_transfers' => true]]);
    }
}
