<?php

namespace App\Services\Courier;

use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\OrderStateMachine;
use App\Services\RiderAreaCoverage;
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

    /** @var array<int, Collection<int, SortingCenter>> approved hubs per courier */
    private array $hubs = [];

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

        $others = $this->approvedHubs($from)
            ->filter(fn (SortingCenter $hub) => $hub->id !== $from->id && $this->covers($hub, $code));

        // A hub with a rider who covers the barangay can deliver right away, so it goes first.
        return $others->first(fn (SortingCenter $hub) => count($this->coverage->eligibleByBarangayCode($hub)[$code] ?? []) > 0)
            ?? $others->first();
    }

    /** Called when the first hub scans the parcel in: writes down the way it will go. */
    public function plan(Parcel $parcel, SortingCenter $hub): void
    {
        if (! self::ready() || $parcel->hubStops()->exists()) {
            return;
        }

        $parcel->hubStops()->create(['position' => 0, 'sorting_center_id' => $hub->id, 'arrived_at' => now()]);
        if ($next = $this->deliveringHub($parcel, $hub)) {
            $parcel->hubStops()->create(['position' => 1, 'sorting_center_id' => $next->id]);
            $parcel->forceFill(['destination_hub_id' => $next->id])->save();
        }
    }

    /** The hub this parcel has to be sent on to from where it is now, or null. */
    public function nextHub(Parcel $parcel): ?SortingCenter
    {
        if (! self::ready() || ! $parcel->awaitingTransfer() || $parcel->transit_since !== null) {
            return null;
        }

        return $parcel->hubStops()->with('hub')->whereNull('arrived_at')->orderBy('position')->first()?->hub;
    }

    /** The hub sends the parcel on. The caller holds the row lock and has checked that it may. */
    public function send(Parcel $parcel, User $by, string $actorType = 'hub'): SortingCenter
    {
        $stops = $parcel->hubStops()->with('hub')->orderBy('position')->get();
        $current = $stops->last(fn (ParcelHubStop $stop) => $stop->arrived_at !== null && $stop->departed_at === null);
        $next = $stops->first(fn (ParcelHubStop $stop) => $stop->arrived_at === null);

        $now = now();
        $current?->update(['departed_at' => $now]);
        $parcel->forceFill(['sorting_center_id' => $next->sorting_center_id, 'transit_since' => $now])->save();

        $this->machine->recordEvent($parcel->order, 'hub_departed', $actorType, $by->id,
            'Package left ' . ($current?->hub?->hub_name ?? 'the hub') . '. Next stop: ' . $next->hub?->hub_name . '.',
            ['from_hub_id' => $current?->sorting_center_id, 'to_hub_id' => $next->sorting_center_id, 'tracking_number' => $parcel->tracking_number]);

        return $next->hub;
    }

    /** The next hub scans the parcel in. From here its own lists treat it as any parcel it received. */
    public function arrive(Parcel $parcel, SortingCenter $hub, User $by, string $actorType = 'hub'): void
    {
        $now = now();
        $parcel->hubStops()->where('sorting_center_id', $hub->id)->whereNull('arrived_at')->update(['arrived_at' => $now]);
        $parcel->forceFill(['transit_since' => null, 'scanned_in_at' => $now])->save();

        $where = $hub->address_city ? " in {$hub->address_city}" : '';
        $this->machine->recordEvent($parcel->order, 'hub_arrived', $actorType, $by->id, "Package arrived at {$hub->hub_name}{$where}.",
            ['sorting_center_id' => $hub->id, 'tracking_number' => $parcel->tracking_number]);
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

        $hubs = $this->hubsOnTheWay($parcel, $riderHub);
        $stops = self::ready() ? $parcel->hubStops()->orderBy('position')->get()->keyBy('sorting_center_id') : collect();
        $arrivedAnywhere = false;
        foreach ($hubs as $index => $hub) {
            $stop = $stops->get($hub->id);
            // A parcel from before transfers has no stops: it reached its one hub when it was scanned in.
            $arrived = $stop ? $stop->arrived_at : ($parcel->transit_since === null ? $parcel->scanned_in_at : null);
            $departed = $stop?->departed_at ?? ($index === count($hubs) - 1 && $leftHubs ? $parcel->out_for_delivery_at : null);
            $gone = $departed !== null || ($leftHubs && $arrived !== null);
            $movingHere = $arrived === null && (($parcel->transit_since !== null && $parcel->sorting_center_id === $hub->id)
                || (! $arrivedAnywhere && $status === Parcel::STATUS_PICKED_UP));
            $arrivedAnywhere = $arrivedAnywhere || $arrived !== null;

            $nodes[] = [
                'kind'        => 'hub',
                'title'       => (string) $hub->hub_name,
                'subtitle'    => $this->place($hub->address_city, $hub->address_province),
                'state'       => $gone ? 'done' : ($arrived !== null ? 'current' : 'upcoming'),
                'moving_here' => $movingHere,
                'label'       => match (true) {
                    $gone       => 'Left this hub',
                    $arrived !== null => 'At this hub',
                    $movingHere => 'On the way here',
                    default     => $index === count($hubs) - 1 && count($hubs) > 1 ? 'Delivering hub' : 'Next hub',
                },
                'at'          => $arrived?->toIso8601String(),
                'left_at'     => $departed?->toIso8601String(),
            ];
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
        if (self::ready()) {
            $stops = $parcel->hubStops()->with('hub')->orderBy('position')->get();
            if ($stops->isNotEmpty()) {
                return $stops->map(fn (ParcelHubStop $stop) => $stop->hub)->filter()->values()->all();
            }
        }

        $first = $parcel->sortingCenter ?? $riderHub;
        if (! $first) {
            return [];
        }
        // Scanned in before transfers existed: it stays at its hub.
        $next = self::ready() && $parcel->scanned_in_at === null ? $this->deliveringHub($parcel, $first) : null;

        return array_values(array_filter([$first, $next]));
    }

    private function covers(SortingCenter $hub, string $code): bool
    {
        return in_array($code, array_map('strval', $hub->coverage_barangays ?? []), true);
    }

    /** @return Collection<int, SortingCenter> */
    private function approvedHubs(SortingCenter $from): Collection
    {
        $company = LogisticsCompany::effectiveId($from->logistics_company_id);

        return $this->hubs[(int) $company] ??= SortingCenter::where('status', SortingCenter::STATUS_APPROVED)->orderBy('id')->get()
            ->filter(fn (SortingCenter $hub) => LogisticsCompany::effectiveId($hub->logistics_company_id) === $company)
            ->values();
    }

    private function place(?string $first, ?string $second): string
    {
        return implode(', ', array_filter([trim((string) $first), trim((string) $second)]));
    }
}
