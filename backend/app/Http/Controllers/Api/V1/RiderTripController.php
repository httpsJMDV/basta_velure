<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Rider;
use App\Models\TruckTrip;
use App\Services\Courier\TruckTrips;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * A truck driver's trips between hubs: the one on the way now, the ones before it, and the trip pay the courier owes.
 */
class RiderTripController extends Controller
{
    public function __construct(private readonly TruckTrips $trucks)
    {
    }

    /** GET /api/v1/rider/trips */
    public function index(Request $request): JsonResponse
    {
        $driver = $this->driver($request);
        $current = $this->trucks->currentTrip($driver);
        $past = TruckTrip::where('driver_id', $driver->id)
            ->when($current, fn ($q) => $q->whereKeyNot($current->id))
            ->latest('departed_at')->latest('id')
            ->limit(50)->get();

        return response()->json([
            'data' => [
                'is_truck_driver' => $driver->isTruckDriver(),
                'current'         => $current ? $this->trucks->payload($current, true) : null,
                'trips'           => $past->map(fn (TruckTrip $t) => $this->trucks->payload($t))->values(),
                'pay'             => $this->trucks->payFor($driver),
            ],
        ]);
    }

    /** POST /api/v1/rider/trips/{trip}/arrived: the truck is at the next hub's dock. */
    public function arrived(Request $request, int $trip): JsonResponse
    {
        $driver = $this->driver($request);

        return DB::transaction(function () use ($driver, $trip) {
            $row = TruckTrip::where('driver_id', $driver->id)->lockForUpdate()->find($trip);
            abort_unless($row, 404, 'Trip not found.');
            $row = $this->trucks->reportArrival($row, $driver->loadMissing('user'));

            return response()->json([
                'message' => 'The hub was told you are there. Hand over the parcels so they can scan them in.',
                'data'    => $this->trucks->payload($row, true),
            ]);
        });
    }

    private function driver(Request $request): Rider
    {
        return Rider::with('user')->where('user_id', $request->user()->id)->firstOrFail();
    }
}
