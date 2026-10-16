<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\HubEarning;
use App\Models\SortingCenter;
use App\Support\ManilaPeriod;
use App\Support\Money;
use App\Support\ShippingSplit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * What this hub has earned: its share (15% by default) of the delivery fee of every parcel it handled that was
 * delivered. Read-only, and only ever this hub's own rows. Amounts are decimal strings summed in SQL and turned into
 * centavos, never floats. Today, this week (Monday to Sunday) and this month are Asia/Manila.
 */
class HubEarningsController extends Controller
{
    /**
     * GET /api/v1/hub/earnings
     */
    public function summary(Request $request): JsonResponse
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        $riderPercent = ShippingSplit::riderPercent();

        $recent = HubEarning::with(['parcel.order:id,order_number,shipping_fee', 'parcel.assignedRider.user:id,first_name,last_name'])
            ->where('sorting_center_id', $hub->id)
            ->orderByDesc('earned_at')
            ->orderByDesc('id')
            ->limit(30)
            ->get();

        return response()->json(['data' => [
            'delivery_fee' => ShippingSplit::fee(),
            'split'        => ['rider_percent' => $riderPercent, 'pickup_percent' => ShippingSplit::pickupPercent(), 'delivery_percent' => ShippingSplit::deliveryPercent(), 'hub_percent' => 100 - $riderPercent],
            'today'        => $this->totals($hub, ManilaPeriod::containing(ManilaPeriod::DAY)),
            'week'         => $this->totals($hub, ManilaPeriod::containing(ManilaPeriod::WEEK)),
            'month'        => $this->totals($hub, ManilaPeriod::containing(ManilaPeriod::MONTH)),
            'lifetime'     => $this->totals($hub, null),
            'recent'       => $recent->map(function (HubEarning $e) {
                $rider = $e->parcel?->assignedRider?->user;
                $name = trim(($rider?->first_name ?? '') . ' ' . ($rider?->last_name ?? ''));

                return [
                    'tracking_number' => $e->parcel?->tracking_number,
                    'order_number'    => $e->parcel?->order?->order_number,
                    'rider_name'      => $name !== '' ? $name : null,
                    'delivery_fee'    => $e->parcel?->order ? Money::fromCents(Money::toCents((string) $e->parcel->order->shipping_fee)) : null,
                    'amount'          => (string) $e->amount,
                    'earned_at'       => $e->earned_at?->toIso8601String(),
                ];
            })->values()->all(),
        ]]);
    }

    /**
     * @return array{total: string, deliveries_count: int}
     */
    private function totals(SortingCenter $hub, ?ManilaPeriod $period): array
    {
        $query = DB::table('hub_earnings')
            ->where('sorting_center_id', $hub->id)
            ->whereNull('deleted_at');

        if ($period) {
            $query->where('earned_at', '>=', $period->startUtc())->where('earned_at', '<', $period->endUtc());
        }

        $row = $query->selectRaw('COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt')->first();

        return ['total' => Money::fromCents(Money::toCents($row->total)), 'deliveries_count' => (int) $row->cnt];
    }
}
