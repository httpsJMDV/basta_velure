<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Gcash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The GCash a rider, a hub or a courier company is paid on: riders and hubs by their courier company, the courier
 * by shops (the delivery fees of GCash and free-delivery orders).
 */
class PayoutAccountController extends Controller
{
    /** GET /rider/gcash */
    public function rider(Request $request): JsonResponse { return response()->json(['data' => $this->format($request->user()->rider)]); }

    /** PATCH /rider/gcash */
    public function updateRider(Request $request): JsonResponse { return $this->save($request, $request->user()->rider); }

    /** GET /hub/gcash */
    public function hub(Request $request): JsonResponse { return response()->json(['data' => $this->format($request->user()->sortingCenter)]); }

    /** PATCH /hub/gcash */
    public function updateHub(Request $request): JsonResponse { return $this->save($request, $request->user()->sortingCenter); }

    /** GET /logistics/gcash */
    public function courier(Request $request): JsonResponse { return response()->json(['data' => $this->format($request->attributes->get('logistics_company'))]); }

    /** PATCH /logistics/gcash */
    public function updateCourier(Request $request): JsonResponse { return $this->save($request, $request->attributes->get('logistics_company')); }

    private function save(Request $request, ?Model $owner): JsonResponse
    {
        abort_if(! $owner, 404);
        $data = $request->validate([
            'gcash_number' => ['nullable', ...Gcash::RULE],
            'gcash_name'   => ['nullable', 'string', 'max:120'],
        ]);

        $raw = trim((string) ($data['gcash_number'] ?? ''));
        $number = $raw === '' ? null : Gcash::normalize($raw);
        if ($raw !== '' && ! $number) {
            throw \Illuminate\Validation\ValidationException::withMessages(['gcash_number' => 'Enter the 11-digit mobile number of the GCash account, like 0917 123 4567.']);
        }
        $name = trim((string) ($data['gcash_name'] ?? '')) ?: null;
        if ($number && ! $name) {
            throw \Illuminate\Validation\ValidationException::withMessages(['gcash_name' => 'Enter the name on the GCash account.']);
        }

        $owner->update(['gcash_number' => $number, 'gcash_name' => $number ? $name : null]);

        return response()->json(['data' => $this->format($owner->fresh())]);
    }

    private function format(?Model $owner): array
    {
        abort_if(! $owner, 404);

        return ['gcash_number' => Gcash::format($owner->gcash_number), 'gcash_name' => $owner->gcash_name];
    }
}
