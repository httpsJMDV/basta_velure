<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Dispute;
use App\Models\Order;
use App\Services\Commerce\BuyerOrderPresenter;
use App\Services\Commerce\OrderCanceller;
use App\Services\Commerce\ReturnService;
use App\Services\Commerce\SandboxGateway;
use App\Services\OrderStateMachine;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** The buyer's orders (B10 to B12): tabs, details, cancel, return and refund, receipt and Pay Again. */
class BuyerOrderController extends Controller
{
    private const WITH = ['items.seller.sellerProfile', 'payment', 'parcel', 'dispute.photos'];

    public function __construct(
        protected OrderStateMachine $stateMachine,
        protected OrderCanceller $canceller,
        protected ReturnService $returns,
    ) {}

    /**
     * GET /buyer/orders?tab=to_pay|to_ship|to_receive|completed|cancelled|return_refund&page=&per_page=
     * Every order is in exactly one tab; the counts cover all of the buyer's orders (B10).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $tab = $request->query('tab');
        $perPage = min(50, max(5, (int) $request->query('per_page', 15)));

        $query = Order::with(self::WITH)->where('buyer_id', $user->id);
        if (in_array($tab, BuyerOrderPresenter::TABS, true)) {
            BuyerOrderPresenter::scopeTab($query, $tab);
        } elseif ($status = $request->query('status')) {
            $this->legacyStatusFilter($query, (string) $status);
        }
        if ($q = trim((string) $request->query('search', ''))) {
            $query->where(fn ($w) => $w->where('order_number', 'like', "%{$q}%")->orWhereHas('items', fn ($i) => $i->where('product_name', 'like', "%{$q}%")));
        }
        $orders = $query->latest()->paginate($perPage);

        $counts = [];
        foreach (BuyerOrderPresenter::TABS as $t) {
            $counts[$t] = BuyerOrderPresenter::scopeTab(Order::where('buyer_id', $user->id), $t)->count();
        }

        return response()->json([
            'data'   => $orders->getCollection()->map(fn ($o) => BuyerOrderPresenter::present($o))->values(),
            'meta'   => ['current_page' => $orders->currentPage(), 'last_page' => $orders->lastPage(), 'total' => $orders->total(), 'per_page' => $orders->perPage()],
            'counts' => $counts + ['all' => Order::where('buyer_id', $user->id)->count()],
        ]);
    }

    /** GET /buyer/orders/{order} */
    public function show(Request $request, Order $order): JsonResponse
    {
        abort_if($order->buyer_id !== $request->user()->id, 404, 'Order not found.');
        $order->load([...self::WITH, 'statusHistories']);

        return response()->json(['data' => BuyerOrderPresenter::present($order, detail: true)]);
    }

    /** POST /buyer/orders/{order}/cancel {reason, details?}: until the seller marks it Ready for Pickup (A6). */
    public function cancel(Request $request, Order $order): JsonResponse
    {
        abort_if($order->buyer_id !== $request->user()->id, 404, 'Order not found.');
        $data = $request->validate([
            'reason'  => ['required', Rule::in(OrderCanceller::BUYER_REASONS)],
            'details' => ['nullable', 'required_if:reason,Other', 'string', 'min:10', 'max:300'],
        ], [
            'reason.required'     => 'Choose a reason for cancelling.',
            'reason.in'           => 'Choose a reason from the list.',
            'details.required_if' => 'Tell the seller why you are cancelling (10 to 300 characters).',
            ...Validation::reasonMessages('details'),
        ]);
        $reason = $data['reason'] === 'Other' ? trim(strip_tags($data['details'])) : $data['reason'];

        $fresh = $this->canceller->cancel($order, 'buyer', $request->user()->id, $reason);

        return response()->json([
            'message' => $fresh->refund_status === 'refunded'
                ? 'Order cancelled. ₱' . number_format((float) $fresh->refund_amount, 2) . ' is being refunded to your ' . ($fresh->payment_method === 'card' ? 'card' : 'e-wallet') . '.'
                : 'Order cancelled.',
            'data' => BuyerOrderPresenter::present($fresh->load([...self::WITH, 'statusHistories']), detail: true),
        ]);
    }

