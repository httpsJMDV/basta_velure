<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Services\Commerce\ShippingCalculator;
use App\Services\Courier\Dispatcher;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Scanning at the company's hubs (Logistics L5): Inbound receives a picked-up parcel (At Hub), Sort puts it in its
 * delivery zone's list, and Outbound hands it to a delivery rider. Each scan only works in order, only once, and
 * only on the company's own parcels: a duplicate is answered "already received", an unknown or another company's
 * tracking number "not found", and nothing changes.
 */
class LogisticsHubOpsController extends Controller
{
    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly Dispatcher $dispatcher,
    ) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/hub-ops : the company's approved hubs, and what is at each step now. */
    public function index(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $hubs = LogisticsCompany::constrain(SortingCenter::query(), $company->id)->where('status', SortingCenter::STATUS_APPROVED)->orderBy('hub_name')->get(['id', 'hub_name', 'address_city']);
        $parcels = LogisticsCompany::constrain(Parcel::query(), $company->id);
        $count = fn (string $status) => (clone $parcels)->where('status', $status)->count();

        return response()->json(['data' => [
            'hubs'   => $hubs->map(fn ($h) => ['id' => $h->id, 'name' => $h->hub_name, 'city' => $h->address_city])->values(),
            'counts' => [
                'incoming' => $count(Parcel::STATUS_PICKED_UP),
                'at_hub'   => $count(Parcel::STATUS_AT_SORTING_CENTER),
                'sorted'   => $count(Parcel::STATUS_SORTED),
                'outbound' => $count(Parcel::STATUS_ASSIGNED_TO_RIDER),
            ],
        ]]);
    }

    /** GET /logistics/hub-ops/zones : sorted parcels, one list per delivery zone. */
    public function zones(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $parcels = LogisticsCompany::constrain(Parcel::query(), $company->id)->with('order:id,order_number')
            ->whereIn('status', [Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED])->orderBy('sorted_at')->orderBy('scanned_in_at')->get();

        $sorted = $parcels->where('status', Parcel::STATUS_SORTED)->groupBy(fn (Parcel $p) => $p->shipping_zone ?: 'No zone')
            ->map(fn ($list, $zone) => ['zone' => $zone, 'parcels' => $list->map(fn ($p) => $this->row($p))->values()])->values();

        return response()->json(['data' => [
            'to_sort' => $parcels->where('status', Parcel::STATUS_AT_SORTING_CENTER)->map(fn ($p) => $this->row($p))->values(),
            'zones'   => $sorted,
        ]]);
    }

    /** POST /logistics/hub-ops/inbound {tracking_number, hub_id?} */
    public function inbound(Request $request): JsonResponse
    {
        $data = $request->validate(['tracking_number' => ['required', 'string', 'max:64'], 'hub_id' => ['nullable', 'integer']]);
        $company = $this->company($request);
        $hubId = $this->hubId($company, $data['hub_id'] ?? null);

        $parcel = DB::transaction(function () use ($request, $company, $data, $hubId) {
            $parcel = $this->lock($company, $data['tracking_number']);
            if ($parcel->status === Parcel::STATUS_READY_FOR_PICKUP) {
                abort(409, 'This parcel has not been picked up yet. The rider scans it at the shop first.');
            }
            if ($parcel->status !== Parcel::STATUS_PICKED_UP) {
                abort(409, 'Already received' . ($parcel->scanned_in_at ? ' on ' . $parcel->scanned_in_at->setTimezone('Asia/Manila')->format('M j, g:i A') : '') . '. Nothing was changed.');
            }
            $hub = $hubId ?? $parcel->sorting_center_id;
            $this->machine->transition($parcel->order, OrderStatus::AT_SORTING_CENTER, 'logistics', $request->user()->id,
                'Received at the hub.', ['tracking_number' => $parcel->tracking_number, 'sorting_center_id' => $hub]);
            Parcel::whereKey($parcel->id)->update(['scanned_in_at' => now(), 'sorting_center_id' => $hub]);

            return $parcel->fresh(['order:id,order_number']);
        });

        return response()->json(['message' => 'Received at the hub.', 'data' => $this->row($parcel)]);
    }

    /** POST /logistics/hub-ops/sort {tracking_number} : into the zone of the delivery address. */
    public function sort(Request $request): JsonResponse
    {
        $data = $request->validate(['tracking_number' => ['required', 'string', 'max:64']]);
        $company = $this->company($request);

        $parcel = DB::transaction(function () use ($request, $company, $data) {
            $parcel = $this->lock($company, $data['tracking_number']);
            if (in_array($parcel->status, [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP], true)) {
                abort(409, 'Scan this parcel at Inbound first.');
            }
            if ($parcel->status !== Parcel::STATUS_AT_SORTING_CENTER) {
                abort(409, 'Already sorted' . ($parcel->shipping_zone ? " into {$parcel->shipping_zone}" : '') . '. Nothing was changed.');
            }
            $snap = $parcel->recipient_snapshot ?? [];
            $zone = app(ShippingCalculator::class)->zoneName((int) LogisticsCompany::effectiveId($parcel->logistics_company_id), [
                'city' => $snap['city_code'] ?? $parcel->order?->shipping_city_code, 'province' => $snap['province_code'] ?? $parcel->order?->shipping_province_code,
            ]) ?? $parcel->shipping_zone;

            $this->machine->transition($parcel->order, OrderStatus::SORTED, 'logistics', $request->user()->id,
                'Sorted for ' . ($zone ?: 'delivery') . '.', ['tracking_number' => $parcel->tracking_number, 'zone' => $zone]);
            Parcel::whereKey($parcel->id)->update(['sorted_at' => now(), 'shipping_zone' => $zone]);

            return $parcel->fresh(['order:id,order_number']);
        });

        return response()->json(['message' => 'Sorted into ' . ($parcel->shipping_zone ?: 'No zone') . '.', 'data' => $this->row($parcel)]);
    }

    /** POST /logistics/hub-ops/outbound {tracking_number, rider_id} : out to a delivery rider. */
    public function outbound(Request $request): JsonResponse
    {
        $data = $request->validate(['tracking_number' => ['required', 'string', 'max:64'], 'rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose the delivery rider.']);
        $company = $this->company($request);
        $rider = LogisticsRiderController::companyRiders($company)->with('user')->find($data['rider_id']);
        abort_unless($rider, 422, 'This rider is not one of your riders.');

        $parcel = DB::transaction(function () use ($request, $company, $data, $rider) {
            $parcel = $this->lock($company, $data['tracking_number']);
            if (in_array($parcel->status, [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP], true)) {
                abort(409, 'Scan this parcel at Inbound and sort it before Outbound.');
            }
            if ($parcel->status === Parcel::STATUS_AT_SORTING_CENTER) {
                abort(409, 'Sort this parcel into its zone before Outbound.');
            }
            if ($parcel->status !== Parcel::STATUS_SORTED) {
                abort(409, 'This parcel has already left the hub. Nothing was changed.');
            }
            if ($problem = $this->dispatcher->riderProblem($rider, $parcel)) {
                abort(422, $problem);
            }
            $this->machine->transition($parcel->order, OrderStatus::ASSIGNED_TO_RIDER, 'logistics', $request->user()->id,
                'Handed to a delivery rider.', ['tracking_number' => $parcel->tracking_number, 'rider_id' => $rider->id]);
            Parcel::whereKey($parcel->id)->update(['assigned_rider_id' => $rider->id, 'assigned_at' => now()]);
            app(Notifier::class)->jobAssigned($rider, $parcel, 'delivery');

            return $parcel->fresh(['order:id,order_number']);
        });

        return response()->json(['message' => 'Out to ' . Dispatcher::name($rider) . '. They mark it Out for Delivery when they leave.', 'data' => $this->row($parcel)]);
    }

    /** The company's parcel by tracking number, locked. Unknown and another company's are both "not found". */
    private function lock(LogisticsCompany $company, string $tracking): Parcel
    {
        $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->with('order')
            ->where('tracking_number', Str::upper(trim($tracking)))->lockForUpdate()->first();
        abort_unless($parcel && $parcel->order, 404, 'Parcel not found. Check the tracking number.');

        return $parcel;
    }

    private function hubId(LogisticsCompany $company, ?int $hubId): ?int
    {
        if ($hubId === null) {
            return null;
        }
        abort_unless(LogisticsCompany::constrain(SortingCenter::query(), $company->id)->where('status', SortingCenter::STATUS_APPROVED)->whereKey($hubId)->exists(), 422, 'Choose one of your hubs.');

        return $hubId;
    }

    private function row(Parcel $p): array
    {
        return [
            'id'              => $p->id,
            'tracking_number' => $p->tracking_number,
            'order_number'    => $p->order?->order_number,
            'status'          => $p->status,
            'zone'            => $p->shipping_zone,
            'barangay'        => $p->destination_barangay,
            'scanned_in_at'   => $p->scanned_in_at?->toIso8601String(),
            'sorted_at'       => $p->sorted_at?->toIso8601String(),
        ];
    }
}
