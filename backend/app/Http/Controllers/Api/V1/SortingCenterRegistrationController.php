<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterSortingCenterRequest;
use App\Http\Resources\UserResource;
use App\Models\EmailOtp;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\AccountRegistrar;
use App\Services\EmailOtpService;
use App\Services\MailNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SortingCenterRegistrationController extends Controller
{
    /**
     * A logistics hub application.
     *
     * POST /api/v1/auth/register-hub (a visitor): creates the hub's own account (unverified) with the operator's ID and
     * the application in one go, then emails a 6-digit code. The courier hears about it once the email is confirmed
     * (AccountRegistrar::completeVerification). The account is for deliveries only and never shops.
     *
     * POST /api/v1/auth/apply-hub (signed in): the account's details and ID are reused; a rejected application is
     * reopened with the new details instead of adding a second hub.
     */
    public function register(RegisterSortingCenterRequest $request, AccountRegistrar $registrar, EmailOtpService $otp): JsonResponse
    {
        $guest = $request->isGuest();
        /** @var User|null $user */
        $user = $guest ? null : $request->user('sanctum');
        $validated = $request->validated();

        $stored = [];
        $permitPath = $request->file('dti_permit')->store('dti_permits', 'ids');
        $stored[] = $permitPath;
        $idPath = $idBackPath = null;
        if ($guest) {
            $idPath = $request->file('government_id_image')->store('hub-ids', 'ids');
            $stored[] = $idPath;
            if ($request->hasFile('government_id_image_back')) {
                $idBackPath = $request->file('government_id_image_back')->store('hub-ids', 'ids');
                $stored[] = $idBackPath;
            }
        }
        $previousPermit = null;

        try {
            [$user, $sortingCenter] = DB::transaction(function () use ($user, $guest, $validated, $registrar, $permitPath, $idPath, $idBackPath, &$previousPermit) {
                if ($guest) {
                    $user = $registrar->createUnverified($validated);
                    $user->forceFill([
                        'government_id_type'            => $validated['government_id_type'],
                        'government_id_image_path'      => $idPath,
                        'government_id_image_back_path' => $idBackPath,
                    ])->save();
                }

                $fields = [
                    'logistics_company_id' => (int) $validated['logistics_company_id'],
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

                    return [$user, $rejected];
                }

                return [$user, SortingCenter::create(['user_id' => $user->id] + $fields)];
            });
        } catch (\Throwable $e) {
            foreach (array_filter($stored) as $path) {
                Storage::disk('ids')->delete($path);
            }
            throw $e;
        }

        if ($guest) {
            // The courier sees a finished application only: its email goes out when the code is entered.
            $otp->issue($user, EmailOtp::PURPOSE_REGISTER);

            return response()->json([
                'message' => "Application saved. We sent a 6-digit code to {$user->email}. Enter it to verify your email and send the hub application to the courier.",
                'verification_required' => true,
                'email' => $user->email,
            ], 201);
        }

        // The reopened application no longer points at the old permit.
        $sortingCenter->load(['user', 'logisticsCompany']);
        app(MailNotifier::class)->hubApplicationReceived($sortingCenter);
        app(MailNotifier::class)->courierNewHubApplication($sortingCenter);

        if ($previousPermit && $previousPermit !== $permitPath) {
            Storage::disk('ids')->delete($previousPermit);
        }

        return response()->json([
            'message' => 'Hub application submitted. Please wait for administrator approval.',
            'data' => [
                'user'           => new UserResource($user->fresh()->load(['sellerProfile', 'sortingCenter', 'rider', 'addresses', 'logisticsMembership.company'])),
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
