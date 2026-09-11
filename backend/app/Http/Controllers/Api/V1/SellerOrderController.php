<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SellerOrderController extends Controller
{
    /**
     * GET /api/v1/seller/orders
     */
    public function index(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        $orders = Order::with(['buyer', 'items' => fn ($q) => $q->where('seller_id', $sellerId), 'payment'])
            ->whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->when($request->status, function ($q, $status) {
                if ($status === 'pending_verification') {
                    $q->where('payment_status', 'pending_verification');
                } elseif ($status === 'confirmed') {
                    $q->whereIn('status', ['confirmed', 'packed']);
                } else {
                    $q->where('status', $status);
                }
            })
            ->when($request->search, function ($q, $search) {
                $q->where(function ($sub) use ($search) {
                    $sub->where('order_number', 'like', "%{$search}%")
                        ->orWhere('payment_reference', 'like', "%{$search}%")
                        ->orWhere('shipping_name', 'like', "%{$search}%")
                        ->orWhereHas('buyer', fn ($bq) => $bq->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"));
                });
            })
            ->latest()
            ->paginate(15);

        // Calculate badge counts
        $pendingVerificationCount = Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->where('payment_status', 'pending_verification')
            ->count();

        $toShipCount = Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereIn('status', ['confirmed', 'packed'])
            ->count();

        return response()->json([
            'data' => $orders->map(fn ($o) => $this->formatOrder($o, $sellerId)),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
            'counts' => [
                'pending_verification' => $pendingVerificationCount,
                'to_ship'              => $toShipCount,
            ],
        ]);
    }

    /**
     * GET /api/v1/seller/orders/{order}
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $order->load(['buyer', 'items' => fn ($q) => $q->where('seller_id', $sellerId), 'payment', 'dispute']);

        return response()->json([
            'data' => $this->formatOrder($order, $sellerId, detail: true),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/confirm-payment
     */
    public function confirmPayment(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $order->update([
            'payment_status'      => 'paid',
            'payment_verified_at' => now(),
            'payment_verified_by' => $sellerId,
            'status'              => $order->status === 'pending' ? 'confirmed' : $order->status,
        ]);

        if ($order->payment) {
            $order->payment->update([
                'status'  => 'paid',
                'paid_at' => now(),
            ]);
        }

        return response()->json([
            'message' => 'Payment verified and confirmed successfully!',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment']), $sellerId),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/reject-payment
     */
    public function rejectPayment(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $order->update([
            'payment_status'                => 'verification_failed',
            'verification_rejection_reason' => $data['reason'],
        ]);

        if ($order->payment) {
            $order->payment->update([
                'status' => 'failed',
            ]);
        }

        return response()->json([
            'message' => 'Payment marked as not received / verification failed.',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment']), $sellerId),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/respond-return
     */
    public function respondReturn(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $data = $request->validate([
            'action'         => ['required', 'in:accept,reject,partial_refund'],
            'reason'         => ['required_if:action,reject,partial_refund', 'nullable', 'string', 'max:1000'],
            'partial_amount' => ['required_if:action,partial_refund', 'nullable', 'numeric', 'min:1'],
        ]);

        $dispute = $order->dispute;
        if (!$dispute) {
            return response()->json(['message' => 'No active return request found for this order.'], 404);
        }

        if ($data['action'] === 'accept') {
            $dispute->update([
                'status'          => 'resolved',
                'resolution_note' => 'Accepted by Seller. Return & Refund approved.',
                'resolved_by'     => $sellerId,
                'resolved_at'     => now(),
            ]);
            $order->update(['status' => 'returned']);
        } elseif ($data['action'] === 'reject') {
            $dispute->update([
                'status'          => 'in_progress',
                'resolution_note' => "Seller rejected return: {$data['reason']}. Escalated to Loved-IT Mediation.",
            ]);
        } elseif ($data['action'] === 'partial_refund') {
            $dispute->update([
                'status'          => 'in_progress',
                'resolution_note' => "Seller offered partial refund of ₱" . number_format($data['partial_amount'], 2) . ": {$data['reason']}.",
            ]);
        }

        return response()->json([
            'message' => 'Return response recorded successfully.',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment', 'dispute']), $sellerId, detail: true),
        ]);
    }

    /**
     * PATCH /api/v1/seller/orders/{order}/status
     */
    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $data = $request->validate([
            'status' => ['required', 'in:confirmed,packed,shipped,out_for_delivery,delivered,cancelled'],
        ]);

        $newStatus = $data['status'];
        $order->update(['status' => $newStatus]);

        // When order is marked delivered, release seller earnings into available balance
        if ($newStatus === 'delivered') {
            OrderItem::where('order_id', $order->id)
                ->where('seller_id', $sellerId)
                ->update([
                    'payout_status' => 'available',
                    'delivered_at'  => now(),
                ]);
        }

        return response()->json([
            'message' => "Order status updated to {$newStatus}.",
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment']), $sellerId),
        ]);
    }

    private function formatOrder(Order $o, int $sellerId, bool $detail = false): array
    {
        $sellerItems = $o->items->where('seller_id', $sellerId);
        $sellerSubtotal = (float) $sellerItems->sum('subtotal');
        $sellerCommission = (float) $sellerItems->sum('commission_amount');
        $sellerEarnings = (float) $sellerItems->sum('seller_earnings');

        return [
            'id'                  => $o->id,
            'order_number'        => $o->order_number,
            'status'              => $o->status,
            'payment_method'      => $o->payment_method,
            'payment_status'      => $o->payment_status,
            'payment_reference'   => $o->payment_reference,
            'payment_proof_url'   => $o->payment_proof_path ? asset('storage/' . $o->payment_proof_path) : null,
            'payment_verified_at' => $o->payment_verified_at?->toIso8601String(),
            'rejection_reason'    => $o->verification_rejection_reason,
            'order_total'         => (float) $o->total,
            'shipping_fee'        => (float) $o->shipping_fee,
            'seller_subtotal'     => $sellerSubtotal,
            'seller_commission'   => $sellerCommission,
            'seller_earnings'     => $sellerEarnings,
            'shipping_name'       => $o->shipping_name,
            'shipping_phone'      => $o->shipping_phone,
            'shipping_address'    => $o->shipping_address,
            'shipping_province'   => $o->shipping_province,
            'shipping_city'       => $o->shipping_city,
            'shipping_barangay'   => $o->shipping_barangay,
            'notes'               => $o->notes,
            'created_at'          => $o->created_at?->toIso8601String(),
            'buyer'               => $o->buyer ? [
                'id'         => $o->buyer->id,
                'name'       => trim($o->buyer->first_name . ' ' . $o->buyer->last_name),
                'email'      => $o->buyer->email,
                'phone'      => $o->buyer->phone,
            ] : null,
            'items'               => $sellerItems->map(fn ($i) => [
                'id'                => $i->id,
                'product_name'      => $i->product_name,
                'variant_label'     => $i->variant_label,
                'unit_price'        => (float) $i->unit_price,
                'quantity'          => $i->quantity,
                'subtotal'          => (float) $i->subtotal,
                'commission_rate'   => (float) $i->commission_rate,
                'commission_amount' => (float) $i->commission_amount,
                'seller_earnings'   => (float) $i->seller_earnings,
                'payout_status'     => $i->payout_status,
                'image_url'         => $i->image_url,
            ])->values(),
            'dispute'             => $o->relationLoaded('dispute') && $o->dispute ? [
                'id'              => $o->dispute->id,
                'reason'          => $o->dispute->reason,
                'description'     => $o->dispute->description,
                'status'          => $o->dispute->status,
                'resolution_note' => $o->dispute->resolution_note,
                'resolved_at'     => $o->dispute->resolved_at?->toIso8601String(),
            ] : null,
        ];
    }
}

