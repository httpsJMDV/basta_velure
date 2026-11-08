<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Services\Courier\HubRouter;
use App\Services\Courier\ReturnPickups;
use App\Services\Courier\TruckTrips;
use App\Support\PhMobile;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The hub's side of hub-to-hub transfers: parcels this hub received for a barangay another hub of the courier covers.
 * The parcels coming the other way show under Expected on the intake page, and are scanned in there.
 */
class HubTransferController extends Controller
{
    protected const MAX_SEND_BATCH = 200;

    public function __construct(protected HubRouter $router, protected TruckTrips $trucks)
    {
    }

    /**
     * GET /api/v1/hub/transfers: what to send on, grouped by the next hub and how it goes there (truck, or ship and
     * plane at an island gateway), oldest first. Parcels for buyers, parcels going back to their seller, and buyers'
     * returned items travel together.
     */
    public function index(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        if (! HubRouter::ready()) {
            return response()->json(['data' => [], 'meta' => ['total_parcels' => 0, 'on_the_way_here' => 0, 'sent_today' => 0, 'is_gateway' => false]]);
        }

        $parcels = Parcel::with(['hubStops.hub', 'destinationHub'])
            ->where('sorting_center_id', $hub->id)
            ->waitingToSend()
            ->orderBy('scanned_in_at')->orderBy('id')
            ->get();
        $items = $parcels->map(function (Parcel $p) {
            $next = $p->hubStops->sortBy('position')->first(fn (ParcelHubStop $s) => $s->arrived_at === null);
            $last = $p->hubStops->sortByDesc('position')->first();

            return $next ? [
                'kind' => $p->status === Parcel::STATUS_RETURN_TO_SENDER ? 'return_to_sender' : 'parcel', 'code' => (string) $p->tracking_number,
                'next' => $next->hub, 'mode' => (string) ($next->mode ?: TruckTrip::MODE_TRUCK), 'final' => $last?->hub, 'since' => $p->scanned_in_at,
            ] : null;
        })->filter();

        $returns = ReturnPickup::with(['stops.hub', 'destinationHub'])
            ->where('current_hub_id', $hub->id)->where('status', ReturnPickup::STATUS_AT_HUB)->whereNull('transit_since')
            ->oldest('dropped_at')->get()
            ->map(function (ReturnPickup $r) {
                $next = $r->stops->first(fn ($s) => $s->arrived_at === null);
                $here = $r->stops->last(fn ($s) => $s->arrived_at !== null);

                return $next ? [
                    'kind' => 'buyer_return', 'code' => (string) $r->code, 'next' => $next->hub, 'mode' => (string) ($next->mode ?: TruckTrip::MODE_TRUCK),
                    'final' => $r->destinationHub, 'since' => $here?->arrived_at ?? $r->dropped_at,
                ] : null;
            })->filter();

        $groups = $items->concat($returns)
            ->filter(fn (array $i) => $i['next'] !== null)
            ->groupBy(fn (array $i) => $i['next']->id . '|' . ($i['mode'] === TruckTrip::MODE_TRUCK ? 'truck' : 'cargo'))
            ->map(function ($rows) {
                $to = $rows->first()['next'];
                $finals = $rows->pluck('final')->filter()->unique('id')->reject(fn ($h) => $h->id === $to->id);
                $oldest = $rows->pluck('since')->filter()->min();

                return [
                    'hub'                  => ['id' => $to->id, 'name' => (string) $to->hub_name, 'city' => (string) $to->address_city, 'province' => (string) $to->address_province, 'gateway' => $to->gatewayLabel()],
                    // truck, or sea for a crossing between island groups (the gateway may send it by air instead).
                    'mode'                 => $rows->first()['mode'],
                    'parcel_count'         => $rows->count(),
                    'counts'               => [
                        'parcels'          => $rows->where('kind', 'parcel')->count(),
                        'return_to_sender' => $rows->where('kind', 'return_to_sender')->count(),
                        'buyer_returns'    => $rows->where('kind', 'buyer_return')->count(),
                    ],
                    // Where the parcels finally go after that hub (for a gateway, the delivering hubs beyond it).
                    'final_hubs'           => $finals->take(5)->map(fn ($h) => (string) $h->hub_name)->values(),
                    'final_hub_count'      => $finals->count(),
                    'oldest_scanned_in_at' => $oldest ? \Illuminate\Support\Carbon::parse($oldest)->toIso8601String() : null,
                    'tracking_numbers'     => $rows->where('kind', '!=', 'buyer_return')->pluck('code')->values(),
                    'return_codes'         => $rows->where('kind', 'buyer_return')->pluck('code')->values(),
                ];
            })
            ->sortBy('oldest_scanned_in_at')
            ->values();

        $startOfDay = Carbon::now('Asia/Manila')->startOfDay()->utc();

        return response()->json([
            'data' => $groups,
            'meta' => [
                'total_parcels'   => $groups->sum('parcel_count'),
                'on_the_way_here' => Parcel::where('sorting_center_id', $hub->id)->whereNotNull('transit_since')->count()
                    + ReturnPickup::where('current_hub_id', $hub->id)->whereNotNull('transit_since')->count(),
                'sent_today'      => ParcelHubStop::where('sorting_center_id', $hub->id)->where('departed_at', '>=', $startOfDay)->count(),
                'is_gateway'      => $hub->isGateway(),
                'gateway'         => $hub->gatewayLabel(),
                'carriers'        => self::CARRIER_SUGGESTIONS,
                'cargo_days'      => config('logistics.cargo_days'),
            ],
        ]);
    }

