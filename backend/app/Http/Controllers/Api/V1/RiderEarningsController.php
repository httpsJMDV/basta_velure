<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Support\ManilaPeriod;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * What a rider has earned. Read-only: it never creates or changes an earnings row, and it only ever
 * reads the authenticated rider's own rows. Amounts are decimal strings and are summed in SQL or in
 * integer centavos, never as floats. Days, weeks (Monday to Sunday) and months are Asia/Manila.
 */
class RiderEarningsController extends Controller
{
    /**
     * GET /api/v1/rider/earnings/summary?period=day|week|month&date=YYYY-MM-DD
     */
    public function summary(Request $request): JsonResponse
    {
        $period = $this->period($request);
        $rider = $this->rider($request);

        $current = $this->totals($rider, $period);
        $previousPeriod = $period->previous();
        $previous = $this->totals($rider, $previousPeriod);

        $lifetime = (string) RiderEarning::where('rider_id', $rider->id)->sum('amount');
        // Shares the courier company has not paid out yet (it pays riders by GCash and marks them paid).
        $unpaid = (string) RiderEarning::where('rider_id', $rider->id)->whereNull('paid_at')->sum('amount');

        return response()->json([
            'data' => [
                'period'               => $this->periodPayload($period),
                'total_earned'         => Money::fromCents($current['cents']),
                'deliveries_count'     => $current['count'],
                'average_per_delivery' => Money::fromCents(Money::averageCents($current['cents'], $current['count'])),
                'previous'             => $this->periodPayload($previousPeriod) + [
                    'total_earned'     => Money::fromCents($previous['cents']),
                    'deliveries_count' => $previous['count'],
                ],
                'breakdown'            => $this->breakdown($rider, $period),
                'lifetime_total'       => Money::fromCents(Money::toCents($lifetime)),
                'unpaid_total'         => Money::fromCents(Money::toCents($unpaid)),
            ],
        ]);
    }

    /**
     * GET /api/v1/rider/earnings/deliveries?period=&date=&per_page=&page=
     *
     * The earnings rows of the period, newest first.
     */
    public function deliveries(Request $request): JsonResponse
    {
        $period = $this->period($request);
        $rider = $this->rider($request);
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        $paginated = DB::table('rider_earnings as re')
            ->join('parcels as p', 'p.id', '=', 're.parcel_id')
            ->join('orders as o', 'o.id', '=', 'p.order_id')
            ->where('re.rider_id', $rider->id)
            ->whereNull('re.deleted_at')
            ->where('re.earned_at', '>=', $period->startUtc())
            ->where('re.earned_at', '<', $period->endUtc())
            ->select([
                're.id',
                're.kind',
                'p.tracking_number',
                'o.order_number',
                'p.destination_barangay as barangay_name',
                DB::raw("JSON_UNQUOTE(JSON_EXTRACT(p.recipient_snapshot, '$.city')) as city"),
                're.earned_at',
                're.amount',
                're.paid_at',
            ])
            ->orderByDesc('re.earned_at')
            ->orderByDesc('re.id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($row) => [
                'id'              => (int) $row->id,
                // pickup: collected from the seller and brought to the hub; delivery: brought to the buyer.
                'kind'            => (string) $row->kind,
                'tracking_number' => $row->tracking_number,
                'order_number'    => $row->order_number,
                'destination'     => [
                    'barangay_name' => (string) ($row->barangay_name ?? ''),
                    'city'          => (string) ($row->city ?? ''),
                ],
                'delivered_at'    => CarbonImmutable::parse($row->earned_at, 'UTC')->toIso8601String(),
                'fee'             => Money::fromCents(Money::toCents($row->amount)),
                'paid_at'         => $row->paid_at ? CarbonImmutable::parse($row->paid_at, 'UTC')->toIso8601String() : null,
            ])->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
                'period'       => $this->periodPayload($period),
            ],
        ]);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    protected function period(Request $request): ManilaPeriod
    {
        $validated = $request->validate([
            'period' => ['nullable', 'in:day,week,month'],
            'date'   => ['nullable', 'date_format:Y-m-d'],
        ]);

        return ManilaPeriod::containing($validated['period'] ?? ManilaPeriod::DAY, $validated['date'] ?? null);
    }

    protected function rider(Request $request): Rider
    {
        return Rider::where('user_id', $request->user()->id)->firstOrFail();
    }

    /**
     * @return array{cents: int, count: int}
     */
    protected function totals(Rider $rider, ManilaPeriod $period): array
    {
        $row = DB::table('rider_earnings')
            ->where('rider_id', $rider->id)
            ->whereNull('deleted_at')
            ->where('earned_at', '>=', $period->startUtc())
            ->where('earned_at', '<', $period->endUtc())
            ->selectRaw('COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt')
            ->first();

        return ['cents' => Money::toCents($row->total), 'count' => (int) $row->cnt];
    }

    /**
     * One point per hour (a day) or per calendar day (a week or month), zero-filled. The points always add
     * up to the period's total because they are the same rows, bucketed in Manila time.
     *
     * @return array<int, array{key: string, label: string, total: string, count: int}>
     */
    protected function breakdown(Rider $rider, ManilaPeriod $period): array
    {
        $local = "CONVERT_TZ(earned_at, '+00:00', '{$period->offset()}')";
        $hourly = $period->type === ManilaPeriod::DAY;
        $bucket = $hourly ? "HOUR({$local})" : "DATE({$local})";

        $rows = DB::table('rider_earnings')
            ->where('rider_id', $rider->id)
            ->whereNull('deleted_at')
            ->where('earned_at', '>=', $period->startUtc())
            ->where('earned_at', '<', $period->endUtc())
            ->selectRaw("{$bucket} as bucket, SUM(amount) as total, COUNT(*) as cnt")
            ->groupBy('bucket')
            ->get()
            ->keyBy(fn ($r) => (string) $r->bucket);

        $points = [];
        if ($hourly) {
            for ($h = 0; $h < 24; $h++) {
                $row = $rows->get((string) $h);
                $points[] = [
                    'key'   => str_pad((string) $h, 2, '0', STR_PAD_LEFT),
                    'label' => $period->start->setTime($h, 0)->format('g A'),
                    'total' => Money::fromCents(Money::toCents($row?->total)),
                    'count' => (int) ($row?->cnt ?? 0),
                ];
            }

            return $points;
        }

        for ($day = $period->start; $day->lessThan($period->end); $day = $day->addDay()) {
            $row = $rows->get($day->format('Y-m-d'));
            $points[] = [
                'key'   => $day->format('Y-m-d'),
                'label' => $period->type === ManilaPeriod::WEEK ? $day->format('D j') : $day->format('j'),
                'total' => Money::fromCents(Money::toCents($row?->total)),
                'count' => (int) ($row?->cnt ?? 0),
            ];
        }

        return $points;
    }

    /**
     * @return array<string, mixed>
     */
    protected function periodPayload(ManilaPeriod $period): array
    {
        return [
            'type'       => $period->type,
            'start_date' => $period->start->format('Y-m-d'),
            'end_date'   => $period->lastDay()->format('Y-m-d'),
            'start_at'   => $period->start->toIso8601String(),
            'end_at'     => $period->end->subSecond()->toIso8601String(),
            'is_current' => $period->isCurrent(),
            'timezone'   => config('rider.timezone', 'Asia/Manila'),
        ];
    }
}
