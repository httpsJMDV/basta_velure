<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
}

