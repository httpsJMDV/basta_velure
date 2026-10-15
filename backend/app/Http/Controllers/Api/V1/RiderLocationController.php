<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\Rider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderLocationController extends Controller
{
    /**
     * Statuses where a rider is carrying, or on the way to collect, one of their parcels. While any exists the
     * rider must share their location (the app blocks the screens until they do).
     */
    private const SHARING_STATUSES = [
        Parcel::STATUS_READY_FOR_PICKUP,
        Parcel::STATUS_PICKED_UP,
        Parcel::STATUS_ASSIGNED_TO_RIDER,
        Parcel::STATUS_OUT_FOR_DELIVERY,
    ];

    /**
     * GET /api/v1/rider/location/status
     *
     * Whether the rider has parcels that need their location shared right now, so the app knows when to ask for it.
     */
    public function status(Request $request): JsonResponse
    {
        $rider = $this->rider($request);

        return response()->json(['data' => [
            'sharing_required' => $this->activeParcels($rider) > 0,
            'active_parcels'   => $this->activeParcels($rider),
            'last_located_at'  => $rider->last_located_at?->toIso8601String(),
        ]]);
    }

    /**
     * POST /api/v1/rider/location { latitude, longitude, heading?, accuracy? }
     *
     * Stores the rider's latest point, replacing the one before it. There is no history. A ping from a rider with
     * nothing to carry is refused with 409, so a rider who is off duty is never tracked.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'latitude'  => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'heading'   => ['nullable', 'numeric', 'between:0,360'],
            'accuracy'  => ['nullable', 'numeric', 'min:0', 'max:100000'],
        ]);

        $rider = $this->rider($request);

        if ($this->activeParcels($rider) === 0) {
            return response()->json(['message' => 'You have no parcels to share your location for.'], 409);
        }

        $rider->forceFill([
            'last_latitude'   => round((float) $data['latitude'], 7),
            'last_longitude'  => round((float) $data['longitude'], 7),
            'last_heading'    => isset($data['heading']) ? (int) round(fmod((float) $data['heading'], 360.0)) : null,
            'last_accuracy_m' => isset($data['accuracy']) ? (int) round((float) $data['accuracy']) : null,
            'last_located_at' => now(),
        ])->save();

        return response()->json(['message' => 'Location updated.']);
    }

    private function rider(Request $request): Rider
    {
        return Rider::where('user_id', $request->user()->id)->firstOrFail();
    }

    private function activeParcels(Rider $rider): int
    {
        return Parcel::query()
            ->whereIn('status', self::SHARING_STATUSES)
            ->where(function ($q) use ($rider) {
                $q->where('assigned_rider_id', $rider->id)
                    ->orWhere(function ($q2) use ($rider) {
                        $q2->where('pickup_rider_id', $rider->id)
                            ->whereIn('status', [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP]);
                    });
            })
            ->count();
    }
}
