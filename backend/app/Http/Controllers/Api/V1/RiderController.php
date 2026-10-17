<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Logistics\AddRiderRequest;
use App\Http\Requests\UpdateRiderVehicleRequest;
use App\Http\Resources\RiderProfileResource;
use App\Models\AuditLog;
use App\Models\Rider;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class RiderController extends Controller
{
    private const RELATIONS = ['user', 'sortingCenter', 'areaAssignments', 'company'];

    private function rider(Request $request): Rider
    {
        return Rider::with(self::RELATIONS)->where('user_id', $request->user()->id)->firstOrFail();
    }

    /** The signed-in rider's profile: name, license, vehicle, company and status (RID-PROF-001). */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new RiderProfileResource($this->rider($request))]);
    }

    /** GET /rider/documents/{license|or-cr}: the rider's own uploaded documents. */
    public function document(Request $request, string $doc): BinaryFileResponse
    {
        $rider = $this->rider($request);
        $path = $doc === 'license' ? $rider->drivers_license_path : ($doc === 'or-cr' ? $rider->or_cr_path : null);
        abort_unless($path && Storage::disk('ids')->exists($path), 404, 'Document not found.');

        return response()->file(Storage::disk('ids')->path($path));
    }

    /**
     * PUT /api/v1/rider/vehicle { vehicle_type, plate_number, or_cr_image }
     *
     * The change is saved with the new OR/CR and the old plate is no longer shown; the courier company sees the
     * rider flagged for re-verification until it approves the new documents.
     */
    public function updateVehicle(UpdateRiderVehicleRequest $request): JsonResponse
    {
        $rider = $this->rider($request);
        $validated = $request->validated();
        $newPath = $request->file('or_cr_image')->store('rider_or_cr', 'ids');
        $oldPath = $rider->or_cr_path;
        $old = ['vehicle_type' => $rider->vehicle_type, 'plate_number' => $rider->plate_number];

        DB::transaction(function () use ($rider, $validated, $newPath, $old) {
            $rider->update([
                'vehicle_type'         => $validated['vehicle_type'],
                'plate_number'         => $validated['plate_number'],
                'or_cr_path'           => $newPath,
                'vehicle_updated_at'   => now(),
                'needs_reverification' => true,
            ]);
            AuditLog::record($rider->user, 'rider.vehicle_changed', $rider, $old,
                ['vehicle_type' => $rider->vehicle_type, 'plate_number' => $rider->plate_number], companyId: $rider->companyId(), actorRole: 'rider');
        });

        if ($oldPath && $oldPath !== $newPath) {
            Storage::disk('ids')->delete($oldPath);
        }

        return response()->json([
            'message' => 'Vehicle details updated. Your courier company will re-verify the new OR/CR.',
            'data'    => new RiderProfileResource($rider->refresh()->load(self::RELATIONS)),
        ]);
    }

    /**
     * POST /api/v1/rider/license { license_expiry, license_number?, drivers_license_image? }: renew the license.
     * The expiry must be today or later (A15); a new document is flagged for the company to re-verify. A rejected file
     * leaves the current document in place.
     */
    public function updateLicense(Request $request): JsonResponse
    {
        $rider = $this->rider($request);
        if (is_string($request->input('license_number'))) {
            $request->merge(['license_number' => strtoupper(preg_replace('/\s+/', '', $request->input('license_number')))]);
        }

        $rules = AddRiderRequest::licenseRules($rider->id);
        $rules['license_number'][0] = 'sometimes';
        $validated = $request->validate($rules + [
            'drivers_license_image' => Validation::document(required: false),
        ], AddRiderRequest::licenseMessages() + Validation::uploadMessages('drivers_license_image', "the driver's license", document: true));

        $newPath = $request->file('drivers_license_image')?->store('rider_licenses', 'ids');
        $oldPath = $rider->drivers_license_path;
        $old = ['license_number' => $rider->license_number, 'license_expiry' => $rider->license_expiry?->toDateString()];

        $rider->update(array_filter([
            'license_number'       => $validated['license_number'] ?? null,
            'license_expiry'       => $validated['license_expiry'],
            'drivers_license_path' => $newPath,
            'needs_reverification' => $newPath ? true : null,
        ], fn ($v) => $v !== null));
        AuditLog::record($rider->user, 'rider.license_changed', $rider, $old,
            ['license_number' => $rider->license_number, 'license_expiry' => $rider->license_expiry?->toDateString(), 'new_document' => (bool) $newPath],
            companyId: $rider->companyId(), actorRole: 'rider');

        if ($newPath && $oldPath) {
            Storage::disk('ids')->delete($oldPath);
        }

        return response()->json([
            'message' => $newPath ? 'License updated. Your courier company will re-verify the new document.' : 'License expiry updated.',
            'data'    => new RiderProfileResource($rider->refresh()->load(self::RELATIONS)),
        ]);
    }
}
