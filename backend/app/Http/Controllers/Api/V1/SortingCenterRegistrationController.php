<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterSortingCenterRequest;
use App\Http\Resources\UserResource;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class SortingCenterRegistrationController extends Controller
{
    /**
     * Handle registration of a new Logistics / Sorting Center hub and owner account.
     */
    public function register(RegisterSortingCenterRequest $request): JsonResponse
    {
        $storedFiles = [];

        try {
            $result = DB::transaction(function () use ($request, &$storedFiles) {
                $validated = $request->validated();

                // 1. Store ID files on private 'ids' disk
                $idPath = $request->file('government_id_image')->store('hub_owner_ids', 'ids');
                $storedFiles[] = ['disk' => 'ids', 'path' => $idPath];

                $idBackPath = null;
                if ($request->hasFile('government_id_image_back')) {
                    $idBackPath = $request->file('government_id_image_back')->store('hub_owner_ids', 'ids');
                    $storedFiles[] = ['disk' => 'ids', 'path' => $idBackPath];
                }

                // 2. Store DTI / Business permit file on private 'ids' disk
                $permitPath = $request->file('dti_permit')->store('dti_permits', 'ids');
                $storedFiles[] = ['disk' => 'ids', 'path' => $permitPath];

                // 3. Create the user account (mirrors role pattern in AuthController)
                $user = User::create([
                    'first_name'                    => $validated['first_name'],
                    'middle_name'                   => $validated['middle_name'] ?? null,
                    'last_name'                     => $validated['last_name'],
                    'sex'                           => $validated['sex'],
                    'email'                         => $validated['email'],
                    'phone'                         => $validated['phone'],
                    'password'                      => Hash::make($validated['password']),
                    'date_of_birth'                 => $validated['date_of_birth'],
                    'government_id_type'            => $validated['government_id_type'],
                    'government_id_image_path'      => $idPath,
                    'government_id_image_back_path' => $idBackPath,
                    'status'                        => 'active',
                ]);
                $user->role = 'buyer';
                $user->save();

                // 4. Create initial default address record for the user
                $user->addresses()->create([
                    'full_name'  => $user->first_name . ' ' . $user->last_name,
                    'phone'      => $user->phone,
                    'address'    => $validated['address_street'],
                    'province'   => $validated['address_province'],
                    'district'   => $validated['address_city'],
                    'ward'       => $validated['address_barangay'],
                    'label'      => 'office',
                    'is_default' => true,
                ]);

                // 5. Create the sorting_centers row with status PENDING
                $sortingCenter = SortingCenter::create([
                    'user_id'            => $user->id,
                    'hub_name'           => $validated['hub_name'],
                    'address_province'   => $validated['address_province'],
                    'address_city'       => $validated['address_city'],
                    'address_barangay'   => $validated['address_barangay'],
                    'address_street'     => $validated['address_street'],
                    'dti_permit_path'    => $permitPath,
                    'coverage_barangays' => array_values(array_unique($validated['coverage_barangays'])),
                    'status'             => SortingCenter::STATUS_PENDING,
                    'rejection_reason'   => null,
                ]);

                return [$user, $sortingCenter];
            });

            [$user, $sortingCenter] = $result;

            return response()->json([
                'message' => 'Sorting center registration submitted successfully. Please wait for administrator approval.',
                'data' => [
                    'user'           => new UserResource($user),
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
        } catch (\Throwable $e) {
            // Roll back files if database transaction fails
            foreach ($storedFiles as $file) {
                try {
                    Storage::disk($file['disk'])->delete($file['path']);
                } catch (\Throwable) {
                    // Ignore storage cleanup errors during rollback
                }
            }

            throw $e;
        }
    }
}
