<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $orders = Order::with(['buyer', 'items'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('order_number', 'like', "%{$request->search}%")
                   ->orWhereHas('buyer', fn ($q3) => $q3
                       ->where('first_name', 'like', "%{$request->search}%")
                       ->orWhere('last_name',  'like', "%{$request->search}%")
                       ->orWhere('email',      'like', "%{$request->search}%"));
            }))
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $orders->map(fn ($o) => $this->formatOrder($o)),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
        ]);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['buyer', 'items', 'payment', 'dispute']);
        return response()->json(['data' => $this->formatOrder($order, detail: true)]);
    }

    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        $request->validate([
            'status' => ['required', 'in:pending,confirmed,packed,shipped,out_for_delivery,delivered,cancelled,returned'],
        ]);

        $order->update(['status' => $request->status]);

        return response()->json(['data' => $this->formatOrder($order->fresh(['buyer', 'items']))]);
    }

    public function stats(): JsonResponse
    {
        $counts = Order::selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $todayTotal = Order::whereDate('created_at', today())->count();
        $gmvTotal   = Order::where('payment_status', 'paid')->sum('total');

        return response()->json([
            'data' => [
                'by_status'   => $counts,
                'orders_today' => $todayTotal,
                'gmv_total'    => (float) $gmvTotal,
            ],
        ]);
    }

    private function formatOrder(Order $o, bool $detail = false): array
    {
        $base = [
            'id'             => $o->id,
            'order_number'   => $o->order_number,
            'status'         => $o->status,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
            'subtotal'       => (float) $o->subtotal,
            'shipping_fee'   => (float) $o->shipping_fee,
            'total'          => (float) $o->total,
            'created_at'     => $o->created_at,
            'buyer'          => $o->buyer ? [
                'id'         => $o->buyer->id,
                'first_name' => $o->buyer->first_name,
                'last_name'  => $o->buyer->last_name,
                'email'      => $o->buyer->email,
            ] : null,
            'items' => $o->items->map(fn ($i) => [
                'id'            => $i->id,
                'product_name'  => $i->product_name,
                'variant_label' => $i->variant_label,
                'quantity'      => $i->quantity,
                'unit_price'    => (float) $i->unit_price,
                'subtotal'      => (float) $i->subtotal,
                'image_url'     => $i->image_url,
            ])->values(),
        ];

        if ($detail) {
            $base['payment'] = $o->payment ? [
                'method'           => $o->payment->method,
                'reference_number' => $o->payment->reference_number,
                'amount'           => (float) $o->payment->amount,
                'status'           => $o->payment->status,
                'paid_at'          => $o->payment->paid_at,
            ] : null;
        }

        return $base;
    }
}
