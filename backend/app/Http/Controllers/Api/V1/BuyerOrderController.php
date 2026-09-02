<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BuyerOrderController extends Controller
{
    /**
     * POST /api/v1/checkout/place-order
     */
    public function placeOrder(Request $request): JsonResponse
    {
        $user = $request->user();

        $rules = [
            'payment_method'    => ['required', 'in:gcash,cod'],
            'shipping_name'     => ['required', 'string', 'max:150'],
            'shipping_phone'    => ['required', 'string', 'max:30'],
            'shipping_address'  => ['required', 'string'],
            'shipping_province' => ['nullable', 'string', 'max:100'],
            'shipping_city'     => ['nullable', 'string', 'max:100'],
            'shipping_barangay' => ['nullable', 'string', 'max:100'],
            'notes'             => ['nullable', 'string', 'max:500'],
            'items'             => ['required', 'array', 'min:1'],
            'items.*.product_id'=> ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id'=> ['nullable', 'integer'],
            'items.*.quantity'  => ['required', 'integer', 'min:1'],
        ];

        if ($request->payment_method === 'gcash') {
            $rules['payment_reference'] = ['required', 'string', 'min:5', 'max:100'];
            $rules['payment_proof']     = ['required', 'image', 'max:5120']; // max 5MB image
        }

        $data = $request->validate($rules);

        return DB::transaction(function () use ($request, $user, $data) {
            $orderNumber = 'VEL-' . strtoupper(Str::random(4)) . '-' . date('ymdHis');
            $subtotal    = 0;
            $shippingFee = 99.00; // Flat shipping rate
            $preparedItems = [];

            // Process and validate items
            foreach ($data['items'] as $itemData) {
                $product = Product::with(['seller', 'images'])->lockForUpdate()->findOrFail($itemData['product_id']);
                abort_if($product->status !== 'active', 422, "Product {$product->name} is no longer available.");

                $variant = null;
                $unitPrice = (float) $product->base_price;
                $variantLabel = null;

                if (!empty($itemData['variant_id'])) {
                    $variant = ProductVariant::where('product_id', $product->id)
                        ->lockForUpdate()
                        ->find($itemData['variant_id']);

                    if ($variant) {
                        $unitPrice = (float) $variant->price;
                        $variantLabel = $variant->label ?? null;
                        if ($variant->stock_quantity < $itemData['quantity']) {
                            abort(422, "Insufficient stock for {$product->name}" . ($variantLabel ? " ({$variantLabel})" : ""));
                        }
                        $variant->decrement('stock_quantity', $itemData['quantity']);
                    }
                }

                $qty = (int) $itemData['quantity'];
                $itemSubtotal = round($unitPrice * $qty, 2);
                $subtotal += $itemSubtotal;

                // Commission calculation
                $commissionRate = PlatformSetting::getCommissionRateForCategory($product->category_id);
                $commissionAmount = round($itemSubtotal * $commissionRate, 2);
                $sellerEarnings = round($itemSubtotal - $commissionAmount, 2);

                $primaryImage = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
                $imageUrl = $primaryImage ? asset('storage/' . $primaryImage->path) : null;

                $preparedItems[] = [
                    'seller_id'         => $product->seller_id,
                    'category_id'       => $product->category_id,
                    'product_name'      => $product->name,
                    'variant_label'     => $variantLabel,
                    'unit_price'        => $unitPrice,
                    'quantity'          => $qty,
                    'subtotal'          => $itemSubtotal,
                    'image_url'         => $imageUrl,
                    'commission_rate'   => $commissionRate,
                    'commission_amount' => $commissionAmount,
                    'seller_earnings'   => $sellerEarnings,
                    'payout_status'     => 'pending_release',
                ];

                // Increment product sales metric
                $product->increment('units_sold', $qty);
            }

            $total = $subtotal + $shippingFee;

            // Handle GCash payment proof upload
            $proofPath = null;
            if ($request->hasFile('payment_proof')) {
                $proofPath = $request->file('payment_proof')->store('orders/payment-proofs', 'public');
            }

            $paymentStatus = $data['payment_method'] === 'gcash' ? 'pending_verification' : 'pending';

            // Create Order
            $order = Order::create([
                'buyer_id'          => $user->id,
                'order_number'      => $orderNumber,
                'subtotal'          => $subtotal,
                'shipping_fee'      => $shippingFee,
                'total'             => $total,
                'payment_method'    => $data['payment_method'],
                'payment_status'    => $paymentStatus,
                'status'            => 'pending',
                'payment_reference' => $data['payment_reference'] ?? null,
                'payment_proof_path'=> $proofPath,
                'shipping_name'     => $data['shipping_name'],
                'shipping_phone'    => $data['shipping_phone'],
                'shipping_address'  => $data['shipping_address'],
                'shipping_province' => $data['shipping_province'] ?? null,
                'shipping_city'     => $data['shipping_city'] ?? null,
                'shipping_barangay' => $data['shipping_barangay'] ?? null,
                'notes'             => $data['notes'] ?? null,
            ]);

            // Create Order Items
            foreach ($preparedItems as $item) {
                $order->items()->create($item);
            }

            // Create Payment Record
            Payment::create([
                'order_id'         => $order->id,
                'method'           => $data['payment_method'],
                'reference_number' => $data['payment_reference'] ?? null,
                'amount'           => $total,
                'status'           => $data['payment_method'] === 'gcash' ? 'pending' : 'pending',
            ]);

            return response()->json([
                'message' => 'Order placed successfully!',
                'data'    => $this->formatOrder($order->fresh(['items', 'buyer'])),
            ], 201);
        });
    }

    /**
     * GET /api/v1/buyer/orders
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $orders = Order::with(['items.seller.sellerProfile', 'payment'])
            ->where('buyer_id', $user->id)
            ->when($request->status, function ($q, $status) {
                if ($status === 'pending_verification') {
                    $q->where('payment_status', 'pending_verification');
                } else {
                    $q->where('status', $status);
                }
            })
            ->latest()
            ->paginate(15);

        return response()->json([
            'data' => $orders->map(fn ($o) => $this->formatOrder($o)),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
        ]);
    }

    /**
     * GET /api/v1/buyer/orders/{order}
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        abort_if($order->buyer_id !== $request->user()->id, 403);

        $order->load(['items.seller.sellerProfile', 'payment', 'dispute']);

        return response()->json([
            'data' => $this->formatOrder($order, detail: true),
        ]);
    }

    /**
     * POST /api/v1/buyer/orders/{order}/request-return
     */
    public function requestReturn(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();
        abort_if($order->buyer_id !== $user->id, 403);

        $data = $request->validate([
            'reason'      => ['required', 'string', 'max:255'],
            'description' => ['required', 'string', 'max:2000'],
        ]);

        \App\Models\Dispute::updateOrCreate(
            ['order_id' => $order->id],
            [
                'buyer_id'    => $user->id,
                'reason'      => $data['reason'],
                'description' => $data['description'],
                'status'      => 'open',
            ]
        );

        $order->update(['status' => 'return_requested']);

        return response()->json([
            'message' => 'Return request submitted successfully. The seller will review within 48 hours.',
            'data'    => $this->formatOrder($order->fresh(['items.seller.sellerProfile', 'payment', 'dispute']), detail: true),
        ]);
    }

    private function formatOrder(Order $o, bool $detail = false): array
    {
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
            'subtotal'            => (float) $o->subtotal,
            'shipping_fee'        => (float) $o->shipping_fee,
            'total'               => (float) $o->total,
            'shipping_name'       => $o->shipping_name,
            'shipping_phone'      => $o->shipping_phone,
            'shipping_address'    => $o->shipping_address,
            'shipping_province'   => $o->shipping_province,
            'shipping_city'       => $o->shipping_city,
            'shipping_barangay'   => $o->shipping_barangay,
            'notes'               => $o->notes,
            'created_at'          => $o->created_at?->toIso8601String(),
            'items'               => $o->items->map(fn ($i) => [
                'id'            => $i->id,
                'seller_id'     => $i->seller_id,
                'shop_name'     => $i->seller?->sellerProfile?->shop_name ?? ($i->seller?->first_name . "'s Shop"),
                'product_name'  => $i->product_name,
                'variant_label' => $i->variant_label,
                'unit_price'    => (float) $i->unit_price,
                'quantity'      => $i->quantity,
                'subtotal'      => (float) $i->subtotal,
                'image_url'     => $i->image_url,
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

