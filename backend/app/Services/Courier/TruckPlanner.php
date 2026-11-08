<?php

namespace App\Services\Courier;

use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Http\Controllers\Api\V1\LogisticsRiderController;
use Illuminate\Support\Facades\DB;

/**
 * "How many truck drivers do we need?" for a courier, from its own last 7 days (docs/api/courier-network.md):
 *
 *   trips a day, per route = parcels a day on that route ÷ what one truck carries (rounded up)
 *   driver hours a day     = trips a day × the round trip (twice the one-way hours)
 *   drivers                = driver hours a day ÷ one shift, plus a spare for days off and breakdowns
 *
 * A route is one hop between two hubs by land. Ships and planes between island groups are cargo carriers, not the
 * courier's drivers, so they are counted apart and never add drivers. Parcels waiting right now count too, so a
 * new courier with a backlog and no history still gets an answer.
 */
class TruckPlanner
{
    /** A parcel that waited longer than this for a truck is a sign of too few drivers. */
    public const LONG_WAIT_HOURS = 12;

    public function capacity(LogisticsCompany $company): int
    {
        return max(1, (int) ($company->truck_capacity ?? config('logistics.truck_capacity', 300)));
    }

    public function shiftHours(LogisticsCompany $company): int
    {
        return max(1, (int) ($company->truck_shift_hours ?? config('logistics.truck_shift_hours', 8)));
    }

    /** @return array<string, mixed> */
    public function plan(LogisticsCompany $company): array
    {
        $since = now()->subDays(7);
        $capacity = $this->capacity($company);
        $shift = $this->shiftHours($company);
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $company->id)->pluck('id')->all();

