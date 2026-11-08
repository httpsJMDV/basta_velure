<?php

namespace App\Services\Courier;

use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use App\Services\OrderStateMachine;
use App\Services\RiderAreaCoverage;
use App\Support\PhPlaces;
use App\Support\PhRegions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * Hub-to-hub transfers. A parcel goes to the hub of the rider who collected it, like before. If that hub does not cover
 * the buyer's barangay, it goes on to the same courier's hub that does: the first hub scans it out, the courier's
 * line-haul carries it, and the next hub scans it in and sorts it as usual. With no hub covering the barangay, the first
 * hub keeps it, as it always did.
 *
 * Each scan writes a line on the order's timeline, naming the next hub like J&T's "departed, next site" does. The order
 * stays AT_SORTING_CENTER on the way, so nothing about orders, payments or earnings changes.
 */
class HubRouter
{
    private static ?bool $ready = null;

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly RiderAreaCoverage $coverage,
    ) {
    }

    /**
     * True once the migration has run. Until then the site works as it did before transfers, with one hub per parcel:
     * this code goes live as soon as it is saved, and the live database is migrated by hand.
     */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('parcel_hub_stops') && Schema::hasColumn('parcels', 'transit_since');
    }

    /** For a test: pretend the migration has or has not run. Null asks the database again. */
    public static function assumeReady(?bool $ready): void
    {
        self::$ready = $ready;
    }

    /** The same courier's hub that delivers to the parcel's barangay, or null when $from does it itself or nobody does. */
    public function deliveringHub(Parcel $parcel, SortingCenter $from): ?SortingCenter
    {
        $code = trim((string) $parcel->destination_barangay_code);
        if ($code === '' || $this->covers($from, $code)) {
            return null;
        }

        return $this->bestHubFor(LogisticsCompany::effectiveId($from->logistics_company_id), $code, $from->id);
    }

    /**
     * The courier's approved hub for a barangay: one with a rider who covers it first (it can deliver right away), then
     * the oldest. Found through the hub_coverage index, so it stays one query with thousands of hubs.
     */
    public function bestHubFor(?int $companyId, string $code, ?int $exceptHubId = null): ?SortingCenter
    {
        $hubs = $this->companyHubs($companyId)
            ->whereIn('id', HubCoverage::where('barangay_code', $code)->select('sorting_center_id'))
            ->when($exceptHubId, fn ($q) => $q->whereKeyNot($exceptHubId))
            ->orderBy('id')->limit(10)->get();

        return $hubs->first(fn (SortingCenter $hub) => count($this->coverage->eligibleByBarangayCode($hub)[$code] ?? []) > 0)
            ?? $hubs->first();
    }

    /** Called when the first hub scans the parcel in: writes down the way it will go, through the gateways. */
    public function plan(Parcel $parcel, SortingCenter $hub): void
    {
        if (! self::ready() || $parcel->hubStops()->exists()) {
            return;
        }

        $parcel->hubStops()->create(['position' => 0, 'sorting_center_id' => $hub->id, 'arrived_at' => now()]);
        if ($next = $this->deliveringHub($parcel, $hub)) {
            foreach ($this->legs($hub, $next) as $i => [$stop, $mode]) {
                $parcel->hubStops()->create(['position' => $i + 1, 'sorting_center_id' => $stop->id, 'mode' => $mode]);
            }
            $parcel->forceFill(['destination_hub_id' => $next->id])->save();
        }
    }

    /**
     * A parcel going back to the seller (return to sender) from a hub that is not the one near the shop: adds the way
     * back, the mirror of the way here, ending at the hub that first received it. Returns that hub, or null when the
     * parcel is already there (or came before transfers, with no stops to follow back).
     */
    public function planReturn(Parcel $parcel): ?SortingCenter
    {
        if (! self::ready() || $parcel->transit_since !== null) {
            return null;
        }
        $stops = $parcel->hubStops()->with('hub')->orderBy('position')->get();
        $origin = $stops->first()?->hub;
        $here = $parcel->sortingCenter;
        if (! $origin || ! $here || $origin->id === $here->id || $stops->contains(fn (ParcelHubStop $s) => $s->arrived_at === null)) {
            return null;
        }

        $position = (int) $stops->max('position');
        foreach ($this->legs($here, $origin) as [$stop, $mode]) {
            $parcel->hubStops()->create(['position' => ++$position, 'sorting_center_id' => $stop->id, 'mode' => $mode, 'direction' => ParcelHubStop::DIRECTION_RETURN]);
        }
        $this->machine->recordEvent($parcel->order, 'return_route', 'system', null,
            "Going back to the seller through {$origin->hub_name}.", ['tracking_number' => $parcel->tracking_number, 'to_hub_id' => $origin->id]);

        return $origin;
    }

    /**
     * The stops after $from on the way to $to, each with how the parcel gets there. Within a region it is one truck
     * ride. Between regions it goes through both regional gateways, and between island groups also through both island
     * gateways, crossing by sea. A courier without gateways goes straight, as before.
     *
     * @return list<array{0: SortingCenter, 1: string}>
     */
    public function legs(SortingCenter $from, SortingCenter $to): array
    {
        $company = LogisticsCompany::effectiveId($from->logistics_company_id);
        $path = [$from];
        if ($this->regionOf($from) === null || $this->regionOf($from) !== $this->regionOf($to)) {
            $path[] = $this->regionGateway($company, $this->regionOf($from));
            if ($this->islandOf($from) !== $this->islandOf($to)) {
                $path[] = $this->islandGateway($company, $this->islandOf($from));
                $path[] = $this->islandGateway($company, $this->islandOf($to));
            }
            $path[] = $this->regionGateway($company, $this->regionOf($to));
        }
        $path[] = $to;

        // No gaps, no hub twice: a loop back to a hub already on the way is cut out.
        $clean = [];
        foreach ($path as $hub) {
            if (! $hub) {
                continue;
            }
            $at = array_search($hub->id, array_map(fn (SortingCenter $h) => $h->id, $clean), true);
            $clean = $at === false ? [...$clean, $hub] : array_slice($clean, 0, $at + 1);
        }

        $legs = [];
        for ($i = 1; $i < count($clean); $i++) {
            $crossesSea = $this->islandOf($clean[$i - 1]) !== null && $this->islandOf($clean[$i - 1]) !== $this->islandOf($clean[$i]);
            $legs[] = [$clean[$i], $crossesSea ? TruckTrip::MODE_SEA : TruckTrip::MODE_TRUCK];
        }

        return $legs;
    }

    /** The next stop this parcel has to be sent on to from where it is now, or null. */
    public function nextStop(Parcel $parcel): ?ParcelHubStop
    {
        if (! self::ready() || $parcel->transit_since !== null) {
            return null;
        }
        if ($parcel->status === Parcel::STATUS_AT_SORTING_CENTER && ! $parcel->awaitingTransfer()) {
            return null;
        }
        if (! in_array($parcel->status, [Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_RETURN_TO_SENDER], true)) {
            return null;
        }

        return $parcel->hubStops()->with('hub')->whereNull('arrived_at')->orderBy('position')->first();
    }

    /** The hub this parcel has to be sent on to from where it is now, or null. */
    public function nextHub(Parcel $parcel): ?SortingCenter
    {
        return $this->nextStop($parcel)?->hub;
    }

    /** True while a parcel going back to the seller still has hubs to pass before the one near the shop. */
    public function returnStillTravelling(Parcel $parcel): bool
    {
        return self::ready() && $parcel->status === Parcel::STATUS_RETURN_TO_SENDER
            && ($parcel->transit_since !== null || $parcel->hubStops()->where('direction', ParcelHubStop::DIRECTION_RETURN)->whereNull('arrived_at')->exists());
    }

    // ── The network ──────────────────────────────────────────────────────────

    /** @var array<string, SortingCenter|null> */
    private array $gateways = [];

    public function regionGateway(?int $companyId, ?string $region): ?SortingCenter
    {
        if ($region === null) {
            return null;
        }

        return $this->gateways["r{$companyId}-{$region}"] ??= $this->companyHubs($companyId)->where('gateway_region_code', $region)->orderBy('id')->first();
    }

    public function islandGateway(?int $companyId, ?string $island): ?SortingCenter
    {
        if ($island === null) {
            return null;
        }

        return $this->gateways["i{$companyId}-{$island}"] ??= $this->companyHubs($companyId)->where('is_island_gateway', true)->where('island_group', $island)->orderBy('id')->first();
    }

    public function regionOf(SortingCenter $hub): ?string
    {
        return $hub->region_code ?? PhRegions::regionOf((string) (($hub->coverage_barangays ?? [])[0] ?? ''));
    }

    public function islandOf(SortingCenter $hub): ?string
    {
        return $hub->island_group ?? PhPlaces::islandOf($this->regionOf($hub));
    }

    /** @return \Illuminate\Database\Eloquent\Builder<SortingCenter> approved hubs of one courier (null: hubs with none) */
    private function companyHubs(?int $companyId)
    {
        $query = SortingCenter::where('status', SortingCenter::STATUS_APPROVED);

        return $companyId === null ? $query->whereNull('logistics_company_id') : LogisticsCompany::constrain($query, $companyId);
    }

    /**
     * The hub sends the parcel on, on a truck trip when the hub picked a driver. The caller holds the row lock and has
     * checked that it may.
     */
    public function send(Parcel $parcel, User $by, string $actorType = 'hub', ?TruckTrip $trip = null): SortingCenter
    {
        $stops = $parcel->hubStops()->with('hub')->orderBy('position')->get();
        $current = $stops->last(fn (ParcelHubStop $stop) => $stop->arrived_at !== null && $stop->departed_at === null);
        $next = $stops->first(fn (ParcelHubStop $stop) => $stop->arrived_at === null);

        $now = now();
        $current?->update(['departed_at' => $now]);
        if ($trip) {
            // A gateway may fly a leg that was planned by sea.
            $next->update(['truck_trip_id' => $trip->id, 'mode' => $trip->mode ?? TruckTrip::MODE_TRUCK]);
        }
        $parcel->forceFill(['sorting_center_id' => $next->sorting_center_id, 'transit_since' => $now])->save();

        $how = match ($trip?->mode) {
            TruckTrip::MODE_SEA => ' on a ship' . ($trip->carrier_name ? " ({$trip->carrier_name})" : ''),
            TruckTrip::MODE_AIR => ' on a plane' . ($trip->carrier_name ? " ({$trip->carrier_name})" : ''),
            null                => '',
            default             => ' on a truck',
        };
        $back = $next->direction === ParcelHubStop::DIRECTION_RETURN ? 'On its way back to the seller: package left ' : 'Package left ';
        $this->machine->recordEvent($parcel->order, 'hub_departed', $actorType, $by->id,
            $back . ($current?->hub?->hub_name ?? 'the hub') . $how . '. Next stop: ' . $next->hub?->hub_name . '.',
            array_filter(['from_hub_id' => $current?->sorting_center_id, 'to_hub_id' => $next->sorting_center_id, 'tracking_number' => $parcel->tracking_number,
                'truck_trip' => $trip?->code, 'mode' => $trip?->mode]));
        if ($next->hub) {
            app(\App\Services\Notifier::class)->transferSent($parcel, $current?->hub, $next->hub);
        }

        return $next->hub;
    }

    /** The next hub scans the parcel in. From here its own lists treat it as any parcel it received. */
    public function arrive(Parcel $parcel, SortingCenter $hub, User $by, string $actorType = 'hub'): void
    {
        $now = now();
        $from = $parcel->hubStops()->with('hub')->whereNotNull('departed_at')->orderByDesc('position')->first()?->hub;
        $stop = $parcel->hubStops()->where('sorting_center_id', $hub->id)->whereNull('arrived_at')->orderBy('position')->first();
        $stop?->update(['arrived_at' => $now]);
        $parcel->forceFill(['transit_since' => null, 'scanned_in_at' => $now])->save();
        if ($stop) {
            app(TruckTrips::class)->parcelArrived($stop);
        }

        $where = $hub->address_city ? " in {$hub->address_city}" : '';
        $this->machine->recordEvent($parcel->order, 'hub_arrived', $actorType, $by->id, "Package arrived at {$hub->hub_name}{$where}.",
            ['sorting_center_id' => $hub->id, 'tracking_number' => $parcel->tracking_number]);
        app(\App\Services\Notifier::class)->transferArrived($parcel, $from, $hub);
    }

    /** The hub a parcel on its way here is coming from. */
    public function comingFrom(Parcel $parcel): ?string
    {
        if (! self::ready() || $parcel->transit_since === null) {
            return null;
        }

        return $parcel->hubStops()->with('hub')->whereNotNull('departed_at')->orderByDesc('position')->first()?->hub?->hub_name;
    }

    /**
     * The hubs a parcel goes through, in order, as names. Before any hub has scanned it this is the plan: the given hub
     * (the rider's), then the one that delivers.
     *
     * @return list<string>
     */
    public function path(Parcel $parcel, ?SortingCenter $riderHub = null): array
    {
        return array_map(fn (SortingCenter $hub) => (string) $hub->hub_name, $this->hubsOnTheWay($parcel, $riderHub));
    }

    /**
     * A shop's parcels by the way they go, for a rider collecting them. They can go to different hubs after the first.
     *
     * @return list<array{path: list<string>, parcel_count: int, tracking_number: string}>
     */
    public function groupedPaths(Collection $parcels, ?SortingCenter $riderHub): array
    {
        return $parcels
            ->map(fn (Parcel $parcel) => ['path' => $this->path($parcel, $riderHub), 'tracking_number' => (string) $parcel->tracking_number])
            ->groupBy(fn (array $row) => implode('|', $row['path']))
            ->map(fn (Collection $rows) => [
                'path'            => $rows->first()['path'],
                'parcel_count'    => $rows->count(),
                'tracking_number' => $rows->first()['tracking_number'],
            ])
            ->values()
            ->all();
    }

    /**
     * The whole way as a timeline: the shop, each hub, and the buyer's barangay. Never names the buyer, because a rider
     * collecting from the shop sees this too.
     *
     * @return list<array<string, mixed>>
     */
    public function journey(Parcel $parcel, ?SortingCenter $riderHub = null): array
    {
        $pickup = $parcel->pickup_address_snapshot ?? [];
        $recipient = $parcel->recipient_snapshot ?? [];
        $status = (string) $parcel->status;
        $pickedUp = $parcel->picked_up_at !== null || ! in_array($status, [Parcel::STATUS_READY_FOR_PICKUP], true);
        $leftHubs = $parcel->out_for_delivery_at !== null
            || in_array($status, [Parcel::STATUS_OUT_FOR_DELIVERY, Parcel::STATUS_DELIVERED, Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURN_TO_SENDER, Parcel::STATUS_RETURNED], true);
        $delivered = $status === Parcel::STATUS_DELIVERED;

        $nodes = [[
            'kind'     => 'shop',
            'title'    => (string) ($pickup['shop_name'] ?? 'The shop'),
            'subtitle' => $this->place($pickup['barangay'] ?? $parcel->pickup_barangay, $pickup['city'] ?? null),
            'state'    => $pickedUp ? 'done' : 'current',
            'label'    => $pickedUp ? 'Picked up' : 'Waiting for pickup',
            'at'       => $parcel->picked_up_at?->toIso8601String(),
        ]];

        $way = $this->wayOf($parcel, $riderHub);
        $forward = array_values(array_filter($way, fn (array $w) => $w['direction'] === ParcelHubStop::DIRECTION_FORWARD));
        $arrivedAnywhere = false;
        foreach ($forward as $index => $w) {
            $hub = $w['hub'];
            $stop = $w['stop'];
            $last = $index === count($forward) - 1;
            // A parcel from before transfers has no stops: it reached its one hub when it was scanned in.
            $arrived = $stop ? $stop->arrived_at : ($parcel->transit_since === null ? $parcel->scanned_in_at : null);
            $departed = $stop?->departed_at ?? ($last && $leftHubs ? $parcel->out_for_delivery_at : null);
            $gone = $departed !== null || ($leftHubs && $arrived !== null);
            $movingHere = $arrived === null && (($parcel->transit_since !== null && $parcel->sorting_center_id === $hub->id && $stop?->direction !== ParcelHubStop::DIRECTION_RETURN)
                || (! $arrivedAnywhere && $status === Parcel::STATUS_PICKED_UP));
            $arrivedAnywhere = $arrivedAnywhere || $arrived !== null;

            $nodes[] = $this->hubNode($hub, $w['mode'], $index === 0 ? null : $w['mode'], [
                'state'       => $gone ? 'done' : ($arrived !== null ? 'current' : 'upcoming'),
                'moving_here' => $movingHere,
                'label'       => match (true) {
                    $gone       => 'Left this hub',
                    $arrived !== null => 'At this hub',
                    $movingHere => 'On the way here',
                    default     => $last && count($forward) > 1 ? 'Delivering hub' : ($hub->isGateway() ? 'Gateway' : 'Next hub'),
                },
                'at'          => $arrived?->toIso8601String(),
                'left_at'     => $departed?->toIso8601String(),
            ]);
        }

        // The way back to the seller, when the parcel has to pass hubs again (return to sender from far away).
        foreach (array_values(array_filter($way, fn (array $w) => $w['direction'] === ParcelHubStop::DIRECTION_RETURN)) as $w) {
            $stop = $w['stop'];
            $movingHere = $stop->arrived_at === null && $parcel->transit_since !== null && $parcel->sorting_center_id === $w['hub']->id;
            $nodes[] = $this->hubNode($w['hub'], $w['mode'], $w['mode'], [
                'direction'   => 'return',
                'state'       => $stop->departed_at ? 'done' : ($stop->arrived_at ? 'current' : 'upcoming'),
                'moving_here' => $movingHere,
                'label'       => match (true) {
                    $stop->departed_at !== null => 'Left this hub',
                    $stop->arrived_at !== null  => 'Back at this hub',
                    $movingHere                 => 'On the way back here',
                    default                     => 'On the way back',
                },
                'at'          => $stop->arrived_at?->toIso8601String(),
                'left_at'     => $stop->departed_at?->toIso8601String(),
            ]);
        }

        $goingBack = in_array($status, [Parcel::STATUS_RETURN_TO_SENDER, Parcel::STATUS_RETURNED], true);
        $nodes[] = $goingBack ? [
            'kind'     => 'return',
            'title'    => 'Back to the seller',
            'subtitle' => '',
            'state'    => $status === Parcel::STATUS_RETURNED ? 'done' : 'current',
            'label'    => $status === Parcel::STATUS_RETURNED ? 'Returned' : 'On the way back',
            'at'       => $parcel->returned_at?->toIso8601String(),
        ] : [
            'kind'        => 'buyer',
            'title'       => 'Delivery to ' . ($recipient['barangay'] ?? $parcel->destination_barangay ?? 'the buyer'),
            'subtitle'    => $this->place($recipient['city'] ?? null, $recipient['province'] ?? null),
            'state'       => $delivered ? 'done' : 'upcoming',
            'moving_here' => $status === Parcel::STATUS_OUT_FOR_DELIVERY,
            'label'       => match (true) {
                $delivered => 'Delivered',
                $status === Parcel::STATUS_OUT_FOR_DELIVERY => 'Out for delivery',
                $status === Parcel::STATUS_DELIVERY_FAILED  => 'Delivery failed',
                default    => 'Last stop',
            },
            'at'          => $parcel->delivered_at?->toIso8601String(),
        ];

        return $nodes;
    }

    /** @return list<SortingCenter> */
    private function hubsOnTheWay(Parcel $parcel, ?SortingCenter $riderHub): array
    {
        return array_map(fn (array $w) => $w['hub'], array_values(array_filter($this->wayOf($parcel, $riderHub), fn (array $w) => $w['direction'] === ParcelHubStop::DIRECTION_FORWARD)));
    }

    /**
     * Every hub on the parcel's way with how it gets there. Before any hub has scanned it this is the plan: the given
     * hub (the rider's), the gateways, then the one that delivers.
     *
     * @return list<array{hub: SortingCenter, stop: ?ParcelHubStop, mode: string, direction: string}>
     */
    public function wayOf(Parcel $parcel, ?SortingCenter $riderHub = null): array
    {
        if (self::ready()) {
            $stops = $parcel->relationLoaded('hubStops') ? $parcel->hubStops->sortBy('position')->values() : $parcel->hubStops()->with('hub')->orderBy('position')->get();
            if ($stops->isNotEmpty()) {
                return $stops->filter(fn (ParcelHubStop $s) => $s->hub !== null)->map(fn (ParcelHubStop $s) => [
                    'hub' => $s->hub, 'stop' => $s, 'mode' => (string) ($s->mode ?: TruckTrip::MODE_TRUCK),
                    'direction' => (string) ($s->direction ?: ParcelHubStop::DIRECTION_FORWARD),
                ])->values()->all();
            }
        }

        $first = $parcel->sortingCenter ?? $riderHub;
        if (! $first) {
            return [];
        }
        $way = [['hub' => $first, 'stop' => null, 'mode' => TruckTrip::MODE_TRUCK, 'direction' => ParcelHubStop::DIRECTION_FORWARD]];
        // Scanned in before transfers existed: it stays at its hub.
        $next = self::ready() && $parcel->scanned_in_at === null ? $this->deliveringHub($parcel, $first) : null;
        if ($next) {
            foreach ($this->legs($first, $next) as [$hub, $mode]) {
                $way[] = ['hub' => $hub, 'stop' => null, 'mode' => $mode, 'direction' => ParcelHubStop::DIRECTION_FORWARD];
            }
        }

        return $way;
    }

    /** @param array<string, mixed> $state */
    private function hubNode(SortingCenter $hub, string $mode, ?string $arrivesBy, array $state): array
    {
        return array_merge([
            'kind'       => 'hub',
            'title'      => (string) $hub->hub_name,
            'subtitle'   => $this->place($hub->address_city, $hub->address_province),
            'gateway'    => $hub->gatewayLabel(),
            // How the parcel gets to this hub from the one before (null for the first hub).
            'arrives_by' => $arrivesBy,
            'direction'  => 'forward',
        ], $state);
    }

    private function covers(SortingCenter $hub, string $code): bool
    {
        return in_array($code, array_map('strval', $hub->coverage_barangays ?? []), true);
    }

    private function place(?string $first, ?string $second): string
    {
        return implode(', ', array_filter([trim((string) $first), trim((string) $second)]));
    }
}
