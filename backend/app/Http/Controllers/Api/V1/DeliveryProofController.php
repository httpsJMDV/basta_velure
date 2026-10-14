<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DeliveryProofController extends Controller
{
    /**
     * GET /api/v1/parcels/{tracking}/delivery-proof
     *
     * Streams the delivery proof photo from the private disk. Only the assigned rider, the parcel's
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

        abort_unless($parcel && $parcel->delivery_proof_path && $this->mayView($user, $parcel), 404, 'Delivery proof not found.');
        abort_unless(Storage::disk('ids')->exists($parcel->delivery_proof_path), 404, 'Delivery proof not found.');

        return response()->file(Storage::disk('ids')->path($parcel->delivery_proof_path), [
            'Cache-Control'          => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function mayView(User $user, Parcel $parcel): bool
    {
        if ($user->role === 'admin') {
            return true;
        }

        // The assigned rider.
        $rider = $user->rider;
        if ($rider && $parcel->assigned_rider_id !== null && $rider->id === $parcel->assigned_rider_id) {
            return true;
        }

        // The hub the parcel belongs to (an approved hub only).
        $hub = $user->sortingCenter;
        if (
            $hub
            && $hub->status === SortingCenter::STATUS_APPROVED
            && $parcel->sorting_center_id !== null
            && $hub->id === $parcel->sorting_center_id
        ) {
            return true;
        }

        // The seller and the buyer of the order.
        if ($parcel->seller_id !== null && $parcel->seller_id === $user->id) {
            return true;
        }

        return $parcel->order && $parcel->order->buyer_id === $user->id;
    }
}
