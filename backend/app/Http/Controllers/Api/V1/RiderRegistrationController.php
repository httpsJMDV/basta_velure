<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRiderRequest;
use App\Http\Resources\UserResource;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class RiderRegistrationController extends Controller
{
    /**
     * The signed-in buyer applies to deliver for a logistics hub. The account keeps its buyer role (the riders row is
     * what makes it a courier); a disapproved application is reopened instead of adding a second rider profile.
     *
     * POST /api/v1/auth/apply-rider
     */
    public function register(RegisterRiderRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validated();

        $orCrPath = $request->file('or_cr_image')->store('rider_or_cr', 'ids');
        $licensePath = $request->file('drivers_license_image')->store('rider_licenses', 'ids');
        $previousFiles = [];

        try {
            [$rider, $hub] = DB::transaction(function () use ($user, $validated, $orCrPath, $licensePath, &$previousFiles) {
                $hub = SortingCenter::findOrFail($validated['sorting_center_id']);

                $fields = [
                    'sorting_center_id'    => $hub->id,
                    'vehicle_type'         => $validated['vehicle_type'],
                    'plate_number'         => $validated['plate_number'],
                    'or_cr_path'           => $orCrPath,
                    'drivers_license_path' => $licensePath,
                    'status'               => Rider::STATUS_PENDING,
                    'submitted_at'         => now(),
                ];

                $disapproved = Rider::where('user_id', $user->id)
                    ->where('status', Rider::STATUS_DISAPPROVED)
                    ->latest('id')
                    ->lockForUpdate()
                    ->first();

                if ($disapproved) {
                    $previousFiles = array_filter([$disapproved->or_cr_path, $disapproved->drivers_license_path]);
                    $disapproved->forceFill($fields + ['rejection_reason' => null, 'reviewed_by' => null, 'reviewed_at' => null])->save();

                    return [$disapproved, $hub];
                }

                return [Rider::create(['user_id' => $user->id] + $fields), $hub];
            });
        } catch (\Throwable $e) {
            Storage::disk('ids')->delete([$orCrPath, $licensePath]);
            throw $e;
        }

        // The reopened application no longer points at the old documents.
        // "Application received" to the applicant, and "new courier application" to the hub owner.
        app(\App\Services\MailNotifier::class)->riderApplicationReceived($rider->load(['user', 'sortingCenter.user']));

        if ($previousFiles) {
            Storage::disk('ids')->delete(array_values(array_diff($previousFiles, [$orCrPath, $licensePath])));
        }

        return response()->json([
            'message' => 'Courier application submitted. Your application is pending hub approval.',
            'data' => [
                'user'  => new UserResource($user->fresh()->load(['sellerProfile', 'sortingCenter', 'rider', 'addresses'])),
                'rider' => [
                    'id'                => $rider->id,
                    'status'            => $rider->status,
                    'vehicle_type'      => $rider->vehicle_type,
                    'plate_number'      => $rider->plate_number,
                    'sorting_center_id' => $hub->id,
                    'hub_name'          => $hub->hub_name,
                    'submitted_at'      => $rider->submitted_at?->toIso8601String(),
                ],
            ],
        ], 201);
    }
}
