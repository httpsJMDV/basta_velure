<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Mail\ParcelsAssignedMail;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Services\OrderStateMachine;
use App\Services\RiderAreaCoverage;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class HubDispatchController extends Controller
{
    protected const MAX_ASSIGN_BATCH = 200;

    public function __construct(
        protected OrderStateMachine $stateMachine,
        protected RiderAreaCoverage $coverage,
    ) {
    }

    /**
     * GET /api/v1/hub/dispatch/batches?search=&sort=waiting|count
     *
     * This hub's SORTED parcels grouped by destination barangay PSGC code.
     */
    public function batches(Request $request): JsonResponse
    {
        $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'sort'   => ['nullable', 'in:waiting,count'],
        ]);

        $hub = $this->hub($request);
        $search = Str::lower(trim((string) $request->query('search', '')));
        $sort = $request->query('sort', 'waiting');

        $rows = $this->sortedParcels($hub)
            ->selectRaw('destination_barangay_code as code, COUNT(*) as parcel_count, MIN(sorted_at) as oldest_sorted_at, MIN(id) as sample_id')
            ->groupBy('destination_barangay_code')
            ->get();

        $samples = Parcel::whereIn('id', $rows->pluck('sample_id'))
            ->get(['id', 'destination_barangay', 'recipient_snapshot'])
            ->keyBy('id');

        $eligible = $this->coverage->eligibleByBarangayCode($hub);

        $batches = $rows->map(function ($row) use ($samples, $eligible) {
            $code = (string) $row->code;
            $sample = $samples->get($row->sample_id);
            $snapshot = $sample?->recipient_snapshot ?? [];
            $oldest = $row->oldest_sorted_at ? Carbon::parse($row->oldest_sorted_at, 'UTC') : null;

            return [
                'barangay_code'        => $code,
                'barangay_name'        => (string) ($sample?->destination_barangay ?: ($snapshot['barangay'] ?? '')),
                'city'                 => (string) ($snapshot['city'] ?? ''),
                'parcel_count'         => (int) $row->parcel_count,
                'oldest_sorted_at'     => $oldest?->toIso8601String(),
                'eligible_riders'      => count($eligible[$code] ?? []),
            ];
        });

        if ($search !== '') {
            $batches = $batches->filter(
                fn (array $b) => str_contains(Str::lower($b['barangay_name']), $search)
                    || str_contains(Str::lower($b['city']), $search)
            );
        }

        // Compare the waiting time as a moment in time, not as an ISO string.
        $waitingSince = fn (array $b): int => $b['oldest_sorted_at']
            ? Carbon::parse($b['oldest_sorted_at'])->getTimestamp()
            : PHP_INT_MAX;

        $batches = $sort === 'count'
            ? $batches->sort(fn (array $a, array $b) => [$b['parcel_count'], $waitingSince($a)] <=> [$a['parcel_count'], $waitingSince($b)])
            : $batches->sort(fn (array $a, array $b) => [$waitingSince($a), $a['barangay_code']] <=> [$waitingSince($b), $b['barangay_code']]);

        $batches = $batches->values();

        return response()->json([
            'data' => $batches,
            'meta' => [
                'total_batches' => $batches->count(),
                'total_parcels' => $batches->sum('parcel_count'),
            ],
        ]);
    }

    /**
     * GET /api/v1/hub/dispatch/batches/{barangay_code}/parcels
     *
     * SORTED parcels of one batch, oldest first. No recipient phone and no COD amount.
     */
    public function batchParcels(Request $request, string $barangayCode): JsonResponse
    {
        $hub = $this->hub($request);
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        $paginated = $this->sortedParcels($hub)
            ->where('destination_barangay_code', trim($barangayCode))
            ->with('order:id,order_number')
            ->orderBy('sorted_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate($perPage);

        return response()->json([
            'data' => $paginated->getCollection()->map(fn (Parcel $p) => [
                'tracking_number' => $p->tracking_number,
                'order_number'    => $p->order?->order_number,
                'sorted_at'       => $p->sorted_at?->toIso8601String(),
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
     * GET /api/v1/hub/dispatch/batches/{barangay_code}/riders
     *
     * Riders who may be assigned this barangay's parcels, least loaded first.
     */
    public function batchRiders(Request $request, string $barangayCode): JsonResponse
    {
        $hub = $this->hub($request);
        $code = trim($barangayCode);

        $matching = $this->coverage->eligibleByBarangayCode($hub)[$code] ?? [];
        if (empty($matching)) {
            return response()->json(['data' => []]);
        }

        $riders = Rider::with('user')
            ->whereIn('id', array_keys($matching))
            ->get();

        $loads = Parcel::whereIn('assigned_rider_id', $riders->pluck('id'))
            ->whereIn('status', [Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY])
            ->selectRaw('assigned_rider_id, COUNT(*) as load_count')
            ->groupBy('assigned_rider_id')
            ->pluck('load_count', 'assigned_rider_id');

        $data = $riders->map(fn (Rider $rider) => [
            'id'            => $rider->id,
            'name'          => trim(($rider->user?->first_name ?? '') . ' ' . ($rider->user?->last_name ?? '')),
            'vehicle_type'  => $rider->vehicle_type,
            'plate_number'  => $rider->plate_number,
            'area_labels'   => $matching[$rider->id] ?? [],
            'current_load'  => (int) ($loads[$rider->id] ?? 0),
        ])->sort(fn (array $a, array $b) => [$a['current_load'], $a['name']] <=> [$b['current_load'], $b['name']])
            ->values();

        return response()->json(['data' => $data]);
    }

    /**
     * POST /api/v1/hub/dispatch/assign
     *
     * Assign a batch of SORTED parcels for one barangay to an eligible rider. All or nothing:
     * everything is validated under row locks first, and nothing is written if anything is invalid.
     */
    public function assign(Request $request): JsonResponse
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
            'rider_id'           => ['required', 'integer'],
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_ASSIGN_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
        ]);

        $hub = $this->hub($request);
        $trackingNumbers = array_values($validated['tracking_numbers']);
        $riderId = (int) $validated['rider_id'];

        /** @var array{rider: Rider, count: int, barangay: string}|null $notify */
        $notify = null;

        $response = DB::transaction(function () use ($request, $hub, $trackingNumbers, $riderId, &$notify) {
            $parcels = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->whereIn('tracking_number', $trackingNumbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            // Another hub's rider and an unknown rider read exactly the same.
            $rider = Rider::with('user')
                ->where('id', $riderId)
                ->where('sorting_center_id', $hub->id)
                ->lockForUpdate()
                ->first();

            // The batch's barangay is that of the first parcel that is actually waiting for dispatch.
            $referenceCode = null;
            foreach ($trackingNumbers as $tn) {
                $candidate = $parcels->get($tn);
                if (
                    $candidate
                    && $candidate->status === Parcel::STATUS_SORTED
                    && trim((string) $candidate->destination_barangay_code) !== ''
                ) {
                    $referenceCode = (string) $candidate->destination_barangay_code;
                    break;
                }
            }

            $errors = [];

            if (! $rider) {
                $errors['rider_id'] = ['Rider not found for this hub.'];
            } elseif ($referenceCode !== null) {
                $eligible = $this->coverage->eligibleByBarangayCode($hub)[$referenceCode] ?? [];
                if (! array_key_exists($rider->id, $eligible)) {
                    $errors['rider_id'] = ['This rider is not eligible for this barangay.'];
                }
            }

            foreach ($trackingNumbers as $index => $tn) {
                $parcel = $parcels->get($tn);
                $key = "tracking_numbers.{$index}";

                if (! $parcel) {
                    $errors[$key] = ['Parcel not found for this hub.'];
                } elseif ($parcel->status !== Parcel::STATUS_SORTED) {
                    $errors[$key] = ['This parcel is not waiting for dispatch.'];
                } elseif (trim((string) $parcel->destination_barangay_code) === '') {
                    $errors[$key] = ['This parcel has no destination barangay code, so it cannot be dispatched.'];
                } elseif ((string) $parcel->destination_barangay_code !== $referenceCode) {
                    $errors[$key] = ['This parcel is bound for a different barangay than the rest of the batch.'];
                } elseif (! $parcel->order || ! $this->stateMachine->canTransition($parcel->order, OrderStatus::ASSIGNED_TO_RIDER, 'hub')) {
                    $errors[$key] = ['This parcel cannot be dispatched right now.'];
                }
            }

            if (! empty($errors)) {
                return response()->json([
                    'message' => 'The parcels cannot be assigned. Nothing was changed.',
                    'errors'  => $errors,
                ], 422);
            }

            $barangayName = (string) ($parcels->first()->destination_barangay ?? '');
            $now = now();

            foreach ($parcels as $parcel) {
                // The state machine also syncs parcels.status and writes the history row.
                $this->stateMachine->transition(
                    $parcel->order,
                    OrderStatus::ASSIGNED_TO_RIDER,
                    'hub',
                    $request->user()->id,
                    'Assigned to a delivery rider.',
                    [
                        'sorting_center_id' => $hub->id,
                        'rider_id'          => $rider->id,
                        'tracking_number'   => $parcel->tracking_number,
                        'barangay_code'     => $referenceCode,
                    ]
                );

                Parcel::where('id', $parcel->id)->update([
                    'assigned_rider_id' => $rider->id,
                    'assigned_at'       => $now,
                ]);
            }

            $notify = ['rider' => $rider, 'count' => $parcels->count(), 'barangay' => $barangayName];

            return response()->json([
                'message'        => 'Parcels assigned.',
                'assigned_count' => $parcels->count(),
                'barangay'       => ['code' => $referenceCode, 'name' => $barangayName],
                'rider'          => [
                    'id'   => $rider->id,
                    'name' => trim(($rider->user?->first_name ?? '') . ' ' . ($rider->user?->last_name ?? '')),
                ],
            ]);
        });

        // Only after the transaction has committed. A mail failure must never undo the assignment.
        if ($notify !== null) {
            $this->notifyRider($hub, $notify['rider'], $notify['count'], $notify['barangay']);
        }

        return $response;
    }

    protected function notifyRider(SortingCenter $hub, Rider $rider, int $count, string $barangayName): void
    {
        $email = $rider->user?->email;
        if (! $email) {
            return;
        }

        try {
            Mail::to($email)->queue(new ParcelsAssignedMail($rider->user, $hub, $count, $barangayName));
        } catch (\Throwable $e) {
            Log::error("Failed sending parcel assignment email to rider #{$rider->id}: {$e->getMessage()}");
        }
    }

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }

    /**
     * This hub's SORTED parcels that have a destination barangay code.
     */
    protected function sortedParcels(SortingCenter $hub)
    {
        return Parcel::where('sorting_center_id', $hub->id)
            ->where('status', Parcel::STATUS_SORTED)
            ->whereNotNull('destination_barangay_code')
            ->where('destination_barangay_code', '!=', '');
    }
}
