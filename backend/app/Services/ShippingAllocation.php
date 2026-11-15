<?php

namespace App\Services;

use App\Models\Order;
use App\Models\ParcelHubStop;
use App\Models\ReturnPickupStop;
use App\Models\TruckTrip;
use App\Support\Money;

/** Immutable checkout budget; transport claims are serialized on the order row. */
final class ShippingAllocation
{
    public const PERCENTAGES = ['pickup' => 20, 'delivery' => 20, 'hub' => 15, 'transport' => 20, 'courier' => 25];

    public static function snapshot(string|float $fee): array
    {
        $cents = max(0, Money::toCents((string) $fee));
        $amounts = [];
        foreach (self::PERCENTAGES as $kind => $percent) {
            // Floor each allocation; the courier receives the remaining centavos.
            $amounts[$kind] = intdiv($cents * $percent, 100);
        }
        $amounts['courier'] += $cents - array_sum($amounts);

        return ['version' => 1, 'fee_cents' => $cents, 'percentages' => self::PERCENTAGES, 'cents' => $amounts,
            'return_reserve_cents' => min($amounts['transport'], $amounts['courier'])];
    }

    /** The full forward route shares ONE transport pool, including sea/air operating reserves. */
    public function claimTransport(ParcelHubStop|ReturnPickupStop $stop, TruckTrip $trip): int
    {
        $buyerReturn = $stop instanceof ReturnPickupStop;
        $returning = $buyerReturn || $stop->direction === ParcelHubStop::DIRECTION_RETURN;
        $order = Order::whereKey($buyerReturn ? $stop->returnPickup->order_id : $stop->parcel->order_id)->lockForUpdate()->firstOrFail();
        $budget = $order->shipping_earnings;
        if (! $budget) {
            return 0;
        }
        $plan = $returning ? 'return_transport_legs' : 'transport_legs';
        $prefix = $buyerReturn ? 'buyer-return-' : 'parcel-';
        if (! isset($budget[$plan])) {
            $stops = $buyerReturn
                ? ReturnPickupStop::where('return_pickup_id', $stop->return_pickup_id)->orderBy('position')->orderBy('id')->get()->skip(1)->values()
                : ParcelHubStop::where('parcel_id', $stop->parcel_id)
                    ->where('direction', $returning ? ParcelHubStop::DIRECTION_RETURN : ParcelHubStop::DIRECTION_FORWARD)
                    ->orderBy('position')->orderBy('id')->get();
            if (! $returning) {
                $stops = $stops->skip(1)->values();
            }
            $count = $stops->count();
            $pool = $returning ? $budget['return_reserve_cents'] : $budget['cents']['transport'];
            $budget[$plan] = [];
            foreach ($stops as $index => $leg) {
                $budget[$plan][$prefix.$leg->id] = [
                    'cents' => intdiv($pool, $count) + ($index < $pool % $count ? 1 : 0),
                    'trip_id' => null,
                ];
            }
        }
        $key = $prefix.$stop->id;
        $leg = $budget[$plan][$key] ?? null;
        if (! $leg || $leg['trip_id'] !== null) {
            return 0;
        }
        $budget[$plan][$key]['trip_id'] = $trip->id;
        $order->shipping_earnings = $budget;
        $order->save();

        return $leg['cents'];
    }
}
