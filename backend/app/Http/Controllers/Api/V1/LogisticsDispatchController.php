<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DispatchOffer;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Services\Courier\Dispatcher;
use App\Services\RiderWorkload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The company's dispatch board (Logistics L4): pickups being offered, the Unassigned queue, and pickups assigned
 * but not picked up yet. From here the company runs auto-assign, assigns or reassigns one parcel, or assigns several
 * to one rider (as many as the rider can hold).
 */
class LogisticsDispatchController extends Controller
{
    public function __construct(
        private readonly Dispatcher $dispatcher,
        private readonly RiderWorkload $workload,
    ) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/dispatch?state=unassigned|offering|assigned|all */
    public function index(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $this->dispatcher->expireDue();
        $state = (string) $request->query('state', 'all');

        $base = fn () => LogisticsCompany::constrain(Parcel::query(), $company->id)->where('status', Parcel::STATUS_READY_FOR_PICKUP);
        $parcels = $base()->with(['order:id,order_number,payment_method,total', 'pickupRider.user', 'offers' => fn ($q) => $q->with('rider.user')->latest('id')])
            ->when($state === 'unassigned', fn ($q) => $q->whereNull('pickup_rider_id')->where(fn ($w) => $w->whereNull('dispatch_state')->orWhere('dispatch_state', Parcel::DISPATCH_UNASSIGNED)))
            ->when($state === 'offering', fn ($q) => $q->whereNull('pickup_rider_id')->where('dispatch_state', Parcel::DISPATCH_OFFERING))
            ->when($state === 'assigned', fn ($q) => $q->whereNotNull('pickup_rider_id'))
            ->orderBy('ready_at')->limit(200)->get();

        $counts = [
            'unassigned' => $base()->whereNull('pickup_rider_id')->where(fn ($w) => $w->whereNull('dispatch_state')->orWhere('dispatch_state', Parcel::DISPATCH_UNASSIGNED))->count(),
            'offering'   => $base()->whereNull('pickup_rider_id')->where('dispatch_state', Parcel::DISPATCH_OFFERING)->count(),
            'assigned'   => $base()->whereNotNull('pickup_rider_id')->count(),
        ];

        return response()->json(['data' => $parcels->map(fn (Parcel $p) => $this->row($p))->values(), 'counts' => $counts]);
    }

    /** GET /logistics/dispatch/riders?parcel_id= : every rider with whether they can take the job, nearest first. */
    public function riders(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $parcelId = (int) $request->query('parcel_id');
        $parcel = $parcelId ? LogisticsCompany::constrain(Parcel::query(), $company->id)->find($parcelId) : null;

        $all = LogisticsRiderController::companyRiders($company)->with('user')->whereIn('status', [Rider::STATUS_ACTIVE, Rider::STATUS_SUSPENDED])->get();
        $jobs = $this->workload->activeJobCounts($all->pluck('id'));
        $ranked = $parcel ? $this->dispatcher->eligibleRiders($parcel)->keyBy(fn ($e) => $e['rider']->id) : collect();

        $rows = $all->map(function (Rider $r) use ($jobs, $ranked, $parcel) {
            $active = (int) ($jobs[$r->id] ?? 0);
            $problem = match (true) {
                $r->status === Rider::STATUS_SUSPENDED => 'Suspended',
                ! $r->isAvailable()                    => 'Offline',
                $active >= Rider::MAX_ACTIVE_JOBS      => 'At the ' . Rider::MAX_ACTIVE_JOBS . '-job limit',
                default                                => null,
            };

            return [
                'id'          => $r->id,
                'name'        => $r->user ? trim($r->user->first_name . ' ' . $r->user->last_name) : 'Rider #' . $r->id,
                'online'      => $r->isAvailable(),
                'status'      => $r->status,
                'active_jobs' => $active,
                'assignable'  => $problem === null,
                'problem'     => $problem,
                'distance'    => $parcel && isset($ranked[$r->id]) ? $ranked[$r->id]['distance'] : null,
                'rank'        => $parcel && isset($ranked[$r->id]) ? $ranked->keys()->search($r->id) : null,
            ];
        })->sortBy(fn ($r) => [$r['assignable'] ? 0 : 1, $r['rank'] ?? 999, $r['name']])->values();

        // Only riders who can take the job are offered for assignment (LOG-DISP-003).
        return response()->json([
            'data' => $rows->where('assignable', true)->values(),
            'unavailable' => $rows->where('assignable', false)->values(),
            'max_active_jobs' => Rider::MAX_ACTIVE_JOBS,
        ]);
    }