        // Each land hop that left a hub in the last 7 days: the stop before it departed, this stop is a truck leg.
        $legs = DB::table('parcel_hub_stops as s')
            ->join('parcel_hub_stops as prev', fn ($j) => $j->on('prev.parcel_id', '=', 's.parcel_id')->whereRaw('prev.position + 1 = s.position'))
            ->whereIn('prev.sorting_center_id', $hubIds)
            ->where('prev.departed_at', '>=', $since)
            ->selectRaw("prev.sorting_center_id as from_id, s.sorting_center_id as to_id, s.mode as mode, COUNT(*) as n,
                AVG(TIMESTAMPDIFF(MINUTE, prev.arrived_at, prev.departed_at)) as wait_min,
                SUM(CASE WHEN TIMESTAMPDIFF(HOUR, prev.arrived_at, prev.departed_at) >= ? THEN 1 ELSE 0 END) as long_waits", [self::LONG_WAIT_HOURS])
            ->groupBy('prev.sorting_center_id', 's.sorting_center_id', 's.mode')
            ->get();
        $land = $legs->filter(fn ($l) => ($l->mode ?: TruckTrip::MODE_TRUCK) === TruckTrip::MODE_TRUCK);

        // How long a truck takes, one way, from the trips that finished: per route, and for the whole courier.
        $tripHours = LogisticsCompany::constrain(TruckTrip::query(), $company->id)
            ->where('mode', TruckTrip::MODE_TRUCK)->where('departed_at', '>=', now()->subDays(30))
            ->whereNotNull('driver_arrived_at')
            ->selectRaw('from_hub_id, to_hub_id, AVG(TIMESTAMPDIFF(MINUTE, departed_at, driver_arrived_at)) as minutes, COUNT(*) as trips')
            ->groupBy('from_hub_id', 'to_hub_id')->get();
        $fallbackHours = $tripHours->sum('trips') > 0
            ? max(0.5, round($tripHours->sum(fn ($t) => $t->minutes * $t->trips) / $tripHours->sum('trips') / 60, 1))
            : (float) config('logistics.truck_trip_hours', 3);
        $hoursFor = function (int $from, int $to) use ($tripHours, $fallbackHours): float {
            $row = $tripHours->first(fn ($t) => (int) $t->from_hub_id === $from && (int) $t->to_hub_id === $to);

            return $row ? max(0.5, round($row->minutes / 60, 1)) : $fallbackHours;
        };

        // What waits right now, by the next hop.
        $waiting = [];
        $cargoWaiting = 0;
        $parcels = LogisticsCompany::constrain(Parcel::query(), $company->id)->waitingToSend()
            ->with(['hubStops' => fn ($q) => $q->whereNull('arrived_at')->orderBy('position')])->get(['id', 'sorting_center_id', 'scanned_in_at', 'status']);
        foreach ($parcels as $p) {
            $next = $p->hubStops->first();
            if (! $next) {
                continue;
            }
            if (in_array($next->mode, [TruckTrip::MODE_SEA, TruckTrip::MODE_AIR], true)) {
                $cargoWaiting++;
                continue;
            }
            $key = "{$p->sorting_center_id}-{$next->sorting_center_id}";
            $waiting[$key] ??= ['n' => 0, 'oldest' => null];
            $waiting[$key]['n']++;
            if ($p->scanned_in_at && ($waiting[$key]['oldest'] === null || $p->scanned_in_at->lt($waiting[$key]['oldest']))) {
                $waiting[$key]['oldest'] = $p->scanned_in_at;
            }
        }

        // One row per route: last week's parcels a day, or what waits now when that is more.
        $routes = [];
        foreach ($land as $l) {
            $routes["{$l->from_id}-{$l->to_id}"] = ['from' => (int) $l->from_id, 'to' => (int) $l->to_id, 'week' => (int) $l->n,
                'wait_min' => (float) $l->wait_min, 'long_waits' => (int) $l->long_waits];
        }
        foreach (array_keys($waiting) as $key) {
            [$from, $to] = array_map('intval', explode('-', $key));
            $routes[$key] ??= ['from' => $from, 'to' => $to, 'week' => 0, 'wait_min' => 0.0, 'long_waits' => 0];
        }
        $hubs = SortingCenter::withTrashed()->whereIn('id', collect($routes)->flatMap(fn ($r) => [$r['from'], $r['to']])->unique())
            ->get(['id', 'hub_name', 'address_city', 'gateway_region_code', 'is_island_gateway'])->keyBy('id');

        $rows = [];
        foreach ($routes as $key => $r) {
            $perDay = $r['week'] / 7;
            $now = $waiting[$key]['n'] ?? 0;
            $load = max($perDay, $now);
            $trips = $load > 0 ? (int) ceil($load / $capacity) : 0;
            $hours = $hoursFor($r['from'], $r['to']);
            $rows[] = [
                'from'               => $this->hub($hubs->get($r['from'])),
                'to'                 => $this->hub($hubs->get($r['to'])),
                'parcels_last_7_days' => $r['week'],
                'parcels_per_day'    => round($perDay, 1),
                'waiting_now'        => $now,
                'oldest_waiting_at'  => ($waiting[$key]['oldest'] ?? null)?->toIso8601String(),
                'trips_per_day'      => $trips,
                'trip_hours'         => $hours,
                'driver_hours'       => round($trips * $hours * 2, 1),
            ];
        }
        usort($rows, fn ($a, $b) => [$b['driver_hours'], $b['waiting_now']] <=> [$a['driver_hours'], $a['waiting_now']]);

        $driverHours = array_sum(array_column($rows, 'driver_hours'));
        $needed = $driverHours > 0 ? (int) ceil($driverHours / $shift) : 0;
        $spare = $needed > 0 ? max(1, (int) ceil($needed * 0.2)) : 0;
        $recommended = $needed + $spare;

        $drivers = LogisticsRiderController::companyRiders($company)->where('duty', Rider::DUTY_TRUCK)->where('status', Rider::STATUS_ACTIVE)->pluck('id');
        $onTheWay = TruckTrip::whereIn('driver_id', $drivers)->where('status', TruckTrip::STATUS_ON_THE_WAY)->distinct()->count('driver_id');
        $active = $drivers->count();
        $weekParcels = (int) $land->sum('n');
        $waits = $land->sum('n') > 0 ? round($land->sum(fn ($l) => $l->wait_min * $l->n) / $land->sum('n') / 60, 1) : null;

        $verdict = match (true) {
            $recommended === 0                => 'idle',
            $active < $needed                 => 'short',
            $active < $recommended            => 'tight',
            $active > $recommended + 2        => 'more_than_needed',
            default                           => 'ok',
        };

        return [
            'settings' => ['capacity' => $capacity, 'shift_hours' => $shift, 'trip_hours' => $fallbackHours, 'long_wait_hours' => self::LONG_WAIT_HOURS],
            'drivers'  => ['active' => $active, 'on_the_way' => $onTheWay, 'free' => max(0, $active - $onTheWay)],
            'demand'   => [
                'parcels_last_7_days' => $weekParcels,
                'parcels_per_day'     => round($weekParcels / 7, 1),
                'waiting_now'         => array_sum(array_column($waiting, 'n')),
                'average_wait_hours'  => $waits,
                'waited_too_long'     => (int) $land->sum('long_waits'),
                'by_sea_or_air_waiting' => $cargoWaiting,
                'by_sea_or_air_last_7_days' => (int) $legs->reject(fn ($l) => ($l->mode ?: TruckTrip::MODE_TRUCK) === TruckTrip::MODE_TRUCK)->sum('n'),
            ],
            'needed'   => [
                'trips_per_day'        => array_sum(array_column($rows, 'trips_per_day')),
                'driver_hours_per_day' => round($driverHours, 1),
                'drivers'              => $needed,
                'spare'                => $spare,
                'recommended'          => $recommended,
            ],
            'verdict'  => $verdict,
            'message'  => $this->message($verdict, $active, $recommended),
            'routes'   => array_slice($rows, 0, 30),
            'route_count' => count($rows),
        ];
    }

    private function message(string $verdict, int $active, int $recommended): string
    {
        $drivers = fn (int $n) => $n === 1 ? '1 driver' : "{$n} drivers";

        return match ($verdict) {
            'idle'             => 'No parcels moved between your hubs by land this week, so you need no truck drivers yet.',
            'short'            => "You have {$drivers($active)} and need about {$drivers($recommended)}. Parcels will wait at the hubs until you hire more.",
            'tight'            => "You have {$drivers($active)}: enough on a normal day, but none to spare. About {$drivers($recommended)} covers days off and breakdowns.",
            'more_than_needed' => "You have {$drivers($active)}, more than the {$drivers($recommended)} this week's trips need.",
            default            => "You have {$drivers($active)}, the right number for this week's trips.",
        };
    }

    /** @return array{id: int, name: string, city: string, gateway: ?string}|null */
    private function hub(?SortingCenter $hub): ?array
    {
        return $hub ? ['id' => $hub->id, 'name' => (string) $hub->hub_name, 'city' => (string) $hub->address_city, 'gateway' => $hub->gatewayLabel()] : null;
    }
}
