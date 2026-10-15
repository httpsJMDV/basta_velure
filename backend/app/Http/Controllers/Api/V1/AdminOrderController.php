<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\AdminOrderListRequest;
use App\Models\Order;
use App\Services\AdminAnalyticsService;
use App\Services\OrderStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminOrderController extends Controller
{
    public function __construct(
        protected OrderStateMachine $stateMachine
    ) {}

    /**
     * The status groups of the admin Orders page (chips and KPI cards). They partition every OrderStatus, so the group
     * counts always add up to the total. The labels live in frontend/src/utils/orderStatus.ts (ADMIN_ORDER_GROUPS).
     *
     * @return array<string, array<int, string>> group key => statuses
     */
    public static function statusGroups(): array
    {
        $v = fn (OrderStatus ...$cases) => array_map(fn (OrderStatus $c) => $c->value, $cases);

        return [
            'awaiting_action'     => $v(OrderStatus::PLACED, OrderStatus::CONFIRMED, OrderStatus::PREPARING, OrderStatus::READY_FOR_PICKUP),
            'in_transit'          => $v(OrderStatus::PICKED_UP, OrderStatus::AT_SORTING_CENTER, OrderStatus::SORTED, OrderStatus::ASSIGNED_TO_RIDER, OrderStatus::OUT_FOR_DELIVERY),
            'delivered_completed' => $v(OrderStatus::DELIVERED, OrderStatus::COMPLETED),
            'problem'             => $v(OrderStatus::DELIVERY_FAILED, OrderStatus::RETURNED, OrderStatus::DISPUTED),
            'cancelled'           => $v(OrderStatus::CANCELLED),
        ];
    }

    /** Legacy and lower-case status names the endpoint has always accepted, mapped to OrderStatus values. */
    private function mapStatus(string $status): string
    {
        return match (strtolower($status)) {
            'pending'   => OrderStatus::PLACED->value,
            'confirmed' => OrderStatus::CONFIRMED->value,
            'preparing', 'packed' => OrderStatus::PREPARING->value,
            'ready_for_pickup', 'shipped' => OrderStatus::READY_FOR_PICKUP->value,
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
    }

    /**
     * The orders the filters select. `$withStatus` is false for the summary, whose counts per status must not depend
     * on the status filter.
     *
     * Filters: from/to (inclusive Asia/Manila days, on the day the order was placed), payment_method, payment_status,
     * search (order number, tracking number, buyer name or email, seller name or shop name), and status / group.
     */
    private function filtered(AdminOrderListRequest $request, bool $withStatus)
    {
        $search = $request->validated('search');
        $like = $search !== null ? '%' . addcslashes($search, '\\%_') . '%' : null;

        return Order::query()
            ->when($request->validated('from') && $request->validated('to'), function ($q) use ($request) {
                $range = app(AdminAnalyticsService::class)->range($request->validated('from'), $request->validated('to'));
                $q->where('created_at', '>=', $range['start'])->where('created_at', '<', $range['end']);
            })
            ->when($request->validated('payment_method'), fn ($q, $v) => $q->where('payment_method', $v))
            ->when($request->validated('payment_status'), fn ($q, $v) => $q->where('payment_status', $v))
            ->when($like, fn ($q) => $q->where(function ($w) use ($like) {
                $w->where('order_number', 'like', $like)
                    ->orWhereHas('parcel', fn ($p) => $p->where('tracking_number', 'like', $like))
                    ->orWhereHas('buyer', fn ($b) => $b
                        ->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like))
                    ->orWhereHas('items.seller', fn ($s) => $s
                        ->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhereHas('sellerProfile', fn ($sp) => $sp->where('shop_name', 'like', $like)));
            }))
            ->when($withStatus ? $request->validated('group') : null, fn ($q, $group) => $q->whereIn('status', self::statusGroups()[$group]))
            ->when($withStatus ? $request->validated('status') : null, fn ($q, $status) => $q->where('status', $this->mapStatus($status)));
    }

    public function index(AdminOrderListRequest $request): JsonResponse
    {
        $sort = $request->validated('sort') === 'total' ? 'total' : 'created_at';
        $direction = $request->validated('direction') === 'asc' ? 'asc' : 'desc';

        $orders = $this->filtered($request, withStatus: true)
            ->with(['buyer', 'items.seller.sellerProfile', 'parcel'])
            ->orderBy($sort, $direction)
            ->orderBy('id', $direction)
            ->paginate((int) ($request->validated('per_page') ?? 20));

        return response()->json([
            'data' => $orders->map(fn ($o) => $this->formatOrder($o)),
            'meta' => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
                'per_page'     => $orders->perPage(),
                'from'         => $orders->firstItem(),
                'to'           => $orders->lastItem(),
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/orders/summary: the KPI row and chip counts of the Orders page, for the same filters as the
     * list (except the status filter). Counts are raw counts of the matching orders by status, so the groups always
     * add up to `total`. `gmv` uses the dashboard's definition: the orders that count (not CANCELLED or RETURNED), the
     * sum of `orders.total`.
     */
    public function summary(AdminOrderListRequest $request): JsonResponse
    {
        $base = $this->filtered($request, withStatus: false);

        $counts = (clone $base)->reorder()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $byStatus = [];
        foreach (OrderStatus::cases() as $case) {
            $byStatus[$case->value] = (int) ($counts[$case->value] ?? 0);
        }

        $groups = [];
        foreach (self::statusGroups() as $key => $statuses) {
            $groups[$key] = array_sum(array_map(fn (string $s) => $byStatus[$s], $statuses));
        }

        $gmv = (clone $base)->reorder()->whereNotIn('status', AdminAnalyticsService::excludedStatuses())->sum('total');

        return response()->json([
            'data' => [
                'total'     => array_sum($byStatus),
                'groups'    => $groups,
                'by_status' => $byStatus,
                'gmv'       => round((float) $gmv, 2),
            ],
        ]);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['buyer', 'items', 'payment', 'dispute', 'statusHistories', 'parcel']);
        return response()->json(['data' => $this->formatOrder($order, detail: true)]);
    }

    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        $request->validate([
            'status' => ['required', 'string'],
            'note'   => ['nullable', 'string', 'max:500'],
        ]);

        $targetStatus = match (strtolower($request->status)) {
            'pending'          => OrderStatus::PLACED->value,
            'confirmed'        => OrderStatus::CONFIRMED->value,
            'packed', 'preparing' => OrderStatus::PREPARING->value,
            'shipped', 'ready_for_pickup' => OrderStatus::READY_FOR_PICKUP->value,
            'picked_up'        => OrderStatus::PICKED_UP->value,
            'at_sorting_center'=> OrderStatus::AT_SORTING_CENTER->value,
            'sorted'           => OrderStatus::SORTED->value,
            'assigned_to_rider'=> OrderStatus::ASSIGNED_TO_RIDER->value,
            'out_for_delivery' => OrderStatus::OUT_FOR_DELIVERY->value,
            'delivered'        => OrderStatus::DELIVERED->value,
            'completed'        => OrderStatus::COMPLETED->value,
            'delivery_failed'  => OrderStatus::DELIVERY_FAILED->value,
            'cancelled'        => OrderStatus::CANCELLED->value,
            'returned'         => OrderStatus::RETURNED->value,
            default            => strtoupper($request->status),
        };

        $order = $this->stateMachine->transition(
            $order,
            $targetStatus,
            'admin',
            $request->user()->id,
            $request->note ?? 'Admin status update'
        );

        return response()->json(['data' => $this->formatOrder($order->fresh(['buyer', 'items', 'statusHistories', 'parcel']))]);
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

    /** @return array{id: int, name: string}|null */
    private function shopOf(Order $o): ?array
    {
        $seller = $o->items->first()?->seller;
        if (! $seller) {
            return null;
        }

        return ['id' => $seller->id, 'name' => $seller->sellerProfile?->shop_name ?? trim($seller->first_name . ' ' . $seller->last_name)];
    }

    private function formatOrder(Order $o, bool $detail = false): array
    {
        $statusStr = $o->status instanceof OrderStatus ? $o->status->value : (string) $o->status;

        $base = [
            'id'              => $o->id,
            'order_number'    => $o->order_number,
            'tracking_number' => $o->relationLoaded('parcel') ? $o->parcel?->tracking_number : $o->parcel()->value('tracking_number'),
            'status'          => $statusStr,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
            'subtotal'       => (float) $o->subtotal,
            'shipping_fee'   => (float) $o->shipping_fee,
            'total'          => (float) $o->total,
            'created_at'     => $o->created_at,
            // The shop(s) selling on this order. Checkout makes one order per seller, so this is one shop.
            'shop'           => $this->shopOf($o),
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

        $base['status_history'] = ($detail || $o->relationLoaded('statusHistories')) ? $o->statusHistories->map(fn ($h) => [
            'id'          => $h->id,
            'from_status' => $h->from_status,
            'to_status'   => $h->to_status,
            'actor_type'  => $h->actor_type,
            'note'        => $h->note,
            'created_at'  => $h->created_at?->toIso8601String(),
        ])->values() : [];

        return $base;
    }
}
