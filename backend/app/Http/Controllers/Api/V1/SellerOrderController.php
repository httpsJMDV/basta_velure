<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Services\Commerce\OrderCanceller;
use App\Services\Commerce\ReturnService;
use App\Services\OrderStateMachine;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class SellerOrderController extends Controller
{
    public function __construct(
        protected OrderStateMachine $stateMachine,
        protected OrderCanceller $canceller,
        protected ReturnService $returns,
    ) {}

    /** Seller tabs (A10): New, To Ship, Shipping, Completed, Cancelled, Return/Refund. */
    public const TABS = [
        'new'           => ['PLACED'],
        'to_ship'       => ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'],
        'shipping'      => ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED'],
        'completed'     => ['COMPLETED'],
        'cancelled'     => ['CANCELLED'],
        'return_refund' => ['DISPUTED', 'RETURNED'],
    ];

    /**
     * GET /api/v1/seller/orders?tab=&from=Y-m-d&to=Y-m-d&search=&page=&per_page=
     * Every order is in exactly one tab; the counts follow the same date range (S8).
     */
    public function index(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $range = $this->dateRange($request);
        $base = fn () => Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->when($range, fn ($q) => $q->whereBetween('created_at', $range));

        $query = $base()->with(['buyer', 'items' => fn ($q) => $q->where('seller_id', $sellerId), 'payment', 'parcel', 'dispute.photos']);
        $tab = $request->query('tab');
        if (is_string($tab) && isset(self::TABS[$tab])) {
            $query->whereIn('status', self::TABS[$tab]);
        } elseif ($request->status) {
            $this->legacyStatusFilter($query, (string) $request->status);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($sub) use ($search) {
                $sub->where('order_number', 'like', "%{$search}%")
                    ->orWhere('payment_reference', 'like', "%{$search}%")
                    ->orWhere('shipping_name', 'like', "%{$search}%")
                    ->orWhereHas('buyer', fn ($bq) => $bq->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"));
                if (ctype_digit($search)) {
                    $sub->orWhere('id', (int) $search);
                }
            });
        }
        $orders = $query->latest()->paginate(min(50, max(5, (int) $request->query('per_page', 15))));

        $counts = ['all' => $base()->count()];
        foreach (self::TABS as $key => $statuses) {
            $counts[$key] = $base()->whereIn('status', $statuses)->count();
        }
        $counts['pending_verification'] = $base()->where('payment_status', 'pending_verification')->count();

        $groupIds = $orders->pluck('checkout_group_id')->filter()->unique();
        $groupStatsMap = $groupIds->isNotEmpty()
            ? Order::whereIn('checkout_group_id', $groupIds)->groupBy('checkout_group_id')
                ->selectRaw('checkout_group_id, count(*) as orders_count, sum(total) as group_total')->get()->keyBy('checkout_group_id')
            : collect();

        return response()->json([
            'data' => $orders->getCollection()->map(function ($o) use ($sellerId, $groupStatsMap) {
                $stat = $o->checkout_group_id ? ($groupStatsMap[$o->checkout_group_id] ?? null) : null;
                $groupMeta = $stat && $stat->orders_count > 1 ? ['group_total' => (float) $stat->group_total, 'orders_count' => (int) $stat->orders_count] : null;

                return $this->formatOrder($o, $sellerId, detail: false, groupMeta: $groupMeta);
            })->values(),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
                'per_page'     => $orders->perPage(),
            ],
            'counts' => $counts,
        ]);
    }

    /** from/to as Manila dates, both days included; an end before the start is refused. */
    private function dateRange(Request $request): ?array
    {
        if (! $request->filled('from') && ! $request->filled('to')) {
            return null;
        }
        $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to'   => ['nullable', 'date_format:Y-m-d'],
        ], [
            'from.date_format' => 'Enter the start date as YYYY-MM-DD.',
            'to.date_format'   => 'Enter the end date as YYYY-MM-DD.',
        ]);
        $from = $request->filled('from') ? \Carbon\CarbonImmutable::parse($request->input('from'), 'Asia/Manila')->startOfDay() : \Carbon\CarbonImmutable::create(2000, 1, 1, 0, 0, 0, 'Asia/Manila');
        $to = $request->filled('to') ? \Carbon\CarbonImmutable::parse($request->input('to'), 'Asia/Manila')->endOfDay() : \Carbon\CarbonImmutable::now('Asia/Manila')->endOfDay();
        if ($to->lt($from)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['to' => 'The end date cannot be before the start date.']);
        }

        return [$from->utc(), $to->utc()];
    }

    /** The older ?status= filter, kept for clients that still send it. */
    private function legacyStatusFilter($q, string $status): void
    {
        if ($status === 'pending_verification') {
            $q->where('payment_status', 'pending_verification');
        } elseif (in_array(strtolower($status), ['confirmed', 'to_ship'])) {
            $q->whereIn('status', self::TABS['to_ship']);
        } elseif (in_array(strtolower($status), ['in_transit', 'shipped'])) {
            $q->whereIn('status', ['PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY']);
        } elseif (strtolower($status) === 'delivered') {
            $q->whereIn('status', ['DELIVERED', 'COMPLETED']);
        } elseif (in_array(strtolower($status), ['cancelled', 'returned'])) {
            $q->whereIn('status', ['CANCELLED', 'RETURNED', 'DISPUTED', 'DELIVERY_FAILED']);
        } else {
            $mapped = match (strtolower($status)) {
                'pending'   => OrderStatus::PLACED->value,
                'preparing', 'packed' => OrderStatus::PREPARING->value,
                'ready_for_pickup' => OrderStatus::READY_FOR_PICKUP->value,
                'picked_up' => OrderStatus::PICKED_UP->value,
                'out_for_delivery' => OrderStatus::OUT_FOR_DELIVERY->value,
                'completed' => OrderStatus::COMPLETED->value,
                default     => strtoupper($status),
            };
            $q->where('status', $mapped);
        }
    }

    /**
     * GET /api/v1/seller/orders/{order}
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $order->load(['buyer', 'items' => fn ($q) => $q->where('seller_id', $sellerId), 'payment', 'dispute.photos', 'statusHistories', 'parcel']);

        return response()->json([
            'data' => $this->formatOrder($order, $sellerId, detail: true),
        ]);
    }

    /**
     * GET /api/v1/seller/orders/{order}/waybill
     */
    public function waybill(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();
        $isOwner = $order->items()->where('seller_id', $user->id)->exists();
        $isAdmin = $user->role === 'admin';
        abort_unless($isOwner || $isAdmin, 403, 'Unauthorized to access waybill for this order.');

        $parcel = $order->parcel()->first();
        if (! $parcel) {
            return response()->json([
                'message' => 'Waybill cannot be generated: parcel has not been created yet. Mark the order as Ready for Pickup first.',
            ], 409);
        }

        $order->loadMissing(['items.seller.sellerProfile', 'buyer']);
        $sellerItems = $isAdmin
            ? $order->items
            : $order->items->where('seller_id', $user->id);

        return response()->json([
            'data' => [
                'order' => [
                    'id'             => $order->id,
                    'order_number'   => $order->order_number,
                    'created_at'     => $order->created_at?->toIso8601String(),
                    'payment_method' => $order->payment_method,
                    'total'          => (float) $order->total,
                ],
                'parcel' => [
                    'id'                   => $parcel->id,
                    'tracking_number'      => $parcel->tracking_number,
                    'status'               => $parcel->status,
                    'ready_at'             => $parcel->ready_at?->toIso8601String(),
                    'pickup_barangay'      => $parcel->pickup_barangay,
                    'destination_barangay' => $parcel->destination_barangay,
                    'cod_amount'           => $parcel->cod_amount !== null ? (float) $parcel->cod_amount : null,
                    // The parcel's actual weight and the whole kilograms it is charged as (A20).
                    'weight_kg'            => $this->weightKg($order, $sellerItems),
                    'chargeable_weight_kg' => $order->chargeable_weight_kg,
                ],
                'sender' => $parcel->pickup_address_snapshot,
                'recipient' => $parcel->recipient_snapshot,
                'items' => $sellerItems->map(fn ($i) => [
                    'id'            => $i->id,
                    'product_name'  => $i->product_name,
                    'variant_label' => $i->variant_label,
                    'quantity'      => $i->quantity,
                    'unit_price'    => (float) $i->unit_price,
                    'subtotal'      => (float) $i->subtotal,
                ])->values(),
                'cod' => [
                    'is_cod' => $order->payment_method === 'cod',
                    'amount' => $order->payment_method === 'cod' ? (float) ($parcel->cod_amount ?? $order->total) : 0.00,
                ],
                'courier' => \App\Models\LogisticsCompany::summaryFor($parcel->logistics_company_id ?? $order->logistics_company_id),
                'barcode' => [
                    'format' => 'CODE128',
                    'value'  => $parcel->tracking_number,
                ],
            ],
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/confirm-payment
     */
    public function confirmPayment(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);
        if (in_array($order->payment_method, Order::GATEWAY_METHODS, true) && $order->payment_status !== 'paid') {
            abort(422, 'This order is not paid yet. You can accept it once the buyer pays.');
        }

        if ($order->payment_method === 'gcash') {
            $order->update([
                'payment_status'      => 'paid',
                'payment_verified_at' => now(),
                'payment_verified_by' => $sellerId,
            ]);

            if ($order->payment) {
                $order->payment->update([
                    'status'  => 'paid',
                    'paid_at' => now(),
                ]);
            }
        }

        $currentStatus = $order->status instanceof OrderStatus ? $order->status->value : (string) $order->status;
        if ($currentStatus === OrderStatus::PLACED->value) {
            // The "Order confirmed" email from the transition already tells a GCash buyer the payment was received.
            $this->stateMachine->transition(
                $order,
                OrderStatus::CONFIRMED,
                'seller',
                $sellerId,
                $order->payment_method === 'cod'
                    ? 'COD order confirmed by merchant'
                    : 'Payment verified and confirmed by merchant'
            );
        } elseif ($order->payment_method === 'gcash') {
            app(\App\Services\MailNotifier::class)->gcashPaymentConfirmed($order);
        }

        return response()->json([
            'message' => $order->payment_method === 'cod'
                ? 'COD order confirmed successfully!'
                : 'Payment verified and confirmed successfully!',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment', 'statusHistories']), $sellerId),
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

        app(\App\Services\MailNotifier::class)->gcashPaymentRejected($order, $data['reason']);

        return response()->json([
            'message' => 'Payment marked as not received / verification failed.',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment']), $sellerId),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/respond-return {action: approve|reject, reason}
     *
     * Approve refunds the buyer and returns the order; reject needs a 10 to 300 character reason, which the buyer
     * sees with an Escalate button for 3 days (A31). An escalated request is Loved-IT's to decide.
     */
    public function respondReturn(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $data = $request->validate([
            'action' => ['required', 'in:approve,accept,reject'],
            'reason' => ['required_if:action,reject', 'nullable', 'string', 'min:10', 'max:300'],
        ], [
            'action.in'          => 'Choose Approve or Reject.',
            'reason.required_if' => 'Give the buyer a reason for rejecting (10 to 300 characters).',
            ...Validation::reasonMessages(),
        ]);

        $dispute = $order->dispute;
        if (! $dispute) {
            return response()->json(['message' => 'No return request was found for this order.'], 404);
        }
        if ($dispute->status === 'escalated') {
            return response()->json(['message' => 'The buyer escalated this request. Loved-IT will decide it.'], 409);
        }

        if ($data['action'] === 'reject') {
            $this->returns->reject($order, $sellerId, trim(strip_tags($data['reason'])));
            $message = 'Return rejected. The buyer can escalate it to Loved-IT within 3 days.';
        } else {
            $this->returns->approve($order, 'seller', $sellerId);
            $message = 'Return approved. The buyer has been refunded and told how to send the item back.';
        }

        return response()->json([
            'message' => $message,
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment', 'dispute.photos', 'statusHistories', 'parcel']), $sellerId, detail: true),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/cancel {reason, details?}: until the courier picks the parcel up (A6).
     */
    public function cancel(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);
        $reason = $this->cancelReason($request);
        $fresh = $this->canceller->cancel($order, 'seller', $sellerId, $reason);

        return response()->json([
            'message' => 'Order cancelled. The buyer was told why' . ($fresh->refund_status ? ' and refunded.' : '.'),
            'data'    => $this->formatOrder($fresh->load(['buyer', 'items', 'payment', 'dispute.photos', 'statusHistories', 'parcel']), $sellerId, detail: true),
        ]);
    }

    /**
     * POST /api/v1/seller/orders/{order}/confirm-return-received: the parcel of a failed delivery is back at the shop.
     * Only now does its stock go back on sale (A13, LOG-RTS-003).
     */
    public function confirmReturnReceived(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);
        app(\App\Services\Courier\ReturnToSender::class)->sellerConfirm($order, $request->user());

        return response()->json([
            'message' => 'Thanks. The items are back in stock.',
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment', 'dispute.photos', 'statusHistories', 'parcel']), $sellerId, detail: true),
        ]);
    }

    /** @return array{state: string, since: string|null, confirmed_at: string|null}|null */
    private function rtsState(Order $o): ?array
    {
        $p = $o->relationLoaded('parcel') ? $o->parcel : $o->parcel()->first();
        if (! $p) {
            return null;
        }
        if ($p->status === \App\Models\Parcel::STATUS_RETURN_TO_SENDER) {
            return ['state' => 'on_the_way', 'since' => $p->rts_at?->toIso8601String(), 'confirmed_at' => null];
        }
        if ($p->status === \App\Models\Parcel::STATUS_RETURNED && $o->cancel_reason === \App\Services\Courier\ReturnToSender::CANCEL_REASON) {
            return [
                'state' => $p->seller_return_confirmed_at ? 'confirmed' : 'awaiting_confirmation',
                'since' => $p->returned_at?->toIso8601String(), 'confirmed_at' => $p->seller_return_confirmed_at?->toIso8601String(),
            ];
        }

        return null;
    }

    /** A reason from the list, or "Other" with 10 to 300 characters of explanation. */
    private function cancelReason(Request $request): string
    {
        $data = $request->validate([
            'reason'  => ['required', Rule::in(OrderCanceller::SELLER_REASONS)],
            'details' => ['nullable', 'required_if:reason,Other', 'string', 'min:10', 'max:300'],
        ], [
            'reason.required'     => 'Choose a reason for cancelling. The buyer will see it.',
            'reason.in'           => 'Choose a reason from the list.',
            'details.required_if' => 'Explain the reason to the buyer (10 to 300 characters).',
            ...Validation::reasonMessages('details'),
        ]);

        return $data['reason'] === 'Other' ? trim(strip_tags($data['details'])) : $data['reason'];
    }

    /**
     * PATCH /api/v1/seller/orders/{order}/status
     */
    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        $data = $request->validate([
            'status' => ['required', 'string'],
            'note'   => ['nullable', 'string', 'max:500'],
        ]);

        $requestedStatus = match (strtolower($data['status'])) {
            'preparing', 'packed' => OrderStatus::PREPARING->value,
            'ready_for_pickup', 'shipped' => OrderStatus::READY_FOR_PICKUP->value,
            'cancelled' => OrderStatus::CANCELLED->value,
            'confirmed' => OrderStatus::CONFIRMED->value,
            default => strtoupper($data['status']),
        };

        // Cancelling needs a reason, restores stock and vouchers and refunds a prepaid order.
        if ($requestedStatus === OrderStatus::CANCELLED->value) {
            return $this->cancel($request, $order);
        }

        if ($requestedStatus === OrderStatus::CONFIRMED->value) {
            if ($order->payment_method === 'gcash' && $order->payment_status !== 'paid') {
                abort(422, 'GCash orders require verified payment before confirmation. Please verify the payment slip.');
            }
            if (in_array($order->payment_method, Order::GATEWAY_METHODS, true) && $order->payment_status !== 'paid') {
                abort(422, 'This order is not paid yet. You can accept it once the buyer pays.');
            }
        } else {
            abort_unless(
                in_array($requestedStatus, [OrderStatus::PREPARING->value, OrderStatus::READY_FOR_PICKUP->value], true),
                403,
                "Sellers cannot transition orders to {$requestedStatus}."
            );
        }

        $defaultNote = match ($requestedStatus) {
            OrderStatus::CONFIRMED->value => $order->payment_method === 'cod'
                ? 'COD order confirmed by merchant'
                : 'Order confirmed by merchant',
            default => "Order status updated to {$requestedStatus} by seller",
        };

        $order = $this->stateMachine->transition($order, $requestedStatus, 'seller', $sellerId, $data['note'] ?? $defaultNote);

        return response()->json([
            'message' => "Order status updated to {$requestedStatus}.",
            'data'    => $this->formatOrder($order->fresh(['buyer', 'items', 'payment', 'statusHistories', 'parcel']), $sellerId),
        ]);
    }

    /** The parcel's actual weight in kg, from the items (falls back to the products' weights). */
    private function weightKg(Order $order, $items): ?float
    {
        $grams = (int) collect($items)->sum(fn ($i) => (int) ($i->weight_grams ?? 0));
        if ($grams === 0) {
            $grams = (int) collect($items)->sum(fn ($i) => (int) round(((float) (\App\Models\Product::withTrashed()->whereKey($i->product_id)->value('weight_kg') ?? 0)) * 1000) * $i->quantity);
        }

        return $grams > 0 ? round($grams / 1000, 3) : null;
    }

    private function formatOrder(Order $o, int $sellerId, bool $detail = false, ?array $groupMeta = null): array
    {
        $sellerItems = $o->items->where('seller_id', $sellerId);
        $sellerSubtotal = (float) $sellerItems->sum('subtotal');
        $sellerCommission = (float) $sellerItems->sum('commission_amount');
        $sellerEarnings = (float) $sellerItems->sum('seller_earnings');
        $statusStr = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;

        $checkoutGroupTotal = null;
        $checkoutOrdersCount = null;
        if ($groupMeta !== null) {
            $checkoutGroupTotal = $groupMeta['group_total'] ?? null;
            $checkoutOrdersCount = $groupMeta['orders_count'] ?? null;
        } elseif ($o->checkout_group_id) {
            $groupStats = Order::where('checkout_group_id', $o->checkout_group_id)
                ->selectRaw('count(*) as orders_count, sum(total) as group_total')
                ->first();
            if ($groupStats && $groupStats->orders_count > 1) {
                $checkoutGroupTotal = (float) $groupStats->group_total;
                $checkoutOrdersCount = (int) $groupStats->orders_count;
            }
        }

        return [
            'id'                    => $o->id,
            'checkout_group_id'     => $o->checkout_group_id,
            'checkout_group_total'  => $checkoutGroupTotal,
            'checkout_orders_count' => $checkoutOrdersCount,
            'order_number'          => $o->order_number,
            'tracking_number'       => $o->relationLoaded('parcel') ? $o->parcel?->tracking_number : $o->parcel()->value('tracking_number'),
            'courier'               => \App\Models\LogisticsCompany::summaryFor($o->logistics_company_id),
            'status'                => $statusStr,
            'payment_method'        => $o->payment_method,
            'payment_status'        => $o->payment_status,
            'payment_reference'     => $o->payment_reference,
            'payment_proof_url'     => $o->payment_proof_path ? asset('storage/' . $o->payment_proof_path) : null,
            'payment_verified_at'   => $o->payment_verified_at?->toIso8601String(),
            'rejection_reason'      => $o->verification_rejection_reason,
            'awaiting_payment'      => $o->awaitingPayment(),
            'payment_due_at'        => $o->payment_due_at?->toIso8601String(),
            'paid_at'               => $o->paid_at?->toIso8601String(),
            'tab'                   => collect(self::TABS)->search(fn ($statuses) => in_array($statusStr, $statuses, true)) ?: null,
            'order_total'           => (float) $o->total,
            'shipping_fee'          => (float) $o->shipping_fee,
            'shipping_route'        => $o->shipping_route,
            'chargeable_weight_kg'  => $o->chargeable_weight_kg,
            // The shop's own discounts reduce its earnings; Loved-IT's platform and shipping vouchers do not (A8).
            'promo_discount'        => (float) $o->promo_discount,
            'store_voucher_discount' => (float) $o->store_voucher_discount,
            'store_voucher_code'    => $o->store_voucher_id ? \App\Models\Voucher::whereKey($o->store_voucher_id)->value('code') : null,
            'platform_voucher_discount' => (float) $o->platform_voucher_discount,
            'shipping_voucher_discount' => (float) $o->shipping_voucher_discount,
            'cancel_reason'         => $o->cancel_reason,
            'cancelled_by'          => $o->cancelled_by,
            'cancelled_at'          => $o->cancelled_at?->toIso8601String(),
            'refund_status'         => $o->refund_status,
            'refund_amount'         => $o->refund_amount !== null ? (float) $o->refund_amount : null,
            'can_cancel'            => OrderCanceller::canSellerCancel($o),
            // A failed delivery coming back, or back and waiting for the shop to confirm it (A13).
            'return_to_sender'      => $this->rtsState($o),
            'seller_subtotal'       => $sellerSubtotal,
            'seller_commission'     => $sellerCommission,
            'seller_earnings'       => $sellerEarnings,
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
                'regular_unit_price' => $i->regular_unit_price !== null ? (float) $i->regular_unit_price : null,
                'price_source'      => $i->price_source,
                'is_gift'           => (bool) $i->is_gift,
                'promo_share'       => (float) $i->promo_share,
                'store_voucher_share' => (float) $i->store_voucher_share,
                'quantity'          => $i->quantity,
                'subtotal'          => (float) $i->subtotal,
                'commission_rate'   => (float) $i->commission_rate,
                'commission_amount' => (float) $i->commission_amount,
                'seller_earnings'   => (float) $i->seller_earnings,
                'payout_status'     => $i->payout_status,
                'image_url'         => $i->image_url,
            ])->values(),
            'dispute'             => ReturnService::present($o->relationLoaded('dispute') ? $o->dispute : $o->dispute()->first()),
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

