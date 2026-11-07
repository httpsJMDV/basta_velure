<?php

namespace App\Services\Courier;

use App\Models\AuditLog;
use App\Models\Dispute;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\User;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use App\Services\TrackingNumberGenerator;
use App\Support\PhMobile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Return pickups (reverse logistics). Once a return is approved and the shop wants the item back, a rider of the hub
 * that delivered the order collects it from the buyer (with a photo) and hands it to the shop, which confirms it
 * arrived. Three failed visits cancel the pickup. The refund was already settled when the return was approved, so
 * nothing here touches money; like a return-to-sender trip, a return pickup earns the rider nothing.
 */
class ReturnPickups
{
    public const MAX_ATTEMPTS = 3;

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly Notifier $notifier,
    ) {
    }

    /** Books the pickup for an approved return. Null when there is nothing to collect (the parcel never arrived). */
    public function book(Order $order, ?Dispute $dispute, string $actorType, ?int $actorId): ?ReturnPickup
    {
        if ($dispute?->reason === Dispute::REASON_NOT_RECEIVED || ReturnPickup::where('order_id', $order->id)->exists()) {
            return null;
        }
        /** @var Parcel|null $parcel */
        $parcel = $order->parcel()->first();
        $recipient = $parcel?->recipient_snapshot ?? [];
        $shop = $parcel?->pickup_address_snapshot ?? [];

        $pickup = ReturnPickup::create([
            'code'                 => $this->code(),
            'order_id'             => $order->id,
            'dispute_id'           => $dispute?->id,
            'parcel_id'            => $parcel?->id,
            'logistics_company_id' => LogisticsCompany::effectiveId($parcel?->logistics_company_id ?? $order->logistics_company_id),
            'sorting_center_id'    => $parcel?->sorting_center_id,
            'status'               => ReturnPickup::STATUS_REQUESTED,
            'buyer_snapshot'       => [
                'name'         => $recipient['name'] ?? $order->shipping_name,
                'phone'        => $recipient['phone'] ?? $order->shipping_phone,
                'full_address' => $recipient['full_address'] ?? implode(', ', array_filter([$order->shipping_address, $order->shipping_barangay, $order->shipping_city, $order->shipping_province])),
                'barangay'     => $recipient['barangay'] ?? $order->shipping_barangay,
                'city'         => $recipient['city'] ?? $order->shipping_city,
            ],
            'shop_snapshot'        => [
                'shop_name'    => $shop['shop_name'] ?? null,
                'phone'        => $shop['phone'] ?? null,
                'full_address' => $shop['full_address'] ?? null,
                'barangay'     => $shop['barangay'] ?? null,
                'city'         => $shop['city'] ?? null,
            ],
            'buyer_barangay_code'  => $recipient['barangay_code'] ?? $order->shipping_barangay_code,
        ]);

        $this->machine->recordEvent($order, 'return_pickup_requested', $actorType, $actorId,
            'Return pickup booked: a rider will collect the item from the buyer and bring it back to the shop.',
            ['return_pickup' => $pickup->code]);
        $this->notifier->toUserId($order->buyer_id, 'return.pickup_booked', 'A rider will collect your return',
            "Order {$order->order_number}: keep the item packed. A rider will come to collect it; we will tell you who.",
            "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
        if ($pickup->sorting_center_id) {
            $this->notifier->send($pickup->hub?->loadMissing('user')->user, 'hub.return_pickup', 'Return pickup to assign',
                "Collect the returned item of order {$order->order_number} in {$pickup->buyer_snapshot['barangay']}. Give it to one of your riders.",
                '/hub/deliveries', ['return_pickup_id' => $pickup->id]);
        }

        return $pickup;
    }

    /** The hub or the courier gives the pickup to a rider (again, to change the rider before it is collected). */
    public function assign(ReturnPickup $pickup, Rider $rider, User $by, string $actorRole): ReturnPickup
    {
        if (! in_array($pickup->status, [ReturnPickup::STATUS_REQUESTED, ReturnPickup::STATUS_ASSIGNED], true)) {
            throw ValidationException::withMessages(['rider_id' => 'This return was already collected or closed.']);
        }
        if ($rider->status !== Rider::STATUS_ACTIVE || $rider->isTruckDriver()) {
            throw ValidationException::withMessages(['rider_id' => 'Choose an active delivery rider.']);
        }
        $previous = $pickup->rider_id;
        $pickup->forceFill(['rider_id' => $rider->id, 'status' => ReturnPickup::STATUS_ASSIGNED, 'assigned_at' => now()])->save();
        $rider->loadMissing('user');
        $order = $pickup->order;

        AuditLog::record($by, 'return_pickup.assigned', $pickup, $previous ? ['rider_id' => $previous] : null, [
            'code' => $pickup->code, 'rider' => trim($rider->user?->first_name . ' ' . $rider->user?->last_name), 'order_number' => $order?->order_number,
        ], companyId: $pickup->logistics_company_id, actorRole: $actorRole);
        if ($order) {
            $this->machine->recordEvent($order, 'return_pickup_assigned', $actorRole, $by->id,
                ($rider->user?->first_name ?? 'A rider') . ' will collect the returned item.', ['return_pickup' => $pickup->code]);
            $this->notifier->toUserId($order->buyer_id, 'return.pickup_assigned', 'Your return pickup rider',
                ($rider->user?->first_name ?? 'A rider') . " will collect the item of order {$order->order_number}. Keep your phone on.",
                "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
        }
        $this->notifier->send($rider->user, 'rider.return_pickup', 'Return pickup assigned',
            "Collect the returned item of order {$order?->order_number} in {$pickup->buyer_snapshot['barangay']} and bring it to {$pickup->shop_snapshot['shop_name']}.",
            '/rider/deliveries', ['return_pickup_id' => $pickup->id]);

        return $pickup;
    }

    /** The rider has the item, with a photo of it. */
    public function collected(ReturnPickup $pickup, Rider $rider, UploadedFile $photo): ReturnPickup
    {
        $this->assertRider($pickup, $rider, [ReturnPickup::STATUS_ASSIGNED]);
        $path = $photo->store('return_pickups', 'ids');
        $pickup->forceFill(['status' => ReturnPickup::STATUS_COLLECTED, 'collected_at' => now(), 'collect_photo_path' => $path])->save();

        $order = $pickup->order;
        if ($order) {
            $this->machine->recordEvent($order, 'return_pickup_collected', 'rider', $rider->user_id,
                'Returned item collected from the buyer.', ['return_pickup' => $pickup->code]);
            $this->notifier->toUserId($order->buyer_id, 'return.pickup_collected', 'Return collected',
                "The rider collected the item of order {$order->order_number}. It is on its way back to the shop.",
                "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
            $this->notifier->toSeller($order->items()->value('seller_id'), 'returns', 'return.pickup_collected', 'Returned item on its way',
                "A rider collected the returned item of order {$order->order_number} and is bringing it to you.",
                "/seller/orders?order={$order->id}", ['order_id' => $order->id]);
        }

        return $pickup;
    }

    /** The rider could not collect it this time. The third failed visit cancels the pickup. */
    public function failed(ReturnPickup $pickup, Rider $rider, string $reason): ReturnPickup
    {
        $this->assertRider($pickup, $rider, [ReturnPickup::STATUS_ASSIGNED]);
        $attempts = $pickup->attempts + 1;
        $cancel = $attempts >= self::MAX_ATTEMPTS;
        $pickup->forceFill([
            'attempts' => $attempts, 'last_failure' => $reason,
            'status' => $cancel ? ReturnPickup::STATUS_CANCELLED : ReturnPickup::STATUS_ASSIGNED,
            'cancelled_at' => $cancel ? now() : null, 'cancel_reason' => $cancel ? "No pickup after {$attempts} visits: {$reason}" : null,
        ])->save();

        $order = $pickup->order;
        if ($order) {
            $this->machine->recordEvent($order, 'return_pickup_failed', 'rider', $rider->user_id,
                "Return pickup failed ({$attempts} of " . self::MAX_ATTEMPTS . "): {$reason}" . ($cancel ? ' The pickup is cancelled.' : ''),
                ['return_pickup' => $pickup->code]);
            $this->notifier->toUserId($order->buyer_id, 'return.pickup_failed', $cancel ? 'Return pickup cancelled' : 'We missed you',
                $cancel
                    ? "Order {$order->order_number}: after " . self::MAX_ATTEMPTS . ' visits the rider could not collect the item, so the pickup is cancelled. Message the shop to arrange it.'
                    : "Order {$order->order_number}: the rider could not collect the item ({$reason}). They will try again.",
                "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
            if ($cancel) {
                $this->notifier->toSeller($order->items()->value('seller_id'), 'returns', 'return.pickup_cancelled', 'Return pickup cancelled',
                    "Order {$order->order_number}: the rider could not collect the item after " . self::MAX_ATTEMPTS . ' visits. Message the buyer to arrange it.',
                    "/seller/orders?order={$order->id}", ['order_id' => $order->id]);
            }
        }

        return $pickup;
    }

    /** The rider handed the item to the shop. */
    public function delivered(ReturnPickup $pickup, Rider $rider): ReturnPickup
    {
        $this->assertRider($pickup, $rider, [ReturnPickup::STATUS_COLLECTED]);
        $pickup->forceFill(['status' => ReturnPickup::STATUS_DELIVERED, 'delivered_at' => now()])->save();

        $order = $pickup->order;
        if ($order) {
            $this->machine->recordEvent($order, 'return_pickup_delivered', 'rider', $rider->user_id,
                'Returned item handed back to the shop.', ['return_pickup' => $pickup->code]);
            $this->notifier->toSeller($order->items()->value('seller_id'), 'returns', 'return.pickup_delivered', 'Returned item delivered',
                "The rider handed you the returned item of order {$order->order_number}. Confirm you received it.",
                "/seller/orders?order={$order->id}", ['order_id' => $order->id]);
        }

        return $pickup;
    }

    /** The shop confirms it has the item back. */
    public function received(ReturnPickup $pickup, User $seller): ReturnPickup
    {
        if (! in_array($pickup->status, [ReturnPickup::STATUS_COLLECTED, ReturnPickup::STATUS_DELIVERED], true)) {
            throw ValidationException::withMessages(['return_pickup' => 'The item has not been collected from the buyer yet.']);
        }
        $pickup->forceFill(['status' => ReturnPickup::STATUS_RECEIVED, 'received_at' => now(), 'received_by' => $seller->id, 'delivered_at' => $pickup->delivered_at ?? now()])->save();

        $order = $pickup->order;
        if ($order) {
            $this->machine->recordEvent($order, 'return_pickup_delivered', 'seller', $seller->id,
                'The shop confirmed it received the returned item.', ['return_pickup' => $pickup->code, 'confirmed' => true]);
            $this->notifier->toUserId($order->buyer_id, 'return.pickup_received', 'The shop has your return',
                "The shop confirmed it received the item of order {$order->order_number}. This return is complete.",
                "/settings/orders?order={$order->id}", ['order_id' => $order->id]);
        }

        return $pickup;
    }

    /**
     * What each side sees. The rider and the hub get the addresses and phones they need; the buyer and the shop get
     * the progress and the rider's first name.
     *
     * @return array<string, mixed>|null
     */
    public static function present(?ReturnPickup $pickup, string $view = 'buyer'): ?array
    {
        if (! $pickup) {
            return null;
        }
        $pickup->loadMissing(['rider.user', 'order:id,order_number']);
        $rider = $pickup->rider;
        $row = [
            'id'           => $pickup->id,
            'code'         => $pickup->code,
            'status'       => $pickup->status,
            'status_label' => self::label($pickup->status),
            'attempts'     => $pickup->attempts,
            'max_attempts' => self::MAX_ATTEMPTS,
            'last_failure' => $pickup->last_failure,
            'rider_name'   => $rider?->user?->first_name,
            'assigned_at'  => $pickup->assigned_at?->toIso8601String(),
            'collected_at' => $pickup->collected_at?->toIso8601String(),
            'delivered_at' => $pickup->delivered_at?->toIso8601String(),
            'received_at'  => $pickup->received_at?->toIso8601String(),
            'cancelled_at' => $pickup->cancelled_at?->toIso8601String(),
            'cancel_reason' => $pickup->cancel_reason,
            'has_photo'    => $pickup->collect_photo_path !== null,
            'photo_url'    => $pickup->collect_photo_path ? url("/api/v1/return-pickups/{$pickup->id}/photo") : null,
            'created_at'   => $pickup->created_at?->toIso8601String(),
        ];
        if (in_array($view, ['rider', 'hub', 'logistics'], true)) {
            $row += [
                'order_number' => $pickup->order?->order_number,
                'buyer'        => $pickup->buyer_snapshot,
                'shop'         => $pickup->shop_snapshot,
                'rider'        => $rider ? [
                    'id'    => $rider->id,
                    'name'  => trim($rider->user?->first_name . ' ' . $rider->user?->last_name),
                    'phone' => PhMobile::local($rider->user?->phone),
                ] : null,
            ];
        }

        return $row;
    }

    public static function label(string $status): string
    {
        return match ($status) {
            ReturnPickup::STATUS_REQUESTED => 'Waiting for a rider',
            ReturnPickup::STATUS_ASSIGNED  => 'Rider on the way to collect',
            ReturnPickup::STATUS_COLLECTED => 'Collected, on its way to the shop',
            ReturnPickup::STATUS_DELIVERED => 'Handed to the shop',
            ReturnPickup::STATUS_RECEIVED  => 'Shop has it back',
            ReturnPickup::STATUS_CANCELLED => 'Pickup cancelled',
            default => ucfirst($status),
        };
    }

    /** @param list<string> $statuses */
    private function assertRider(ReturnPickup $pickup, Rider $rider, array $statuses): void
    {
        if ($pickup->rider_id !== $rider->id) {
            abort(404, 'Return pickup not found.');
        }
        if (! in_array($pickup->status, $statuses, true)) {
            throw ValidationException::withMessages(['return_pickup' => 'This return pickup is ' . strtolower(self::label($pickup->status)) . '.']);
        }
    }

    private function code(): string
    {
        $generator = app(TrackingNumberGenerator::class);
        do {
            $code = 'RTN-' . now('Asia/Manila')->format('ymd') . '-' . $generator->randomString(5);
        } while (ReturnPickup::where('code', $code)->exists());

        return $code;
    }

    /** Removes the photo when an order is deleted in tests and local resets. */
    public static function deletePhoto(ReturnPickup $pickup): void
    {
        if ($pickup->collect_photo_path) {
            Storage::disk('ids')->delete($pickup->collect_photo_path);
        }
    }
}
