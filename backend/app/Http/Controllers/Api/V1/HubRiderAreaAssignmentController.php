<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RiderAreaAssignmentResource;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HubRiderAreaAssignmentController extends Controller
{
    /**
     * Retrieve the authenticated user's approved sorting center.
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
     * List all area assignments for a specific rider.
     *
     * GET /api/v1/hub/riders/{rider}/areas
     */
    public function index(Request $request, Rider $rider): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');

        $areas = $rider->areaAssignments()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => RiderAreaAssignmentResource::collection($areas),
        ]);
    }

    /**
     * Create a new area assignment for an ACTIVE rider.
     *
     * POST /api/v1/hub/riders/{rider}/areas
     */
    public function store(Request $request, Rider $rider): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');

        abort_if(
            $rider->status !== Rider::STATUS_ACTIVE,
            422,
            'Areas can only be assigned to active approved couriers.'
        );

        $validated = $request->validate([
            'area_label'           => ['required', 'string', 'max:100'],
            'coverage_barangays'   => ['required', 'array', 'min:1'],
            'coverage_barangays.*' => ['required', 'string', 'regex:/^\d{9,10}$/'],
        ], [
            'area_label.required'         => 'Area label is required.',
            'area_label.max'              => 'Area label must not exceed 100 characters.',
            'coverage_barangays.required' => 'At least one coverage barangay must be assigned to this area.',
            'coverage_barangays.min'      => 'At least one coverage barangay must be assigned to this area.',
        ]);

        $areaLabel = trim($validated['area_label']);

        // Check if an active assignment with the same area label already exists for this rider under this hub
        $labelExists = RiderAreaAssignment::where('rider_id', $rider->id)
            ->where('sorting_center_id', $hub->id)
            ->where('area_label', $areaLabel)
            ->where('is_active', true)
            ->exists();

        if ($labelExists) {
            return response()->json([
                'message' => "The area label \"{$areaLabel}\" is already assigned to this courier.",
                'errors'  => [
                    'area_label' => ["Area label \"{$areaLabel}\" is already actively assigned to this courier."],
                ],
            ], 422);
        }

        // Validate that each barangay is within the hub's jurisdiction
        $hubCoverage = $hub->coverage_barangays ?? [];
        foreach ($validated['coverage_barangays'] as $bgy) {
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
        if (count($validated['coverage_barangays']) !== count(array_unique($validated['coverage_barangays']))) {
            return response()->json([
                'message' => 'Duplicate barangays are not permitted within an area assignment.',
                'errors'  => [
                    'coverage_barangays' => ['Area assignment cannot contain duplicate barangays.'],
                ],
            ], 422);
        }

        $assignment = RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $hub->id,
            'area_label'         => $areaLabel,
            'coverage_barangays' => array_values(array_unique($validated['coverage_barangays'])),
            'is_active'          => true,
        ]);

        return response()->json([
            'message' => 'Delivery area assigned successfully.',
            'data'    => new RiderAreaAssignmentResource($assignment),
        ], 201);
    }

    /**
     * Update an existing area assignment.
     *
     * PUT /api/v1/hub/riders/{rider}/areas/{area}
     */
    public function update(Request $request, Rider $rider, RiderAreaAssignment $area): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');
        abort_unless($area->rider_id === $rider->id && $area->sorting_center_id === $hub->id, 404, 'Area assignment not found.');

        $validated = $request->validate([
            'area_label'           => ['sometimes', 'required', 'string', 'max:100'],
            'coverage_barangays'   => ['sometimes', 'required', 'array', 'min:1'],
            'coverage_barangays.*' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'is_active'            => ['sometimes', 'boolean'],
        ]);

        $updateData = [];

        if (isset($validated['area_label'])) {
            $newLabel = trim($validated['area_label']);

            // Unique active label check excluding current area
            $conflict = RiderAreaAssignment::where('rider_id', $rider->id)
                ->where('sorting_center_id', $hub->id)
                ->where('area_label', $newLabel)
                ->where('is_active', true)
                ->where('id', '!=', $area->id)
                ->exists();

            if ($conflict) {
                return response()->json([
                    'message' => "The area label \"{$newLabel}\" is already assigned to this courier.",
                    'errors'  => [
                        'area_label' => ["Area label \"{$newLabel}\" is already actively assigned to this courier."],
                    ],
                ], 422);
            }

            $updateData['area_label'] = $newLabel;
        }

        if (isset($validated['coverage_barangays'])) {
            $hubCoverage = $hub->coverage_barangays ?? [];
            foreach ($validated['coverage_barangays'] as $bgy) {
                if (! in_array($bgy, $hubCoverage, true)) {
                    return response()->json([
                        'message' => "The selected barangay {$bgy} is outside this logistics hub's coverage area.",
                        'errors'  => [
                            'coverage_barangays' => ["Barangay {$bgy} does not belong to this hub's jurisdiction."],
                        ],
                    ], 422);
                }
            }

            if (count($validated['coverage_barangays']) !== count(array_unique($validated['coverage_barangays']))) {
                return response()->json([
                    'message' => 'Duplicate barangays are not permitted within an area assignment.',
                    'errors'  => [
                        'coverage_barangays' => ['Area assignment cannot contain duplicate barangays.'],
                    ],
                ], 422);
            }

            $updateData['coverage_barangays'] = array_values(array_unique($validated['coverage_barangays']));
        }

        if (isset($validated['is_active'])) {
            $updateData['is_active'] = (bool) $validated['is_active'];
        }

        $area->update($updateData);

        return response()->json([
            'message' => 'Area assignment updated successfully.',
            'data'    => new RiderAreaAssignmentResource($area->fresh()),
        ]);
    }

    /**
     * Deactivate an area assignment (sets is_active to false without deleting history).
     *
     * DELETE /api/v1/hub/riders/{rider}/areas/{area}
     */
    public function destroy(Request $request, Rider $rider, RiderAreaAssignment $area): JsonResponse
    {
        $hub = $this->getAuthenticatedHub($request);

        abort_unless($rider->sorting_center_id === $hub->id, 404, 'Rider not found.');
        abort_unless($area->rider_id === $rider->id && $area->sorting_center_id === $hub->id, 404, 'Area assignment not found.');

        $area->update(['is_active' => false]);

        return response()->json([
            'message' => 'Area assignment deactivated successfully.',
            'data'    => new RiderAreaAssignmentResource($area->fresh()),
        ]);
    }
}
