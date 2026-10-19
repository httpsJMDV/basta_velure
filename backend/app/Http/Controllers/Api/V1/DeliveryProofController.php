<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Models\User;
use App\Support\ParcelAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DeliveryProofController extends Controller
{
    /**
     * GET /api/v1/parcels/{tracking}/delivery-proof
     *
     * Streams a delivery proof photo (the first, or the second with ?photo=2) from the private disk. Only the assigned rider, the parcel's
     * hub, the order's seller, the order's buyer and admins may read it. Everyone else, and any parcel
     * without a proof, gets the same 404. The file is never reachable by a public path.
     */
    public function show(Request $request, string $tracking): BinaryFileResponse
    {
        /** @var User $user */
        $user = $request->user();

        $parcel = Parcel::with('order')
            ->where('tracking_number', Str::upper(trim($tracking)))
            ->first();

        // ?photo=2 is the second proof photo; anything else is the first.
        $path = $request->query('photo') === '2' ? $parcel?->delivery_proof_path_2 : $parcel?->delivery_proof_path;

        abort_unless($parcel && $path && $this->mayView($user, $parcel), 404, 'Delivery proof not found.');
        abort_unless(Storage::disk('ids')->exists($path), 404, 'Delivery proof not found.');

        return response()->file(Storage::disk('ids')->path($path), [
            'Cache-Control'          => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** The same people as Track package (the delivery rider, not the pickup rider): ParcelAccess. */
    private function mayView(User $user, Parcel $parcel): bool
    {
        return ParcelAccess::role($user, $parcel, includePickupRider: false) !== null;
    }
}
