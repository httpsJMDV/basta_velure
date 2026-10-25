<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ApplyRiderRequest;
use App\Services\RiderOnboarding;
use Illuminate\Http\JsonResponse;

class RiderRegistrationController extends Controller
{
    /**
     * A signed-in buyer cannot turn their account into a rider account: riders sign in with an email of their own.
     * They apply on the public form (POST /auth/register-rider) with that email instead.
     *
     * POST /api/v1/auth/apply-rider
     */
    public function register(): JsonResponse
    {
        return response()->json([
            'message' => 'Riders use an account of their own. Sign out and apply on the Become a rider page with a different email.',
        ], 403);
    }

    /**
     * The public "Become a rider" form. The application is Pending until the chosen hub (or its courier company)
     * approves it; only then does the rider get the email to set a password.
     *
     * POST /api/v1/auth/register-rider
     */
    public function apply(ApplyRiderRequest $request, RiderOnboarding $onboarding): JsonResponse
    {
        $hub = $request->hub();
        $again = $request->reapplying();
        $rider = $onboarding->apply($hub, $request->validated(), $request->file('drivers_license_image'), $request->file('or_cr_image'), $again);

        return response()->json([
            'message' => "Application sent to {$hub->hub_name}. We will email {$rider->user->email} when they decide.",
            'data'    => [
                'email'      => $rider->user->email,
                'hub'        => $hub->hub_name,
                'courier'    => \App\Models\LogisticsCompany::summaryFor($rider->logistics_company_id)['name'] ?? null,
                'reapplied'  => $again !== null,
                'applied_at' => $rider->applied_at?->toIso8601String(),
            ],
        ], 201);
    }
}
