<?php

namespace App\Services;

use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;

/**
 * Builds the "Track package" payload for one parcel: a timeline written from the order's status history, the
 * places on the route, and the courier's live position while a courier is carrying the parcel.
 *
 * The courier position is only ever the rider's latest point, and only for the legs where the rider has the
 * parcel: on the way to the seller and back to the hub, and out for delivery. Everywhere else it is null.
 */
class ParcelTrackingService
{
    /** A ping this recent counts as live. */
    public const LIVE_SECONDS = 120;

    /** An older ping is still shown, flagged stale, for this long; after that the courier is "not sharing". */
    public const STALE_SECONDS = 1800;

    /**
     * @return array<string, mixed>
     */
    public function build(Parcel $parcel, string $viewerRole): array
    {
        $parcel->loadMissing(['order.statusHistories', 'sortingCenter', 'pickupRider.user', 'assignedRider.user']);

        $order = $parcel->order;
        $pickup = $parcel->pickup_address_snapshot ?? [];
        $recipient = $parcel->recipient_snapshot ?? [];

        return [
            'tracking_number' => $parcel->tracking_number,
            'order_number'    => $order?->order_number,
            'status'          => $order?->status instanceof \BackedEnum ? $order->status->value : (string) ($order?->status ?? $parcel->status),
            'viewer_role'     => $viewerRole,
            'origin'          => [
                'name'         => (string) ($pickup['shop_name'] ?? 'Seller'),
                'full_address' => $this->fullAddress($pickup, $parcel->pickup_barangay),
                'barangay'     => (string) ($pickup['barangay'] ?? ($parcel->pickup_barangay ?? '')),
                'city'         => (string) ($pickup['city'] ?? ''),
                'province'     => (string) ($pickup['province'] ?? ''),
            ],
            'hub'             => $this->hub($parcel->sortingCenter),
            'destination'     => [
                'name'         => (string) ($recipient['name'] ?? ''),
                'full_address' => $this->fullAddress($recipient, $parcel->destination_barangay),
                'barangay'     => (string) ($recipient['barangay'] ?? ($parcel->destination_barangay ?? '')),
                'city'         => (string) ($recipient['city'] ?? ''),
                'province'     => (string) ($recipient['province'] ?? ''),
            ],
            'courier'         => $this->courier($parcel),
            'events'          => $this->events($parcel),
            'proof'           => [
                'count'        => (int) (bool) $parcel->delivery_proof_path + (int) (bool) $parcel->delivery_proof_path_2,
                'delivered_at' => $parcel->delivered_at?->toIso8601String(),
                'received_by'  => $parcel->received_by,
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function hub(?SortingCenter $hub): ?array
    {
        if (! $hub) {
            return null;
        }

        $parts = [$hub->address_street, $hub->address_barangay, $hub->address_city, $hub->address_province];

        return [
            'name'         => (string) $hub->hub_name,
            'full_address' => implode(', ', array_filter(array_map('trim', array_map('strval', $parts)))),
            'barangay'     => (string) $hub->address_barangay,
            'city'         => (string) $hub->address_city,
            'province'     => (string) $hub->address_province,
        ];
    }

    /**
     * @param array<string, mixed> $snapshot
     */
    private function fullAddress(array $snapshot, ?string $fallbackBarangay): string
    {
        if (! empty($snapshot['full_address'])) {
            return (string) $snapshot['full_address'];
        }

        return implode(', ', array_filter([
            $snapshot['street'] ?? '',
            $snapshot['barangay'] ?? ($fallbackBarangay ?? ''),
            $snapshot['city'] ?? '',
            $snapshot['province'] ?? '',
        ]));
    }

    /**
     * Who is carrying the parcel right now and where they are. `state` is one of:
     * `live` (a ping in the last two minutes), `stale` (an older ping), `not_sharing` (the rider has the parcel
     * but nothing recent), or `not_with_courier` (the parcel is at the seller, the hub or the buyer).
     *
     * @return array<string, mixed>
     */
    private function courier(Parcel $parcel): array
    {
        [$rider, $leg] = match (true) {
            in_array($parcel->status, [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP], true) && $parcel->pickup_rider_id !== null
                => [$parcel->pickupRider, 'pickup'],
            $parcel->status === Parcel::STATUS_OUT_FOR_DELIVERY && $parcel->assigned_rider_id !== null
                => [$parcel->assignedRider, 'delivery'],
            default => [null, null],
        };

        if (! $rider instanceof Rider) {
            return ['state' => 'not_with_courier', 'leg' => null, 'name' => null, 'vehicle_type' => null, 'location' => null];
        }

        $base = [
            'leg'          => $leg,
            'name'         => $this->shortName($rider->user),
            'vehicle_type' => $rider->vehicle_type,
        ];

        $seen = $rider->last_located_at;
        $age = $seen ? $seen->diffInSeconds(now(), true) : null;

        if ($rider->last_latitude === null || $rider->last_longitude === null || $age === null || $age > self::STALE_SECONDS) {
            return $base + ['state' => 'not_sharing', 'location' => null];
        }

        return $base + [
            'state'    => $age <= self::LIVE_SECONDS ? 'live' : 'stale',
            'location' => [
                'latitude'   => (float) $rider->last_latitude,
                'longitude'  => (float) $rider->last_longitude,
                'heading'    => $rider->last_heading,
                'accuracy_m' => $rider->last_accuracy_m,
                'updated_at' => $seen->toIso8601String(),
            ],
        ];
    }

    private function shortName(?User $user): string
    {
        $first = trim((string) $user?->first_name);
        $last = trim((string) $user?->last_name);

        return trim($first . ($last !== '' ? ' ' . mb_substr($last, 0, 1) . '.' : '')) ?: 'Courier';
    }

    /**
     * The timeline, newest first, as the order's status history wrote it.
     *
     * @return list<array<string, mixed>>
     */
    private function events(Parcel $parcel): array
    {
        $order = $parcel->order;
        if (! $order) {
            return [];
        }

        $pickup = $parcel->pickup_address_snapshot ?? [];
        $recipient = $parcel->recipient_snapshot ?? [];
        $hubName = $parcel->sortingCenter?->hub_name ?? 'the logistics hub';
        $hubCity = $parcel->sortingCenter?->address_city;
        $pickupWhere = $pickup['barangay'] ?? ($parcel->pickup_barangay ?? 'the seller');
        $toWhere = $recipient['barangay'] ?? ($parcel->destination_barangay ?? 'the delivery area');

        $events = [];
        foreach ($order->statusHistories as $h) {
            $to = $h->to_status instanceof \BackedEnum ? $h->to_status->value : (string) $h->to_status;
            [$title, $detail] = match ($to) {
                'PLACED'            => ['Order placed', 'The order was placed and is waiting for the seller.'],
                'CONFIRMED'         => ['Order confirmed', 'The seller confirmed the order.'],
                'PREPARING'         => ['Preparing to ship', 'The seller is preparing the package and will hand it to our courier.'],
                'READY_FOR_PICKUP'  => ['Ready for pickup', 'The package is packed and waiting for a courier.'],
                'PICKED_UP'         => ['Package picked up', "Package collected by our courier in {$pickupWhere}."],
                'AT_SORTING_CENTER' => ['Arrived at the hub', "Package arrived at {$hubName}" . ($hubCity ? " in {$hubCity}." : '.')],
                'SORTED'            => ['Sorted', "Package sorted for {$toWhere}."],
                'ASSIGNED_TO_RIDER' => ['Assigned to a courier', "A courier was assigned to deliver to {$toWhere}."],
                'OUT_FOR_DELIVERY'  => ['Out for delivery', 'Your package is out for delivery.'],
                'DELIVERED'         => ['Delivered', 'The package has been delivered.' . (! empty($parcel->received_by) ? " Recipient: {$parcel->received_by}" : '')],
                'COMPLETED'         => ['Completed', 'The buyer confirmed the order was received.'],
                'DELIVERY_FAILED'   => ['Delivery attempt failed', $h->note ?: 'The courier could not deliver the package.'],
                'RETURNED'          => ['Returned to seller', $h->note ?: 'The package is on its way back to the seller.'],
                'CANCELLED'         => ['Order cancelled', $h->note ?: 'The order was cancelled.'],
                'DISPUTED'          => ['Return requested', 'The buyer asked for a return or refund.'],
                default             => [str_replace('_', ' ', ucfirst(strtolower($to))), ''],
            };

            $events[] = [
                'status' => $to,
                'title'  => $title,
                'detail' => $detail,
                'at'     => $h->created_at?->toIso8601String(),
                // The delivered step carries the proof photos.
                'proof'  => $to === 'DELIVERED' && ($parcel->delivery_proof_path || $parcel->delivery_proof_path_2),
            ];
        }

        return array_reverse($events);
    }
}
