<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $payments = Payment::with(['order.buyer'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->whereHas('order', fn ($q2) =>
                $q2->where('order_number', 'like', "%{$request->search}%")
                   ->orWhereHas('buyer', fn ($q3) => $q3
                       ->where('email', 'like', "%{$request->search}%")
                       ->orWhere('first_name', 'like', "%{$request->search}%")
                       ->orWhere('last_name',  'like', "%{$request->search}%"))
            ))
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $payments->map(fn ($p) => $this->format($p)),
            'meta' => [
                'current_page' => $payments->currentPage(),
                'last_page'    => $payments->lastPage(),
                'total'        => $payments->total(),
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
        $payment->order->update(['payment_status' => 'paid']);

        return response()->json(['data' => $this->format($payment->fresh('order.buyer'))]);
    }

    public function stats(): JsonResponse
    {
        $pending = Payment::where('status', 'pending')->sum('amount');
        $failed  = Payment::where('status', 'failed')->count();
        $paid    = Payment::where('status', 'paid')->sum('amount');

        return response()->json([
            'data' => [
                'pending_payout_amount' => (float) $pending,
                'failed_count'          => $failed,
                'total_paid'            => (float) $paid,
            ],
        ]);
    }

    private function format(Payment $p): array
    {
        return [
            'id'               => $p->id,
            'method'           => $p->method,
            'reference_number' => $p->reference_number,
            'amount'           => (float) $p->amount,
            'status'           => $p->status,
            'paid_at'          => $p->paid_at,
            'created_at'       => $p->created_at,
            'order' => $p->order ? [
                'id'           => $p->order->id,
                'order_number' => $p->order->order_number,
                'buyer'        => $p->order->buyer ? [
                    'id'         => $p->order->buyer->id,
                    'first_name' => $p->order->buyer->first_name,
                    'last_name'  => $p->order->buyer->last_name,
                    'email'      => $p->order->buyer->email,
                ] : null,
            ] : null,
        ];
    }
}
