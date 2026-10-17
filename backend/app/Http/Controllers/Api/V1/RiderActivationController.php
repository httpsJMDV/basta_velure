<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\LogisticsCompany;
use App\Services\RiderOnboarding;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The rider's side of the activation link (A13): check the link, then set a password. The link works once, for 24
 * hours; an expired link is a 410 and a used or unknown link a 404, and neither can set a password.
 */
class RiderActivationController extends Controller
{
    public function __construct(private readonly RiderOnboarding $onboarding) {}

    /** GET /auth/rider-activation?token= */
    public function show(Request $request): JsonResponse
    {
        $rider = $this->onboarding->riderForToken((string) $request->query('token', ''));

        return response()->json(['data' => [
            'name'       => trim($rider->user->first_name . ' ' . $rider->user->last_name),
            'email'      => $rider->user->email,
            'company'    => LogisticsCompany::summaryFor($rider->companyId())['name'] ?? null,
            'expires_at' => $rider->activation_expires_at?->toIso8601String(),
        ]]);
    }

    /** POST /auth/rider-activation {token, password, password_confirmation} */
    public function activate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'                 => ['required', 'string'],
            'password'              => ['required', 'string', 'confirmed', BuyerRegisterRequest::passwordRule()],
            'password_confirmation' => ['required', 'string'],
        ], [
            'password.required'  => 'Enter a password.',
            'password.confirmed' => 'The passwords do not match.',
            'password_confirmation.required' => 'Confirm your password.',
        ]);

        $rider = $this->onboarding->activate($data['token'], $data['password']);

        return response()->json([
            'message' => 'Your rider account is active. Sign in with your email and the password you just set.',
            'data'    => new UserResource($rider->user->fresh()->load(['rider'])),
        ]);
    }
}