    /**
     * POST /buyer/orders/{order}/request-return (multipart): reason from the list, a 10 to 500 character description
     * and 1 to 5 JPG or PNG photos up to 5 MB each (A31); only after delivery, within 7 days, before completion.
     */
    public function requestReturn(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();
        abort_if($order->buyer_id !== $user->id, 404, 'Order not found.');
        if ($why = ReturnService::unavailableReason($order)) {
            return response()->json(['message' => $why], 422);
        }
        $data = $request->validate([
            'reason'      => ['required', Rule::in(Dispute::REASONS)],
            'description' => ['required', 'string', 'min:10', 'max:500'],
            'photos'      => ['required', 'array', 'min:1', 'max:5'],
            'photos.*'    => Validation::image(),
        ], [
            'reason.required'      => 'Choose a reason for the return.',
            'reason.in'            => 'Choose a reason from the list.',
            'description.required' => 'Describe the problem (10 to 500 characters).',
            'description.min'      => 'The description must be at least 10 characters.',
            'description.max'      => 'The description can be at most 500 characters.',
            'photos.required'      => 'Add at least one photo of the problem.',
            'photos.min'           => 'Add at least one photo of the problem.',
            'photos.max'           => 'You can add up to 5 photos.',
            ...Validation::uploadMessages('photos.*', 'each photo'),
        ]);

        $this->returns->request($order, $user, $data['reason'], trim(strip_tags($data['description'])), $request->file('photos', []));

        return response()->json([
            'message' => 'Return request sent. The shop has 3 days to answer; if it does not, the request is approved.',
            'data'    => BuyerOrderPresenter::present($order->fresh([...self::WITH, 'statusHistories']), detail: true),
        ]);
    }

    /** POST /buyer/orders/{order}/escalate-return: once, within 3 days of the shop's rejection. */
    public function escalateReturn(Request $request, Order $order): JsonResponse
    {
        abort_if($order->buyer_id !== $request->user()->id, 404, 'Order not found.');
        $this->returns->escalate($order, $request->user());

        return response()->json([
            'message' => 'Escalated. Loved-IT will review the request and decide.',
            'data'    => BuyerOrderPresenter::present($order->fresh([...self::WITH, 'statusHistories']), detail: true),
        ]);
    }

    /** POST /buyer/orders/{order}/pay-again: a new sandbox payment for the unpaid orders of the checkout. */
    public function payAgain(Request $request, Order $order, SandboxGateway $gateway): JsonResponse
    {
        abort_if($order->buyer_id !== $request->user()->id, 404, 'Order not found.');
        if (! $order->awaitingPayment()) {
            return response()->json(['message' => $order->status === OrderStatus::CANCELLED
                ? 'This order was cancelled because it was not paid within 1 hour.'
                : 'This order does not need a payment.'], 409);
        }
        $session = $gateway->retry($order);
        if (! $session) {
            return response()->json(['message' => 'The hour to pay this order is over, so it can no longer be paid.'], 409);
        }

        return response()->json(['message' => 'Continue to the payment page.', 'data' => SandboxGateway::present($session)]);
    }

    /**
     * POST /buyer/orders/{order}/confirm-receipt
     *
     * The buyer confirms the parcel arrived: DELIVERED -> COMPLETED, and the shop's earnings become available (A15).
     * Another buyer's order is a 404. Anything but DELIVERED (including a disputed order and a second submit) is 409.
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

            $this->stateMachine->transition($locked, OrderStatus::COMPLETED, 'buyer', $user->id, 'Buyer confirmed receipt');

            return response()->json([
                'message' => 'Thanks for confirming. You can now rate the items.',
                'data'    => BuyerOrderPresenter::present($locked->fresh([...self::WITH, 'statusHistories']), detail: true),
            ]);
        });
    }

    /** The older ?status= filter, kept for clients that still send it. */
    private function legacyStatusFilter($q, string $status): void
    {
        if ($status === 'pending_verification') {
            $q->where('payment_status', 'pending_verification');

            return;
        }
        $mapped = match (strtolower($status)) {
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
        $q->where('status', $mapped);
    }
}
