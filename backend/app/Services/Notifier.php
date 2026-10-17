<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\User;
use App\Notifications\AppNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The in-app notification inbox (A23). Every order or shipment status change notifies each role involved (buyer,
 * seller, the courier company for shipment steps), except the role that made the change; riders hear about jobs
 * offered or assigned to them. Notifications are written after the surrounding transaction commits, so a change that
 * rolls back notifies no one.
 */
class Notifier
{
    private static bool $muted = false;

    /**
     * @template T
     * @param  callable(): T  $work
     * @return T
     */
    public static function muted(callable $work): mixed
    {
        $previous = self::$muted;
        self::$muted = true;
        try {
            return $work();
        } finally {
            self::$muted = $previous;
        }
    }

    /**
     * @param  User|iterable<User>|null  $to
     * @param  array<string, mixed>  $meta
     */
    public function send(User|iterable|null $to, string $kind, string $title, string $body, ?string $link = null, array $meta = []): void
    {
        if (self::$muted || $to === null) {
            return;
        }

        $users = $to instanceof User ? [$to] : collect($to)->filter()->unique('id')->values()->all();
        if ($users === []) {
            return;
        }

        DB::afterCommit(function () use ($users, $kind, $title, $body, $link, $meta) {
            foreach ($users as $user) {
                try {
                    $user->notify(new AppNotification($kind, $title, $body, $link, $meta));
                } catch (\Throwable $e) {
                    Log::warning('Could not write an in-app notification.', ['user_id' => $user->id, 'kind' => $kind, 'error' => $e->getMessage()]);
                }
            }
        });
    }

    // ── Orders and shipments ─────────────────────────────────────────────────

    /** Buyer-facing names of each status (A10). */
    public const BUYER_LABELS = [
        'PLACED'            => 'Order placed',
        'CONFIRMED'         => 'Order accepted by the seller',
        'PREPARING'         => 'Order packed',
        'READY_FOR_PICKUP'  => 'Ready for pickup',
        'PICKED_UP'         => 'Picked up by the courier',
        'AT_SORTING_CENTER' => 'Arrived at the courier hub',
        'SORTED'            => 'Sorted for delivery',
        'ASSIGNED_TO_RIDER' => 'Assigned to a delivery rider',
        'OUT_FOR_DELIVERY'  => 'Out for delivery',
        'DELIVERED'         => 'Delivered',
        'COMPLETED'         => 'Order completed',
        'DELIVERY_FAILED'   => 'Delivery attempt failed',
        'RETURN_TO_SENDER'  => 'Delivery failed: returning to the seller',
        'RETURNED'          => 'Returned to the seller',
        'CANCELLED'         => 'Order cancelled',
        'DISPUTED'          => 'Return / refund requested',
        'LOST'              => 'Parcel marked lost',
        'DAMAGED'           => 'Parcel marked damaged',
    ];

    /** Shipment steps the courier company follows. */
    private const SHIPMENT_STATUSES = [
        'READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY',
        'DELIVERED', 'DELIVERY_FAILED', 'RETURN_TO_SENDER', 'RETURNED', 'LOST', 'DAMAGED',
    ];

    public function orderStatusChanged(Order $order, string $from, string $to, string $actorType, ?string $note = null): void
    {
        $label = self::BUYER_LABELS[$to] ?? ucwords(strtolower(str_replace('_', ' ', $to)));
        $meta = ['order_id' => $order->id, 'order_number' => $order->order_number, 'from' => $from, 'to' => $to];
        $reason = $note && in_array($to, ['CANCELLED', 'DELIVERY_FAILED', 'RETURN_TO_SENDER', 'LOST', 'DAMAGED'], true) ? " Reason: {$note}" : '';

        if ($actorType !== 'buyer') {
            $this->send(User::find($order->buyer_id), 'order.status', $label, "Order {$order->order_number}: {$label}.{$reason}",
                "/settings/orders?order={$order->id}", $meta);
        }

        $sellerId = $order->seller_id ?? $order->items()->value('seller_id');
        if ($actorType !== 'seller' && $sellerId) {
            $this->send(User::find($sellerId), 'order.status', $label, "Order {$order->order_number}: {$label}.{$reason}",
                "/seller/orders?order={$order->id}", $meta);
        }

        if (in_array($to, self::SHIPMENT_STATUSES, true) && ! in_array($actorType, ['logistics'], true)) {
            $tracking = Parcel::where('order_id', $order->id)->value('tracking_number');
            $this->send($this->companyMembers($order->logistics_company_id), 'shipment.status', $label,
                ($tracking ? "Parcel {$tracking}" : "Order {$order->order_number}") . ": {$label}.{$reason}",
                '/logistics/parcels' . ($tracking ? '?search=' . urlencode($tracking) : ''), $meta + ['tracking_number' => $tracking]);
        }
    }

