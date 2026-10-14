<?php

namespace App\Services;

use App\Models\DeliveryLog;
use App\Models\Rider;
use App\Models\SortingCenter;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Hub performance reports (feature 1.10). Every figure is a SQL aggregate over this hub's own parcels; no parcel is
 * ever loaded into memory. The definitions are written down in docs/api/logistics-hub-reports.md and shown in the UI.
 *
 * Time: ranges are inclusive Asia/Manila calendar days. Timestamps are stored in UTC, so a range becomes the half-open
 * UTC interval [start of `from` in Manila, start of the day after `to` in Manila). Each event is counted by its own
 * timestamp falling in that interval.
 *
 * Attribution (one rule for every rider figure): the rider of an outcome is the rider on that outcome's
 * delivery_logs row. (An administrator marking an order delivered writes no log, so that delivery is counted in the hub
 * totals but is nobody's: see unattributedDeliveries().) A failed attempt is a DELIVERY_FAILED row (one per attempt, so a parcel that fails twice counts
 * twice, for the rider who made each attempt). A delivery is the parcel's DELIVERED row. Neither follows
 * parcels.assigned_rider_id, which moves on when a parcel is rescheduled to someone else.
 */
class HubReportService
{
    public const TIMEZONE = 'Asia/Manila';
    public const MAX_DAYS = 366;
    public const DEFAULT_DAYS = 30;

    public const RIDER_SORTS = ['name', 'delivered', 'failed_attempts', 'success_rate', 'avg_delivery_hours', 'on_time_rate'];

    // ── Range ────────────────────────────────────────────────────────────────

    /** Today in Manila as Y-m-d. */
    public function today(): string
    {
        return CarbonImmutable::now(self::TIMEZONE)->toDateString();
    }