    /** Names a gateway can pick from when it loads a ship or a plane (it can type any other). */
    protected const CARRIER_SUGGESTIONS = [
        'sea' => ['Roll-on/roll-off ferry', 'Container ship', 'Inter-island cargo vessel'],
        'air' => ['Domestic air cargo', 'Passenger flight belly cargo'],
    ];

    /**
     * POST /api/v1/hub/transfers/send {tracking_numbers?, return_codes?, mode?, driver_id?, carrier_name?,
     * carrier_reference?, eta?}: all or nothing, like sorting. Everything on one trip goes to the same next hub.
     * By truck (the default) the courier's driver takes it; across the sea the island gateway puts it on a ship or a
     * plane with the carrier's reference.
     */
    public function send(Request $request): JsonResponse
    {
        foreach (['tracking_numbers', 'return_codes'] as $key) {
            $input = $request->input($key);
            if (is_array($input)) {
                $request->merge([$key => array_map(fn ($tn) => is_string($tn) ? Str::upper(trim($tn)) : $tn, $input)]);
            }
        }
        $validated = $request->validate([
            'tracking_numbers'   => ['nullable', 'array', 'max:' . self::MAX_SEND_BATCH, 'required_without:return_codes'],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
            'return_codes'       => ['nullable', 'array', 'max:' . self::MAX_SEND_BATCH],
            'return_codes.*'     => ['required', 'string', 'max:30', 'distinct'],
            'mode'               => ['nullable', 'in:' . implode(',', TruckTrip::MODES)],
            'driver_id'          => ['nullable', 'integer'],
            'carrier_name'       => ['nullable', 'string', 'max:80'],
            'carrier_reference'  => ['nullable', 'string', 'max:40'],
            'eta'                => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today'],
        ], [
            'tracking_numbers.required_without' => 'Choose the parcels to send.',
            'eta.after_or_equal'                => 'The arrival date cannot be in the past.',
        ]);

        $hub = $this->hub($request);
        $numbers = array_values($validated['tracking_numbers'] ?? []);
        $codes = array_values($validated['return_codes'] ?? []);
        $mode = $validated['mode'] ?? TruckTrip::MODE_TRUCK;
        $cargo = $mode !== TruckTrip::MODE_TRUCK;

        if ($cargo) {
            if (! $hub->is_island_gateway) {
                return $this->fail('mode', 'Only an island gateway sends parcels by ship or plane.');
            }
            if (trim((string) ($validated['carrier_name'] ?? '')) === '') {
                return $this->fail('carrier_name', 'Say which ship or flight carries them.');
            }
            if (trim((string) ($validated['carrier_reference'] ?? '')) === '') {
                return $this->fail('carrier_reference', $mode === TruckTrip::MODE_AIR ? 'Enter the air waybill number.' : 'Enter the bill of lading number.');
            }
        }

        // Once the courier has truck drivers, every truck leg goes on a trip with one of them.
        $driverId = $cargo ? null : ($validated['driver_id'] ?? null);
        if (! $cargo && $driverId === null && $this->trucks->driversFor($hub)->isNotEmpty()) {
            return $this->fail('driver_id', 'Choose the truck driver taking these parcels.');
        }
        $driver = $driverId !== null ? $this->trucks->assertCanDrive($hub, (int) $driverId) : null;

        return DB::transaction(function () use ($request, $hub, $numbers, $codes, $driver, $mode, $cargo, $validated) {
            $parcels = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->whereIn('tracking_number', $numbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');
            $returns = ReturnPickup::with('order')->where('current_hub_id', $hub->id)->whereIn('code', $codes)->lockForUpdate()->get()->keyBy('code');

            $errors = [];
            $nextStops = [];
            foreach ($numbers as $index => $number) {
                $parcel = $parcels->get($number);
                $next = $parcel ? $this->router->nextStop($parcel) : null;
                if (! $parcel) {
                    $errors["tracking_numbers.{$index}"] = ['Parcel not found for this hub.'];
                } elseif (! $next) {
                    $errors["tracking_numbers.{$index}"] = ['This parcel is not waiting to go to another hub.'];
                } else {
                    $nextStops[] = $next;
                }
            }
            foreach ($codes as $index => $code) {
                $item = $returns->get($code);
                $next = $item ? app(ReturnPickups::class)->nextStop($item) : null;
                if (! $next) {
                    $errors["return_codes.{$index}"] = [$item ? 'This returned item is not waiting to go to another hub.' : 'Returned item not found at this hub.'];
                } else {
                    $nextStops[] = $next;
                }
            }
            if ($errors !== []) {
                return response()->json(['message' => 'One or more parcels cannot be sent. Nothing was changed.', 'errors' => $errors], 422);
            }

            // A crossing between island groups goes by ship or plane, and only a crossing does.
            $crossing = collect($nextStops)->contains(fn ($s) => in_array($s->mode, [TruckTrip::MODE_SEA, TruckTrip::MODE_AIR], true));
            $byLand = collect($nextStops)->contains(fn ($s) => ! in_array($s->mode, [TruckTrip::MODE_SEA, TruckTrip::MODE_AIR], true));
            if ($crossing && $byLand) {
                return $this->fail('tracking_numbers', 'Some of these go by land and some across the sea. Send them separately.');
            }
            if ($crossing && ! $cargo) {
                return $this->fail('mode', 'These parcels cross to another island group. Send them by ship or plane.');
            }
            if ($cargo && ! $crossing) {
                return $this->fail('mode', 'These parcels stay on this island group. Send them by truck.');
            }

            $trip = null;
            $destinations = collect($nextStops)->map(fn ($s) => $s->sorting_center_id)->unique();
            if ($driver || $cargo) {
                // A truck, a ship or a plane goes to one hub.
                if ($destinations->count() > 1) {
                    return $this->fail($cargo ? 'mode' : 'driver_id', 'One trip goes to one hub. Send each hub\'s parcels on their own trip.');
                }
                $eta = isset($validated['eta']) ? Carbon::parse($validated['eta'], 'Asia/Manila')->endOfDay() : null;
                $trip = $this->trucks->start($hub, SortingCenter::findOrFail($destinations->first()), $driver, count($nextStops), $request->user(), $mode,
                    $cargo ? trim((string) $validated['carrier_name']) : null, $cargo ? trim((string) $validated['carrier_reference']) : null, $eta);
            }

            $going = [];
            foreach ($parcels as $parcel) {
                $going[$this->router->send($parcel, $request->user(), 'hub', $trip)->hub_name] = true;
            }
            foreach ($returns as $item) {
                if ($to = app(ReturnPickups::class)->send($item, $request->user(), $trip)) {
                    $going[$to->hub_name] = true;
                }
            }
            $count = count($nextStops);
            $how = match (true) {
                $trip?->mode === TruckTrip::MODE_SEA => " on {$trip->carrier_name} (trip {$trip->code})",
                $trip?->mode === TruckTrip::MODE_AIR => " on {$trip->carrier_name} (trip {$trip->code})",
                $trip !== null                       => ' with ' . $this->trucks->name($driver) . " (trip {$trip->code})",
                default                              => '',
            };

            return response()->json([
                'message'    => ($count === 1 ? 'Parcel sent' : "{$count} parcels sent") . $how . '.',
                'sent_count' => $count,
                'to'         => array_keys($going),
                'trip'       => $trip ? $this->trucks->payload($trip) : null,
            ]);
        });
    }

    /**
     * POST /api/v1/hub/truck-trips/{trip}/receive {missing?: [tracking numbers]}: the next hub receives a whole truck (or
     * ship or plane) at once, like scanning one sack instead of every parcel. Parcels named as missing stay expected (a
     * scan finds them later, or the courier closes the trip). Only the hub the trip is going to, while it is on the way.
     */
    public function receiveTrip(Request $request, int $trip): JsonResponse
    {
        $hub = $this->hub($request);
        $data = $request->validate([
            'missing'   => ['nullable', 'array', 'max:' . self::MAX_SEND_BATCH],
            'missing.*' => ['string', 'max:50'],
        ]);
        $missing = array_map(fn ($tn) => Str::upper(trim((string) $tn)), $data['missing'] ?? []);

        return DB::transaction(function () use ($request, $hub, $trip, $missing) {
            $row = TruckTrip::where('to_hub_id', $hub->id)->lockForUpdate()->find($trip);
            abort_unless($row, 404, 'Trip not found.');
            if ($row->status !== TruckTrip::STATUS_ON_THE_WAY) {
                return response()->json(['message' => 'This trip is already finished.'], 409);
            }

            $parcels = Parcel::with('order')
                ->whereIn('id', ParcelHubStop::where('truck_trip_id', $row->id)->whereNull('arrived_at')->select('parcel_id'))
                ->where('sorting_center_id', $hub->id)->whereNotNull('transit_since')
                ->lockForUpdate()->get();
            $received = 0;
            foreach ($parcels as $parcel) {
                if (in_array(Str::upper((string) $parcel->tracking_number), $missing, true)) {
                    continue;
                }
                $this->router->arrive($parcel, $hub, $request->user());
                $received++;
            }
            $items = ReturnPickup::with('order')
                ->whereIn('id', \App\Models\ReturnPickupStop::where('truck_trip_id', $row->id)->whereNull('arrived_at')->select('return_pickup_id'))
                ->where('current_hub_id', $hub->id)->whereNotNull('transit_since')
                ->lockForUpdate()->get();
            foreach ($items as $item) {
                if (in_array(Str::upper((string) $item->code), $missing, true)) {
                    continue;
                }
                app(ReturnPickups::class)->arrive($item, $hub, $request->user());
                $received++;
            }
            $row->refresh();

            return response()->json([
                'message' => $row->status === TruckTrip::STATUS_COMPLETED
                    ? "Received all {$row->parcel_count} parcels of trip {$row->code}. Sort them as usual."
                    : "Received {$received} parcels. " . ($row->parcel_count - $row->received_count) . ' are still missing; scan them in when found, or ask the courier to close the trip.',
                'received' => $received,
                'data'     => $this->trucks->payload($row, true),
            ]);
        });
    }

    private function fail(string $field, string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'errors' => [$field => [$message]]], 422);
    }

    /** GET /api/v1/hub/truck-drivers: the courier's active truck drivers, and whether each is free to drive now. */
    public function drivers(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $drivers = $this->trucks->driversFor($hub);
        $busy = TruckTrip::whereIn('driver_id', $drivers->pluck('id'))->where('status', TruckTrip::STATUS_ON_THE_WAY)
            ->with('toHub:id,hub_name')->get()->keyBy('driver_id');

        return response()->json(['data' => $drivers->map(fn (Rider $r) => [
            'id'           => $r->id,
            'name'         => $this->trucks->name($r),
            'phone'        => PhMobile::local($r->user?->phone),
            'vehicle_type' => $r->vehicle_type,
            'plate_number' => $r->plate_number,
            'home_hub'     => $r->sortingCenter?->hub_name,
            'busy'         => $busy->has($r->id),
            'on_trip_to'   => $busy->get($r->id)?->toHub?->hub_name,
        ])->values()]);
    }

    /** GET /api/v1/hub/truck-trips?direction=out|in: trips that left this hub, or are coming to it. */
    public function trips(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $incoming = $request->query('direction') === 'in';

        $trips = TruckTrip::where($incoming ? 'to_hub_id' : 'from_hub_id', $hub->id)
            ->orderByRaw("CASE status WHEN 'on_the_way' THEN 0 ELSE 1 END")
            ->latest('departed_at')->latest('id')
            ->limit(50)->get();

        return response()->json([
            'data' => $trips->map(fn (TruckTrip $t) => $this->trucks->payload($t, true))->values(),
            'meta' => [
                'on_the_way' => TruckTrip::where($incoming ? 'to_hub_id' : 'from_hub_id', $hub->id)->where('status', TruckTrip::STATUS_ON_THE_WAY)->count(),
            ],
        ]);
    }

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }
}
