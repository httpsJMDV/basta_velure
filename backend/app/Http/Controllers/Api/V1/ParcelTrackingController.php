<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\User;
use App\Services\ParcelTrackingService;
use App\Support\ParcelAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ParcelTrackingController extends Controller
{
    public function __construct(private readonly ParcelTrackingService $tracking)
    {
    }

    /**
     * GET /api/v1/parcels/{tracking}/tracking
     *
     * The "Track package" view of one parcel: its timeline, the route's places and the courier's live position
     * while a courier is carrying it. Readable by the order's buyer, the seller, the parcel's approved hub, the
     * rider carrying it and admins. Everyone else, and an unknown tracking number, gets the same 404.
     */
    public function show(Request $request, string $tracking): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $parcel = Parcel::with('order')
            ->where('tracking_number', Str::upper(trim($tracking)))
            ->first();

        $role = $parcel ? ParcelAccess::role($user, $parcel) : null;
        abort_unless($parcel && $role, 404, 'Parcel not found.');

        return response()->json(['data' => $this->tracking->build($parcel, $role)])
            ->header('Cache-Control', 'private, no-store');
    }
}
