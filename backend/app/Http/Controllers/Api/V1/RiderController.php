<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateRiderVehicleRequest;
use App\Http\Resources\RiderProfileResource;
use App\Models\Rider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RiderController extends Controller
{
    /**
     * Get the authenticated rider's own profile summary.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        /** @var \App\Models\Rider $rider */
        $rider = Rider::with(['user', 'sortingCenter', 'areaAssignments'])
            ->where('user_id', $user->id)
            ->firstOrFail();

        return response()->json([
            'data' => new RiderProfileResource($rider),
        ]);
    }

    /**
     * PUT /api/v1/rider/vehicle { vehicle_type, plate_number }
     *
     * The rider edits their own vehicle. The change takes effect immediately: there is no new OR/CR upload and
     * no hub re-approval (a known gap, see docs/api/rider-chat-account.md).
     */
    public function updateVehicle(UpdateRiderVehicleRequest $request): JsonResponse
    {
        /** @var \App\Models\Rider $rider */
        $rider = Rider::with(['user', 'sortingCenter', 'areaAssignments'])
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $validated = $request->validated();

        $rider->update([
            'vehicle_type'       => $validated['vehicle_type'],
            'plate_number'       => $validated['plate_number'],
            'vehicle_updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Vehicle details updated.',
            'data'    => new RiderProfileResource($rider->refresh()->load(['user', 'sortingCenter', 'areaAssignments'])),
        ]);
    }
}
