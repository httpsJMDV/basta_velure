<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class RiderRegistrationController extends Controller
{
    /**
     * Riders cannot register themselves (A13): an approved courier company adds each rider from its portal, and the
     * rider activates the account from the emailed link. The old self-application endpoint answers 403.
     *
     * POST /api/v1/auth/apply-rider
     */
    public function register(): JsonResponse
    {
        return response()->json([
            'message' => 'Riders are added by their courier company. Ask the courier you work for to add you; you will get an email to set your password.',
        ], 403);
    }
}
