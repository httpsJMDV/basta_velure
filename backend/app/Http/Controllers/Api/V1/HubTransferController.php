<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Services\Courier\HubRouter;
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

    /** GET /api/v1/hub/transfers: what to send, by the hub it goes to, oldest first. */
    public function index(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        if (! HubRouter::ready()) {
            return response()->json(['data' => [], 'meta' => ['total_parcels' => 0, 'on_the_way_here' => 0, 'sent_today' => 0]]);
        }

        $groups = Parcel::with('destinationHub')
            ->where('sorting_center_id', $hub->id)
            ->waitingToSend()
            ->orderBy('scanned_in_at')
            ->orderBy('id')
            ->get()
            ->groupBy('destination_hub_id')
            ->map(function ($parcels) {
                $to = $parcels->first()->destinationHub;

                return [
                    'hub'                  => ['id' => $to?->id, 'name' => (string) $to?->hub_name, 'city' => (string) $to?->address_city, 'province' => (string) $to?->address_province],
                    'parcel_count'         => $parcels->count(),
                    'oldest_scanned_in_at' => $parcels->first()->scanned_in_at?->toIso8601String(),
                    'tracking_numbers'     => $parcels->pluck('tracking_number')->values(),
                ];
            })
            ->values();

        $startOfDay = Carbon::now('Asia/Manila')->startOfDay()->utc();

        return response()->json([
            'data' => $groups,
            'meta' => [
                'total_parcels'   => $groups->sum('parcel_count'),
                'on_the_way_here' => Parcel::where('sorting_center_id', $hub->id)->whereNotNull('transit_since')->count(),
                'sent_today'      => ParcelHubStop::where('sorting_center_id', $hub->id)->where('departed_at', '>=', $startOfDay)->count(),
            ],
        ]);
    }

    /** POST /api/v1/hub/transfers/send: all or nothing, like sorting. */
    public function send(Request $request): JsonResponse
    {
        $input = $request->input('tracking_numbers');
        if (is_array($input)) {
            $request->merge(['tracking_numbers' => array_map(fn ($tn) => is_string($tn) ? Str::upper(trim($tn)) : $tn, $input)]);
        }
        $validated = $request->validate([
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_SEND_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
            'driver_id'          => ['nullable', 'integer'],
        ]);

        $hub = $this->hub($request);
        $numbers = array_values($validated['tracking_numbers']);

        // Once the courier has truck drivers, every transfer goes on a truck trip with one of them.
        $driverId = $validated['driver_id'] ?? null;
        if ($driverId === null && $this->trucks->driversFor($hub)->isNotEmpty()) {
            return response()->json([
                'message' => 'Choose the truck driver taking these parcels.',
                'errors'  => ['driver_id' => ['Choose the truck driver taking these parcels.']],
            ], 422);
        }
        $driver = $driverId !== null ? $this->trucks->assertCanDrive($hub, (int) $driverId) : null;

        return DB::transaction(function () use ($request, $hub, $numbers, $driver) {
            $parcels = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->whereIn('tracking_number', $numbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            $errors = [];
            foreach ($numbers as $index => $number) {
                $parcel = $parcels->get($number);
                if (! $parcel) {
                    $errors["tracking_numbers.{$index}"] = ['Parcel not found for this hub.'];
                } elseif ($parcel->status !== Parcel::STATUS_AT_SORTING_CENTER || ! $this->router->nextHub($parcel)) {
                    $errors["tracking_numbers.{$index}"] = ['This parcel is not waiting to go to another hub.'];
                }
            }
            if ($errors !== []) {
                return response()->json(['message' => 'One or more parcels cannot be sent. Nothing was changed.', 'errors' => $errors], 422);
            }

            $trip = null;
            if ($driver) {
                // A truck goes to one hub.
                $destinations = $parcels->map(fn (Parcel $parcel) => $this->router->nextHub($parcel))->unique('id');
                if ($destinations->count() > 1) {
                    return response()->json([
                        'message' => 'A truck goes to one hub. Send each hub\'s parcels on their own trip.',
                        'errors'  => ['driver_id' => ['A truck goes to one hub. Send each hub\'s parcels on their own trip.']],
                    ], 422);
                }
                $trip = $this->trucks->start($hub, $destinations->first(), $driver, $parcels->count(), $request->user());
            }

            $going = [];
            foreach ($parcels as $parcel) {
                $going[$this->router->send($parcel, $request->user(), 'hub', $trip)->hub_name] = true;
            }

            return response()->json([
                'message'    => ($parcels->count() === 1 ? 'Parcel sent' : "{$parcels->count()} parcels sent")
                    . ($trip ? ' with ' . $this->trucks->name($driver) . " (trip {$trip->code})." : '.'),
                'sent_count' => $parcels->count(),
                'to'         => array_keys($going),
                'trip'       => $trip ? $this->trucks->payload($trip) : null,
            ]);
        });
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
