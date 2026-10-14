<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\OrderStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BuyerOrderController extends Controller
{
    public function __construct(
        protected OrderStateMachine $stateMachine
    ) {}
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
            'shipping_province'      => ['nullable', 'string', 'max:100'],
            'shipping_city'          => ['nullable', 'string', 'max:100'],
            'shipping_barangay'      => ['nullable', 'string', 'max:100'],
            'shipping_province_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'shipping_city_code'     => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'shipping_barangay_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'notes'                  => ['nullable', 'string', 'max:500'],
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.product_id'     => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id'     => ['nullable', 'integer'],
            'items.*.quantity'       => ['required', 'integer', 'min:1'],
        ];

        if ($request->payment_method === 'gcash') {
            $rules['payment_reference'] = ['required', 'string', 'min:5', 'max:100'];
            $rules['payment_proof']     = ['required', 'image', 'max:5120']; // max 5MB image
        }

        $messages = [
            'shipping_barangay_code.required' => 'Selected delivery address is missing a barangay PSGC code. Please re-select or update your delivery address to proceed with checkout.',
            'shipping_city_code.required'     => 'Selected delivery address is missing a city/municipality PSGC code. Please re-select or update your delivery address to proceed with checkout.',
            'shipping_province_code.required' => 'Selected delivery address is missing a province PSGC code. Please re-select or update your delivery address to proceed with checkout.',
        ];

        $data = $request->validate($rules, $messages);

        $proofPath = null;
        if ($request->hasFile('payment_proof')) {
            $proofPath = $request->file('payment_proof')->store('orders/payment-proofs', 'public');
        }

        try {
            return DB::transaction(function () use ($user, $data, $proofPath) {
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

                $paymentStatus = $data['payment_method'] === 'gcash' ? 'pending_verification' : 'pending';
                $checkoutGroupId = (string) Str::uuid();

                $sellerGroups = collect($preparedItems)->groupBy('seller_id');
                $groupCount = $sellerGroups->count();

                $createdOrders = [];
                $baseTimestamp = date('ymdHis');
                $randomKey = strtoupper(Str::random(4));
                $orderIdx = 1;

                foreach ($sellerGroups as $sellerId => $sellerItems) {
                    $orderSubtotal = round((float) $sellerItems->sum('subtotal'), 2);
                    $shippingFee = 99.00; // Flat shipping rate per seller order
                    $orderTotal = round($orderSubtotal + $shippingFee, 2);

                    $orderNumber = $groupCount > 1
                        ? "VEL-{$randomKey}-{$baseTimestamp}-{$orderIdx}"
                        : "VEL-{$randomKey}-{$baseTimestamp}";
                    $orderIdx++;

                    $order = Order::create([
                        'buyer_id'          => $user->id,
                        'checkout_group_id' => $checkoutGroupId,
                        'order_number'      => $orderNumber,
                        'subtotal'          => $orderSubtotal,
                        'shipping_fee'      => $shippingFee,
                        'total'             => $orderTotal,
                        'payment_method'    => $data['payment_method'],
                        'payment_status'    => $paymentStatus,
                        'status'            => OrderStatus::PLACED->value,
                        'payment_reference' => $data['payment_reference'] ?? null,
                        'payment_proof_path'=> $proofPath,
                        'shipping_name'          => $data['shipping_name'],
                        'shipping_phone'         => $data['shipping_phone'],
                        'shipping_address'       => $data['shipping_address'],
                        'shipping_province'      => $data['shipping_province'] ?? null,
                        'shipping_city'          => $data['shipping_city'] ?? null,
                        'shipping_barangay'      => $data['shipping_barangay'] ?? null,
                        'shipping_province_code' => $data['shipping_province_code'],
                        'shipping_city_code'     => $data['shipping_city_code'],
                        'shipping_barangay_code' => $data['shipping_barangay_code'],
                        'notes'                  => $data['notes'] ?? null,
                    ]);

                    // Record initial placement history
                    OrderStatusHistory::create([
                        'order_id'    => $order->id,
                        'from_status' => null,
                        'to_status'   => OrderStatus::PLACED->value,
                        'actor_type'  => 'buyer',
                        'actor_id'    => $user->id,
                        'note'        => 'Order placed by customer',
                        'created_at'  => now(),
                    ]);

                    // Create Order Items
                    foreach ($sellerItems as $item) {
                        $order->items()->create($item);
                    }

                    // Create Payment Record
                    Payment::create([
                        'order_id'         => $order->id,
                        'method'           => $data['payment_method'],
                        'reference_number' => $data['payment_reference'] ?? null,
                        'amount'           => $orderTotal,
                        'status'           => 'pending',
                    ]);

                    $createdOrders[] = $order;
                }

                $formattedOrders = array_map(
                    fn ($o) => $this->formatOrder($o->fresh(['items.seller.sellerProfile', 'buyer', 'statusHistories'])),
                    $createdOrders
                );

                return response()->json([
                    'message'           => count($createdOrders) > 1
                        ? 'Orders placed successfully!'
                        : 'Order placed successfully!',
                    'data'              => $formattedOrders[0],
                    'orders'            => $formattedOrders,
                    'checkout_group_id' => $checkoutGroupId,
                ], 201);
            });
        } catch (\Throwable $e) {
            if ($proofPath) {
                Storage::disk('public')->delete($proofPath);
            }
            throw $e;
        }
    }

    /**
     * GET /api/v1/buyer/orders
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $orders = Order::with(['items.seller.sellerProfile', 'payment', 'parcel'])
            ->where('buyer_id', $user->id)
            ->when($request->status, function ($q, $status) {
                if ($status === 'pending_verification') {
                    $q->where('payment_status', 'pending_verification');
                } else {
                    $mappedStatus = match (strtolower($status)) {
                        'pending'   => OrderStatus::PLACED->value,
                        'confirmed' => OrderStatus::CONFIRMED->value,
                        'packed', 'preparing' => OrderStatus::PREPARING->value,
                        'shipped', 'ready_for_pickup' => OrderStatus::READY_FOR_PICKUP->value,
                        'picked_up' => OrderStatus::PICKED_UP->value,
                        'at_sorting_center' => OrderStatus::AT_SORTING_CENTER->value,
                        'sorted'    => OrderStatus::SORTED->value,
                        'assigned_to_rider' => OrderStatus::ASSIGNED_TO_RIDER->value,
                        'out_for_delivery' => OrderStatus::OUT_FOR_DELIVERY->value,
                        'delivered' => OrderStatus::DELIVERED->value,
                        'completed' => OrderStatus::COMPLETED->value,
                        'delivery_failed' => OrderStatus::DELIVERY_FAILED->value,
                        'cancelled' => OrderStatus::CANCELLED->value,
                        'returned'  => OrderStatus::RETURNED->value,
                        default     => strtoupper($status),
                    };
                    $q->where('status', $mappedStatus);
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

        $order->load(['items.seller.sellerProfile', 'payment', 'dispute', 'statusHistories', 'parcel']);

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

        // One transaction: if the state machine refuses the move (for example the order is already
        // COMPLETED), no dispute row may be left behind.
        DB::transaction(function () use ($order, $user, $data) {
            \App\Models\Dispute::updateOrCreate(
                ['order_id' => $order->id],
                [
                    'buyer_id'    => $user->id,
                    'reason'      => $data['reason'],
                    'description' => $data['description'],
                    'status'      => 'open',
                ]
            );

            $this->stateMachine->transition(
                $order,
                OrderStatus::DISPUTED,
                'buyer',
                $user->id,
                "Return requested: {$data['reason']}"
            );
        });

        return response()->json([
            'message' => 'Return request submitted successfully. The seller will review within 48 hours.',
            'data'    => $this->formatOrder($order->fresh(['items.seller.sellerProfile', 'payment', 'dispute', 'statusHistories']), detail: true),
        ]);
    }

    /**
     * POST /api/v1/buyer/orders/{order}/confirm-receipt
     *
     * The buyer confirms the parcel arrived: DELIVERED -> COMPLETED. This starts the seller's escrow hold
     * (the state machine sets completed_at and each item's escrow_release_at); no money moves here.
     * Another buyer's order is a 404. Anything but DELIVERED (including a disputed order and a second
     * submit) is a 409.
     */
    public function confirmReceipt(Request $request, int $order): JsonResponse
    {
        $user = $request->user();

        return DB::transaction(function () use ($user, $order) {
            /** @var Order|null $locked */
            $locked = Order::where('id', $order)->where('buyer_id', $user->id)->lockForUpdate()->first();

            if (! $locked) {
                return response()->json(['message' => 'Order not found.'], 404);
            }

            $status = $locked->status instanceof OrderStatus ? $locked->status : OrderStatus::tryFrom((string) $locked->status);

            if ($status === OrderStatus::DISPUTED) {
                return response()->json(['message' => 'A return request is open for this order, so receipt cannot be confirmed.'], 409);
            }
            if ($status === OrderStatus::COMPLETED) {
                return response()->json(['message' => 'This order has already been confirmed as received.'], 409);
            }
            if ($status !== OrderStatus::DELIVERED) {
                return response()->json(['message' => 'You can confirm receipt once the order has been delivered.'], 409);
            }

            $this->stateMachine->transition(
                $locked,
                OrderStatus::COMPLETED,
                'buyer',
                $user->id,
                'Buyer confirmed receipt'
            );

            $fresh = $locked->fresh(['items.seller.sellerProfile', 'payment', 'dispute', 'statusHistories', 'parcel']);

            return response()->json([
                'message' => 'Thanks for confirming. The seller\'s payment will be released after the protection period.',
                'data'    => $this->formatOrder($fresh, detail: true),
            ]);
        });
    }

    private function formatOrder(Order $o, bool $detail = false): array
    {
        $statusStr = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;

        // Feature 2.8: when the order was delivered, when it will auto-complete if the buyer does nothing,
        // and whether a delivery proof photo exists (the photo itself is fetched from the secure endpoint).
        $parcel = $o->relationLoaded('parcel') ? $o->parcel : $o->parcel()->first();
        $deliveredAt = $parcel?->delivered_at;
        $autoCompleteAt = ($statusStr === OrderStatus::DELIVERED->value && $deliveredAt)
            ? $deliveredAt->copy()->addDays(max(0, (int) config('orders.auto_complete_days', 3)))
            : null;

        return [
            'id'                  => $o->id,
            'checkout_group_id'   => $o->checkout_group_id,
            'order_number'        => $o->order_number,
            'tracking_number'     => $o->relationLoaded('parcel') ? $o->parcel?->tracking_number : $o->parcel()->value('tracking_number'),
            'status'              => $statusStr,
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
            'delivered_at'            => $deliveredAt?->toIso8601String(),
            'auto_complete_at'        => $autoCompleteAt?->toIso8601String(),
            'completed_at'            => $o->completed_at?->toIso8601String(),
            'delivery_proof_available' => (bool) $parcel?->delivery_proof_path,
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
            'status_history'      => ($detail || $o->relationLoaded('statusHistories')) ? $o->statusHistories->map(fn ($h) => [
                'id'          => $h->id,
                'from_status' => $h->from_status,
                'to_status'   => $h->to_status,
                'actor_type'  => $h->actor_type,
                'note'        => $h->note,
                'created_at'  => $h->created_at?->toIso8601String(),
            ])->values() : [],
        ];
    }
}

