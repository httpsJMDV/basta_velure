<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SellerApplicationResource;
use App\Models\SellerProfile;
use App\Services\AdminSellerReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

class AdminSellerApplicationController extends Controller
{
    public function __construct(private AdminSellerReviewService $reviewService) {}

    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status', 'pending');

        $applications = SellerProfile::with('user')
            ->where('application_status', $status)
            ->latest('submitted_at')
            ->paginate(20);

        return response()->json(SellerApplicationResource::collection($applications)->response()->getData(true));
    }

    public function show(SellerProfile $sellerProfile): JsonResponse
    {
        return response()->json(['data' => new SellerApplicationResource($sellerProfile->load('user'))]);
    }

    public function approve(SellerProfile $sellerProfile, Request $request): JsonResponse
    {
        $this->reviewService->approve($sellerProfile, $request->user()->id);
        return response()->json(['message' => 'Application approved.']);
    }

    public function reject(SellerProfile $sellerProfile, Request $request): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $this->reviewService->reject($sellerProfile, $request->user()->id, $request->reason);
        return response()->json(['message' => 'Application rejected.']);
    }

    /**
     * Serve the government ID image via a short-lived signed URL — never a direct path.
     */
    public function idImage(SellerProfile $sellerProfile): Response
    {
        abort_unless(Storage::disk('ids')->exists($sellerProfile->government_id_image_path), 404);

        $contents = Storage::disk('ids')->get($sellerProfile->government_id_image_path);
        $mime     = Storage::disk('ids')->mimeType($sellerProfile->government_id_image_path);

        return response($contents, 200)->header('Content-Type', $mime);
    }
}
