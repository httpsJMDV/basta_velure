<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Parcel;
use App\Models\RiderEarning;
use App\Support\Money;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Records what a rider earns for a delivered parcel: one flat fee, copied onto the row at the moment of
 * delivery so a later change to the configured fee never rewrites history.
 *
 * It only ever adds a rider_earnings row. It reads and changes no buyer, seller or platform money.
 */
class RiderEarningsRecorder
{
    public const DEFAULT_FEE = '50.00';

    /**
     * Create the earnings row for the parcel of a just-delivered order. Idempotent: a parcel earns once,
     * however many times it enters DELIVERED (for example an admin restoring a disputed order) and
     * whichever actor triggered the transition. A parcel with no assigned rider earns nobody anything.
     */
    public function recordForDeliveredOrder(Order $order): ?RiderEarning
    {
        $parcel = Parcel::where('order_id', $order->id)->first();

        return $parcel ? $this->recordForParcel($parcel) : null;
    }

    public function recordForParcel(Parcel $parcel, ?\DateTimeInterface $earnedAt = null): ?RiderEarning
    {
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
                'amount'    => $this->currentFee(),
                'earned_at' => $earnedAt ?? now(),
                'notes'     => 'Flat delivery fee',
            ]);
        } catch (QueryException $e) {
            // Two requests recorded the same parcel at once; the unique index kept it to one row.
            if (($e->errorInfo[0] ?? null) === '23000') {
                return null;
            }

            throw $e;
        }
    }

    /**
     * The flat fee in force right now, as a decimal string with two places. An unusable config value
     * must not stop a delivery, so it is logged loudly and the default is used instead.
     */
    public function currentFee(): string
    {
        $configured = trim((string) config('rider.delivery_fee', self::DEFAULT_FEE));

        if (! preg_match('/^\d+(\.\d{1,2})?$/', $configured)) {
            Log::error("rider.delivery_fee is not a valid peso amount ('{$configured}'); using " . self::DEFAULT_FEE . '.');

            return self::DEFAULT_FEE;
        }

        return Money::fromCents(Money::toCents($configured));
    }
}
