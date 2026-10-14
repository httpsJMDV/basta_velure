<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Services\OrderStateMachine;
use App\Services\RiderAreaCoverage;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class HubSortingController extends Controller
{
    protected const MAX_SORT_BATCH = 200;

    public function __construct(
        protected OrderStateMachine $stateMachine,
        protected RiderAreaCoverage $riderCoverage,
    ) {
    }

    /**
     * GET /api/v1/hub/sorting/groups?search=&sort=waiting|count
     *
     * This hub's AT_SORTING_CENTER parcels grouped by destination barangay PSGC code.
     */
    public function groups(Request $request): JsonResponse
    {
        $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'sort'   => ['nullable', 'in:waiting,count'],
        ]);

        $hub = $this->hub($request);
        $search = Str::lower(trim((string) $request->query('search', '')));
        $sort = $request->query('sort', 'waiting');

        $rows = $this->waitingParcels($hub)
            ->selectRaw('destination_barangay_code as code, COUNT(*) as parcel_count, MIN(scanned_in_at) as oldest_scanned_in_at, MIN(id) as sample_id')
            ->groupBy('destination_barangay_code')
            ->get();

        $samples = Parcel::whereIn('id', $rows->pluck('sample_id'))
            ->get(['id', 'destination_barangay', 'recipient_snapshot'])
            ->keyBy('id');

        $coverage = array_map('strval', $hub->coverage_barangays ?? []);
        $ridersByCode = $this->riderCoverage->eligibleByBarangayCode($hub);

        $groups = $rows->map(function ($row) use ($samples, $coverage, $ridersByCode) {
            $code = (string) $row->code;
            $sample = $samples->get($row->sample_id);
            $snapshot = $sample?->recipient_snapshot ?? [];
            $oldest = $row->oldest_scanned_in_at ? Carbon::parse($row->oldest_scanned_in_at, 'UTC') : null;

            return [
                'barangay_code'        => $code,
                'barangay_name'        => (string) ($sample?->destination_barangay ?: ($snapshot['barangay'] ?? '')),
                'city'                 => (string) ($snapshot['city'] ?? ''),
                'parcel_count'         => (int) $row->parcel_count,
                'oldest_scanned_in_at' => $oldest?->toIso8601String(),
                'in_coverage'          => in_array($code, $coverage, true),
                'riders_covering'      => count($ridersByCode[$code] ?? []),
            ];
        });

        if ($search !== '') {
            $groups = $groups->filter(
                fn (array $g) => str_contains(Str::lower($g['barangay_name']), $search)
                    || str_contains(Str::lower($g['city']), $search)
            );
        }

        // Compare the waiting time as a moment in time, not as an ISO string (offsets would break string order).
        $waitingSince = fn (array $g): int => $g['oldest_scanned_in_at']
            ? Carbon::parse($g['oldest_scanned_in_at'])->getTimestamp()
            : PHP_INT_MAX;

        $groups = $sort === 'count'
            ? $groups->sort(fn (array $a, array $b) => [$b['parcel_count'], $waitingSince($a)] <=> [$a['parcel_count'], $waitingSince($b)])
            : $groups->sort(fn (array $a, array $b) => [$waitingSince($a), $a['barangay_code']] <=> [$waitingSince($b), $b['barangay_code']]);

        $groups = $groups->values();

        return response()->json([
            'data' => $groups,
            'meta' => [
                'total_groups'  => $groups->count(),
                'total_parcels' => $groups->sum('parcel_count'),
            ],
        ]);
    }

    /**
     * GET /api/v1/hub/sorting/groups/{barangay_code}/parcels
     *
     * Parcels of one group, oldest scan first. No recipient phone and no COD amount.
     */
    public function groupParcels(Request $request, string $barangayCode): JsonResponse
    {
        $hub = $this->hub($request);
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        $paginated = $this->waitingParcels($hub)
            ->where('destination_barangay_code', trim($barangayCode))
            ->with('order:id,order_number')
            ->orderBy('scanned_in_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate($perPage);

        return response()->json([
            'data' => $paginated->getCollection()->map(fn (Parcel $p) => [
                'tracking_number' => $p->tracking_number,
                'order_number'    => $p->order?->order_number,
                'scanned_in_at'   => $p->scanned_in_at?->toIso8601String(),
            ])->values(),
            'meta' => [
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
     * POST /api/v1/hub/sorting/sort
     *
     * Mark a batch of parcels bound for one barangay as SORTED. All or nothing: every item is
     * validated under the row locks first, and nothing is written if any item is invalid.
     */
    public function sort(Request $request): JsonResponse
    {
        $input = $request->input('tracking_numbers');
        if (is_array($input)) {
            $request->merge([
                'tracking_numbers' => array_map(
                    fn ($tn) => is_string($tn) ? Str::upper(trim($tn)) : $tn,
                    $input
                ),
            ]);
        }

        $validated = $request->validate([
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_SORT_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
        ]);

        $hub = $this->hub($request);
        $trackingNumbers = array_values($validated['tracking_numbers']);

        return DB::transaction(function () use ($request, $hub, $trackingNumbers) {
            $parcels = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->whereIn('tracking_number', $trackingNumbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            // The batch's barangay is that of the first parcel that is actually waiting to be sorted.
            $referenceCode = null;
            foreach ($trackingNumbers as $tn) {
                $candidate = $parcels->get($tn);
                if (
                    $candidate
                    && $candidate->status === Parcel::STATUS_AT_SORTING_CENTER
                    && trim((string) $candidate->destination_barangay_code) !== ''
                ) {
                    $referenceCode = (string) $candidate->destination_barangay_code;
                    break;
                }
            }

            $errors = [];
            foreach ($trackingNumbers as $index => $tn) {
                $parcel = $parcels->get($tn);
                $key = "tracking_numbers.{$index}";

                if (! $parcel) {
                    $errors[$key] = ['Parcel not found for this hub.'];
                } elseif ($parcel->status !== Parcel::STATUS_AT_SORTING_CENTER) {
                    $errors[$key] = ['This parcel is not waiting to be sorted.'];
                } elseif (trim((string) $parcel->destination_barangay_code) === '') {
                    // Same rule as the groups endpoint, which never lists parcels without a code.
                    $errors[$key] = ['This parcel has no destination barangay code, so it cannot be sorted.'];
                } elseif ((string) $parcel->destination_barangay_code !== $referenceCode) {
                    $errors[$key] = ['This parcel is bound for a different barangay than the rest of the batch.'];
                } elseif (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::SORTED, 'hub')) {
                    $errors[$key] = ['This parcel cannot be sorted right now.'];
                }
            }

            if (! empty($errors)) {
                return response()->json([
                    'message' => 'One or more parcels cannot be sorted. Nothing was changed.',
                    'errors'  => $errors,
                ], 422);
            }

            $first = $parcels->first();
            $barangayName = (string) ($first->destination_barangay ?? '');
            $now = now();

            foreach ($parcels as $parcel) {
                // The state machine also syncs parcels.status and writes the history row.
                $this->stateMachine->transition(
                    $parcel->order,
                    OrderStatus::SORTED,
                    'hub',
                    $request->user()->id,
                    'Sorted at the sorting center.',
                    ['sorting_center_id' => $hub->id, 'tracking_number' => $parcel->tracking_number, 'barangay_code' => $referenceCode]
                );

                Parcel::where('id', $parcel->id)->update(['sorted_at' => $now]);
            }

            return response()->json([
                'message'      => 'Parcels sorted.',
                'sorted_count' => $parcels->count(),
                'barangay'     => [
                    'code' => $referenceCode,
                    'name' => $barangayName,
                ],
            ]);
        });
    }

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }

    /**
     * This hub's parcels waiting to be sorted.
     */
    protected function waitingParcels(SortingCenter $hub)
    {
        return Parcel::where('sorting_center_id', $hub->id)
            ->where('status', Parcel::STATUS_AT_SORTING_CENTER)
            ->whereNotNull('destination_barangay_code')
            ->where('destination_barangay_code', '!=', '');
    }
}
