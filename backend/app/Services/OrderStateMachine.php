<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderStateMachine
{
    /**
     * Complete transition map defining allowed target statuses and authorized actor roles.
     * Actors: 'seller', 'rider', 'hub', 'buyer', 'admin', 'system'
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
            OrderStatus::CANCELLED->value => ['buyer', 'seller', 'admin'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::PREPARING->value => [
            OrderStatus::READY_FOR_PICKUP->value => ['seller', 'admin'],
            OrderStatus::DISPUTED->value         => ['buyer', 'admin'],
        ],
        OrderStatus::READY_FOR_PICKUP->value => [
            OrderStatus::PICKED_UP->value => ['rider', 'admin'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::PICKED_UP->value => [
            OrderStatus::AT_SORTING_CENTER->value => ['hub', 'admin'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        OrderStatus::AT_SORTING_CENTER->value => [
            OrderStatus::SORTED->value   => ['hub', 'admin'],
            OrderStatus::DISPUTED->value => ['buyer', 'admin'],
        ],
        OrderStatus::SORTED->value => [
            OrderStatus::ASSIGNED_TO_RIDER->value => ['hub', 'admin'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        OrderStatus::ASSIGNED_TO_RIDER->value => [
            OrderStatus::OUT_FOR_DELIVERY->value => ['rider', 'admin'],
            OrderStatus::DISPUTED->value         => ['buyer', 'admin'],
        ],
        OrderStatus::OUT_FOR_DELIVERY->value => [
            OrderStatus::DELIVERED->value       => ['rider', 'admin'],
            OrderStatus::DELIVERY_FAILED->value => ['rider', 'admin'],
            OrderStatus::DISPUTED->value        => ['buyer', 'admin'],
        ],
        OrderStatus::DELIVERED->value => [
            OrderStatus::COMPLETED->value => ['buyer', 'admin', 'system'],
            OrderStatus::DISPUTED->value  => ['buyer', 'admin'],
        ],
        OrderStatus::DELIVERY_FAILED->value => [
            OrderStatus::ASSIGNED_TO_RIDER->value => ['hub', 'admin'],
            OrderStatus::RETURNED->value          => ['hub', 'admin'],
            OrderStatus::DISPUTED->value          => ['buyer', 'admin'],
        ],
        OrderStatus::DISPUTED->value => [
            OrderStatus::RETURNED->value  => ['seller', 'admin'],
            OrderStatus::DELIVERED->value => ['admin'],
            OrderStatus::COMPLETED->value => ['admin'],
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

            return $lockedOrder->fresh(['items', 'statusHistories']);
        });
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
        // Escrow trigger:
        // TODO(2.8): Feature 2.8 will move payout release trigger to COMPLETED once buyer receipt confirmation is introduced.
        // Currently, payout availability and delivered_at release immediately on DELIVERED as existing behavior.
        if ($toStatus === OrderStatus::DELIVERED->value) {
            OrderItem::where('order_id', $order->id)
                ->update([
                    'payout_status' => 'available',
                    'delivered_at'  => now(),
                ]);
        }
    }
}
