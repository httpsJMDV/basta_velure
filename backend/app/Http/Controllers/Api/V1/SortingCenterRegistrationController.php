<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterSortingCenterRequest;
use App\Http\Resources\UserResource;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SortingCenterRegistrationController extends Controller
{
    /**
     * The signed-in buyer applies to run a logistics hub. Their account, personal details and government ID are
     * reused; a rejected application is reopened with the new details instead of adding a second hub.
     *
     * POST /api/v1/auth/apply-hub
     */
    public function register(RegisterSortingCenterRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validated();

        $permitPath = $request->file('dti_permit')->store('dti_permits', 'ids');
        $previousPermit = null;

        try {
            $sortingCenter = DB::transaction(function () use ($user, $validated, $permitPath, &$previousPermit) {
                $fields = [
                    'hub_name'           => $validated['hub_name'],
                    'address_province'   => $validated['address_province'],
                    'address_city'       => $validated['address_city'],
                    'address_barangay'   => $validated['address_barangay'],
                    'address_street'     => $validated['address_street'],
                    'dti_permit_path'    => $permitPath,
                    'coverage_barangays' => array_values(array_unique($validated['coverage_barangays'])),
                    'status'             => SortingCenter::STATUS_PENDING,
                    'rejection_reason'   => null,
                ];

                $rejected = SortingCenter::where('user_id', $user->id)
                    ->where('status', SortingCenter::STATUS_REJECTED)
                    ->latest('id')
                    ->lockForUpdate()
                    ->first();

                if ($rejected) {
                    $previousPermit = $rejected->dti_permit_path;
                    $rejected->forceFill($fields + ['reviewed_by' => null, 'reviewed_at' => null])->save();

                    return $rejected;
                }

                return SortingCenter::create(['user_id' => $user->id] + $fields);
            });
        } catch (\Throwable $e) {
            Storage::disk('ids')->delete($permitPath);
            throw $e;
        }

        // The reopened application no longer points at the old permit.
        app(\App\Services\MailNotifier::class)->hubApplicationReceived($sortingCenter->load('user'));

        if ($previousPermit && $previousPermit !== $permitPath) {
            Storage::disk('ids')->delete($previousPermit);
        }

        return response()->json([
            'message' => 'Hub application submitted. Please wait for administrator approval.',
            'data' => [
                'user'           => new UserResource($user->fresh()->load(['sellerProfile', 'sortingCenter', 'rider', 'addresses'])),
                'sorting_center' => [
                    'id'                 => $sortingCenter->id,
                    'hub_name'           => $sortingCenter->hub_name,
                    'status'             => $sortingCenter->status,
                    'address_province'   => $sortingCenter->address_province,
                    'address_city'       => $sortingCenter->address_city,
                    'address_barangay'   => $sortingCenter->address_barangay,
                    'address_street'     => $sortingCenter->address_street,
                    'coverage_barangays' => $sortingCenter->coverage_barangays,
                    'created_at'         => $sortingCenter->created_at?->toIso8601String(),
                ],
                'hub_status'     => $sortingCenter->status,
            ],
        ], 201);
    }
}
