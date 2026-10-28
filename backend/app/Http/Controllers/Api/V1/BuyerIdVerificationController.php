<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Notifier;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * A buyer's government ID check. Buyers can sign in, browse and fill a cart right away, but place orders only once the
 * Loved-IT team approved their ID (Admin > Buyer Applications). Any buyer without an ID on file, or whose ID was not
 * approved, sends one here; Google sign-ups send theirs with the rest of their profile (AuthController::completeProfile).
 */
class BuyerIdVerificationController extends Controller
{
    /** GET /account/id-verification */
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => self::state($request->user())]);
    }

    /** POST /account/id-verification {government_id_type, government_id_image, government_id_image_back?} */
    public function submit(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->role === 'buyer', 403, 'Only shopper accounts send an ID here.');
        abort_if($user->buyer_application_status === 'pending', 409, 'Your ID is already being checked. We will email you when it is done.');
        abort_if($user->buyer_application_status === 'approved', 409, 'Your ID is already approved.');

        $data = $request->validate([
            'government_id_type'       => ['required', 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id'],
            'government_id_image'      => Validation::document(),
            'government_id_image_back' => Validation::document(BuyerRegisterRequest::requiresBack($request->input('government_id_type'))),
        ], [
            'government_id_type.required' => 'Choose the type of ID.',
            'government_id_type.in'       => 'Choose a government-issued ID. School IDs are not accepted.',
            ...Validation::uploadMessages('government_id_image', 'the front of your ID', document: true),
            ...Validation::uploadMessages('government_id_image_back', 'the back of your ID', document: true),
        ]);

        $old = array_filter([$user->government_id_image_path, $user->government_id_image_back_path]);
        $front = $request->file('government_id_image')->store('buyer-ids', 'local');
        $back = $request->hasFile('government_id_image_back') ? $request->file('government_id_image_back')->store('buyer-ids', 'local') : null;

        $user->forceFill([
            'government_id_type'            => $data['government_id_type'],
            'government_id_image_path'      => $front,
            'government_id_image_back_path' => $back,
            'buyer_application_status'      => 'pending',
            'buyer_rejection_reason'        => null,
        ])->save();
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        app(Notifier::class)->toAdmins('buyer.id_submitted', 'New ID to check',
            trim("{$user->first_name} {$user->last_name}") . ' sent a government ID. They can place orders once it is approved.',
            '/admin/buyer-applications', ['user_id' => $user->id]);

        return response()->json([
            'message' => 'Thanks! Your ID is being checked, usually within 1 business day. You can keep browsing and filling your cart meanwhile.',
            'data'    => self::state($user->fresh()),
            'user'    => new UserResource($user->fresh()->load(['sellerProfile', 'addresses'])),
        ], 201);
    }

    /** @return array{status: string, reason: string|null, id_type: string|null, can_order: bool} */
    public static function state(User $user): array
    {
        return [
            'status'    => $user->buyer_application_status ?? 'none',
            'reason'    => $user->buyer_application_status === 'rejected' ? $user->buyer_rejection_reason : null,
            'id_type'   => $user->government_id_type,
            'can_order' => $user->orderBlockedByIdCheck() === null,
        ];
    }
}
