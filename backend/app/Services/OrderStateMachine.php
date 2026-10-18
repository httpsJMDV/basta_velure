<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderStateMachine
{
    public function __construct(
        protected ?TrackingNumberGenerator $trackingNumberGenerator = null
    ) {
        $this->trackingNumberGenerator ??= app(TrackingNumberGenerator::class);
    }

    /**
     * Complete transition map defining allowed target statuses and authorized actor roles.
     * Actors: 'seller', 'rider', 'hub', 'logistics' (a courier company member), 'buyer', 'admin', 'system'
     *
     * The courier company can move its own parcels through each courier step (scans at its hubs, and a manual
     * override with a reason, A35). A failed delivery that goes back to the seller ends Cancelled for the buyer
     * (A13), and a parcel the courier marks Lost or Damaged cancels the order.
     *
     * @var array<string, array<string, array<string>>>
     */
    public const ALLOWED_TRANSITIONS = [
        OrderStatus::PLACED->value => [
            OrderStatus::CONFIRMED->value => ['seller', 'admin', 'system'],
            OrderStatus::CANCELLED->value => ['buyer', 'seller', 'admin', 'system'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::CONFIRMED->value => [
            OrderStatus::PREPARING->value => ['seller', 'admin'],
            OrderStatus::CANCELLED->value => ['buyer', 'seller', 'admin', 'system'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        // A6: the buyer can cancel until the order is Ready for Pickup; the seller until the courier picks it up.
        OrderStatus::PREPARING->value => [
            OrderStatus::READY_FOR_PICKUP->value => ['seller', 'admin'],
            OrderStatus::CANCELLED->value        => ['buyer', 'seller', 'admin'],
            OrderStatus::DISPUTED->value         => ['buyer', 'admin'],
        ],
        OrderStatus::READY_FOR_PICKUP->value => [
            OrderStatus::PICKED_UP->value => ['rider', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value => ['seller', 'admin'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::PICKED_UP->value => [
            OrderStatus::AT_SORTING_CENTER->value => ['hub', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value         => ['admin', 'logistics'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        OrderStatus::AT_SORTING_CENTER->value => [
            OrderStatus::SORTED->value    => ['hub', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value => ['admin', 'logistics'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::SORTED->value => [
            OrderStatus::ASSIGNED_TO_RIDER->value => ['hub', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value         => ['admin', 'logistics'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        OrderStatus::ASSIGNED_TO_RIDER->value => [
            OrderStatus::OUT_FOR_DELIVERY->value => ['rider', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value        => ['admin', 'logistics'],
            OrderStatus::DISPUTED->value         => ['buyer', 'admin'],
        ],
        OrderStatus::OUT_FOR_DELIVERY->value => [
            OrderStatus::DELIVERED->value       => ['rider', 'admin', 'logistics'],
            OrderStatus::DELIVERY_FAILED->value => ['rider', 'admin', 'logistics'],
            OrderStatus::CANCELLED->value       => ['admin', 'logistics'],
            OrderStatus::DISPUTED->value        => ['buyer', 'admin'],
        ],
        OrderStatus::DELIVERED->value => [
            OrderStatus::COMPLETED->value => ['buyer', 'admin', 'system'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::DELIVERY_FAILED->value => [
            OrderStatus::ASSIGNED_TO_RIDER->value => ['hub', 'admin', 'logistics'],
            OrderStatus::RETURNED->value          => ['hub', 'admin'],
            // Back with the seller after a failed delivery (A13): Cancelled (failed delivery) for the buyer.
            OrderStatus::CANCELLED->value         => ['hub', 'rider', 'admin', 'logistics', 'system'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        // A31: an unanswered return is approved by the system after 3 days; a rejection not escalated in time
        // closes and the order completes.
        OrderStatus::DISPUTED->value => [
            OrderStatus::RETURNED->value  => ['seller', 'admin', 'system'],
            OrderStatus::DELIVERED->value => ['admin'],
            OrderStatus::COMPLETED->value => ['admin', 'system'],
            OrderStatus::CANCELLED->value => ['admin'],
        ],
        OrderStatus::COMPLETED->value => [],
        OrderStatus::RETURNED->value  => [],
        OrderStatus::CANCELLED->value => [],
    ];

    /**
     * Transition an order to a new status.
     *
     * @param Order $order
     * @param OrderStatus|string $targetStatus
     * @param string $actorType 'seller'|'rider'|'hub'|'buyer'|'admin'|'system'
     * @param int|null $actorId
     * @param string|null $note
     * @param array<string, mixed> $meta
     * @return Order
     *
     * @throws HttpException
     */
    public function transition(
        Order $order,
        OrderStatus|string $targetStatus,
        string $actorType,
        ?int $actorId = null,
        ?string $note = null,
        array $meta = []
    ): Order {
        $toStatus = $targetStatus instanceof OrderStatus ? $targetStatus->value : (string) $targetStatus;

        return DB::transaction(function () use ($order, $toStatus, $actorType, $actorId, $note, $meta) {
            /** @var Order $lockedOrder */
            $lockedOrder = Order::where('id', $order->id)->lockForUpdate()->firstOrFail();

            $currentStatus = $lockedOrder->status instanceof OrderStatus
                ? $lockedOrder->status->value
                : (string) $lockedOrder->status;

            // 1. Verify transition is allowed in the state machine
            if (! isset(self::ALLOWED_TRANSITIONS[$currentStatus][$toStatus])) {
                abort(422, "Cannot transition order from {$currentStatus} to {$toStatus}.");
            }

            // 2. Verify actor has permission for this transition
            $allowedActors = self::ALLOWED_TRANSITIONS[$currentStatus][$toStatus];
            if (! in_array($actorType, $allowedActors, true)) {
                abort(403, "Actor '{$actorType}' is not authorized to transition order to '{$toStatus}'.");
            }

            // 3. Apply state update
            $lockedOrder->status = OrderStatus::from($toStatus);
            $lockedOrder->save();

            // 4. Log status history record
            OrderStatusHistory::create([
                'order_id'    => $lockedOrder->id,
                'from_status' => $currentStatus,
                'to_status'   => $toStatus,
                'actor_type'  => $actorType,
                'actor_id'    => $actorId,
                'note'        => $note,
                'meta'        => ! empty($meta) ? $meta : null,
                'created_at'  => now(),
            ]);

            // 5. Post-transition hooks
            $this->handlePostTransition($lockedOrder, $currentStatus, $toStatus, $actorType, $actorId, $meta);

            // 6. Email the buyer and seller about the steps they care about. Queued after commit, so a rollback
            //    sends nothing, and a mail failure never blocks the transition.
            app(MailNotifier::class)->orderStatusChanged($lockedOrder, $currentStatus, $toStatus);

            // 7. One in-app notification per change for each role involved (A23), written after commit.
            app(Notifier::class)->orderStatusChanged($lockedOrder, $currentStatus, $toStatus, $actorType, $note);

            return $lockedOrder->fresh(['items', 'statusHistories']);
        });
    }

    /**
     * A step on the order's timeline that is not a status change, such as a pickup rider being assigned or changed
     * (L4). The row keeps the current status on both sides and names the event in meta.event.
     *
     * @param  array<string, mixed>  $meta
     */
    public function recordEvent(Order $order, string $event, string $actorType, ?int $actorId, string $note, array $meta = []): void
    {
        $status = $order->status instanceof OrderStatus ? $order->status->value : (string) $order->status;
        OrderStatusHistory::create([
            'order_id' => $order->id, 'from_status' => $status, 'to_status' => $status, 'actor_type' => $actorType,
            'actor_id' => $actorId, 'note' => $note, 'meta' => ['event' => $event] + $meta, 'created_at' => now(),
        ]);
    }

    /**
     * Check if a transition is allowed for an actor.
     */
    public function canTransition(Order $order, OrderStatus|string $targetStatus, string $actorType): bool
    {
        $currentStatus = $order->status instanceof OrderStatus ? $order->status->value : (string) $order->status;
        $toStatus = $targetStatus instanceof OrderStatus ? $targetStatus->value : (string) $targetStatus;

        if (! isset(self::ALLOWED_TRANSITIONS[$currentStatus][$toStatus])) {
            return false;
        }

        return in_array($actorType, self::ALLOWED_TRANSITIONS[$currentStatus][$toStatus], true);
    }

    /**
     * Get list of allowed target statuses from the current status.
     *
     * @param Order $order
     * @param string|null $actorType Optional filter by actor type
     * @return array<string>
     */
    public function getAllowedTransitions(Order $order, ?string $actorType = null): array
    {
        $currentStatus = $order->status instanceof OrderStatus ? $order->status->value : (string) $order->status;
        $transitions = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];

        if ($actorType === null) {
            return array_keys($transitions);
        }

        $allowed = [];
        foreach ($transitions as $target => $actors) {
            if (in_array($actorType, $actors, true)) {
                $allowed[] = $target;
            }
        }

        return $allowed;
    }

    /**
     * Execute post-transition logic and domain events.
     */
    protected function handlePostTransition(
        Order $order,
        string $fromStatus,
        string $toStatus,
        string $actorType,
        ?int $actorId,
        array $meta
    ): void {
        // 1. Entering READY_FOR_PICKUP: create logistics parcel if it does not exist yet (idempotent)
        if ($toStatus === OrderStatus::READY_FOR_PICKUP->value) {
            $existingParcel = Parcel::where('order_id', $order->id)->first();
            if (! $existingParcel) {
                $seller = $order->seller ?? $order->items()->first()?->seller;
                $profile = $seller?->sellerProfile;

                if (! $profile) {
                    abort(422, 'Cannot mark order ready for pickup: seller profile not found.');
                }

                $pickupBarangay = trim((string) ($profile->address_barangay ?? ''));
                if ($pickupBarangay === '') {
                    abort(422, 'Cannot mark order ready for pickup: seller pickup address/barangay is required.');
                }

                $pickupBarangayCode = trim((string) ($profile->address_barangay_code ?? ''));
                if ($pickupBarangayCode === '') {
                    abort(422, 'Cannot mark order ready for pickup: Re-select your shop address so a barangay can be matched to a delivery area.');
                }

                $recipientName = trim((string) ($order->shipping_name ?? ''));
                $recipientPhone = trim((string) ($order->shipping_phone ?? ''));
                $recipientAddress = trim((string) ($order->shipping_address ?? ''));
                $destinationBarangay = trim((string) ($order->shipping_barangay ?? ''));

                if ($recipientName === '' || $recipientPhone === '' || $recipientAddress === '' || $destinationBarangay === '') {
                    abort(422, 'Cannot mark order ready for pickup: recipient details and destination barangay are required.');
                }

                $destinationBarangayCode = trim((string) ($order->shipping_barangay_code ?? ''));
                if ($destinationBarangayCode === '') {
                    abort(422, 'Cannot mark order ready for pickup: Delivery address is missing a barangay code. Customer must re-select their address.');
                }

                $pickupSnapshot = [
                    'shop_name'     => $profile->shop_name ?? ($seller->first_name . "'s Shop"),
                    'contact_phone' => $profile->shop_contact_number ?? $seller->phone ?? '',
                    'street'        => $profile->address_street ?? '',
                    'barangay'      => $pickupBarangay,
                    'city'          => $profile->address_city ?? '',
                    'province'      => $profile->address_province ?? '',
                    'barangay_code' => $pickupBarangayCode,
                    'city_code'     => $profile->address_city_code ?? '',
                    'province_code' => $profile->address_province_code ?? '',
                    'full_address'  => implode(', ', array_filter([
                        $profile->address_street,
                        $pickupBarangay,
                        $profile->address_city,
                        $profile->address_province,
                    ])),
                ];

                $recipientSnapshot = [
                    'name'          => $recipientName,
                    'phone'         => $recipientPhone,
                    'street'        => $recipientAddress,
                    'barangay'      => $destinationBarangay,
                    'city'          => $order->shipping_city ?? '',
                    'province'      => $order->shipping_province ?? '',
                    'barangay_code' => $destinationBarangayCode,
                    'city_code'     => $order->shipping_city_code ?? '',
                    'province_code' => $order->shipping_province_code ?? '',
                    'full_address'  => implode(', ', array_filter([
                        $recipientAddress,
                        $destinationBarangay,
                        $order->shipping_city,
                        $order->shipping_province,
                    ])),
                ];

                $codAmount = $order->payment_method === 'cod' ? (float) $order->total : null;
                $trackingNumber = $this->trackingNumberGenerator->generate();
                $companyId = \App\Models\LogisticsCompany::effectiveId($order->logistics_company_id);
                // The delivery zone the hub sorts the parcel into (L5), from the courier's zones.
                $zone = $companyId ? app(\App\Services\Commerce\ShippingCalculator::class)->zoneName($companyId, [
                    'city' => $order->shipping_city_code, 'province' => $order->shipping_province_code,
                ]) : null;

                $parcel = Parcel::create([
                    // The order's assigned courier: only that courier's riders are offered the pickup.
                    'logistics_company_id'      => \App\Models\LogisticsCompany::effectiveId($order->logistics_company_id),
                    'tracking_number'           => $trackingNumber,
                    'order_id'                  => $order->id,
                    'seller_id'                 => $seller->id,
                    'status'                    => Parcel::STATUS_READY_FOR_PICKUP,
                    'destination_barangay'      => $destinationBarangay,
                    'destination_barangay_code' => $destinationBarangayCode,
                    'pickup_barangay'           => $pickupBarangay,
                    'pickup_barangay_code'      => $pickupBarangayCode,
                    'pickup_address_snapshot'   => $pickupSnapshot,
                    'recipient_snapshot'        => $recipientSnapshot,
                    'cod_amount'                => $codAmount,
                    'weight_kg'                 => $order->total_weight_grams ? round($order->total_weight_grams / 1000, 3) : null,
                    'shipping_zone'             => $zone,
                    'ready_at'                  => now(),
                ]);

                // A14: offer the pickup to the nearest eligible rider straight away.
                app(\App\Services\Courier\Dispatcher::class)->offerNext($parcel);
            }
        }

        // 2. Sync parcel status if parcel exists and target status matches a parcel status
        if (in_array($toStatus, Parcel::STATUSES, true)) {
            Parcel::where('order_id', $order->id)->update([
                'status' => $toStatus,
            ]);
        }

        // 3. Escrow timing (Feature 2.8). Only WHEN funds become available changes here; amounts,
        //    commission and payout requests are untouched, and payout_status is never moved by a transition.
        //
        //    AT_SORTING_CENTER: the pickup rider's leg is done, so they earn their share of the delivery fee now (kept
        //    even if the delivery later fails). It adds a rider_earnings row only. Idempotent.
        if ($toStatus === OrderStatus::PICKED_UP->value || $toStatus === OrderStatus::AT_SORTING_CENTER->value) {
            // A3: the rider earns the fixed pickup pay when they pick the parcel up (the hub's receipt only catches
            // parcels picked up before this rule). Idempotent.
            app(RiderEarningsRecorder::class)->recordForReceivedOrder($order);
        }

        //    OUT_FOR_DELIVERY: a fresh 6-digit delivery code for the buyer to give the rider (A32). Each new attempt
        //    gets a new code; wrong entries and the lock start over.
        if ($toStatus === OrderStatus::OUT_FOR_DELIVERY->value) {
            $parcel = Parcel::where('order_id', $order->id)->first();
            $parcel?->forceFill([
                'delivery_otp' => (string) random_int(100000, 999999), 'delivery_otp_attempts' => 0, 'delivery_otp_locked_until' => null,
            ])->save();
        }

        //    DELIVERED: record the delivery time only. Funds stay in escrow (pending_release).
        if ($toStatus === OrderStatus::DELIVERED->value) {
            OrderItem::where('order_id', $order->id)->update(['delivered_at' => now()]);

            // Hub reports and the rider history read the parcel's delivery time, so stamp it for every actor (an
            // admin has no rider endpoint to do it). Only when empty: the rider endpoint's own value is never
            // overwritten, and a second pass through DELIVERED (a rejected dispute) keeps the original time.
            // No delivery log is written here: a log means a rider reported the outcome.
            Parcel::where('order_id', $order->id)->whereNull('delivered_at')->update(['delivered_at' => now()]);

            // Feature 2.9: the delivery rider and the hub earn their shares of the fee, recorded now (not at the buyer's
            // confirmation, and never clawed back by a later return). It adds a rider_earnings row and
            // touches no buyer, seller or platform money. Idempotent, whichever actor triggered DELIVERED.
            app(RiderEarningsRecorder::class)->recordForDeliveredOrder($order);
        }

        //    COMPLETED (by the buyer, the system's auto-complete, or an admin): earnings move from Pending to
        //    Available (A15). With no hold (the default) they are available at once; with a hold configured, each
        //    item gets a release date and payouts:release-due makes it available later. Items already available
        //    or disbursed are left exactly as they are.
        if ($toStatus === OrderStatus::COMPLETED->value) {
            $completedAt = now();
            $hold = $this->escrowHoldDays();

            Order::where('id', $order->id)->update(['completed_at' => $completedAt]);

            OrderItem::where('order_id', $order->id)
                ->where('payout_status', 'pending_release')
                ->update(['escrow_release_at' => $completedAt->copy()->addDays($hold)] + ($hold === 0 ? ['payout_status' => 'available'] : []));
        }
    }

    /**
     * Days a seller's earnings stay in escrow after the order is COMPLETED.
     */
    protected function escrowHoldDays(): int
    {
        return max(0, (int) config('payouts.escrow_hold_days', 0));
    }
}