    /** @return iterable<User> */
    public function companyMembers(?int $companyId): iterable
    {
        $id = LogisticsCompany::effectiveId($companyId);
        if (! $id) {
            return [];
        }

        return User::whereIn('id', LogisticsCompanyMember::where('logistics_company_id', $id)->pluck('user_id'))->get();
    }

    // ── Riders ───────────────────────────────────────────────────────────────

    public function jobOffered(Rider $rider, Parcel $parcel, int $seconds): void
    {
        $this->send($rider->user, 'rider.job_offer', 'New pickup job offer',
            "Pickup {$parcel->tracking_number} at {$this->pickupPlace($parcel)}. Accept within {$seconds} seconds.",
            '/rider/pickups', ['parcel_id' => $parcel->id, 'tracking_number' => $parcel->tracking_number]);
    }

    public function jobAssigned(Rider $rider, Parcel $parcel, string $leg): void
    {
        $title = match ($leg) {
            'delivery' => 'Delivery job assigned',
            'return'   => 'Return to sender job assigned',
            default    => 'Pickup job assigned',
        };
        $this->send($rider->user, 'rider.job_assigned', $title, "Parcel {$parcel->tracking_number} is now on your list.",
            $leg === 'pickup' ? '/rider/pickups' : '/rider/deliveries', ['parcel_id' => $parcel->id, 'tracking_number' => $parcel->tracking_number, 'leg' => $leg]);
    }

    public function jobRemoved(Rider $rider, Parcel $parcel, string $why): void
    {
        $this->send($rider->user, 'rider.job_removed', 'Job removed from your list', "Parcel {$parcel->tracking_number}: {$why}",
            '/rider/pickups', ['parcel_id' => $parcel->id, 'tracking_number' => $parcel->tracking_number]);
    }

    public function riderDecision(Rider $rider, bool $approved, ?string $reason = null): void
    {
        $rider->loadMissing('user');
        $this->send($rider->user, $approved ? 'rider.approved' : 'rider.rejected',
            $approved ? 'You are verified' : 'Verification not approved',
            $approved ? 'Your courier company verified your rider account. You can go Online and receive jobs.'
                : "Your courier company did not approve your rider account. Reason: {$reason}",
            '/rider/account');
        if (! $approved) {
            app(MailNotifier::class)->riderNotApproved($rider, (string) $reason);
        }
    }

    public function riderSuspended(Rider $rider, string $reason): void
    {
        $rider->loadMissing('user');
        $this->send($rider->user, 'rider.suspended', 'Your rider account is suspended',
            "Your courier company suspended your rider account, so you cannot go Online. Reason: {$reason}", '/rider/dashboard');
    }

    private function pickupPlace(Parcel $parcel): string
    {
        $snap = $parcel->pickup_address_snapshot ?? [];

        return trim(($snap['shop_name'] ?? 'the seller') . ', ' . ($snap['barangay'] ?? '') . ', ' . ($snap['city'] ?? ''), ', ');
    }

    // ── Generic helpers used across modules ──────────────────────────────────

    public function toUserId(?int $userId, string $kind, string $title, string $body, ?string $link = null, array $meta = []): void
    {
        if ($userId) {
            $this->send(User::find($userId), $kind, $title, $body, $link, $meta);
        }
    }

    public static function statusLabel(OrderStatus|string $status): string
    {
        $value = $status instanceof OrderStatus ? $status->value : $status;

        return self::BUYER_LABELS[$value] ?? ucwords(strtolower(str_replace('_', ' ', $value)));
    }
}
