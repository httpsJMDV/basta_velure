<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DeliveryFailureReason;
use App\Http\Controllers\Controller;
use App\Models\DeliveryLog;
use App\Models\Parcel;
use App\Models\Rider;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Every delivery attempt the authenticated rider has made, newest first. Read-only, and only this
 * rider's data. It never selects the recipient's phone number.
 *
 * Where each outcome comes from:
 *  - delivered: the rider's earnings rows (so a parcel an admin marked delivered still shows, with its fee);
 *  - failed:    the rider's DELIVERY_FAILED delivery logs, one per attempt, so a parcel that failed twice
 *               appears twice;
 *  - returned:  RETURNED is not written to delivery_logs, so it is derived from the parcel: it is
 *               RETURNED, `returned_at` is set (only the hub's "return to seller" action sets it) and it is
 *               assigned to this rider.
 */
class RiderHistoryController extends Controller
{
    private const OUTCOMES = ['delivered', 'failed', 'returned'];

    /**
     * GET /api/v1/rider/history?outcome=all|delivered|failed|returned&from=&to=&search=&per_page=&page=
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'outcome'  => ['nullable', 'in:all,delivered,failed,returned'],
            'from'     => ['nullable', 'date_format:Y-m-d'],
            'to'       => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'search'   => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer'],
        ]);

        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();
        $outcome = $validated['outcome'] ?? 'all';
        $perPage = min(max((int) ($validated['per_page'] ?? 20), 1), 100);
        $wanted = $outcome === 'all' ? self::OUTCOMES : [$outcome];

        $union = null;
        foreach ($wanted as $name) {
            $leg = match ($name) {
                'delivered' => $this->deliveredLeg($rider),
                'failed'    => $this->failedLeg($rider),
                'returned'  => $this->returnedLeg($rider),
            };
            $union = $union ? $union->unionAll($leg) : $leg;
        }

        $query = DB::query()->fromSub($union, 'h');

        $tz = config('rider.timezone', 'Asia/Manila');
        if (! empty($validated['from'])) {
            $query->where('occurred_at', '>=', CarbonImmutable::createFromFormat('Y-m-d', $validated['from'], $tz)->startOfDay()->utc());
        }
        if (! empty($validated['to'])) {
            $query->where('occurred_at', '<', CarbonImmutable::createFromFormat('Y-m-d', $validated['to'], $tz)->startOfDay()->addDay()->utc());
        }
        if (! empty($validated['search'])) {
            $like = '%' . addcslashes(trim($validated['search']), '%_\\') . '%';
            $query->where(fn ($w) => $w->where('tracking_number', 'like', $like)->orWhere('order_number', 'like', $like));
        }

        $paginated = $query->orderByDesc('occurred_at')->orderByDesc('parcel_id')->orderBy('outcome')->paginate($perPage);

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($row) => $this->entry($row))->values(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
                'outcome'      => $outcome,
            ],
        ]);
    }

    // ─── the three sources, with identical columns so they can be unioned ─────

    private function cityExpression(): \Illuminate\Contracts\Database\Query\Expression
    {
        return DB::raw("JSON_UNQUOTE(JSON_EXTRACT(p.recipient_snapshot, '$.city')) as city");
    }

    private function deliveredLeg(Rider $rider)
    {
        return DB::table('rider_earnings as re')
            ->join('parcels as p', 'p.id', '=', 're.parcel_id')
            ->join('orders as o', 'o.id', '=', 'p.order_id')
            ->where('re.rider_id', $rider->id)
            ->whereNull('re.deleted_at')
            ->whereNull('p.deleted_at')
            ->select([
                DB::raw("'delivered' as outcome"),
                DB::raw('COALESCE(p.delivered_at, re.earned_at) as occurred_at'),
                'p.id as parcel_id',
                'p.tracking_number',
                'o.order_number',
                'p.destination_barangay as barangay_name',
                $this->cityExpression(),
                're.amount as fee',
                DB::raw('CASE WHEN p.cod_collected_at IS NOT NULL THEN p.cod_amount END as cod_collected'),
                DB::raw('NULL as notes'),
            ]);
    }

    private function failedLeg(Rider $rider)
    {
        return DB::table('delivery_logs as dl')
            ->join('parcels as p', 'p.id', '=', 'dl.parcel_id')
            ->join('orders as o', 'o.id', '=', 'p.order_id')
            ->where('dl.rider_id', $rider->id)
            ->where('dl.outcome', DeliveryLog::OUTCOME_DELIVERY_FAILED)
            ->whereNull('dl.deleted_at')
            ->whereNull('p.deleted_at')
            ->select([
                DB::raw("'failed' as outcome"),
                'dl.logged_at as occurred_at',
                'p.id as parcel_id',
                'p.tracking_number',
                'o.order_number',
                'p.destination_barangay as barangay_name',
                $this->cityExpression(),
                DB::raw('NULL as fee'),
                DB::raw('NULL as cod_collected'),
                'dl.notes as notes',
            ]);
    }

    private function returnedLeg(Rider $rider)
    {
        return DB::table('parcels as p')
            ->join('orders as o', 'o.id', '=', 'p.order_id')
            ->where('p.assigned_rider_id', $rider->id)
            ->where('p.status', Parcel::STATUS_RETURNED)
            ->whereNotNull('p.returned_at')
            ->whereNull('p.deleted_at')
            ->select([
                DB::raw("'returned' as outcome"),
                'p.returned_at as occurred_at',
                'p.id as parcel_id',
                'p.tracking_number',
                'o.order_number',
                'p.destination_barangay as barangay_name',
                $this->cityExpression(),
                DB::raw('NULL as fee'),
                DB::raw('NULL as cod_collected'),
                DB::raw('NULL as notes'),
            ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function entry(object $row): array
    {
        return [
            'outcome'         => $row->outcome,
            'occurred_at'     => CarbonImmutable::parse($row->occurred_at, 'UTC')->toIso8601String(),
            'tracking_number' => $row->tracking_number,
            'order_number'    => $row->order_number,
            'destination'     => [
                'barangay_name' => (string) ($row->barangay_name ?? ''),
                'city'          => (string) ($row->city ?? ''),
            ],
            // Only for failed attempts. Each attempt keeps its own reason, because the log stores it as "CODE: label".
            'failure_reason'  => $row->outcome === 'failed' ? $this->failureReason($row->notes) : null,
            // Only for delivered: the fee that row earned, and the cash collected for a COD parcel.
            'fee'             => $row->fee !== null ? Money::fromCents(Money::toCents($row->fee)) : null,
            'cod_collected'   => $row->cod_collected !== null ? Money::fromCents(Money::toCents($row->cod_collected)) : null,
        ];
    }

    /**
     * @return array{code: string, label: string}|null
     */
    private function failureReason(?string $notes): ?array
    {
        if ($notes === null || ! preg_match('/^([A-Z_]+):/', $notes, $m)) {
            return null;
        }

        $reason = DeliveryFailureReason::tryFrom($m[1]);

        // The label comes from the enum, never from the rider's free-text note that follows it in the log.
        return $reason ? ['code' => $reason->value, 'label' => $reason->label()] : null;
    }
}
