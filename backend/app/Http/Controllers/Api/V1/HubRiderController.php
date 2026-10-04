<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\HubRiderDetailResource;
use App\Http\Resources\HubRiderSummaryResource;
use App\Mail\RiderApplicationMail;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class HubRiderController extends Controller
{
    /**
     * Helper to retrieve the authenticated user's approved sorting center.
     */
    protected function getAuthenticatedHub(Request $request): SortingCenter
    {
        $user = $request->user();
        $hub = $user?->sortingCenter;

        if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED) {
            abort(403, 'Sorting center account not approved.');
        }

        return $hub;
    }

    /**
     * List courier applications under this hub with status filtering, search, and pagination.
     *
     * GET /api/v1/hub/riders
     */
    public function index(Request $request): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        $status  = $request->query('status', Rider::STATUS_PENDING);
        $search  = $request->query('search');
        $sort    = $request->query('sort', 'newest');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        $query = Rider::where('sorting_center_id', $hub->id)
            ->with(['user', 'areaAssignments']);

        if ($status && strtolower($status) !== 'all') {
            $query->where('status', strtoupper($status));
        }

        if ($search) {
            $term = trim($search);
            $query->where(function ($q) use ($term) {
                $q->where('plate_number', 'like', "%{$term}%")
                  ->orWhere('vehicle_type', 'like', "%{$term}%")
                  ->orWhereHas('user', function ($uq) use ($term) {
                      $uq->where('first_name', 'like', "%{$term}%")
                         ->orWhere('last_name', 'like', "%{$term}%")
                         ->orWhere('email', 'like', "%{$term}%")
                         ->orWhere('phone', 'like', "%{$term}%");
                  });
            });
        }

        $query->orderBy('created_at', strtolower($sort) === 'oldest' ? 'asc' : 'desc');

        $paginated = $query->paginate($perPage);

        // Status counts for hub tab badges
        $counts = [
            'pending'     => Rider::where('sorting_center_id', $hub->id)->where('status', Rider::STATUS_PENDING)->count(),
            'active'      => Rider::where('sorting_center_id', $hub->id)->where('status', Rider::STATUS_ACTIVE)->count(),
            'disapproved' => Rider::where('sorting_center_id', $hub->id)->where('status', Rider::STATUS_DISAPPROVED)->count(),
            'all'         => Rider::where('sorting_center_id', $hub->id)->count(),
        ];

        return response()->json([
            'data'   => HubRiderSummaryResource::collection($paginated),
            'counts' => $counts,
            'meta'   => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
            ],
        ]);
    }

    /**
     * Show full courier application details.
     *
     * GET /api/v1/hub/riders/{rider}
     */
    public function show(Request $request, Rider $rider): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');

        return response()->json([
            'data' => new HubRiderDetailResource($rider->load(['user.addresses', 'reviewer', 'areaAssignments'])),
        ]);
    }

    /**
     * Approve a pending courier application, optionally creating an initial area assignment.
     *
     * POST /api/v1/hub/riders/{rider}/approve
     */
    public function approve(Request $request, Rider $rider): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');

        abort_if(
            $rider->status !== Rider::STATUS_PENDING,
            422,
            'Only pending rider applications can be approved.'
        );

        $hasInitialArea = $request->filled('area_label') || $request->filled('coverage_barangays');
        $initialArea = null;

        if ($hasInitialArea) {
            $validatedArea = $request->validate([
                'area_label'            => ['required', 'string', 'max:100'],
                'coverage_barangays'    => ['required', 'array', 'min:1'],
                'coverage_barangays.*'  => ['required', 'string', 'regex:/^\d{9,10}$/'],
            ], [
                'area_label.required'         => 'Area label is required when specifying an initial area assignment.',
                'coverage_barangays.required' => 'At least one coverage barangay must be assigned to this area.',
                'coverage_barangays.min'      => 'At least one coverage barangay must be assigned to this area.',
            ]);

            // Validate that every assigned barangay is within this hub's coverage list
            $hubCoverage = $hub->coverage_barangays ?? [];
            foreach ($validatedArea['coverage_barangays'] as $bgy) {
                if (! in_array($bgy, $hubCoverage, true)) {
                    return response()->json([
                        'message' => "The selected barangay {$bgy} is outside this logistics hub's coverage area.",
                        'errors'  => [
                            'coverage_barangays' => ["Barangay {$bgy} does not belong to this hub's jurisdiction."],
                        ],
                    ], 422);
                }
            }

            // Check for duplicate barangays within the assignment
            if (count($validatedArea['coverage_barangays']) !== count(array_unique($validatedArea['coverage_barangays']))) {
                return response()->json([
                    'message' => 'Duplicate barangays are not permitted within an area assignment.',
                    'errors'  => [
                        'coverage_barangays' => ['Area assignment cannot contain duplicate barangays.'],
                    ],
                ], 422);
            }

            $initialArea = $validatedArea;
        }

        $hubManagerId = $request->user()->id;

        DB::transaction(function () use ($rider, $hub, $hubManagerId, $initialArea) {
            $rider->update([
                'status'           => Rider::STATUS_ACTIVE,
                'rejection_reason' => null,
                'reviewed_by'      => $hubManagerId,
                'reviewed_at'      => now(),
            ]);

            if ($initialArea) {
                RiderAreaAssignment::create([
                    'rider_id'           => $rider->id,
                    'sorting_center_id'  => $hub->id,
                    'area_label'         => trim($initialArea['area_label']),
                    'coverage_barangays' => array_values(array_unique($initialArea['coverage_barangays'])),
                    'is_active'          => true,
                ]);
            }
        });

        // Dispatch decision email to courier; fail-safe try/catch
        if ($rider->user && $rider->user->email) {
            try {
                Mail::to($rider->user->email)->queue(
                    new RiderApplicationMail($rider->user, 'approved', null, $hub)
                );
            } catch (\Throwable $e) {
                Log::error("Failed sending rider approval email: {$e->getMessage()}");
            }
        }

        return response()->json([
            'message' => 'Courier application approved successfully.',
            'data'    => new HubRiderDetailResource($rider->fresh(['user.addresses', 'reviewer', 'areaAssignments'])),
        ]);
    }

    /**
     * Disapprove a pending courier application with a required reason.
     *
     * POST /api/v1/hub/riders/{rider}/disapprove
     */
    public function disapprove(Request $request, Rider $rider): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');

        abort_if(
            $rider->status !== Rider::STATUS_PENDING,
            422,
            'Only pending rider applications can be disapproved.'
        );

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ], [
            'reason.required' => 'A disapproval reason is required.',
            'reason.max'      => 'The disapproval reason may not exceed 500 characters.',
        ]);

        $hubManagerId = $request->user()->id;
        $reason = trim($validated['reason']);

        DB::transaction(function () use ($rider, $hubManagerId, $reason) {
            $rider->update([
                'status'           => Rider::STATUS_DISAPPROVED,
                'rejection_reason' => $reason,
                'reviewed_by'      => $hubManagerId,
                'reviewed_at'      => now(),
            ]);
        });

        // Dispatch decision email to courier; fail-safe try/catch
        if ($rider->user && $rider->user->email) {
            try {
                Mail::to($rider->user->email)->queue(
                    new RiderApplicationMail($rider->user, 'disapproved', $reason, $hub)
                );
            } catch (\Throwable $e) {
                Log::error("Failed sending rider disapproval email: {$e->getMessage()}");
            }
        }

        return response()->json([
            'message' => 'Courier application disapproved successfully.',
            'data'    => new HubRiderDetailResource($rider->fresh(['user.addresses', 'reviewer', 'areaAssignments'])),
        ]);
    }

    /**
     * Securely stream the rider's OR/CR document from private 'ids' storage.
     *
     * GET /api/v1/hub/riders/{rider}/or-cr
     */
    public function orCrDocument(Request $request, Rider $rider): BinaryFileResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');
        abort_unless($rider->or_cr_path, 404, 'OR/CR document not found.');
        abort_unless(Storage::disk('ids')->exists($rider->or_cr_path), 404, 'File not found on storage disk.');

        return response()->file(Storage::disk('ids')->path($rider->or_cr_path));
    }

    /**
     * Securely stream the rider's Driver's License document from private 'ids' storage.
     *
     * GET /api/v1/hub/riders/{rider}/license
     */
    public function licenseDocument(Request $request, Rider $rider): BinaryFileResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');
        abort_unless($rider->drivers_license_path, 404, "Driver's license document not found.");
        abort_unless(Storage::disk('ids')->exists($rider->drivers_license_path), 404, 'File not found on storage disk.');

        return response()->file(Storage::disk('ids')->path($rider->drivers_license_path));
    }

    /**
     * Return this hub's coverage options for area mapping.
     *
     * GET /api/v1/hub/coverage-options
     */
    public function coverageOptions(Request $request): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        return response()->json([
            'data' => [
                'hub_id'             => $hub->id,
                'hub_name'           => $hub->hub_name,
                'address_city'       => $hub->address_city,
                'address_province'   => $hub->address_province,
                'coverage_barangays' => $hub->coverage_barangays ?? [],
            ],
        ]);
    }
}