    /** POST /logistics/dispatch/auto-assign {parcel_ids?} */
    public function autoAssign(Request $request): JsonResponse
    {
        $ids = $request->validate(['parcel_ids' => ['nullable', 'array', 'max:200'], 'parcel_ids.*' => ['integer']])['parcel_ids'] ?? null;
        $result = $this->dispatcher->autoAssign($this->company($request), $ids);

        return response()->json([
            'message' => $result['offered'] > 0
                ? "{$result['offered']} job(s) offered to the nearest Online riders." . ($result['unassigned'] > 0 ? " {$result['unassigned']} stay unassigned: no eligible rider is Online." : '')
                : 'No eligible rider is Online right now. The jobs stay in the Unassigned queue.',
            'data'    => $result,
        ]);
    }

    /**
     * POST /logistics/dispatch/assign {parcel_ids: [..], rider_id}. One parcel assigns or reassigns it; several
     * assign as many as the rider can hold and report the rest as skipped.
     */
    public function assign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'parcel_ids'   => ['required', 'array', 'min:1', 'max:50'],
            'parcel_ids.*' => ['integer'],
            'rider_id'     => ['required', 'integer'],
        ], ['rider_id.required' => 'Choose a rider.']);
        $company = $this->company($request);
        $rider = LogisticsRiderController::companyRiders($company)->find($data['rider_id']);
        abort_unless($rider, 422, 'This rider is not one of your riders.');

        if (count($data['parcel_ids']) === 1) {
            $parcel = $this->dispatcher->assign($company, (int) $data['parcel_ids'][0], $rider, $request->user());

            return response()->json(['message' => 'Assigned to ' . Dispatcher::name($rider->load('user')) . '.', 'data' => ['assigned' => [$parcel->tracking_number], 'skipped' => []]]);
        }

        $result = $this->dispatcher->bulkAssign($company, $data['parcel_ids'], $rider, $request->user());
        $n = count($result['assigned']);
        $skipped = count($result['skipped']);

        return response()->json([
            'message' => "{$n} assigned to " . Dispatcher::name($rider->load('user')) . '.' . ($skipped ? " {$skipped} skipped." : ''),
            'data'    => $result,
        ]);
    }

    private function row(Parcel $p): array
    {
        $snap = $p->pickup_address_snapshot ?? [];
        $open = $p->offers->firstWhere('status', DispatchOffer::STATUS_OFFERED);

        return [
            'id'              => $p->id,
            'tracking_number' => $p->tracking_number,
            'order_number'    => $p->order?->order_number,
            'shop_name'       => $snap['shop_name'] ?? null,
            'pickup_area'     => trim(($snap['barangay'] ?? $p->pickup_barangay ?? '') . ', ' . ($snap['city'] ?? ''), ', '),
            'dropoff_area'    => $p->destination_barangay,
            'cod_amount'      => $p->cod_amount !== null ? (float) $p->cod_amount : null,
            'ready_at'        => $p->ready_at?->toIso8601String(),
            'state'           => $p->pickup_rider_id ? 'assigned' : ($p->dispatch_state === Parcel::DISPATCH_OFFERING ? 'offering' : 'unassigned'),
            'attempts'        => (int) $p->dispatch_attempts,
            'max_attempts'    => DispatchOffer::MAX_ATTEMPTS,
            'rider'           => $p->pickupRider ? ['id' => $p->pickupRider->id, 'name' => Dispatcher::name($p->pickupRider)] : null,
            'offer'           => $open ? ['rider' => Dispatcher::name($open->rider), 'expires_at' => $open->expires_at->toIso8601String()] : null,
            'history'         => $p->offers->take(6)->map(fn (DispatchOffer $o) => [
                'rider' => Dispatcher::name($o->rider), 'status' => $o->status, 'at' => ($o->responded_at ?? $o->offered_at)?->toIso8601String(),
            ])->values(),
        ];
    }
}
