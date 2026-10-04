<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SortingCenterApplicationResource;
use App\Http\Resources\SortingCenterApplicationSummaryResource;
use App\Mail\SortingCenterApplicationMail;
use App\Models\AdminActivityLog;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AdminSortingCenterApplicationController extends Controller
{
    /**
     * List sorting center applications with status filtering, search, and pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $status  = $request->query('status', SortingCenter::STATUS_PENDING);
        $search  = $request->query('search');
        $sort    = $request->query('sort', 'newest');
        $perPage = min((int) $request->query('per_page', 30), 100);

        $query = SortingCenter::with('user');

        if ($status && strtolower($status) !== 'all') {
            $query->where('status', strtoupper($status));
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('hub_name', 'like', "%{$search}%")
                  ->orWhere('address_city', 'like', "%{$search}%")
                  ->orWhere('address_province', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('first_name', 'like', "%{$search}%")
                         ->orWhere('last_name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        $query->orderBy('created_at', strtolower($sort) === 'oldest' ? 'asc' : 'desc');

        $applications = $query->paginate($perPage);

        return response()->json(
            SortingCenterApplicationSummaryResource::collection($applications)->response()->getData(true)
        );
    }

    /**
     * Show full application details for an Admin reviewer.
     */
    public function show(SortingCenter $sortingCenter): JsonResponse
    {
        return response()->json([
            'data' => new SortingCenterApplicationResource($sortingCenter->load('user')),
        ]);
    }

    /**
     * Approve a pending sorting center application.
     */
    public function approve(Request $request, SortingCenter $sortingCenter): JsonResponse
    {
        abort_if(
            $sortingCenter->status !== SortingCenter::STATUS_PENDING,
            422,
            'Only pending sorting center applications can be approved.'
        );

        $adminId = $request->user()->id;
        $user = $sortingCenter->user;

        DB::transaction(function () use ($sortingCenter, $adminId, $user) {
            $sortingCenter->update([
                'status'           => SortingCenter::STATUS_APPROVED,
                'rejection_reason' => null,
                'reviewed_by'      => $adminId,
                'reviewed_at'      => now(),
            ]);

            if ($user) {
                $user->update(['status' => 'active']);
            }

            AdminActivityLog::create([
                'admin_id'    => $adminId,
                'action'      => 'approve_sorting_center',
                'target_type' => 'sorting_center',
                'target_id'   => $sortingCenter->id,
                'description' => "Approved sorting center application for hub \"{$sortingCenter->hub_name}\".",
                'meta'        => [
                    'sorting_center_id' => $sortingCenter->id,
                    'hub_name'          => $sortingCenter->hub_name,
                    'user_id'           => $user?->id,
                ],
            ]);
        });

        // Dispatch approval email after commit; fail-safe logging
        if ($user && $user->email) {
            try {
                Mail::to($user->email)->queue(
                    new SortingCenterApplicationMail($user, 'approved', null, $sortingCenter)
                );
            } catch (\Throwable $e) {
                Log::error("Failed sending sorting center approval email: {$e->getMessage()}");
            }
        }

        return response()->json([
            'message' => 'Sorting center application approved successfully.',
        ]);
    }

    /**
     * Reject a pending sorting center application.
     */
    public function reject(Request $request, SortingCenter $sortingCenter): JsonResponse
    {
        abort_if(
            $sortingCenter->status !== SortingCenter::STATUS_PENDING,
            422,
            'Only pending sorting center applications can be rejected.'
        );

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ], [
            'reason.required' => 'A rejection reason is required.',
            'reason.max'      => 'The rejection reason may not exceed 500 characters.',
        ]);

        $adminId = $request->user()->id;
        $reason  = $validated['reason'];
        $user    = $sortingCenter->user;

        DB::transaction(function () use ($sortingCenter, $adminId, $reason, $user) {
            $sortingCenter->update([
                'status'           => SortingCenter::STATUS_REJECTED,
                'rejection_reason' => $reason,
                'reviewed_by'      => $adminId,
                'reviewed_at'      => now(),
            ]);

            AdminActivityLog::create([
                'admin_id'    => $adminId,
                'action'      => 'reject_sorting_center',
                'target_type' => 'sorting_center',
                'target_id'   => $sortingCenter->id,
                'description' => "Rejected sorting center application for hub \"{$sortingCenter->hub_name}\".",
                'meta'        => [
                    'sorting_center_id' => $sortingCenter->id,
                    'hub_name'          => $sortingCenter->hub_name,
                    'user_id'           => $user?->id,
                    'reason'            => $reason,
                ],
            ]);
        });

        // Dispatch rejection email after commit; fail-safe logging
        if ($user && $user->email) {
            try {
                Mail::to($user->email)->queue(
                    new SortingCenterApplicationMail($user, 'rejected', $reason, $sortingCenter)
                );
            } catch (\Throwable $e) {
                Log::error("Failed sending sorting center rejection email: {$e->getMessage()}");
            }
        }

        return response()->json([
            'message' => 'Sorting center application rejected successfully.',
        ]);
    }

    /**
     * Securely serve DTI / business permit file to authorized Admins from private storage.
     */
    public function dtiPermit(SortingCenter $sortingCenter): BinaryFileResponse
    {
        abort_unless($sortingCenter->dti_permit_path, 404, 'DTI permit document not found.');
        abort_unless(Storage::disk('ids')->exists($sortingCenter->dti_permit_path), 404, 'File not found on storage disk.');

        return response()->file(Storage::disk('ids')->path($sortingCenter->dti_permit_path));
    }

    /**
     * Securely serve applicant front ID image to authorized Admins from private storage.
     */
    public function idImage(SortingCenter $sortingCenter): BinaryFileResponse
    {
        $user = $sortingCenter->user;
        abort_unless($user && $user->government_id_image_path, 404, 'Government ID image not found.');
        abort_unless(Storage::disk('ids')->exists($user->government_id_image_path), 404, 'File not found on storage disk.');

        return response()->file(Storage::disk('ids')->path($user->government_id_image_path));
    }

    /**
     * Securely serve applicant back ID image to authorized Admins from private storage.
     */
    public function idImageBack(SortingCenter $sortingCenter): BinaryFileResponse
    {
        $user = $sortingCenter->user;
        abort_unless($user && $user->government_id_image_back_path, 404, 'Government ID back image not found.');
        abort_unless(Storage::disk('ids')->exists($user->government_id_image_back_path), 404, 'File not found on storage disk.');

        return response()->file(Storage::disk('ids')->path($user->government_id_image_back_path));
    }
}
