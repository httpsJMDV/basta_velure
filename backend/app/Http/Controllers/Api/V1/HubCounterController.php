<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Services\OrderStateMachine;
use App\Support\Money;
use App\Support\RemoteDelivery;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Pickups at the branch counter. A buyer in a very remote town can choose to collect the parcel at the courier's
 * nearest branch (orders.delivery_point = branch, RemoteDelivery). Once the branch has sorted it, the parcel waits here
 * instead of going to a rider, and the hub hands it over: a photo of the handover, the name of who took it, and for
 * cash on delivery the exact amount. The order history records it (delivery logs are per rider). No rider is paid; the hub's share is recorded as for any delivery.
 */
class HubCounterController extends Controller
{
    public function __construct(protected OrderStateMachine $stateMachine)
    {
    }

    /** GET /api/v1/hub/counter: parcels waiting here for their buyer, oldest first. */
    public function index(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $parcels = $this->waiting($hub)->with('order:id,order_number,delivery_point')->orderBy('sorted_at')->orderBy('id')->limit(500)->get();

        return response()->json(['data' => $parcels->map(function (Parcel $p) {
            $recipient = $p->recipient_snapshot ?? [];

            return [
                'tracking_number' => $p->tracking_number,
                'order_number'    => $p->order?->order_number,
                'recipient'       => [
                    'name'     => (string) ($recipient['name'] ?? ''),
                    'phone'    => (string) ($recipient['phone'] ?? ''),
                    'barangay' => (string) ($recipient['barangay'] ?? ($p->destination_barangay ?? '')),
                    'city'     => (string) ($recipient['city'] ?? ''),
                ],
                'cod_amount'      => $p->cod_amount !== null ? (float) $p->cod_amount : null,
                'weight_kg'       => $p->weight_kg !== null ? (float) $p->weight_kg : null,
                'waiting_since'   => $p->sorted_at?->toIso8601String(),
            ];
        })->values(), 'meta' => ['count' => $parcels->count()]]);
    }

    /** POST /api/v1/hub/counter/{tracking}/handed-over (multipart: proof_photo, received_by, cod_amount for COD) */
    public function handedOver(Request $request, string $tracking): JsonResponse
    {
        $request->validate([
            'proof_photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'received_by' => Validation::personName(required: true),
            'cod_amount'  => ['nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:10000000'],
        ], [
            'proof_photo.required' => 'Take a photo of the parcel being handed over.',
            'cod_amount.numeric'   => 'Enter the cash you collected as a number, like 500 or 500.00.',
        ] + Validation::personNameMessages('received_by', 'The name of who took the parcel'));

        $hub = $this->hub($request);
        $stored = null;

        try {
            return DB::transaction(function () use ($request, $hub, $tracking, &$stored) {
                $parcel = $this->waiting($hub)->where('tracking_number', Str::upper(trim($tracking)))->with('order')->lockForUpdate()->first();
                if (! $parcel || ! $parcel->order) {
                    return response()->json(['message' => 'This parcel is not waiting at your counter.'], 404);
                }
                if (! $this->stateMachine->canTransition($parcel->order, OrderStatus::DELIVERED, 'hub')) {
                    return response()->json(['message' => 'This order can no longer be handed over.'], 409);
                }

                $isCod = $parcel->cod_amount !== null;
                if ($isCod) {
                    $entered = $request->input('cod_amount');
                    if ($entered === null || $entered === '') {
                        throw ValidationException::withMessages(['cod_amount' => ['Enter the cash you collected.']]);
                    }
                    if (Money::toCents(number_format((float) $entered, 2, '.', '')) !== Money::toCents((string) $parcel->cod_amount)) {
                        throw ValidationException::withMessages(['cod_amount' => ['The cash must be exactly ₱' . number_format((float) $parcel->cod_amount, 2) . ', the order\'s COD amount.']]);
                    }
                }

                $stored = $request->file('proof_photo')->store('delivery-proofs', 'ids');
                if (! $stored) {
                    throw new \RuntimeException('Could not store the handover photo.');
                }

                $now = now();
                $receivedBy = trim((string) $request->input('received_by'));
                $this->stateMachine->transition($parcel->order, OrderStatus::DELIVERED, 'hub', $request->user()->id,
                    "Picked up by the buyer at {$hub->hub_name}.", ['tracking_number' => $parcel->tracking_number, 'sorting_center_id' => $hub->id]);
                Parcel::where('id', $parcel->id)->update([
                    'delivered_at'         => $now,
                    'delivery_proof_path'  => $stored,
                    'received_by'          => $receivedBy,
                    'cod_collected_at'     => $isCod ? $now : null,
                    'cod_collected_amount' => $isCod ? $parcel->cod_amount : null,
                ]);

                return response()->json([
                    'message'         => 'Handed over to the buyer.',
                    'tracking_number' => $parcel->tracking_number,
                    'delivered_at'    => $now->toIso8601String(),
                    'cod_collected'   => $isCod,
                ]);
            });
        } catch (\Throwable $e) {
            if ($stored) {
                Storage::disk('ids')->delete($stored);
            }

            throw $e;
        }
    }

    /** Parcels this hub has sorted whose buyer collects them here. */
    private function waiting(SortingCenter $hub)
    {
        return Parcel::where('sorting_center_id', $hub->id)
            ->where('status', Parcel::STATUS_SORTED)
            ->whereHas('order', fn ($q) => $q->where('delivery_point', RemoteDelivery::BRANCH));
    }

    private function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }
}
