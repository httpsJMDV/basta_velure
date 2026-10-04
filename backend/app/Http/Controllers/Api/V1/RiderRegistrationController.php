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
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class RiderRegistrationController extends Controller
{
    /**
     * Handle registration of a new courier / delivery rider.
     *
     * POST /api/v1/auth/register-rider
     */
    public function register(RegisterRiderRequest $request): JsonResponse
    {
        $storedFiles = [];

        try {
            $result = DB::transaction(function () use ($request, &$storedFiles) {
                $validated = $request->validated();

                // 1. Store OR/CR document on private 'ids' disk
                $orCrPath = $request->file('or_cr_image')->store('rider_or_cr', 'ids');
                $storedFiles[] = ['disk' => 'ids', 'path' => $orCrPath];

                // 2. Store Driver's License / ID document on private 'ids' disk
                $licensePath = $request->file('drivers_license_image')->store('rider_licenses', 'ids');
                $storedFiles[] = ['disk' => 'ids', 'path' => $licensePath];

                // 3. Create User account with role 'rider'
                $user = User::create([
                    'first_name'    => $validated['first_name'],
                    'middle_name'   => $validated['middle_name'] ?? null,
                    'last_name'     => $validated['last_name'],
                    'sex'           => $validated['sex'],
                    'email'         => $validated['email'],
                    'phone'         => $validated['phone'],
                    'password'      => Hash::make($validated['password']),
                    'date_of_birth' => $validated['date_of_birth'],
                    'status'        => 'active',
                ]);
                $user->role = 'rider';
                $user->save();

                // 4. Create default address record for the rider
                $user->addresses()->create([
                    'full_name'  => $user->first_name . ' ' . $user->last_name,
                    'phone'      => $user->phone,
                    'address'    => $validated['address_street'],
                    'province'   => $validated['address_province'],
                    'district'   => $validated['address_city'],
                    'ward'       => $validated['address_barangay'],
                    'label'      => 'home',
                    'is_default' => true,
                ]);

                // 5. Create the rider profile record with status PENDING
                $hub = SortingCenter::findOrFail($validated['sorting_center_id']);

                $rider = Rider::create([
                    'user_id'              => $user->id,
                    'sorting_center_id'    => $hub->id,
                    'vehicle_type'         => $validated['vehicle_type'],
                    'plate_number'         => $validated['plate_number'],
                    'or_cr_path'           => $orCrPath,
                    'drivers_license_path' => $licensePath,
                    'status'               => Rider::STATUS_PENDING,
                    'submitted_at'         => now(),
                ]);

                return [$user, $rider, $hub];
            });

            /** @var User $user */
            /** @var Rider $rider */
            /** @var SortingCenter $hub */
            [$user, $rider, $hub] = $result;

            return response()->json([
                'message' => 'Courier registration submitted successfully. Your application is pending hub approval.',
                'data' => [
                    'user'  => [
                        'id'         => $user->id,
                        'first_name' => $user->first_name,
                        'last_name'  => $user->last_name,
                        'email'      => $user->email,
                        'role'       => $user->role,
                    ],
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
        } catch (\Throwable $e) {
            // Clean up files from storage if transaction fails
            foreach ($storedFiles as $file) {
                try {
                    Storage::disk($file['disk'])->delete($file['path']);
                } catch (\Throwable) {
                    // Ignore storage deletion errors during rollback
                }
            }

            throw $e;
        }
    }
}
