<?php

namespace App\Services;

use App\Models\HubEarning;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\RiderEarning;
use App\Support\Money;
use App\Support\ShippingSplit;
use Illuminate\Database\QueryException;

/**
 * What riders and hubs earn on a parcel (A3):
 *
 *  - the pickup rider (seller to hub) earns the fixed pickup pay (30.00) when they pick the parcel up;
 *  - the delivery rider (hub to buyer) earns the fixed delivery pay (50.00) when it is delivered; a failed attempt
 *    pays nothing;
 *  - the logistics hub that handled it earns its percentage of the delivery fee (15%) when it is delivered.
 *
 * One rider doing both legs earns both. The amounts are copied onto the earnings rows when they are written, so a
 * later change to the pay or the percentages never rewrites history.
 *
 * It only ever adds earnings rows (per parcel: one pickup and one delivery row for riders, one for the hub). It reads
 * and changes no buyer, seller or platform money.
 */
class RiderEarningsRecorder
{
    /** Pays the pickup rider of the order's parcel, just received at the hub. Idempotent. */
    public function recordForReceivedOrder(Order $order): ?RiderEarning
    {
        $parcel = Parcel::where('order_id', $order->id)->first();

        return $parcel ? $this->recordPickup($parcel) : null;
    }

    /**
     * Create the earnings rows for the parcel of a just-delivered order. Idempotent: a parcel earns once, however many
     * times it enters DELIVERED (for example an admin restoring a disputed order) and whichever actor triggered the
     * transition.
     */
    public function recordForDeliveredOrder(Order $order): ?RiderEarning
    {
        $parcel = Parcel::where('order_id', $order->id)->first();

        return $parcel ? $this->recordForParcel($parcel) : null;
    }

    /**
     * The pickup rider's row: their share of the fee, once per parcel. Null when the parcel has no pickup rider or the
     * row already exists.
     */
    public function recordPickup(Parcel $parcel, ?\DateTimeInterface $earnedAt = null): ?RiderEarning
    {
        if (! $parcel->pickup_rider_id) {
            return null;
        }

        $cents = ShippingSplit::pickupPayCents();

        return $this->recordRider($parcel, $parcel->pickup_rider_id, RiderEarning::KIND_PICKUP, $cents, $earnedAt ?? now(),
            'Pickup pay (₱' . Money::fromCents($cents) . ')');
    }

    /**
     * The delivery rider's new row, or null when there is none to add (no rider, or already recorded). The hub's row
     * is added next to it when the parcel has a hub and none yet, and so is the pickup rider's when the hub's intake
     * did not write it (a parcel received before pickups earned).
     */
    public function recordForParcel(Parcel $parcel, ?\DateTimeInterface $earnedAt = null): ?RiderEarning
    {
        $earnedAt ??= now();
        $shares = ShippingSplit::split(Money::toCents($parcel->order?->courierFeeAmount() ?? '0'));

        $this->recordHub($parcel, $shares['hub'], $earnedAt);

        // A parcel with no assigned rider earns the rider nobody anything.
        if (! $parcel->assigned_rider_id) {
            return null;
        }

        // withTrashed: a soft-deleted row still counts as "already earned", and would collide with the unique index.
        if (RiderEarning::withTrashed()->where('parcel_id', $parcel->id)->where('kind', RiderEarning::KIND_DELIVERY)->exists()) {
            return null;
        }

        // The pickup rider is paid at pickup; this catches a parcel picked up before that rule. Idempotent.
        $this->recordPickup($parcel, $earnedAt);
        $cents = ShippingSplit::deliveryPayCents();

        return $this->recordRider($parcel, $parcel->assigned_rider_id, RiderEarning::KIND_DELIVERY, $cents, $earnedAt,
            'Delivery pay (₱' . Money::fromCents($cents) . ')');
    }

    private function recordRider(Parcel $parcel, int $riderId, string $kind, int $cents, \DateTimeInterface $earnedAt, string $notes): ?RiderEarning
    {
        if (RiderEarning::withTrashed()->where('parcel_id', $parcel->id)->where('kind', $kind)->exists()) {
            return null;
        }

        try {
            return RiderEarning::create([
                'rider_id'  => $riderId,
                'parcel_id' => $parcel->id,
                'kind'      => $kind,
                'amount'    => Money::fromCents($cents),
                'earned_at' => $earnedAt,
                'notes'     => $notes,
            ]);
        } catch (QueryException $e) {
            // Two requests recorded the same parcel at once; the unique index kept it to one row.
            if (($e->errorInfo[0] ?? null) === '23000') {
                return null;
            }

            throw $e;
        }
    }

    private function recordHub(Parcel $parcel, int $hubCents, \DateTimeInterface $earnedAt): void
    {
        if (! $parcel->sorting_center_id) {
            return;
        }

        if (HubEarning::withTrashed()->where('parcel_id', $parcel->id)->exists()) {
            return;
        }

        try {
            HubEarning::create([
                'sorting_center_id' => $parcel->sorting_center_id,
                'parcel_id'         => $parcel->id,
                'amount'            => Money::fromCents($hubCents),
                'earned_at'         => $earnedAt,
                'notes'             => (100 - ShippingSplit::riderPercent()) . '% of the delivery fee',
            ]);
        } catch (QueryException $e) {
            if (($e->errorInfo[0] ?? null) !== '23000') {
                throw $e;
            }
        }
    }
}
