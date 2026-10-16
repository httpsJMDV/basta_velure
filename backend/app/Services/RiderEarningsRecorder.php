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
 * Shares the delivery fee of a delivered parcel: the rider who delivered it earns their percentage (85% by default)
 * and the logistics hub that handled it earns the rest. The split is of the delivery fee the buyer actually paid on
 * that order, copied onto the earnings rows at the moment of delivery, so a later change to the fee or the percentage
 * never rewrites history.
 *
 * It only ever adds earnings rows (one per parcel for the rider, one per parcel for the hub). It reads and changes no
 * buyer, seller or platform money.
 */
class RiderEarningsRecorder
{
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
     * Returns the rider's new row, or null when there is none to add (no rider, or already recorded). The hub's row is
     * added next to it when the parcel has a hub and none yet.
     */
    public function recordForParcel(Parcel $parcel, ?\DateTimeInterface $earnedAt = null): ?RiderEarning
    {
        $earnedAt ??= now();
        $feeCents = Money::toCents((string) ($parcel->order?->shipping_fee ?? 0));
        $shares = ShippingSplit::split($feeCents);

        $this->recordHub($parcel, $shares['hub'], $earnedAt);

        // A parcel with no assigned rider earns the rider nobody anything.
        if (! $parcel->assigned_rider_id) {
            return null;
        }

        // withTrashed: a soft-deleted row still counts as "already earned", and would collide with the unique index.
        if (RiderEarning::withTrashed()->where('parcel_id', $parcel->id)->exists()) {
            return null;
        }

        try {
            return RiderEarning::create([
                'rider_id'  => $parcel->assigned_rider_id,
                'parcel_id' => $parcel->id,
                'amount'    => Money::fromCents($shares['rider']),
                'earned_at' => $earnedAt,
                'notes'     => ShippingSplit::riderPercent() . '% of the delivery fee',
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
