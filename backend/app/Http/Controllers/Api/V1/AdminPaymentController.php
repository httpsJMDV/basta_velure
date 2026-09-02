<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $orders = Order::with(['buyer', 'items.product', 'seller.sellerProfile'])
            ->when($request->method, fn ($q) => $q->where('payment_method', $request->method))
            ->when($request->status, function ($q, $status) {
                if ($status === 'pending_verification') {
                    $q->where('payment_status', 'pending_verification');
                } elseif ($status === 'paid' || $status === 'confirmed') {
                    $q->where('payment_status', 'paid');
                } elseif ($status === 'verification_failed') {
                    $q->where('payment_status', 'verification_failed');
                } elseif ($status === 'cod') {
                    $q->where('payment_method', 'cod');
                } else {
                    $q->where('payment_status', $status);
                }
            })
            ->when($request->search, function ($q, $search) {
                $q->where(function ($sub) use ($search) {
                    $sub->where('order_number', 'like', "%{$search}%")
                        ->orWhere('payment_reference', 'like', "%{$search}%")
                        ->orWhereHas('buyer', fn ($bq) => $bq
                            ->where('email', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name',  'like', "%{$search}%")
                        )
                        ->orWhereHas('seller.sellerProfile', fn ($sq) => $sq
                            ->where('shop_name', 'like', "%{$search}%")
                        );
                });
            })
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $orders->map(fn (Order $o) => [
                'id'                => $o->id,
                'order_number'      => $o->order_number,
                'payment_method'    => $o->payment_method,
                'payment_status'    => $o->payment_status,
                'payment_reference' => $o->payment_reference,
                'payment_proof_url' => $o->payment_proof_path ? asset('storage/' . $o->payment_proof_path) : null,
                'amount'            => (float) $o->total,
                'order_status'      => $o->status,
                'created_at'        => $o->created_at?->toIso8601String(),
                'payment_verified_at' => $o->payment_verified_at?->toIso8601String(),
                'rejection_reason'  => $o->verification_rejection_reason,
                'buyer' => $o->buyer ? [
                    'id'         => $o->buyer->id,
                    'name'       => trim($o->buyer->first_name . ' ' . $o->buyer->last_name),
                    'first_name' => $o->buyer->first_name,
                    'last_name'  => $o->buyer->last_name,
                    'email'      => $o->buyer->email,
                    'phone'      => $o->buyer->phone,
                ] : null,
                'seller' => $o->seller ? [
                    'id'        => $o->seller->id,
                    'name'      => trim($o->seller->first_name . ' ' . $o->seller->last_name),
                    'shop_name' => $o->seller->sellerProfile?->shop_name ?? ($o->seller->first_name . "'s Shop"),
                ] : null,
                'items_count' => $o->items->count(),
                'items' => $o->items->map(fn ($item) => [
                    'id'           => $item->id,
                    'product_name' => $item->product?->name ?? 'Product Item',
                    'quantity'     => $item->quantity,
                    'price'        => (float) $item->unit_price,
                    'subtotal'     => (float) $item->subtotal,
                ]),
            ]),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
            'stats' => [
                'total_volume'         => (float) Order::whereNotIn('status', ['cancelled'])->sum('total'),
                'gcash_volume'         => (float) Order::where('payment_method', 'gcash')->whereNotIn('status', ['cancelled'])->sum('total'),
                'cod_volume'           => (float) Order::where('payment_method', 'cod')->whereNotIn('status', ['cancelled'])->sum('total'),
                'pending_verification' => Order::where('payment_method', 'gcash')->where('payment_status', 'pending_verification')->count(),
                'verified_paid'        => Order::where('payment_status', 'paid')->count(),
                'verification_failed'  => Order::where('payment_status', 'verification_failed')->count(),
            ],
        ]);
    }

    public function markPaid(Request $request, Payment $payment): JsonResponse
    {
        $request->validate([
            'reference_number' => ['nullable', 'string', 'max:100'],
        ]);

        $payment->update([
            'status'           => 'paid',
            'paid_at'          => now(),
            'reference_number' => $request->reference_number ?? $payment->reference_number,
        ]);
        if ($payment->order) {
            $payment->order->update(['payment_status' => 'paid']);
        }

        return response()->json(['message' => 'Payment marked as paid.']);
    }

    public function stats(): JsonResponse
    {
        $pending = Order::where('payment_method', 'gcash')->where('payment_status', 'pending_verification')->count();
        $failed  = Order::where('payment_status', 'verification_failed')->count();
        $paidVol = Order::where('payment_status', 'paid')->sum('total');

        return response()->json([
            'data' => [
                'pending_payout_amount' => (float) Order::where('payment_status', 'pending_verification')->sum('total'),
                'failed_count'          => $failed,
                'pending_count'         => $pending,
                'total_paid'            => (float) $paidVol,
            ],
        ]);
    }
}