    /**
     * @return array{from: string, to: string, days: int, start: string, end: string}
     *         start/end are the UTC bounds as 'Y-m-d H:i:s', start inclusive and end exclusive
     */
    public function range(string $from, string $to): array
    {
        $start = CarbonImmutable::createFromFormat('Y-m-d', $from, self::TIMEZONE)->startOfDay();
        $endDay = CarbonImmutable::createFromFormat('Y-m-d', $to, self::TIMEZONE)->startOfDay();

        return [
            'from'  => $from,
            'to'    => $to,
            'days'  => (int) $start->diffInDays($endDay) + 1,
            'start' => $start->utc()->format('Y-m-d H:i:s'),
            'end'   => $endDay->addDay()->utc()->format('Y-m-d H:i:s'),
        ];
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    /**
     * @param array{from: string, to: string, days: int, start: string, end: string} $range
     * @return array<string, mixed>
     */
    public function summary(SortingCenter $hub, array $range): array
    {
        $slaHours = $this->slaHours();

        $received   = $this->countParcels($hub, 'scanned_in_at', $range);
        $sorted     = $this->countParcels($hub, 'sorted_at', $range);
        $dispatched = $this->countParcels($hub, 'assigned_at', $range);
        $returned   = $this->countParcels($hub, 'returned_at', $range);
        $failed     = $this->failedAttemptsQuery($hub, $range)->count();

        $delivery = $this->between($this->parcels($hub), 'delivered_at', $range)
            ->selectRaw(
                'COUNT(*) as delivered, '
                . 'COALESCE(SUM(CASE WHEN scanned_in_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, scanned_in_at, delivered_at) <= ? THEN 1 ELSE 0 END), 0) as on_time, '
                . 'AVG(CASE WHEN out_for_delivery_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, out_for_delivery_at, delivered_at) END) as avg_delivery_seconds',
                [$slaHours * 3600]
            )
            ->first();

        $dwell = $this->between($this->parcels($hub), 'out_for_delivery_at', $range)
            ->whereNotNull('scanned_in_at')
            ->selectRaw('AVG(TIMESTAMPDIFF(SECOND, scanned_in_at, out_for_delivery_at)) as avg_dwell_seconds')
            ->value('avg_dwell_seconds');

        $delivered = (int) $delivery->delivered;
        $onTime = (int) $delivery->on_time;

        return [
            'range'     => ['from' => $range['from'], 'to' => $range['to'], 'days' => $range['days'], 'timezone' => self::TIMEZONE],
            'sla_hours' => $slaHours,
            'totals'    => [
                'received'           => $received,
                'sorted'             => $sorted,
                'dispatched'         => $dispatched,
                'delivered'          => $delivered,
                'failed_attempts'    => $failed,
                'returned'           => $returned,
                'on_time_deliveries' => $onTime,
                'on_time_rate'       => $this->ratio($onTime, $delivered),
                'success_rate'       => $this->ratio($delivered, $delivered + $failed),
                'avg_hub_dwell_hours' => $this->hours($dwell),
                'avg_delivery_hours'  => $this->hours($delivery->avg_delivery_seconds),
            ],
            'daily'     => $this->daily($hub, $range),
            'excluded'  => [
                // Parcels an admin marked delivered directly never get a delivered_at, so no range can include them.
                'delivered_without_time' => $this->parcels($hub)->where('status', 'DELIVERED')->whereNull('delivered_at')->count(),
            ],
        ];
    }

    /**
     * One row per Manila day in the range, zeros included.
     *
     * @param array{from: string, to: string, days: int, start: string, end: string} $range
     * @return array<int, array{date: string, received: int, delivered: int, failed: int, returned: int}>
     */
    public function daily(SortingCenter $hub, array $range): array
    {
        $received  = $this->dailyCounts($this->between($this->parcels($hub), 'scanned_in_at', $range), 'scanned_in_at');
        $delivered = $this->dailyCounts($this->between($this->parcels($hub), 'delivered_at', $range), 'delivered_at');
        $returned  = $this->dailyCounts($this->between($this->parcels($hub), 'returned_at', $range), 'returned_at');
        $failed    = $this->dailyCounts($this->failedAttemptsQuery($hub, $range), 'l.logged_at');

        $rows = [];
        $day = CarbonImmutable::createFromFormat('Y-m-d', $range['from'], self::TIMEZONE);
        for ($i = 0; $i < $range['days']; $i++) {
            $date = $day->addDays($i)->toDateString();
            $rows[] = [
                'date'      => $date,
                'received'  => $received[$date] ?? 0,
                'delivered' => $delivered[$date] ?? 0,
                'failed'    => $failed[$date] ?? 0,
                'returned'  => $returned[$date] ?? 0,
            ];
        }

        return $rows;
    }

    // ── Riders ───────────────────────────────────────────────────────────────

    /**
     * One row per rider of this hub: every ACTIVE rider (zeros if idle) plus any other rider of the hub who had
     * activity in the range.
     *
     * @param array{from: string, to: string, days: int, start: string, end: string} $range
     * @return array<int, array<string, mixed>>
     */
    public function riders(SortingCenter $hub, array $range, string $sort = 'delivered', ?string $direction = null): array
    {
        $slaSeconds = $this->slaHours() * 3600;

        // Deliveries: the parcel's latest DELIVERED log names the rider (a parcel delivered twice, for example after
        // an admin reversal, is still one delivery).
        $deliveries = $this->between($this->parcels($hub, 'p'), 'p.delivered_at', $range)
            ->join('delivery_logs as l', function ($join) {
                $join->on('l.parcel_id', '=', 'p.id')
                    ->where('l.outcome', DeliveryLog::OUTCOME_DELIVERED)
                    ->whereNull('l.deleted_at')
                    ->whereRaw('l.id = (select max(d.id) from delivery_logs d where d.parcel_id = p.id and d.outcome = ? and d.deleted_at is null)', [DeliveryLog::OUTCOME_DELIVERED]);
            })
            ->groupBy('l.rider_id')
            ->selectRaw(
                'l.rider_id, COUNT(*) as delivered, '
                . 'COALESCE(SUM(CASE WHEN p.scanned_in_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, p.scanned_in_at, p.delivered_at) <= ? THEN 1 ELSE 0 END), 0) as on_time, '
                . 'AVG(CASE WHEN p.out_for_delivery_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, p.out_for_delivery_at, p.delivered_at) END) as avg_delivery_seconds',
                [$slaSeconds]
            )
            ->get()
            ->keyBy('rider_id');

        $failures = $this->failedAttemptsQuery($hub, $range)
            ->groupBy('l.rider_id')
            ->selectRaw('l.rider_id, COUNT(*) as failed')
            ->pluck('failed', 'rider_id');

        $activeIds = $deliveries->keys()->merge($failures->keys())->unique()->values();

        $riders = Rider::withTrashed()
            ->join('users', 'users.id', '=', 'riders.user_id')
            ->where('riders.sorting_center_id', $hub->id)
            ->where(function ($q) use ($activeIds) {
                $q->where(fn ($active) => $active->where('riders.status', Rider::STATUS_ACTIVE)->whereNull('riders.deleted_at'))
                    ->orWhereIn('riders.id', $activeIds);
            })
            ->select('riders.id', 'riders.status', 'riders.vehicle_type', 'riders.plate_number', 'users.first_name', 'users.last_name')
            ->get();

        $rows = $riders->map(function ($rider) use ($deliveries, $failures) {
            $d = $deliveries->get($rider->id);
            $delivered = (int) ($d->delivered ?? 0);
            $onTime = (int) ($d->on_time ?? 0);
            $failed = (int) ($failures[$rider->id] ?? 0);

            return [
                'rider_id'           => (int) $rider->id,
                'name'               => trim("{$rider->first_name} {$rider->last_name}"),
                'status'             => $rider->status,
                'vehicle_type'       => $rider->vehicle_type,
                'plate_number'       => $rider->plate_number,
                'delivered'          => $delivered,
                'failed_attempts'    => $failed,
                'success_rate'       => $this->ratio($delivered, $delivered + $failed),
                'avg_delivery_hours' => $this->hours($d->avg_delivery_seconds ?? null),
                'on_time_deliveries' => $onTime,
                'on_time_rate'       => $this->ratio($onTime, $delivered),
            ];
        })->all();

        return $this->sortRiders($rows, $sort, $direction);
    }

    /**
     * Deliveries in the range that no rider reported: the parcel has a delivery time but no DELIVERED log, which is
     * what an administrator marking an order delivered leaves behind. They are in the hub's totals but in no rider's
     * row, so this number is what lets the rider table add up to the totals.
     *
     * @param array{from: string, to: string, days: int, start: string, end: string} $range
     */
    public function unattributedDeliveries(SortingCenter $hub, array $range): int
    {
        return $this->between($this->parcels($hub, 'p'), 'p.delivered_at', $range)
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('delivery_logs as l')
                    ->whereColumn('l.parcel_id', 'p.id')
                    ->where('l.outcome', DeliveryLog::OUTCOME_DELIVERED)
                    ->whereNull('l.deleted_at');
            })
            ->count();
    }

    /**
     * Nulls always sort last, whichever the direction; the rider's name breaks ties.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function sortRiders(array $rows, string $sort, ?string $direction): array
    {
        $direction = $direction ?? ($sort === 'name' ? 'asc' : 'desc');
        $factor = $direction === 'asc' ? 1 : -1;

        usort($rows, function (array $a, array $b) use ($sort, $factor) {
            $x = $a[$sort];
            $y = $b[$sort];
            if ($x === null || $y === null) {
                if ($x === $y) {
                    return strcasecmp($a['name'], $b['name']);
                }

                return $x === null ? 1 : -1;
            }
            $cmp = $sort === 'name' ? strcasecmp((string) $x, (string) $y) : ($x <=> $y);

            return $cmp !== 0 ? $cmp * $factor : strcasecmp($a['name'], $b['name']);
        });

        return $rows;
    }

    // ── Query helpers ────────────────────────────────────────────────────────

    public function slaHours(): int
    {
        return max(1, (int) config('logistics.delivery_sla_hours', 48));
    }

    private function parcels(SortingCenter $hub, string $alias = 'parcels'): Builder
    {
        $table = $alias === 'parcels' ? 'parcels' : "parcels as {$alias}";

        return DB::table($table)
            ->where("{$alias}.sorting_center_id", $hub->id)
            ->whereNull("{$alias}.deleted_at");
    }

    /**
     * @param array{start: string, end: string} $range
     */
    private function between(Builder $query, string $column, array $range): Builder
    {
        return $query->where($column, '>=', $range['start'])->where($column, '<', $range['end']);
    }

    /**
     * @param array{start: string, end: string} $range
     */
    private function countParcels(SortingCenter $hub, string $column, array $range): int
    {
        return $this->between($this->parcels($hub), $column, $range)->count();
    }

    /**
     * Failed delivery attempts of this hub's parcels in the range: one delivery_logs row per attempt.
     *
     * @param array{start: string, end: string} $range
     */
    private function failedAttemptsQuery(SortingCenter $hub, array $range): Builder
    {
        return $this->between(
            DB::table('delivery_logs as l')
                ->join('parcels as p', 'p.id', '=', 'l.parcel_id')
                ->where('p.sorting_center_id', $hub->id)
                ->whereNull('p.deleted_at')
                ->whereNull('l.deleted_at')
                ->where('l.outcome', DeliveryLog::OUTCOME_DELIVERY_FAILED),
            'l.logged_at',
            $range
        );
    }

    /**
     * Counts per Manila calendar day (Y-m-d => count). The WHERE clause still filters on the raw column so the
     * composite index is used; only the grouping shifts to Manila time (a fixed UTC+8, no daylight saving).
     *
     * @return array<string, int>
     */
    private function dailyCounts(Builder $query, string $column): array
    {
        $offset = (int) CarbonImmutable::now(self::TIMEZONE)->getOffset();

        return $query
            ->selectRaw("DATE(DATE_ADD({$column}, INTERVAL {$offset} SECOND)) as day, COUNT(*) as total")
            ->groupBy('day')
            ->pluck('total', 'day')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    /** numerator / denominator as a fraction rounded to 4 places, or null when there is nothing to divide. */
    private function ratio(int $numerator, int $denominator): ?float
    {
        return $denominator > 0 ? round($numerator / $denominator, 4) : null;
    }

    private function hours(mixed $seconds): ?float
    {
        return $seconds === null ? null : round(((float) $seconds) / 3600, 2);
    }
}
