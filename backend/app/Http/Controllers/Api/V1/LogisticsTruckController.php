<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\TruckTrip;
use App\Services\Courier\TruckTrips;
use App\Support\PhMobile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The courier company's truck drivers: who they are, their trips between hubs, and the trip pay the company owes them.
 * The company adds a truck driver like any rider (Add rider, "Truck driver"), and pays them from its own money.
 */
class LogisticsTruckController extends Controller
{
    public function __construct(private readonly TruckTrips $trucks)
    {
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/truck-drivers */
    public function drivers(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $drivers = LogisticsRiderController::companyRiders($company)->with(['user', 'sortingCenter'])
            ->where('duty', Rider::DUTY_TRUCK)
            ->orderByRaw("CASE status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING_ACTIVATION' THEN 1 ELSE 2 END")
            ->latest('id')->get();
        $ids = $drivers->pluck('id');

        $current = TruckTrip::whereIn('driver_id', $ids)->where('status', TruckTrip::STATUS_ON_THE_WAY)->get()->keyBy('driver_id');
        $unpaid = TruckTrip::unpaid()->whereIn('driver_id', $ids)
            ->selectRaw('driver_id, COUNT(*) as trips, SUM(pay_amount) as amount')->groupBy('driver_id')->get()->keyBy('driver_id');
        $weekStart = now('Asia/Manila')->startOfWeek()->utc();
        $week = TruckTrip::whereIn('driver_id', $ids)->where('departed_at', '>=', $weekStart)
            ->selectRaw('driver_id, COUNT(*) as trips')->groupBy('driver_id')->pluck('trips', 'driver_id');

        return response()->json([
            'data' => $drivers->map(fn (Rider $r) => [
                'id'              => $r->id,
                'name'            => $this->trucks->name($r),
                'email'           => $r->user?->email,
                'phone'           => PhMobile::local($r->user?->phone),
                'status'          => $r->status,
                'vehicle_type'    => $r->vehicle_type,
                'plate_number'    => $r->plate_number,
                'home_hub'        => $r->sortingCenter?->hub_name,
                'current_trip'    => isset($current[$r->id]) ? $this->trucks->payload($current[$r->id]) : null,
                'unpaid_trips'    => (int) ($unpaid[$r->id]->trips ?? 0),
                'unpaid_amount'   => round((float) ($unpaid[$r->id]->amount ?? 0), 2),
                'trips_this_week' => (int) ($week[$r->id] ?? 0),
            ])->values(),
            'summary' => [
                'drivers'       => $drivers->count(),
                'active'        => $drivers->where('status', Rider::STATUS_ACTIVE)->count(),
                'on_the_way'    => $current->count(),
                'unpaid_amount' => round((float) $unpaid->sum(fn ($row) => (float) $row->amount), 2),
                'rate'          => $this->trucks->rate($company),
            ],
        ]);
    }

    /** GET /logistics/truck-trips?status=&driver_id= */
    public function trips(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $status = $request->query('status');

        $trips = LogisticsCompany::constrain(TruckTrip::query(), $company->id)
            ->when(in_array($status, [TruckTrip::STATUS_ON_THE_WAY, TruckTrip::STATUS_COMPLETED, TruckTrip::STATUS_CLOSED], true), fn ($q) => $q->where('status', $status))
            ->when($status === 'unpaid', fn ($q) => $q->unpaid())
            ->when($request->query('driver_id'), fn ($q, $id) => $q->where('driver_id', (int) $id))
            ->orderByRaw("CASE status WHEN 'on_the_way' THEN 0 ELSE 1 END")
            ->latest('departed_at')->latest('id')
            ->limit(100)->get();

        return response()->json(['data' => $trips->map(fn (TruckTrip $t) => $this->trucks->payload($t, true))->values()]);
    }

    /** POST /logistics/truck-drivers/{rider}/pay {reference?}: every finished, unpaid trip of this driver is paid. */
    public function pay(Request $request, int $rider): JsonResponse
    {
        $data = $request->validate(['reference' => ['nullable', 'string', 'max:40']]);
        $company = $this->company($request);
        $driver = LogisticsRiderController::companyRiders($company)->with('user')->where('duty', Rider::DUTY_TRUCK)->findOrFail($rider);

        $paid = DB::transaction(fn () => $this->trucks->markPaid($driver, $request->user(), $data['reference'] ?? null, $company->id));

        return response()->json([
            'message' => 'Marked ₱' . number_format($paid['amount'], 2) . ' paid to ' . $this->trucks->name($driver) . " for {$paid['trips']} " . ($paid['trips'] === 1 ? 'trip.' : 'trips.'),
            'data'    => $paid,
        ]);
    }

    /** POST /logistics/truck-trips/{trip}/close {reason}: parcels went missing; the driver is still paid for the trip. */
    public function close(Request $request, int $trip): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:500']], [
            'reason.required' => 'Say why the trip is closed with parcels missing.',
            'reason.min'      => 'Say why the trip is closed with parcels missing.',
        ]);
        $company = $this->company($request);

        return DB::transaction(function () use ($request, $company, $trip, $data) {
            $row = LogisticsCompany::constrain(TruckTrip::query(), $company->id)->lockForUpdate()->findOrFail($trip);
            $row = $this->trucks->close($row, $request->user(), trim($data['reason']));

            return response()->json(['message' => "Trip {$row->code} closed.", 'data' => $this->trucks->payload($row, true)]);
        });
    }

    /** PUT /logistics/truck-rate {rate}: what one trip pays from now on. Trips already on the way keep their amount. */
    public function rate(Request $request): JsonResponse
    {
        $data = $request->validate(['rate' => ['required', 'numeric', 'min:0', 'max:100000']], [
            'rate.required' => 'Enter what one trip pays.',
            'rate.numeric'  => 'Enter an amount in pesos.',
        ]);
        $company = $this->company($request);
        $old = $this->trucks->rate($company);
        $company->forceFill(['truck_trip_rate' => round((float) $data['rate'], 2)])->save();
        AuditLog::record($request->user(), 'truck_trip.rate_changed', $company, ['rate' => $old], ['rate' => (float) $company->truck_trip_rate],
            companyId: $company->id, actorRole: 'logistics');

        return response()->json(['message' => 'Trip pay saved.', 'data' => ['rate' => (float) $company->truck_trip_rate]]);
    }
}
